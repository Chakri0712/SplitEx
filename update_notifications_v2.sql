-- ============================================================================
-- 1. DROP EXISTING TRIGGERS (To replace with better logic)
-- ============================================================================
drop trigger if exists on_expense_change on expenses;
drop function if exists public.handle_expense_changes;

-- ============================================================================
-- 2. IMPROVED FUNCTION: Handle Expenses (Insert, Update, Delete)
-- ============================================================================
create or replace function public.handle_expense_changes()
returns trigger as $$
declare
  target_user_id uuid;
  group_name text;
  record_data record; -- To hold NEW or OLD depending on op
  is_settlement boolean;
begin
  -- Determine operation type and relevant record
  if (TG_OP = 'DELETE') then
    record_data := old;
  else
    record_data := new;
  end if;

  -- Get Group Name
  select name into group_name from groups where id = record_data.group_id;
  
  -- Check if Settlement
  is_settlement := (record_data.category = 'settlement');

  -- ======================
  -- CASE: INSERT
  -- ======================
  if (TG_OP = 'INSERT') then
    -- Loop through group members (excluding creator)
    for target_user_id in 
      select user_id from group_members where group_id = record_data.group_id and user_id != record_data.created_by
    loop
      if (is_settlement) then
         -- NOTIFICATION: New Settlement
         insert into notifications (user_id, type, title, message, data)
         values (
           target_user_id,
           'settlement_created',
           'New Settlement Request',
           'Settlement of ' || record_data.amount || ' proposed in ' || group_name,
           jsonb_build_object('group_id', record_data.group_id, 'expense_id', record_data.id)
         );
      else
         -- NOTIFICATION: New Expense
         insert into notifications (user_id, type, title, message, data)
         values (
           target_user_id,
           'expense_created',
           'New Expense in ' || group_name,
           'Added: ' || record_data.description || ' (' || record_data.amount || ')',
           jsonb_build_object('group_id', record_data.group_id, 'expense_id', record_data.id)
         );
      end if;
    end loop;
    return new;
  end if;

  -- ======================
  -- CASE: UPDATE
  -- ======================
  if (TG_OP = 'UPDATE') then
    -- We generally ignore Settlement UPDATES here because status changes happen in 'settlement_details'
    -- Only notify for Expenses if critical fields change
    if (not is_settlement) then
        if (new.amount != old.amount or new.description != old.description) then
           for target_user_id in 
              select user_id from group_members where group_id = new.group_id and user_id != new.updated_by
           loop
              insert into notifications (user_id, type, title, message, data)
              values (
                target_user_id,
                'expense_updated',
                'Expense Updated',
                'Updated: ' || new.description,
                jsonb_build_object('group_id', new.group_id, 'expense_id', new.id)
              );
           end loop;
        end if;
    end if;
    return new;
  end if;

  -- ======================
  -- CASE: DELETE
  -- ======================
  if (TG_OP = 'DELETE') then
     -- Notify everyone (except maybe the person who triggered it? DB doesn't know 'who' deleted easily without auth.uid context)
     -- We'll just notify everyone in the group.
     for target_user_id in 
       select user_id from group_members where group_id = old.group_id
     loop
        -- Skip notifying the user if we could identify them, but for now notify all
        -- Ideally we filter out auth.uid() but triggers run as postgres
        
        insert into notifications (user_id, type, title, message, data)
        values (
          target_user_id,
          CASE WHEN is_settlement THEN 'settlement_deleted' ELSE 'expense_deleted' END,
          CASE WHEN is_settlement THEN 'Settlement Cancelled' ELSE 'Expense Deleted' END,
          case 
            when is_settlement then 'Settlement of ' || old.amount || ' was removed from ' || group_name
            else 'Expense "' || old.description || '" was removed from ' || group_name
          end,
          jsonb_build_object('group_id', old.group_id) -- No expense_id as it's gone
        );
     end loop;
     return old;
  end if;

  return null;
end;
$$ language plpgsql security definer;

-- Re-attach Trigger to Expenses
create trigger on_expense_change
  after insert or update or delete on expenses
  for each row execute procedure public.handle_expense_changes();


-- ============================================================================
-- 3. NEW TRIGGER: Handle Settlement Status Changes
-- ============================================================================
create or replace function public.handle_settlement_updates()
returns trigger as $$
declare
  group_id uuid;
  group_name text;
  expense_desc text;
  target_user_id uuid;
  initiator_id uuid;
  payer_id uuid;
begin
  -- Get Expense Info linked to this settlement
  select e.group_id, e.description, e.created_by, e.paid_by 
  into group_id, expense_desc, initiator_id, payer_id
  from expenses e 
  where e.id = new.expense_id;

  select name into group_name from groups where id = group_id;

  -- Only notify on Status Change
  if (new.settlement_status != old.settlement_status) then
      
      -- Determine who to notify:
      -- Usually notify the person who created the settlement (initiator) that it was confirmed/rejected
      -- And maybe the payer?
      -- Simple rule: Notify the Initiator (unless they are the one changing it, but hard to know)
      -- Using 'receiver' logic: 
      -- If Payer (Sender) confirms, Receiver (Initiator) gets notified.
      
      -- We will notify the 'initiator_id' (The one who entered the settlement expense)
      -- We will ALSO notify the 'payer_id' if they weren't the one who triggered this? 
      -- Let's just notify the 'Initiator' for now, assuming they are waiting for confirmation.
      
      insert into notifications (user_id, type, title, message, data)
      values (
        initiator_id,
        'settlement_updated',
        'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')), -- e.g. "Confirmed", "Disputed"
        'Settlement in ' || group_name || ' is now ' || new.settlement_status,
        jsonb_build_object('group_id', group_id, 'expense_id', new.expense_id)
      );
      
      -- Also notify the Payer if the status is 'confirmed' (Just to be sure they know it succeeded)
      if (payer_id != initiator_id) then
        insert into notifications (user_id, type, title, message, data)
        values (
          payer_id,
          'settlement_updated',
          'Settlement ' || initcap(replace(new.settlement_status, '_', ' ')),
          'Settlement in ' || group_name || ' is now ' || new.settlement_status,
          jsonb_build_object('group_id', group_id, 'expense_id', new.expense_id)
        );
      end if;

  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Attach Trigger to Settlement Details
drop trigger if exists on_settlement_update on settlement_details;
create trigger on_settlement_update
  after update on settlement_details
  for each row execute procedure public.handle_settlement_updates();
