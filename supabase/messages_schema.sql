-- Table for geolocate dashboard → globe pulsating signals.
-- Run in Supabase SQL Editor. Then set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env for the Python script.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  message_text text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  severity text not null default 'low' check (severity in ('critical', 'high', 'low')),
  telegram_url text,
  location_label text,
  created_at timestamptz default now()
);

create index if not exists idx_messages_created on public.messages (created_at desc);

alter table public.messages enable row level security;

drop policy if exists "Allow public read" on public.messages;
create policy "Allow public read"
  on public.messages for select
  using (true);

-- Allow service role (Python script) to insert; anon can only read.
-- Scraper uses SUPABASE_SERVICE_KEY (service_role), so inserts work without a policy for anon.

-- If table already exists, add new columns:
-- alter table public.messages add column if not exists telegram_url text;
-- alter table public.messages add column if not exists location_label text;

-- Optional: realtime so the globe updates live when the script inserts
-- alter publication supabase_realtime add table public.messages;
