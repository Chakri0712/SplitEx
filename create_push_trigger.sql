-- 1. Create the webhook function that calls our Edge Function
create or replace function public.trigger_push_notification_on_expense()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_url text := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/send-push';
  group_name_var text;
  auth_header text := current_setting('request.headers')::json->>'authorization';
  split_record record;
begin
  -- If we can't figure out the host (e.g., local dev without direct proxy forwarding), hardcode your project URL.
  -- edge_function_url := 'https://ryjhfcfyglaabpowoxwk.supabase.co/functions/v1/send-push';
  edge_function_url := 'https://ryjhfcfyglaabpowoxwk.supabase.co/functions/v1/send-push';

  -- Fetch the group name for context
  select name into group_name_var from public.groups where id = new.group_id;

  -- Get all the people involved in this expense (excluding the payer)
  for split_record in
    select user_id from public.expense_splits where expense_id = new.id and user_id != new.paid_by
  loop
    -- Make HTTP POST request to our Edge Function for each person involved
    -- We use pg_net extension (which is pre-installed on Supabase)
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', coalesce(auth_header, 'Bearer ' || current_setting('request.jwt.claim.role', true)) -- Fallback
      ),
      body := jsonb_build_object(
        'targetUserId', split_record.user_id,
        'title', 'New Expense in ' || group_name_var,
        'body', 'An expense "' || new.description || '" of ' || new.amount || ' was just added!'
      )
    );
  end loop;

  return new;
end;
$$;

-- 2. Attach the trigger to the expenses table
-- We use AFTER INSERT because the splits are usually inserted right after the expense
-- Wait, splits are inserted *after* the expense. If we trigger on expense insert, the splits might not exist yet!
-- Alternatively, trigger on `expense_splits` instead.

drop function if exists public.trigger_push_notification_on_expense cascade;


-- Revised strategy: Trigger on expense_splits insert
create or replace function public.trigger_push_notification_on_split()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_url text := 'https://ryjhfcfyglaabpowoxwk.supabase.co/functions/v1/send-push';
  expense_record record;
  group_name_var text;
  auth_header text;
begin
  -- Note: HTTP POSTs in triggers can sometimes be tricky with auth headers if triggered from the background.
  -- We'll try to extract the service_role key or use anon key if available, but since standard `net.http_post` 
  -- in Supabase is fire-and-forget, we might need a stored secret, OR our Edge function shouldn't require auth 
  -- (which might be risky, but we can secure it by expecting a secret header). 
  
  -- For now, we will pass a placeholder Authorization if missing.
  auth_header := current_setting('request.headers', true)::json->>'authorization';

  -- Only notify if the person being split on is NOT the person who paid
  select * into expense_record from public.expenses where id = new.expense_id;
  
  if expense_record.paid_by != new.user_id then
    
    select name into group_name_var from public.groups where id = expense_record.group_id;

    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', coalesce(auth_header, 'Bearer dummy')
      ),
      body := jsonb_build_object(
        'targetUserId', new.user_id,
        'title', 'New Split in ' || group_name_var,
        'body', 'You owe ' || new.owe_amount || ' for "' || expense_record.description || '"'
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_split_insert on public.expense_splits;
create trigger on_split_insert
  after insert on public.expense_splits
  for each row
  execute function public.trigger_push_notification_on_split();
