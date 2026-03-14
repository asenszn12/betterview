-- Run in Supabase SQL Editor for Thunderdome MONITOR globe (intel_messages).
create table if not exists public.intel_messages (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null,
  longitude double precision not null,
  country_name text,
  message_count int not null default 1,
  text_snippet text,
  created_at timestamptz default now()
);

create index if not exists idx_intel_messages_created on public.intel_messages (created_at desc);

alter table public.intel_messages enable row level security;

drop policy if exists "Allow public read" on public.intel_messages;
create policy "Allow public read"
  on public.intel_messages for select
  using (true);
