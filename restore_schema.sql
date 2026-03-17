-- ============================================================================
-- RESTORE SCHEMA SCRIPT
-- This script will:
-- 1. Drop all application tables (keeping auth.users intact)
-- 2. Re-create all tables, functions, triggers, and policies
-- 3. Restore user profiles from existing auth.users
--
-- ✅ Includes: fcm_tokens, notifications, all RPCs, all indexes
-- ✅ Safe to run on a fresh Supabase project
-- ============================================================================

-- 1. CLEANUP (Drop tables in correct dependency order)
DROP TABLE IF EXISTS settlement_details CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS fcm_tokens CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop Functions
DROP FUNCTION IF EXISTS is_member_of CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS join_group_by_code CASCADE;
DROP FUNCTION IF EXISTS create_expense_rpc CASCADE;
DROP FUNCTION IF EXISTS update_expense_rpc CASCADE;
DROP FUNCTION IF EXISTS create_settlement_rpc CASCADE;
DROP FUNCTION IF EXISTS update_settlement_rpc CASCADE;
DROP FUNCTION IF EXISTS notify_single_expense CASCADE;
DROP FUNCTION IF EXISTS notify_expense_deleted_trigger CASCADE;
DROP FUNCTION IF EXISTS handle_settlement_updates CASCADE;
DROP FUNCTION IF EXISTS cleanup_notifications CASCADE;
DROP FUNCTION IF EXISTS send_push_to_user CASCADE;
DROP FUNCTION IF EXISTS set_expense_split_group_id CASCADE;

-- ============================================================================
-- 2. REBUILD SCHEMA
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 2.1 TABLES (order matters — dependencies first)
-- ============================================================================

-- Profiles (Managed by Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  upi_id text,
  country text DEFAULT 'IND',
  updated_at timestamp with time zone,
  cleared_at timestamp with time zone
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users NOT NULL,
  invite_code text UNIQUE,
  currency text DEFAULT 'USD',
  category text DEFAULT 'Personal',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid REFERENCES groups ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id uuid REFERENCES groups ON DELETE CASCADE NOT NULL,
  paid_by uuid REFERENCES profiles(id) NOT NULL,
  amount decimal(10,2) NOT NULL,
  description text NOT NULL,
  category text,
  date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_by uuid REFERENCES profiles(id)
);

-- Expense Splits (group_id denormalized for fast RLS checks)
CREATE TABLE IF NOT EXISTS expense_splits (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  expense_id uuid REFERENCES expenses ON DELETE CASCADE NOT NULL,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  owe_amount decimal(10,2) NOT NULL
);

-- Settlement Details
CREATE TABLE IF NOT EXISTS settlement_details (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE UNIQUE,
  settlement_method text NOT NULL,
  settlement_status text CHECK (settlement_status IN ('pending_utr', 'pending_confirmation', 'confirmed', 'disputed', 'cancelled')) NOT NULL,
  utr_reference text,
  cancellation_reason text,
  initiated_by uuid REFERENCES profiles(id) NOT NULL,
  initiated_at timestamp with time zone DEFAULT now(),
  confirmed_by uuid REFERENCES profiles(id),
  confirmed_at timestamp with time zone,
  cross_group_batch_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('expense_created', 'expense_updated', 'expense_deleted', 'settlement_created', 'settlement_updated', 'settlement_deleted')),
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- FCM Tokens (Push Notification Device Tokens)
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 2.2 INDEXES (Performance — defined AFTER all tables)
-- ============================================================================

-- Groups
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category);

-- Expenses — composite for the most common query (group feed ordered by date)
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_date ON expenses(group_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);

-- Expense Splits
CREATE INDEX IF NOT EXISTS idx_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user_id ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_splits_group_id ON expense_splits(group_id);

-- Settlement Details
CREATE INDEX IF NOT EXISTS idx_settlements_expense_id ON settlement_details(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_initiated_by ON settlement_details(initiated_by);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlement_details(settlement_status);
CREATE INDEX IF NOT EXISTS idx_settlements_batch_id ON settlement_details(cross_group_batch_id) WHERE cross_group_batch_id IS NOT NULL;

-- Group Members (composite for RLS optimization)
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Notifications (user feed sorted by time + unread filter)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read) WHERE is_read = false;

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- FCM Tokens
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);

-- ============================================================================
-- 3. ENABLE RLS
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Enable Realtime for notifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ============================================================================
-- 4. SECURITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION is_member_of(_group_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM group_members WHERE group_id = _group_id AND user_id = auth.uid());
END;
$$;

-- ============================================================================
-- 5. POLICIES
-- ============================================================================

-- Profiles
CREATE POLICY "Public profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Groups
CREATE POLICY "View joined groups" ON groups FOR SELECT USING (
  is_member_of(id) OR created_by = auth.uid()
);
CREATE POLICY "Create groups" ON groups FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update groups" ON groups FOR UPDATE USING (is_member_of(id));
CREATE POLICY "Delete groups" ON groups FOR DELETE USING (created_by = auth.uid());
CREATE POLICY "Allow last member to delete group" ON groups FOR DELETE USING (
  (SELECT COUNT(*) FROM group_members WHERE group_id = id) = 1
  AND (auth.uid() IN (SELECT user_id FROM group_members WHERE group_id = id))
);

-- Members
CREATE POLICY "View members" ON group_members FOR SELECT USING (
  is_member_of(group_id) OR user_id = auth.uid()
);
CREATE POLICY "Join group" ON group_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete members" ON group_members FOR DELETE USING (user_id = auth.uid());

-- Expenses
CREATE POLICY "View expenses" ON expenses FOR SELECT USING (is_member_of(group_id));
CREATE POLICY "Add expense" ON expenses FOR INSERT WITH CHECK (is_member_of(group_id));
CREATE POLICY "Update expenses" ON expenses FOR UPDATE USING (is_member_of(group_id));
CREATE POLICY "Delete expenses" ON expenses FOR DELETE USING (is_member_of(group_id));

-- Splits (use denormalized group_id for fast policy evaluation)
CREATE POLICY "View splits" ON expense_splits FOR SELECT USING (is_member_of(group_id));
CREATE POLICY "Add splits" ON expense_splits FOR INSERT WITH CHECK (is_member_of(group_id));
CREATE POLICY "Update splits" ON expense_splits FOR UPDATE USING (is_member_of(group_id));
CREATE POLICY "Delete splits" ON expense_splits FOR DELETE USING (is_member_of(group_id));

-- Settlement Details
CREATE POLICY "View settlement details" ON settlement_details FOR SELECT USING (
  expense_id IN (
    SELECT e.id FROM expenses e
    JOIN group_members gm ON e.group_id = gm.group_id
    WHERE gm.user_id = auth.uid()
  )
);
CREATE POLICY "Create settlement details" ON settlement_details FOR INSERT WITH CHECK (
  initiated_by = auth.uid()
);
CREATE POLICY "Update settlement details" ON settlement_details FOR UPDATE USING (
  initiated_by = auth.uid() OR
  expense_id IN (
    SELECT e.id FROM expenses e
    JOIN expense_splits es ON e.id = es.expense_id
    WHERE es.user_id = auth.uid()
  )
);

-- Notifications
CREATE POLICY "View own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- FCM Tokens
CREATE POLICY "Users can view their own fcm tokens" ON fcm_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fcm tokens" ON fcm_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own fcm tokens" ON fcm_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own fcm tokens" ON fcm_tokens FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 6. TRIGGERS & HELPER FUNCTIONS
-- ============================================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-populate group_id on expense_splits if client omits it (backward compat)
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

-- Notification cleanup (keep last 2 days per user)
CREATE OR REPLACE FUNCTION public.cleanup_notifications()
RETURNS trigger AS $$
BEGIN
  DELETE FROM notifications
  WHERE user_id = new.user_id
    AND created_at < now() - INTERVAL '2 days';
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_notification_created ON notifications;
CREATE TRIGGER on_notification_created
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE PROCEDURE public.cleanup_notifications();

-- ============================================================================
-- 7. RPC FUNCTIONS (Atomic, Security Definer)
-- ============================================================================

-- Join group by invite code
CREATE OR REPLACE FUNCTION join_group_by_code(invite_code_input text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_group_id uuid;
  target_group_name text;
  already_member boolean;
BEGIN
  SELECT id, name INTO target_group_id, target_group_name
  FROM groups WHERE invite_code = invite_code_input;

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id AND user_id = auth.uid()
  ) INTO already_member;

  IF already_member THEN
    RETURN json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', true);
  END IF;

  INSERT INTO group_members (group_id, user_id) VALUES (target_group_id, auth.uid());
  RETURN json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', false);
END;
$$;

-- Push notification helper
CREATE OR REPLACE FUNCTION public.send_push_to_user(
  p_user_id uuid,
  p_title   text,
  p_body    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://ryjhfcfyglaabpowoxwk.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'targetUserId', p_user_id,
      'title',        p_title,
      'body',         p_body
    )
  );
END;
$$;

-- Notify members when an expense is created or updated
CREATE OR REPLACE FUNCTION public.notify_single_expense(
  p_expense_id uuid,
  p_action text,
  p_actor_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  exp_rec record;
  group_name text;
  actor_name text;
  target_user_id uuid;
  is_sett_create boolean;
  notif_type text;
  notif_title text;
  notif_msg_inapp text;
  notif_msg_push text;
BEGIN
  SELECT * INTO exp_rec FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT name INTO group_name FROM groups WHERE id = exp_rec.group_id;
  SELECT split_part(full_name, ' ', 1) INTO actor_name FROM profiles WHERE id = p_actor_id;

  is_sett_create := (exp_rec.category = 'settlement' AND p_action = 'INSERT');

  IF p_action = 'INSERT' THEN
    IF is_sett_create THEN
       notif_type := 'settlement_created';
       notif_title := 'New Settlement Request';
       notif_msg_inapp := 'Settlement of ' || exp_rec.amount || ' proposed';
       notif_msg_push := 'A settlement was created by ' || COALESCE(actor_name, 'Someone') || ' in ' || COALESCE(group_name, 'a group');
    ELSE
       notif_type := 'expense_created';
       notif_title := 'Expense Added';
       notif_msg_inapp := 'Added: ' || exp_rec.description || ' (' || exp_rec.amount || ')';
       notif_msg_push := '"' || exp_rec.description || '" of ' || exp_rec.amount || ' was added by ' || COALESCE(actor_name, 'Someone') || ' in ' || COALESCE(group_name, 'a group');
    END IF;
  ELSIF p_action = 'UPDATE' AND exp_rec.category != 'settlement' THEN
    notif_type := 'expense_updated';
    notif_title := 'Expense Edited';
    notif_msg_inapp := 'Updated: ' || exp_rec.description;
    notif_msg_push := '"' || exp_rec.description || '" of ' || exp_rec.amount || ' was edited by ' || COALESCE(actor_name, 'Someone') || ' in ' || COALESCE(group_name, 'a group');
  ELSE
    RETURN;
  END IF;

  FOR target_user_id IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM expense_splits WHERE expense_id = p_expense_id
      UNION
      SELECT exp_rec.paid_by
    ) involved
    WHERE user_id != p_actor_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (target_user_id, notif_type, notif_title, notif_msg_inapp,
            jsonb_build_object('group_id', exp_rec.group_id, 'expense_id', exp_rec.id));

    BEGIN
      EXECUTE format('SELECT public.send_push_to_user(%L, %L, %L)', target_user_id, notif_title, notif_msg_push);
    EXCEPTION WHEN undefined_function THEN
    END;
  END LOOP;
END;
$$;

-- Expense delete notification trigger
CREATE OR REPLACE FUNCTION public.notify_expense_deleted_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  actor_id uuid;
  actor_name text;
  group_name text;
  target_user_id uuid;
  is_settlement boolean;
  notif_type text;
  notif_title text;
  notif_msg_inapp text;
  notif_msg_push text;
BEGIN
  actor_id := COALESCE(auth.uid(), old.updated_by, old.paid_by);
  SELECT split_part(full_name, ' ', 1) INTO actor_name FROM profiles WHERE id = actor_id;
  SELECT name INTO group_name FROM groups WHERE id = old.group_id;

  is_settlement := (old.category = 'settlement');

  IF is_settlement THEN
    notif_type := 'settlement_deleted';
    notif_title := 'Settlement Cancelled';
    notif_msg_inapp := 'Settlement of ' || old.amount || ' removed';
    notif_msg_push := 'A settlement was cancelled by ' || COALESCE(actor_name, 'Someone') || ' in ' || COALESCE(group_name, 'a group');
  ELSE
    notif_type := 'expense_deleted';
    notif_title := 'Expense Deleted';
    notif_msg_inapp := 'Expense "' || old.description || '" removed';
    notif_msg_push := '"' || old.description || '" was deleted by ' || COALESCE(actor_name, 'Someone') || ' in ' || COALESCE(group_name, 'a group');
  END IF;

  FOR target_user_id IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM expense_splits WHERE expense_id = old.id
      UNION
      SELECT old.paid_by
    ) involved
    WHERE user_id != actor_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (target_user_id, notif_type, notif_title, notif_msg_inapp,
            jsonb_build_object('group_id', old.group_id));

    BEGIN
      EXECUTE format('SELECT public.send_push_to_user(%L, %L, %L)', target_user_id, notif_title, notif_msg_push);
    EXCEPTION WHEN undefined_function THEN
    END;
  END LOOP;

  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS on_expense_delete_unified ON expenses;
CREATE TRIGGER on_expense_delete_unified
  BEFORE DELETE ON expenses
  FOR EACH ROW EXECUTE PROCEDURE public.notify_expense_deleted_trigger();

-- Settlement status change notification trigger
CREATE OR REPLACE FUNCTION public.handle_settlement_updates()
RETURNS trigger AS $$
DECLARE
  grp_id uuid;
  group_name text;
  initiator_id uuid;
  payer_id uuid;
  actor_name text;
BEGIN
  SELECT e.group_id, e.created_by, e.paid_by INTO grp_id, initiator_id, payer_id
  FROM expenses e WHERE e.id = new.expense_id;
  SELECT name INTO group_name FROM groups WHERE id = grp_id;

  IF (new.settlement_status != old.settlement_status) THEN
    -- Notify initiator
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      initiator_id, 'settlement_updated',
      'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')),
      'Settlement in ' || group_name || ' is now ' || new.settlement_status,
      jsonb_build_object('group_id', grp_id, 'expense_id', new.expense_id)
    );

    SELECT split_part(full_name, ' ', 1) INTO actor_name FROM profiles WHERE id = COALESCE(new.confirmed_by, payer_id);

    BEGIN
      EXECUTE format('SELECT public.send_push_to_user(%L, %L, %L)',
        initiator_id,
        'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')),
        'A settlement was ' || lower(replace(new.settlement_status, '_', ' ')) || ' by ' || COALESCE(actor_name, 'Someone') || ' in ' || group_name
      );
    EXCEPTION WHEN undefined_function THEN
    END;

    -- Also notify payer if confirmed and different from initiator
    IF (payer_id != initiator_id AND new.settlement_status = 'confirmed') THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        payer_id, 'settlement_updated', 'Settlement Confirmed',
        'Settlement in ' || group_name || ' is now confirmed',
        jsonb_build_object('group_id', grp_id, 'expense_id', new.expense_id)
      );
    END IF;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_settlement_update ON settlement_details;
CREATE TRIGGER on_settlement_update
  AFTER UPDATE ON settlement_details
  FOR EACH ROW EXECUTE PROCEDURE public.handle_settlement_updates();

-- create_expense_rpc
CREATE OR REPLACE FUNCTION create_expense_rpc(
    p_group_id uuid, p_paid_by uuid, p_amount numeric, p_description text,
    p_date timestamptz, p_created_by uuid, p_splits jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    new_expense_id uuid;
    split_record jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized to add expenses to this group';
    END IF;
    INSERT INTO expenses (group_id, paid_by, amount, description, date, created_by)
    VALUES (p_group_id, p_paid_by, p_amount, p_description, p_date, p_created_by)
    RETURNING id INTO new_expense_id;

    FOR split_record IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
        VALUES (new_expense_id, p_group_id, (split_record->>'user_id')::uuid, (split_record->>'owe_amount')::numeric);
    END LOOP;
    PERFORM public.notify_single_expense(new_expense_id, 'INSERT', p_created_by);
    RETURN new_expense_id;
END;
$$;

-- update_expense_rpc
CREATE OR REPLACE FUNCTION update_expense_rpc(
    p_expense_id uuid, p_group_id uuid, p_paid_by uuid, p_amount numeric,
    p_description text, p_date timestamptz, p_updated_by uuid, p_splits jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    split_record jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized to update expenses in this group';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id AND group_id = p_group_id) THEN
        RAISE EXCEPTION 'Expense not found or group mismatch';
    END IF;

    UPDATE expenses SET paid_by = p_paid_by, amount = p_amount, description = p_description,
        date = p_date, updated_by = p_updated_by, updated_at = now()
    WHERE id = p_expense_id;

    DELETE FROM expense_splits WHERE expense_id = p_expense_id;
    FOR split_record IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
        VALUES (p_expense_id, p_group_id, (split_record->>'user_id')::uuid, (split_record->>'owe_amount')::numeric);
    END LOOP;
    PERFORM public.notify_single_expense(p_expense_id, 'UPDATE', p_updated_by);
END;
$$;

-- create_settlement_rpc
CREATE OR REPLACE FUNCTION create_settlement_rpc(
    p_group_id uuid, p_paid_by uuid, p_receiver_id uuid, p_amount numeric,
    p_description text, p_created_by uuid, p_settlement_method text, p_settlement_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    new_expense_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    INSERT INTO expenses (group_id, paid_by, amount, description, category, created_by)
    VALUES (p_group_id, p_paid_by, p_amount, p_description, 'settlement', p_created_by)
    RETURNING id INTO new_expense_id;

    INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
    VALUES (new_expense_id, p_group_id, p_receiver_id, p_amount);

    INSERT INTO settlement_details (expense_id, settlement_method, settlement_status, initiated_by, confirmed_by, confirmed_at)
    VALUES (
        new_expense_id, p_settlement_method, p_settlement_status, p_created_by,
        CASE WHEN p_settlement_status = 'confirmed' THEN p_created_by ELSE NULL END,
        CASE WHEN p_settlement_status = 'confirmed' THEN now() ELSE NULL END
    );
    PERFORM public.notify_single_expense(new_expense_id, 'INSERT', p_created_by);
    RETURN new_expense_id;
END;
$$;

-- update_settlement_rpc
CREATE OR REPLACE FUNCTION update_settlement_rpc(
    p_expense_id uuid, p_group_id uuid, p_paid_by uuid, p_receiver_id uuid,
    p_amount numeric, p_description text, p_updated_by uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    UPDATE expenses SET paid_by = p_paid_by, amount = p_amount, description = p_description,
        updated_by = p_updated_by, updated_at = now()
    WHERE id = p_expense_id;

    DELETE FROM expense_splits WHERE expense_id = p_expense_id;
    INSERT INTO expense_splits (expense_id, group_id, user_id, owe_amount)
    VALUES (p_expense_id, p_group_id, p_receiver_id, p_amount);
END;
$$;

-- ============================================================================
-- 8. RESTORE PROFILES (Sync from auth.users)
-- ============================================================================
INSERT INTO profiles (id, email, full_name, avatar_url)
SELECT
    id,
    email,
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
