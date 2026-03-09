-- ============================================================================
-- RESTORE SCHEMA SCRIPT
-- This script will:
-- 1. Drop all application tables (keeping auth.users intact)
-- 2. Re-create all tables, functions, and policies
-- 3. Restore user profiles from existing auth.users
-- ============================================================================

-- 1. CLEANUP (Drop tables in correct dependency order)
DROP TABLE IF EXISTS settlement_details CASCADE;
DROP TABLE IF EXISTS notifications CASCADE; -- Added cleanup
DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop Functions
DROP FUNCTION IF EXISTS is_member_of CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS join_group_by_code CASCADE;

-- ============================================================================
-- 2. REBUILD SCHEMA (From master_schema.sql)
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (Managed by Supabase Auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  avatar_url text,
  upi_id text,
  country text default 'IND',
  updated_at timestamp with time zone,
  cleared_at timestamp with time zone
);

-- Groups
create table if not exists groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_by uuid references auth.users not null,
  invite_code text unique,
  currency text default 'USD',
  category text default 'Personal',
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
  created_by uuid references profiles(id), -- Nullable for backward compatibility, but good to have
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  updated_by uuid references profiles(id)
);

-- Expense Splits
create table if not exists expense_splits (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references expenses on delete cascade not null,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  owe_amount decimal(10,2) not null
);

-- ============================================================================
-- 2.5 INDEXES (Performance Optimizations)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user_id ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_splits_group_id ON expense_splits(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_expense_id ON settlement_details(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_initiated_by ON settlement_details(initiated_by);
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);

-- Settlement Details
create table if not exists settlement_details (
  id uuid primary key default uuid_generate_v4(),
  expense_id uuid references expenses(id) on delete cascade unique,
  settlement_method text not null,
  settlement_status text check (settlement_status in ('pending_utr', 'pending_confirmation', 'confirmed', 'disputed', 'cancelled')) not null,
  utr_reference text,
  cancellation_reason text,
  initiated_by uuid references profiles(id) not null,
  initiated_at timestamp with time zone default now(),
  confirmed_by uuid references profiles(id),
  confirmed_at timestamp with time zone,
  cross_group_batch_id uuid,
  created_at timestamp with time zone default now()
);

-- 3. ENABLE RLS
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlement_details enable row level security;

-- 4. SECURITY FUNCTIONS
create or replace function is_member_of(_group_id uuid)
returns boolean language plpgsql security definer
as $$
begin
  return exists (select 1 from group_members where group_id = _group_id and user_id = auth.uid());
end;
$$;

-- 5. POLICIES

-- Profiles
create policy "Public profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Groups
create policy "View joined groups" on groups for select using (
  is_member_of(id) OR created_by = auth.uid()
);
create policy "Create groups" on groups for insert with check (
  created_by = auth.uid()
);
create policy "Update groups" on groups for update using (
  is_member_of(id)
);
create policy "Delete groups" on groups for delete using (
  created_by = auth.uid()
);
create policy "Allow last member to delete group" on groups for delete using (
  (select count(*) from group_members where group_id = id) = 1
  and
  (auth.uid() in (select user_id from group_members where group_id = id))
);

-- Members
create policy "View members" on group_members for select using (
  is_member_of(group_id) OR user_id = auth.uid()
);
create policy "Join group" on group_members for insert with check (
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
create policy "View splits" on expense_splits for select using (is_member_of(group_id));
create policy "Add splits" on expense_splits for insert with check (is_member_of(group_id));
create policy "Update splits" on expense_splits for update using (is_member_of(group_id));
create policy "Delete splits" on expense_splits for delete using (is_member_of(group_id));

-- Settlement Details
create policy "View settlement details" on settlement_details for select using (
  expense_id in (
    select e.id from expenses e
    join group_members gm on e.group_id = gm.group_id
    where gm.user_id = auth.uid()
  )
);
create policy "Create settlement details" on settlement_details for insert with check (
  initiated_by = auth.uid()
);
create policy "Update settlement details" on settlement_details for update using (
  initiated_by = auth.uid() or
  expense_id in (
    select e.id from expenses e
    join expense_splits es on e.id = es.expense_id
    where es.user_id = auth.uid()
  )
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. FUNCTIONS
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
  select id, name into target_group_id, target_group_name
  from groups
  where invite_code = invite_code_input;

  if target_group_id is null then
    raise exception 'Invalid invite code';
  end if;

  select exists (
    select 1 from group_members
    where group_id = target_group_id
    and user_id = auth.uid()
  ) into already_member;

  if already_member then
    return json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', true);
  end if;

  insert into group_members (group_id, user_id)
  values (target_group_id, auth.uid());

  return json_build_object('id', target_group_id, 'name', target_group_name, 'already_joined', false);
end;
$$;

-- 8. ATOMIC RPC FUNCTIONS (SECURITY DEFINER)
create or replace function create_expense_rpc(
    p_group_id uuid, p_paid_by uuid, p_amount numeric, p_description text, 
    p_date timestamptz, p_created_by uuid, p_splits jsonb
) returns uuid language plpgsql security definer as $$
declare
    new_expense_id uuid;
    split_record jsonb;
begin
    if not exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid()) then
        raise exception 'Not authorized to add expenses to this group';
    end if;
    insert into expenses (group_id, paid_by, amount, description, date, created_by)
    values (p_group_id, p_paid_by, p_amount, p_description, p_date, p_created_by)
    returning id into new_expense_id;

    for split_record in select * from jsonb_array_elements(p_splits)
    loop
        insert into expense_splits (expense_id, group_id, user_id, owe_amount)
        values (new_expense_id, p_group_id, (split_record->>'user_id')::uuid, (split_record->>'owe_amount')::numeric);
    end loop;
    perform public.notify_single_expense(new_expense_id, 'INSERT', p_created_by);
    return new_expense_id;
end;
$$;

create or replace function update_expense_rpc(
    p_expense_id uuid, p_group_id uuid, p_paid_by uuid, p_amount numeric, 
    p_description text, p_date timestamptz, p_updated_by uuid, p_splits jsonb
) returns void language plpgsql security definer as $$
declare
    split_record jsonb;
begin
    if not exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid()) then
        raise exception 'Not authorized to update expenses in this group';
    end if;
    if not exists (select 1 from expenses where id = p_expense_id and group_id = p_group_id) then
        raise exception 'Expense not found or group mismatch';
    end if;

    update expenses set paid_by = p_paid_by, amount = p_amount, description = p_description, date = p_date, updated_by = p_updated_by, updated_at = now()
    where id = p_expense_id;

    delete from expense_splits where expense_id = p_expense_id;
    for split_record in select * from jsonb_array_elements(p_splits)
    loop
        insert into expense_splits (expense_id, group_id, user_id, owe_amount)
        values (p_expense_id, p_group_id, (split_record->>'user_id')::uuid, (split_record->>'owe_amount')::numeric);
    end loop;
    perform public.notify_single_expense(p_expense_id, 'UPDATE', p_updated_by);
end;
$$;

create or replace function create_settlement_rpc(
    p_group_id uuid, p_paid_by uuid, p_receiver_id uuid, p_amount numeric, 
    p_description text, p_created_by uuid, p_settlement_method text, p_settlement_status text
) returns uuid language plpgsql security definer as $$
declare
    new_expense_id uuid;
begin
    if not exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid()) then
        raise exception 'Not authorized';
    end if;
    insert into expenses (group_id, paid_by, amount, description, category, created_by)
    values (p_group_id, p_paid_by, p_amount, p_description, 'settlement', p_created_by)
    returning id into new_expense_id;

    insert into expense_splits (expense_id, group_id, user_id, owe_amount)
    values (new_expense_id, p_group_id, p_receiver_id, p_amount);

    insert into settlement_details (expense_id, settlement_method, settlement_status, initiated_by, confirmed_by, confirmed_at)
    values (
        new_expense_id, p_settlement_method, p_settlement_status, p_created_by,
        case when p_settlement_status = 'confirmed' then p_created_by else null end,
        case when p_settlement_status = 'confirmed' then now() else null end
    );
    perform public.notify_single_expense(new_expense_id, 'INSERT', p_created_by);
    return new_expense_id;
end;
$$;

create or replace function update_settlement_rpc(
    p_expense_id uuid, p_group_id uuid, p_paid_by uuid, p_receiver_id uuid, 
    p_amount numeric, p_description text, p_updated_by uuid
) returns void language plpgsql security definer as $$
begin
    if not exists (select 1 from group_members where group_id = p_group_id and user_id = auth.uid()) then
        raise exception 'Not authorized';
    end if;
    update expenses set paid_by = p_paid_by, amount = p_amount, description = p_description, updated_by = p_updated_by, updated_at = now()
    where id = p_expense_id;

    delete from expense_splits where expense_id = p_expense_id;
    insert into expense_splits (expense_id, group_id, user_id, owe_amount)
    values (p_expense_id, p_group_id, p_receiver_id, p_amount);
end;
$$;


-- ============================================================================
-- 3. RESTORE PROFILES (Sync from auth.users)
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

-- ============================================================================
-- 4. NOTIFICATIONS SYSTEM (Integrated)
-- ============================================================================

-- 4.1 Create Table
create table if not exists notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null check (type in ('expense_created', 'expense_updated', 'expense_deleted', 'settlement_created', 'settlement_updated', 'settlement_deleted')),
  title text not null,
  message text not null,
  data jsonb,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4.2 Enable RLS & Realtime
alter table notifications enable row level security;

-- Enable Realtime (This might fail if already added, so we wrap in a block or just run it)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- 4.3 Policies
create policy "View own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Update own notifications" on notifications for update using (auth.uid() = user_id);

-- 4.4 Cleanup Trigger (7 Days Retention)
create or replace function public.cleanup_notifications()
returns trigger as $$
begin
  delete from notifications 
  where user_id = new.user_id 
  and created_at < now() - interval '2 days';
  return new;
end;
$$ language plpgsql security definer;

create trigger on_notification_created
  after insert on notifications
  for each row execute procedure public.cleanup_notifications();

-- 4.4.5 Push Helper
create or replace function public.send_push_to_user(
  p_user_id uuid,
  p_title   text,
  p_body    text
) returns void language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := 'https://ryjhfcfyglaabpowoxwk.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'targetUserId', p_user_id,
      'title',        p_title,
      'body',         p_body
    )
  );
end;
$$;

-- 4.5 Single Notification Function (Triggered by RPCs)
create or replace function public.notify_single_expense(
  p_expense_id uuid,
  p_action text,
  p_actor_id uuid
) returns void language plpgsql security definer as $$
declare
  exp_rec record;
  group_name text;
  actor_name text;
  target_user_id uuid;
  is_sett_create boolean;
  notif_type text;
  notif_title text;
  notif_msg_inapp text;
  notif_msg_push text;
begin
  select * into exp_rec from expenses where id = p_expense_id;
  if not found then return; end if;

  select name into group_name from groups where id = exp_rec.group_id;
  select split_part(full_name, ' ', 1) into actor_name from profiles where id = p_actor_id;
  
  is_sett_create := (exp_rec.category = 'settlement' and p_action = 'INSERT');

  if p_action = 'INSERT' then
    if is_sett_create then
       notif_type := 'settlement_created';
       notif_title := 'New Settlement Request';
       notif_msg_inapp := 'Settlement of ' || exp_rec.amount || ' proposed';
       notif_msg_push := 'A settlement was created by ' || coalesce(actor_name, 'Someone') || ' in ' || coalesce(group_name, 'a group');
    else
       notif_type := 'expense_created';
       notif_title := 'Expense Added';
       notif_msg_inapp := 'Added: ' || exp_rec.description || ' (' || exp_rec.amount || ')';
       notif_msg_push := '"' || exp_rec.description || '" of ' || exp_rec.amount || ' was added by ' || coalesce(actor_name, 'Someone') || ' in ' || coalesce(group_name, 'a group');
    end if;
  elsif p_action = 'UPDATE' and exp_rec.category != 'settlement' then
    notif_type := 'expense_updated';
    notif_title := 'Expense Edited';
    notif_msg_inapp := 'Updated: ' || exp_rec.description;
    notif_msg_push := '"' || exp_rec.description || '" of ' || exp_rec.amount || ' was edited by ' || coalesce(actor_name, 'Someone') || ' in ' || coalesce(group_name, 'a group');
  else
    return;
  end if;

  for target_user_id in 
    select distinct user_id from (
      select user_id from expense_splits where expense_id = p_expense_id
      union
      select exp_rec.paid_by
    ) involved
    where user_id != p_actor_id
  loop
    insert into notifications (user_id, type, title, message, data)
    values (target_user_id, notif_type, notif_title, notif_msg_inapp, jsonb_build_object('group_id', exp_rec.group_id, 'expense_id', exp_rec.id));
    
    begin
        execute format('select public.send_push_to_user(%L, %L, %L)', target_user_id, notif_title, notif_msg_push);
    exception when undefined_function then
    end;
  end loop;
end;
$$;

-- 4.6 Unified Expense Delete Trigger
create or replace function public.notify_expense_deleted_trigger()
returns trigger language plpgsql security definer as $$
declare
  actor_id uuid;
  actor_name text;
  group_name text;
  target_user_id uuid;
  is_settlement boolean;
  notif_type text;
  notif_title text;
  notif_msg_inapp text;
  notif_msg_push text;
begin
  actor_id := coalesce(auth.uid(), old.updated_by, old.paid_by);
  select split_part(full_name, ' ', 1) into actor_name from profiles where id = actor_id;
  select name into group_name from groups where id = old.group_id;
  
  is_settlement := (old.category = 'settlement');

  if is_settlement then
    notif_type := 'settlement_deleted';
    notif_title := 'Settlement Cancelled';
    notif_msg_inapp := 'Settlement of ' || old.amount || ' removed';
    notif_msg_push := 'A settlement was cancelled by ' || coalesce(actor_name, 'Someone') || ' in ' || coalesce(group_name, 'a group');
  else
    notif_type := 'expense_deleted';
    notif_title := 'Expense Deleted';
    notif_msg_inapp := 'Expense "' || old.description || '" removed';
    notif_msg_push := '"' || old.description || '" was deleted by ' || coalesce(actor_name, 'Someone') || ' in ' || coalesce(group_name, 'a group');
  end if;

  for target_user_id in 
    select distinct user_id from (
      select user_id from expense_splits where expense_id = old.id
      union
      select old.paid_by
    ) involved
    where user_id != actor_id
  loop
    insert into notifications (user_id, type, title, message, data)
    values (target_user_id, notif_type, notif_title, notif_msg_inapp, jsonb_build_object('group_id', old.group_id));
    
    begin
       execute format('select public.send_push_to_user(%L, %L, %L)', target_user_id, notif_title, notif_msg_push);
    exception when undefined_function then
    end;
  end loop;

  return old;
end;
$$;

drop trigger if exists on_expense_delete_unified on expenses;
create trigger on_expense_delete_unified
  before delete on expenses
  for each row execute procedure public.notify_expense_deleted_trigger();


-- 4.6 Settlement Status Trigger
create or replace function public.handle_settlement_updates()
returns trigger as $$
declare
  group_id uuid;
  group_name text;
  initiator_id uuid;
  payer_id uuid;
  actor_name text;
begin
  select e.group_id, e.created_by, e.paid_by into group_id, initiator_id, payer_id
  from expenses e where e.id = new.expense_id;
  select name into group_name from groups where id = group_id;

  if (new.settlement_status != old.settlement_status) then
      -- Notify Initiator
      insert into notifications (user_id, type, title, message, data)
      values (
        initiator_id, 'settlement_updated',
        'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')),
        'Settlement in ' || group_name || ' is now ' || new.settlement_status,
        jsonb_build_object('group_id', group_id, 'expense_id', new.expense_id)
      );
      
      select split_part(full_name, ' ', 1) into actor_name from profiles where id = coalesce(new.confirmed_by, payer_id);
      
      begin
         execute format('select public.send_push_to_user(%L, %L, %L)', initiator_id, 'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')), 'A settlement was ' || lower(replace(new.settlement_status, '_', ' ')) || ' by ' || coalesce(actor_name, 'Someone') || ' in ' || group_name);
      exception when undefined_function then
      end;

      -- Notify Payer if confirmed
      if (payer_id != initiator_id AND new.settlement_status = 'confirmed') then
        insert into notifications (user_id, type, title, message, data)
        values (
          payer_id, 'settlement_updated', 'Settlement Confirmed',
          'Settlement in ' || group_name || ' is now confirmed',
          jsonb_build_object('group_id', group_id, 'expense_id', new.expense_id)
        );
        -- In our schema, payer = the person who is owed. initiator = the person paying.
        -- When confirmed, the initiator is notified above. The payer is notified here.
      end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_settlement_update
  after update on settlement_details
  for each row execute procedure public.handle_settlement_updates();
