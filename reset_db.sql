-- ============================================================================
-- RESET SCRIPT (DESTRUCTIVE!)
-- Run this in Supabase SQL Editor to wipe everything.
-- ============================================================================

-- 1. Drop Application Tables (Order matters due to foreign keys)
DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. Drop Custom Functions
DROP FUNCTION IF EXISTS is_member_of CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS join_group_by_code CASCADE;

-- 3. Wiping Auth Users (Optional but requested)
-- WARNING: This deletes ALL registered users from Supabase Auth.
-- You will need to Sign Up again.
TRUNCATE TABLE auth.users CASCADE;

-- ============================================================================
-- NOW RUN 'master_schema.sql' TO REBUILD
-- ============================================================================
