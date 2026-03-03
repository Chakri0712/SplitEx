-- Create a table to store FCM tokens for users
create table public.fcm_tokens (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    token text not null unique,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.fcm_tokens enable row level security;

-- Policies for fcm_tokens
create policy "Users can view their own fcm tokens"
    on public.fcm_tokens for select
    using (auth.uid() = user_id);

create policy "Users can insert their own fcm tokens"
    on public.fcm_tokens for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own fcm tokens"
    on public.fcm_tokens for update
    using (auth.uid() = user_id);

create policy "Users can delete their own fcm tokens"
    on public.fcm_tokens for delete
    using (auth.uid() = user_id);
