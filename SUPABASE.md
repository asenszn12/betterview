# Supabase setup for Betterview

Use Supabase to store scraped Telegram messages and power the dashboard feed (with optional realtime updates).

---

## 1. Create the table in Supabase

1. Open your [Supabase](https://supabase.com) project.
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of **`supabase/schema.sql`** and run it.

That creates the `telegram_messages` table and allows public read access so the dashboard can fetch data.

---

## 2. Scraper: upload to Supabase

Add these to your **`.env`** in the `betterview` folder (same place as `TELEGRAM_API_ID`):

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
```

- **SUPABASE_URL**: Project URL (Settings → API).
- **SUPABASE_SERVICE_KEY**: `service_role` key (Settings → API). Keep this secret; use only in the scraper, not in the frontend.

Install the Supabase client and run the scraper with `--supabase`:

```bash
pip install supabase
python telegram_scraper.py --supabase --translate
```

Scraped messages are upserted into `telegram_messages` (no duplicates by channel + message_id).

---

## 3. Dashboard: read from Supabase

In the **`web`** folder, create a **`.env`** file (or copy from `.env.example`):

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

- Use the **anon/public** key (Settings → API), not the service role key.

Then:

```bash
cd web
npm install
npm run dev
```

The feed panel will load messages from Supabase, show links to Telegram posts, and timestamps. New rows inserted by the scraper can be shown in near realtime if Realtime is enabled (see below).

---

## 4. Optional: Realtime updates

To have the dashboard update when new messages are inserted:

1. In Supabase **SQL Editor**, run:
   ```sql
   alter publication supabase_realtime add table public.telegram_messages;
   ```
2. If you get an error (e.g. table already in publication), you can ignore it.

The feed subscribes to inserts and refetches when new data arrives.

---

## Summary

| What              | Where to get it        | Used by                |
|-------------------|------------------------|------------------------|
| SUPABASE_URL      | Settings → API         | Scraper + Dashboard    |
| SUPABASE_SERVICE_KEY | Settings → API (service_role) | Scraper only (.env) |
| SUPABASE_ANON_KEY   | Settings → API (anon)  | Dashboard only (web/.env as VITE_SUPABASE_ANON_KEY) |

Run the schema once, add keys to `.env` and `web/.env`, then use `--supabase` when scraping and run the web app to see the live feed.
