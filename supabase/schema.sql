-- Run this in your Supabase project: SQL Editor → New query → paste → Run

-- Table for scraped Telegram messages (from telegram_scraper.py)
create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id bigint not null,
  channel_username text,
  channel_title text,
  message_id bigint not null,
  date timestamptz not null,
  text text not null default '',
  text_translated text,
  views int,
  forwards int,
  url text,
  created_at timestamptz default now(),
  unique(channel_id, message_id)
);

-- Index for dashboard: newest first and filter by time
create index if not exists idx_telegram_messages_date on public.telegram_messages (date desc);
create index if not exists idx_telegram_messages_channel on public.telegram_messages (channel_username);

-- Allow anonymous read (dashboard uses anon key). Scraper uses service_role key (bypasses RLS).
alter table public.telegram_messages enable row level security;

drop policy if exists "Allow public read" on public.telegram_messages;
create policy "Allow public read"
  on public.telegram_messages for select
  using (true);

-- Optional: enable Realtime so the dashboard can show new messages live
-- (Run this after the table has data, or Supabase may show a warning.)
-- alter publication supabase_realtime add table public.telegram_messages;
