-- ============================================================================
-- 1. SCHEMA MIGRATION: Denormalize `group_id` into `expense_splits`
-- ============================================================================

-- Add the column if it doesn't exist
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;

-- Backfill existing records (this might take a moment if you have thousands of records)
UPDATE expense_splits es
SET group_id = e.group_id
FROM expenses e
WHERE es.expense_id = e.id AND es.group_id IS NULL;

-- ============================================================================
-- 1.5 BACKWARD COMPATIBILITY TRIGGER (ZERO DOWNTIME GUARANTEE)
-- To guarantee that existing apps/users do NOT break while the update 
-- rolls out, this trigger auto-populates group_id if the old client 
-- inserts a split without it.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_expense_split_group_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    SELECT group_id INTO NEW.group_id FROM expenses WHERE id = NEW.expense_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_insert_expense_split ON expense_splits;
CREATE TRIGGER before_insert_expense_split
BEFORE INSERT ON expense_splits
FOR EACH ROW EXECUTE FUNCTION set_expense_split_group_id();

-- ============================================================================
-- 2. INDEX OPTIMIZATIONS
-- ============================================================================

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);

-- Expense Splits
CREATE INDEX IF NOT EXISTS idx_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user_id ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_splits_group_id ON expense_splits(group_id);

-- Settlement Details
CREATE INDEX IF NOT EXISTS idx_settlements_expense_id ON settlement_details(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_initiated_by ON settlement_details(initiated_by);

-- Group Members (Composite for RLS optimization)
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);

-- ============================================================================
-- 3. RLS OPTIMIZATION
-- ============================================================================

-- Drop the complex nested policies on expense_splits
DROP POLICY IF EXISTS "View splits" ON expense_splits;
DROP POLICY IF EXISTS "Add splits" ON expense_splits;
DROP POLICY IF EXISTS "Update splits" ON expense_splits;
DROP POLICY IF EXISTS "Delete splits" ON expense_splits;

-- Create the simplified high-performance policy
CREATE POLICY "View splits" ON expense_splits FOR SELECT USING (
  is_member_of(group_id)
);

-- Note: We do not strictly need Insert/Update/Delete policies entirely if relying fully on SECURITY DEFINER RPCs. 
-- But for backward compatibility while we roll out the client changes:
CREATE POLICY "Add splits" ON expense_splits FOR INSERT WITH CHECK (is_member_of(group_id));
CREATE POLICY "Update splits" ON expense_splits FOR UPDATE USING (is_member_of(group_id));
CREATE POLICY "Delete splits" ON expense_splits FOR DELETE USING (is_member_of(group_id));

-- ============================================================================
-- 4. ATOMIC RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- Function: create_expense_rpc
CREATE OR REPLACE FUNCTION create_expense_rpc(
    p_group_id uuid,
    p_paid_by uuid,
    p_amount numeric,
    p_description text,
    p_date timestamptz,
    p_created_by uuid,
    p_splits jsonb -- Array of objects: [{"user_id": "uuid", "owe_amount": numeric}]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_expense_id uuid;
    split_record jsonb;
BEGIN
    -- Verify user is a member of the group
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized to add expenses to this group';
    END IF;

    -- 1. Insert the expense
    INSERT INTO expenses (group_id, paid_by, amount, description, date, created_by)
    VALUES (p_group_id, p_paid_by, p_amount, p_description, p_date, p_created_by)
    RETURNING id INTO new_expense_id;

    -- 2. Insert the splits
    FOR split_record IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
        VALUES (
            new_expense_id,
            p_group_id,
            (split_record->>'user_id')::uuid,
            (split_record->>'owe_amount')::numeric
        );
    END LOOP;

    RETURN new_expense_id;
END;
$$;

-- Function: update_expense_rpc
CREATE OR REPLACE FUNCTION update_expense_rpc(
    p_expense_id uuid,
    p_group_id uuid,
    p_paid_by uuid,
    p_amount numeric,
    p_description text,
    p_date timestamptz,
    p_updated_by uuid,
    p_splits jsonb -- Array of objects
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    split_record jsonb;
BEGIN
    -- Verify user is a member of the group
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized to update expenses in this group';
    END IF;

    -- Verify the expense exists and belongs to the group
    IF NOT EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id AND group_id = p_group_id) THEN
        RAISE EXCEPTION 'Expense not found or group mismatch';
    END IF;

    -- 1. Update the expense
    UPDATE expenses
    SET paid_by = p_paid_by,
        amount = p_amount,
        description = p_description,
        date = p_date,
        updated_by = p_updated_by,
        updated_at = now()
    WHERE id = p_expense_id;

    -- 2. Replace the splits (Delete old, Insert new)
    DELETE FROM expense_splits WHERE expense_id = p_expense_id;

    FOR split_record IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
        VALUES (
            p_expense_id,
            p_group_id,
            (split_record->>'user_id')::uuid,
            (split_record->>'owe_amount')::numeric
        );
    END LOOP;
END;
$$;

-- Function: create_settlement_rpc
CREATE OR REPLACE FUNCTION create_settlement_rpc(
    p_group_id uuid,
    p_paid_by uuid,
    p_receiver_id uuid,
    p_amount numeric,
    p_description text,
    p_created_by uuid,
    p_settlement_method text,
    p_settlement_status text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_expense_id uuid;
BEGIN
    -- Verify user is a member of the group
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- 1. Insert the settlement expense
    INSERT INTO expenses (group_id, paid_by, amount, description, category, created_by)
    VALUES (p_group_id, p_paid_by, p_amount, p_description, 'settlement', p_created_by)
    RETURNING id INTO new_expense_id;

    -- 2. Insert the single split for the receiver
    INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
    VALUES (new_expense_id, p_group_id, p_receiver_id, p_amount);

    -- 3. Insert the settlement details
    INSERT INTO settlement_details (
        expense_id, settlement_method, settlement_status, initiated_by, confirmed_by, confirmed_at
    )
    VALUES (
        new_expense_id, 
        p_settlement_method, 
        p_settlement_status, 
        p_created_by,
        CASE WHEN p_settlement_status = 'confirmed' THEN p_created_by ELSE NULL END,
        CASE WHEN p_settlement_status = 'confirmed' THEN now() ELSE NULL END
    );

    RETURN new_expense_id;
END;
$$;

-- Function: update_settlement_rpc
CREATE OR REPLACE FUNCTION update_settlement_rpc(
    p_expense_id uuid,
    p_group_id uuid,
    p_paid_by uuid,
    p_receiver_id uuid,
    p_amount numeric,
    p_description text,
    p_updated_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify user is a member
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- 1. Update expense
    UPDATE expenses
    SET paid_by = p_paid_by,
        amount = p_amount,
        description = p_description,
        updated_by = p_updated_by,
        updated_at = now()
    WHERE id = p_expense_id;

    -- 2. Update split
    DELETE FROM expense_splits WHERE expense_id = p_expense_id;
    
    INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
    VALUES (p_expense_id, p_group_id, p_receiver_id, p_amount);
    
END;
$$;
