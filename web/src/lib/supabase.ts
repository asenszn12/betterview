import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export type TelegramMessage = {
  id: string;
  channel_id: number;
  channel_username: string | null;
  channel_title: string | null;
  message_id: number;
  date: string;
  text: string;
  text_translated: string | null;
  views: number | null;
  forwards: number | null;
  url: string | null;
  created_at: string;
};
