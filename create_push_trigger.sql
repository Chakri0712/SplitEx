-- ============================================================================
-- PUSH NOTIFICATION TRIGGERS
-- Sends FCM pushes via the `send-push` Edge Function for:
--   - Expense: added, edited, deleted
--   - Settlement: created, confirmed, cancelled
--
-- NOTE: These are PUSH triggers only. In-app notifications are handled
-- by handle_expense_changes() and handle_settlement_updates() in restore_schema.sql.
-- ============================================================================

-- Drop old split-based trigger (caused 1 push per split row = duplicates)
drop trigger if exists on_split_insert on public.expense_splits;
drop function if exists public.trigger_push_notification_on_split();
drop function if exists public.trigger_push_notification_on_expense();

-- ============================================================================
-- HELPER: send a push to a single user via the Edge Function
-- ============================================================================
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

-- ============================================================================
-- TRIGGER 1: Expense INSERT  →  notify all group members except the payer
-- ============================================================================
create or replace function public.push_on_expense_insert()
returns trigger language plpgsql security definer as $$
declare
  actor_name  text;
  group_name  text;
  member_row  record;
  notif_body  text;
begin
  -- Skip settlement expenses (handled by settlement trigger)
  if new.category = 'settlement' then
    return new;
  end if;

  select split_part(full_name, ' ', 1) into actor_name
  from public.profiles where id = new.paid_by;

  select name into group_name
  from public.groups where id = new.group_id;

  notif_body := '"' || new.description || '" of ' || new.amount
                || ' was added by ' || coalesce(actor_name, 'Someone')
                || ' in ' || coalesce(group_name, 'a group');

  for member_row in
    select user_id from public.group_members
    where group_id = new.group_id and user_id != new.paid_by
  loop
    perform public.send_push_to_user(
      member_row.user_id,
      'Expense Added',
      notif_body
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_expense_insert on public.expenses;
create trigger on_expense_insert
  after insert on public.expenses
  for each row execute function public.push_on_expense_insert();

-- ============================================================================
-- TRIGGER 2: Expense UPDATE  →  notify all group members except the editor
-- ============================================================================
create or replace function public.push_on_expense_update()
returns trigger language plpgsql security definer as $$
declare
  actor_name  text;
  group_name  text;
  member_row  record;
  actor_id    uuid;
  notif_body  text;
begin
  -- Skip settlement expenses and settlement-status-only updates
  if new.category = 'settlement' then
    return new;
  end if;

  -- Only fire if something meaningful changed
  if new.amount = old.amount and new.description = old.description
     and new.paid_by = old.paid_by then
    return new;
  end if;

  actor_id := coalesce(new.updated_by, new.paid_by);

  select split_part(full_name, ' ', 1) into actor_name
  from public.profiles where id = actor_id;

  select name into group_name
  from public.groups where id = new.group_id;

  notif_body := '"' || new.description || '" of ' || new.amount
                || ' was edited by ' || coalesce(actor_name, 'Someone')
                || ' in ' || coalesce(group_name, 'a group');

  for member_row in
    select user_id from public.group_members
    where group_id = new.group_id and user_id != actor_id
  loop
    perform public.send_push_to_user(
      member_row.user_id,
      'Expense Edited',
      notif_body
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_expense_update on public.expenses;
create trigger on_expense_update
  after update on public.expenses
  for each row execute function public.push_on_expense_update();

-- ============================================================================
-- TRIGGER 3: Expense DELETE  →  notify all group members
-- ============================================================================
create or replace function public.push_on_expense_delete()
returns trigger language plpgsql security definer as $$
declare
  actor_name  text;
  group_name  text;
  member_row  record;
  actor_id    uuid;
  notif_body  text;
begin
  -- Skip settlement expenses
  if old.category = 'settlement' then
    return old;
  end if;

  actor_id := coalesce(old.updated_by, old.paid_by);

  select split_part(full_name, ' ', 1) into actor_name
  from public.profiles where id = actor_id;

  select name into group_name
  from public.groups where id = old.group_id;

  notif_body := '"' || old.description || '" was deleted by '
                || coalesce(actor_name, 'Someone')
                || ' in ' || coalesce(group_name, 'a group');

  for member_row in
    select user_id from public.group_members
    where group_id = old.group_id and user_id != actor_id
  loop
    perform public.send_push_to_user(
      member_row.user_id,
      'Expense Deleted',
      notif_body
    );
  end loop;

  return old;
end;
$$;

drop trigger if exists on_expense_delete on public.expenses;
create trigger on_expense_delete
  after delete on public.expenses
  for each row execute function public.push_on_expense_delete();

-- ============================================================================
-- TRIGGER 4 & 5: Settlement INSERT/UPDATE
-- settlement_details.initiated_by = person who created the settlement
-- counterparty = the expense split receiver (not initiated_by)
-- ============================================================================
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
  -- Get expense info (group + payer)
  select e.group_id, e.paid_by into expense_rec
  from public.expenses e where e.id = new.expense_id;

  select name into group_name
  from public.groups where id = expense_rec.group_id;

  if (TG_OP = 'INSERT') then
    -- Created: notify the counterparty (expense paid_by, i.e. who is owed)
    actor_id     := new.initiated_by;
    counterparty := expense_rec.paid_by;

    -- Don't notify if actor is the same as counterparty (self-settlement)
    if actor_id = counterparty then return new; end if;

    select split_part(full_name, ' ', 1) into actor_name
    from public.profiles where id = actor_id;

    notif_title := 'Settlement Created';
    notif_body  := 'A settlement was created by ' || coalesce(actor_name, 'Someone')
                   || ' in ' || coalesce(group_name, 'a group');

    perform public.send_push_to_user(counterparty, notif_title, notif_body);

  elsif (TG_OP = 'UPDATE') then
    -- Only fire when status actually changed
    if new.settlement_status = old.settlement_status then return new; end if;

    if new.settlement_status = 'confirmed' then
      -- Confirmed: notify the initiator
      actor_id     := coalesce(new.confirmed_by, expense_rec.paid_by);
      counterparty := new.initiated_by;
      notif_title  := 'Settlement Confirmed';

    elsif new.settlement_status = 'cancelled' then
      -- Cancelled: notify the counterparty (not whoever cancelled)
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

drop trigger if exists on_settlement_insert on public.settlement_details;
create trigger on_settlement_insert
  after insert on public.settlement_details
  for each row execute function public.push_on_settlement_change();

drop trigger if exists on_settlement_update on public.settlement_details;
create trigger on_settlement_update
  after update on public.settlement_details
  for each row execute function public.push_on_settlement_change();
