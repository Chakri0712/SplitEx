
-- ============================================================================
-- My Split App - Master Database Schema
-- Run this if you need to set up the project from scratch.
-- (If you already ran previous scripts, you don't need to run this).
-- ============================================================================

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. CREATE TABLES
-- Profiles (Managed by Supabase Auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone
);

-- Groups
create table if not exists groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_by uuid references auth.users not null,
  invite_code text unique,
  currency text default 'USD',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Group Members
create table if not exists group_members (
  group_id uuid references groups on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (group_id, user_id)
);

-- Expenses
create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references groups on delete cascade not null,
  paid_by uuid references profiles(id) not null,
  amount decimal(10,2) not null,
  description text not null,
  category text,
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Expense Splits
create table if not exists expense_splits (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references expenses on delete cascade not null,
  user_id uuid references profiles(id) not null,
  owe_amount decimal(10,2) not null
);

-- 3. ENABLE RLS
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;

-- 4. SECURITY HELPERS
-- Function to reliably check membership without recursion
create or replace function is_member_of(_group_id uuid)
returns boolean language plpgsql security definer
as $$
begin
  return exists (select 1 from group_members where group_id = _group_id and user_id = auth.uid());
end;
$$;

-- 5. POLICIES (Based on fix_rls_final.sql)

-- Reset existing policies to ensure clean state
drop policy if exists "View joined groups" on groups;
drop policy if exists "Create groups" on groups;
drop policy if exists "Read groups" on groups;
drop policy if exists "Insert groups" on groups;

drop policy if exists "View members" on group_members;
drop policy if exists "Join group" on group_members;
drop policy if exists "Read members" on group_members;
drop policy if exists "Insert members" on group_members;

drop policy if exists "View expenses" on expenses;
drop policy if exists "Add expense" on expenses;
drop policy if exists "View splits" on expense_splits;
drop policy if exists "Add splits" on expense_splits;
drop policy if exists "Public profiles" on profiles;
drop policy if exists "Users can update own profile" on profiles;

-- Profiles
create policy "Public profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Groups
create policy "Read groups" on groups for select using (
  is_member_of(id) OR created_by = auth.uid()
);
create policy "Insert groups" on groups for insert with check (
  created_by = auth.uid()
);
create policy "Update groups" on groups for update using (
  is_member_of(id)
);

-- Members
create policy "Read members" on group_members for select using (
  is_member_of(group_id) OR user_id = auth.uid()
);
create policy "Insert members" on group_members for insert with check (
  user_id = auth.uid()
);
create policy "Delete members" on group_members for delete using (
  user_id = auth.uid()
);

-- Expenses
create policy "View expenses" on expenses for select using (
  is_member_of(group_id)
);
create policy "Add expense" on expenses for insert with check (
  is_member_of(group_id)
);
create policy "Update expenses" on expenses for update using (
  is_member_of(group_id)
);
create policy "Delete expenses" on expenses for delete using (
  is_member_of(group_id)
);

-- Splits
create policy "View splits" on expense_splits for select using (
  exists (select 1 from expenses where id = expense_splits.expense_id and is_member_of(group_id))
);
create policy "Add splits" on expense_splits for insert with check (
  exists (select 1 from expenses where id = expense_splits.expense_id and is_member_of(group_id))
);
create policy "Update splits" on expense_splits for update using (
  exists (select 1 from expenses where id = expense_splits.expense_id and is_member_of(group_id))
);
create policy "Delete splits" on expense_splits for delete using (
  exists (select 1 from expenses where id = expense_splits.expense_id and is_member_of(group_id))
);

-- Groups: Allow deletion
create policy "Delete groups" on groups for delete using (
  created_by = auth.uid()
);

create policy "Allow last member to delete group" on groups for delete using (
  (select count(*) from group_members where group_id = id) = 1
  and
  (auth.uid() in (select user_id from group_members where group_id = id))
);

-- 6. TRIGGERS
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to avoid error
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. BACKEND FUNCTIONS
-- Join Group safely by Code
create or replace function join_group_by_code(invite_code_input text)
returns json
language plpgsql
security definer
as $$
declare
  target_group_id uuid;
  target_group_name text;
  already_member boolean;
begin
  -- 1. Find the group
  select id, name into target_group_id, target_group_name
  from groups
  where invite_code = invite_code_input;

  if target_group_id is null then
    raise exception 'Invalid invite code';
  end if;

  -- 2. Check if already a member
  select exists (
    select 1 from group_members
    where group_id = target_group_id
    and user_id = auth.uid()
  ) into already_member;

  if already_member then
    -- Return success anyway, just don't insert
    return json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', true);
  end if;

  -- 3. Insert membership
  insert into group_members (group_id, user_id)
  values (target_group_id, auth.uid());

  return json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', false);
end;
$$;
