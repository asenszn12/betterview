import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TelegramMessage } from '../lib/supabase';
import './FeedPanel.css';

function formatTimeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (sec < 60) return 'now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  } catch {
    return 'now';
  }
}

function messageToLevel(_m: TelegramMessage): 'CRITICAL' | 'HIGH' | 'LOW' {
  const t = (_m.text_translated || _m.text).toLowerCase();
  if (t.includes('critical') || t.includes('breaking') || t.includes('alert')) return 'CRITICAL';
  if (t.includes('strike') || t.includes('missile') || t.includes('attack')) return 'HIGH';
  return 'LOW';
}

export function FeedPanel() {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          text: 'Connect Supabase to show live Telegram feed. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and run the scraper with --supabase.',
          text_translated: null,
          views: null,
          forwards: null,
          url: null,
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from('telegram_messages')
        .select('*')
        .order('date', { ascending: false })
        .limit(50);
      setLoading(false);
      if (e) {
        setError(e.message);
        return;
      }
      setMessages((data as TelegramMessage[]) || []);
    };

    fetchMessages();

    const channel = supabase
      .channel('telegram_messages_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telegram_messages' }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <aside className="feed-panel">
      <div className="feed-tabs">
        <button type="button" className="feed-tab active">FEED</button>
      </div>
      <div className="feed-toolbar">
        <span className="feed-toolbar-icon" aria-hidden>⊞</span>
        <span className="feed-toolbar-icon" aria-hidden>✕</span>
        <span className="feed-toolbar-icon" aria-hidden>▤</span>
        <span className="feed-toolbar-icon" aria-hidden>👁</span>
        <span className="feed-toolbar-icon" aria-hidden>👤</span>
        <input type="search" placeholder="Q Search..." className="feed-search" aria-label="Search feed" />
      </div>
      <div className="feed-filters">
        <button type="button" className="feed-filter">Critical</button>
        <button type="button" className="feed-filter">High</button>
        <button type="button" className="feed-filter">Low</button>
        <button type="button" className="feed-filter">+ Topic</button>
        <button type="button" className="feed-filter">+ Category</button>
        <button type="button" className="feed-filter">+ Country</button>
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
          const handle = msg.channel_username ? `@${msg.channel_username}` : '';
          const avatar = (msg.channel_title || msg.channel_username || '?').slice(0, 2).toUpperCase();
          return (
            <article key={msg.id} className="feed-item">
              <div className="feed-item-header">
                <div className="feed-item-avatar">{avatar}</div>
                <div className="feed-item-meta">
                  <span className="feed-item-sender">{msg.channel_title || msg.channel_username || 'Telegram'}</span>
                  <span className="feed-item-handle">{handle}</span>
                  <span className={`feed-item-level level-${level.toLowerCase()}`}>{level} REP</span>
                  <span className="feed-item-time">{formatTimeAgo(msg.date)}</span>
                </div>
              </div>
              <div className="feed-item-tags">
                <span className={`feed-tag feed-tag-${level.toLowerCase()}`}>{level}</span>
                <span className="feed-tag feed-tag-telegram">TELEGRAM</span>
              </div>
              <p className="feed-item-text">{displayText}</p>
              {msg.url && (
                <a href={msg.url} target="_blank" rel="noopener noreferrer" className="feed-item-link">
                  View on Telegram →
                </a>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
