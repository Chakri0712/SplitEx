-- ============================================================================
-- ADMIN QUERIES FOR SPLITEX
-- ============================================================================

-- ============================================================================
-- QUERY 1: Delete all settlement records for a specific group
-- ============================================================================
-- This will delete all settlements but keep regular expenses intact
-- Replace 'YOUR_GROUP_ID_HERE' with the actual group UUID

-- Step 1: Get the group ID (if you don't have it)
-- SELECT id, name FROM groups WHERE name = 'Group Name Here';

-- Step 2: Delete settlement details first (due to foreign key constraints)
DELETE FROM settlement_details
WHERE expense_id IN (
    SELECT id FROM expenses 
    WHERE group_id = 'YOUR_GROUP_ID_HERE' 
    AND category = 'settlement'
);

-- Step 3: Delete expense splits for settlements
DELETE FROM expense_splits
WHERE expense_id IN (
    SELECT id FROM expenses 
    WHERE group_id = 'YOUR_GROUP_ID_HERE' 
    AND category = 'settlement'
);

-- Step 4: Delete settlement expenses
DELETE FROM expenses
WHERE group_id = 'YOUR_GROUP_ID_HERE' 
AND category = 'settlement';

-- Verification: Check remaining expenses (should only show non-settlement expenses)
SELECT id, description, category, amount, date 
FROM expenses 
WHERE group_id = 'YOUR_GROUP_ID_HERE'
ORDER BY date DESC;


-- ============================================================================
-- QUERY 2: Move expenses from one group to another
-- ============================================================================
-- This moves expenses AND their settlements, adjusting all related records
-- Replace 'SOURCE_GROUP_ID' and 'TARGET_GROUP_ID' with actual UUIDs

-- IMPORTANT PREREQUISITES:
-- 1. Both groups must have the SAME currency (or you'll need to convert amounts)
-- 2. All members involved in the expenses must be members of the target group
-- 3. Verify member overlap first using the query below

-- Step 1: Verify member overlap between groups
SELECT 
    source.user_id,
    p.full_name,
    CASE 
        WHEN target.user_id IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as in_target_group
FROM group_members source
LEFT JOIN group_members target 
    ON source.user_id = target.user_id 
    AND target.group_id = 'TARGET_GROUP_ID'
LEFT JOIN profiles p ON source.user_id = p.id
WHERE source.group_id = 'SOURCE_GROUP_ID';

-- Step 2: Check if currencies match
SELECT 
    (SELECT currency FROM groups WHERE id = 'SOURCE_GROUP_ID') as source_currency,
    (SELECT currency FROM groups WHERE id = 'TARGET_GROUP_ID') as target_currency;

-- Step 3: Move expenses (this automatically moves splits and settlement_details due to CASCADE)
UPDATE expenses
SET group_id = 'TARGET_GROUP_ID'
WHERE group_id = 'SOURCE_GROUP_ID';

-- Step 4: Verification - Check moved expenses
SELECT 
    e.id,
    e.description,
    e.category,
    e.amount,
    e.date,
    p.full_name as paid_by_name,
    g.name as group_name
FROM expenses e
JOIN profiles p ON e.paid_by = p.id
JOIN groups g ON e.group_id = g.id
WHERE e.group_id = 'TARGET_GROUP_ID'
ORDER BY e.date DESC;

-- Step 5: Verify settlement details moved correctly
SELECT 
    sd.id,
    e.description,
    sd.settlement_method,
    sd.settlement_status,
    sd.utr_reference,
    e.amount
FROM settlement_details sd
JOIN expenses e ON sd.expense_id = e.id
WHERE e.group_id = 'TARGET_GROUP_ID'
ORDER BY sd.initiated_at DESC;


-- ============================================================================
-- QUERY 3: Move SPECIFIC expenses (not all) from one group to another
-- ============================================================================
-- Use this if you only want to move certain expenses, not all of them

-- Step 1: List expenses to choose from
SELECT 
    e.id,
    e.description,
    e.category,
    e.amount,
    e.date,
    p.full_name as paid_by
FROM expenses e
JOIN profiles p ON e.paid_by = p.id
WHERE e.group_id = 'SOURCE_GROUP_ID'
ORDER BY e.date DESC;

-- Step 2: Move specific expenses by ID
UPDATE expenses
SET group_id = 'TARGET_GROUP_ID'
WHERE id IN (
    'EXPENSE_ID_1',
    'EXPENSE_ID_2',
    'EXPENSE_ID_3'
    -- Add more expense IDs as needed
);


-- ============================================================================
-- USEFUL HELPER QUERIES
-- ============================================================================

-- Get all groups with their IDs
SELECT id, name, currency, created_at 
FROM groups 
ORDER BY created_at DESC;

-- Get all members of a specific group
SELECT 
    gm.user_id,
    p.full_name,
    p.email,
    gm.joined_at
FROM group_members gm
JOIN profiles p ON gm.user_id = p.id
WHERE gm.group_id = 'YOUR_GROUP_ID_HERE'
ORDER BY p.full_name;

-- Count expenses by category for a group
SELECT 
    category,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM expenses
WHERE group_id = 'YOUR_GROUP_ID_HERE'
GROUP BY category;

-- Get settlement status summary for a group
SELECT 
    sd.settlement_status,
    COUNT(*) as count,
    SUM(e.amount) as total_amount
FROM settlement_details sd
JOIN expenses e ON sd.expense_id = e.id
WHERE e.group_id = 'YOUR_GROUP_ID_HERE'
GROUP BY sd.settlement_status;
