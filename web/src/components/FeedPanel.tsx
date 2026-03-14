import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TelegramMessage } from '../lib/supabase';
import { TelegramIcon } from './TelegramIcon';
import './FeedPanel.css';

const MAX_TEXT_PREVIEW = 320;

function FeedItemCard({
  msg,
  level,
  displayText,
  channelName,
  channelUrl,
  isLong,
  formatTimeAgo,
}: {
  msg: TelegramMessage;
  level: 'CRITICAL' | 'HIGH' | 'LOW';
  displayText: string;
  channelName: string;
  channelUrl: string | null;
  isLong: boolean;
  formatTimeAgo: (msg: TelegramMessage) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = expanded || !isLong ? displayText : displayText.slice(0, MAX_TEXT_PREVIEW) + (displayText.length > MAX_TEXT_PREVIEW ? '…' : '');
  const postUrl = msg.url || (channelUrl ? `${channelUrl}/${msg.message_id}` : null);

  const content = (
    <>
      <div className="feed-item-header">
        <div className="feed-item-icon-wrap">
          <TelegramIcon className="feed-item-telegram-icon" />
        </div>
        <div className="feed-item-meta">
          {channelUrl ? (
            <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="feed-item-sender feed-item-sender-link" onClick={(e) => e.stopPropagation()}>
              {channelName}
            </a>
          ) : (
            <span className="feed-item-sender">{channelName}</span>
          )}
          <span className={`feed-item-level level-${level.toLowerCase()}`}>{level}</span>
          <span className="feed-item-time" title={msg.date || msg.created_at || ''}>{formatTimeAgo(msg)}</span>
        </div>
      </div>
      <div className="feed-item-tags">
        <span className={`feed-tag feed-tag-${level.toLowerCase()}`}>{level}</span>
        <span className="feed-tag feed-tag-telegram">TELEGRAM</span>
      </div>
      <p className="feed-item-text">{text}</p>
      {isLong && !expanded && (
        <button type="button" className="feed-item-show-more" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(true); }}>
          Show more
        </button>
      )}
    </>
  );

  if (postUrl) {
    return (
      <article
        className="feed-item feed-item-clickable"
        role="link"
        tabIndex={0}
        onClick={() => window.open(postUrl, '_blank', 'noopener,noreferrer')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(postUrl, '_blank', 'noopener,noreferrer'); } }}
      >
        {content}
      </article>
    );
  }
  return <article className="feed-item">{content}</article>;
}

function parseSupabaseTime(s: string | null | undefined): number | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function formatTimeAgo(msg: TelegramMessage): string {
  try {
    // Use message post time (date) from Supabase; fallback to created_at (when we ingested it)
    const dateMs = parseSupabaseTime(msg.date) ?? parseSupabaseTime(msg.created_at);
    if (dateMs == null) return 'just now';
    const now = Date.now();
    let sec = Math.floor((now - dateMs) / 1000);
    if (sec < 0) sec = 0;
    if (sec < 60) return 'just now';
    if (sec < 3600) {
      const mins = Math.floor(sec / 60);
      return mins === 1 ? '1 min ago' : `${mins} min ago`;
    }
    if (sec < 86400) {
      const hrs = Math.floor(sec / 3600);
      return hrs === 1 ? '1 hr ago' : `${hrs} hr ago`;
    }
    const days = Math.floor(sec / 86400);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  } catch {
    return 'just now';
  }
}

function messageToLevel(_m: TelegramMessage): 'CRITICAL' | 'HIGH' | 'LOW' {
  const t = (_m.text_translated || _m.text).toLowerCase();
  if (t.includes('critical') || t.includes('breaking') || t.includes('alert')) return 'CRITICAL';
  if (t.includes('strike') || t.includes('missile') || t.includes('attack')) return 'HIGH';
  return 'LOW';
}

const REFETCH_INTERVAL_MS = 60 * 1000; // 1 min – pull new messages from Supabase
const RECENCY_TICK_MS = 60 * 1000;      // 1 min – re-render "X min ago" so it updates

export function FeedPanel() {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setMessages([
        {
          id: '1',
          channel_id: 0,
          channel_username: 'bv_intel',
          channel_title: 'Betterview Monitor',
          message_id: 0,
          date: new Date().toISOString(),
          text: 'Connect Supabase to show live Telegram feed. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to web/.env and run the scraper with --supabase.',
          text_translated: null,
          views: null,
          forwards: null,
          url: null,
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    const client = supabase;

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await client
        .from('telegram_messages')
        .select('id, channel_id, channel_username, channel_title, message_id, date, text, text_translated, views, forwards, url, created_at')
        .order('date', { ascending: false })
        .limit(100);
      setLoading(false);
      if (e) {
        const msg = e.message || '';
        if (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('relation') || msg.includes('telegram')) {
          setError('Table not found. In Supabase go to SQL Editor, run the script in betterview/supabase/schema.sql to create the telegram_messages table, then run the Telegram scraper with --supabase.');
        } else {
          setError(msg);
        }
        return;
      }
      const list = (data as TelegramMessage[]) || [];
      setMessages(list);
    };

    fetchMessages();
    const refetchTimer = setInterval(fetchMessages, REFETCH_INTERVAL_MS);
    return () => clearInterval(refetchTimer);
  }, []);

  // Re-render recency labels every minute so "5 min ago" becomes "6 min ago"
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), RECENCY_TICK_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="feed-panel">
      <div className="feed-tabs">
        <button type="button" className="feed-tab active">FEED</button>
      </div>
      <div className="feed-toolbar">
        <span className="feed-toolbar-icon" aria-hidden>⊞</span>
        <span className="feed-toolbar-icon" aria-hidden>▤</span>
        <span className="feed-toolbar-icon feed-toolbar-telegram" aria-hidden><TelegramIcon /></span>
        <input type="search" placeholder="Q Search..." className="feed-search" aria-label="Search feed" />
      </div>
      <div className="feed-filters">
        <button type="button" className="feed-filter">Critical</button>
        <button type="button" className="feed-filter">High</button>
        <button type="button" className="feed-filter">Low</button>
        <button type="button" className="feed-filter feed-settings" aria-label="Settings">⚙</button>
      </div>
      <div className="feed-list">
        {error && (
          <div className="feed-error">
            {error}
          </div>
        )}
        {loading && messages.length === 0 && (
          <div className="feed-loading">Loading feed…</div>
        )}
        {!loading && messages.length === 0 && !error && (
          <div className="feed-empty">No messages yet. Run the scraper with --supabase.</div>
        )}
        {messages.map((msg) => {
          const level = messageToLevel(msg);
          const displayText = msg.text_translated || msg.text;
          const channelName = msg.channel_title || msg.channel_username || 'Telegram';
          const channelUrl = msg.channel_username ? `https://t.me/${msg.channel_username}` : null;
          const isLong = displayText.length > MAX_TEXT_PREVIEW;
          return (
            <FeedItemCard
              key={msg.id}
              msg={msg}
              level={level}
              displayText={displayText}
              channelName={channelName}
              channelUrl={channelUrl}
              isLong={isLong}
              formatTimeAgo={formatTimeAgo}
            />
          );
        })}
      </div>
    </aside>
  );
}
