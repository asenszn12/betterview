import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './StatusBar.css';

type TickerMessage = {
  id: string;
  message_text: string;
  severity: string;
  telegram_url: string | null;
};

const TRUNCATE_LEN = 52;

function truncate(s: string, len: number): string {
  const t = (s || '').trim();
  if (t.length <= len) return t;
  return t.slice(0, len).trim() + '…';
}

export function StatusBar() {
  const [tickerMessages, setTickerMessages] = useState<TickerMessage[]>([]);

  useEffect(() => {
    if (!supabase) return;
    const fetchTicker = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, message_text, severity, telegram_url')
        .order('created_at', { ascending: false })
        .limit(30);
      if (data?.length) {
        setTickerMessages(
          data.map((r) => ({
            id: r.id,
            message_text: r.message_text ?? '',
            severity: (r.severity ?? 'low') as string,
            telegram_url: r.telegram_url ?? null,
          }))
        );
      }
    };
    fetchTicker();
    const channel = supabase
      .channel('status-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchTicker)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const items = tickerMessages.length > 0 ? tickerMessages : [
    { id: '1', message_text: 'Connect Supabase to see live ticker.', severity: 'low', telegram_url: null as string | null },
  ];

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-live">
          <span className="status-live-dot" /> LIVE
        </span>
        <div className="status-ticker-wrap">
          <div className="status-ticker-track" role="marquee" aria-live="polite">
            {[...items, ...items].map((msg, i) => (
              <span key={`${msg.id}-${i}`} className="status-ticker-item-wrap">
                <span className="status-ticker-sep" aria-hidden>+</span>
                {msg.telegram_url ? (
                  <a
                    href={msg.telegram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="status-ticker-item"
                    title={msg.message_text}
                  >
                    {truncate(msg.message_text, TRUNCATE_LEN)}{' '}
                    <span className={`status-ticker-level level-${msg.severity}`}>{msg.severity.toUpperCase()}</span>
                  </a>
                ) : (
                  <span className="status-ticker-item status-ticker-item-static" title={msg.message_text}>
                    {truncate(msg.message_text, TRUNCATE_LEN)}{' '}
                    <span className={`status-ticker-level level-${msg.severity}`}>{msg.severity.toUpperCase()}</span>
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
