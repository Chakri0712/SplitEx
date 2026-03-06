-- ============================================================================
-- SAFE NOTIFICATION PATCH
-- THIS SCRIPT IS 100% SAFE to run on your production database.
-- It ONLY updates functions and triggers. It DOES NOT drop or modify your tables/data.
-- ============================================================================

-- 1. DROP OBSOLETE TRIGGERS & FUNCTIONS
drop trigger if exists on_expense_change on public.expenses;
drop trigger if exists on_expense_insert on public.expenses;
drop trigger if exists on_expense_update on public.expenses;
drop trigger if exists on_expense_delete on public.expenses;
drop trigger if exists on_split_insert on public.expense_splits;
drop trigger if exists on_settlement_insert on public.settlement_details;

drop function if exists public.handle_expense_changes;
drop function if exists public.push_on_expense_insert;
drop function if exists public.push_on_expense_update;
drop function if exists public.push_on_expense_delete;
drop function if exists public.trigger_push_notification_on_split;
drop function if exists public.trigger_push_notification_on_expense;

-- 2. CREATE PUSH HELPER (If not exists)
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

-- 3. UNIFIED SETTLEMENT UPDATE TRIGGER ONLY
create or replace function public.push_on_settlement_change()
returns trigger language plpgsql security definer as $$
declare
  expense_rec   record;
  group_name    text;
  actor_name    text;
  counterparty  uuid;
  actor_id      uuid;
  notif_title   text;
  notif_body    text;
begin
  if (TG_OP = 'INSERT') then return new; end if;

  select e.group_id, e.paid_by into expense_rec
  from public.expenses e where e.id = new.expense_id;

  select name into group_name
  from public.groups where id = expense_rec.group_id;

  if (TG_OP = 'UPDATE') then
    if new.settlement_status = old.settlement_status then return new; end if;

    if new.settlement_status = 'confirmed' then
      -- Confirmed: notify the initiator (who paid the settlement)
      actor_id     := coalesce(new.confirmed_by, expense_rec.paid_by);
      counterparty := new.initiated_by;
      notif_title  := 'Settlement Confirmed';
    elsif new.settlement_status = 'cancelled' then
      -- Cancelled: notify the initiator (who paid the settlement)
      actor_id     := new.initiated_by;
      counterparty := expense_rec.paid_by;
      notif_title  := 'Settlement Cancelled';
    else
      return new;
    end if;

    if actor_id = counterparty then return new; end if;

    select split_part(full_name, ' ', 1) into actor_name
    from public.profiles where id = actor_id;

    notif_body := 'A settlement was ' || lower(replace(new.settlement_status, '_', ' '))
                  || ' by ' || coalesce(actor_name, 'Someone')
                  || ' in ' || coalesce(group_name, 'a group');

    perform public.send_push_to_user(counterparty, notif_title, notif_body);
  end if;

  return new;
end;
$$;

drop trigger if exists on_settlement_update on public.settlement_details;
create trigger on_settlement_update
  after update on public.settlement_details
  for each row execute function public.push_on_settlement_change();

-- 4. UNIFIED IN-APP + PUSH NOTIFICATION FUNCTION
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


-- 5. UPDATE RPCS TO FIRE NOTIFICATIONS
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

-- 6. UNIFIED EXPENSE DELETE TRIGGER
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
