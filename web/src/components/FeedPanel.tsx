import './FeedPanel.css';

const FEED_ITEMS = [
  {
    id: 1,
    sender: 'Betterview Monitor',
    handle: '@bv_intel',
    level: 'CRITICAL',
    tags: ['CRITICAL', 'SYSTEM'],
    text: 'ALERT: Potential critical incidence detected in simulated European grid sector. Source analysis from Telegram channels indicates potential system breach.',
    link: '#',
    avatar: 'BV',
  },
  {
    id: 2,
    sender: 'War Monitor',
    handle: '@warmonitors',
    level: 'HIGH',
    tags: ['TWEET', 'HIGH', 'WORLD'],
    text: '⚡️ Iranian missile Impacts in the Negev, Israel. Multiple interceptions reported.',
    link: '#',
    avatar: 'WM',
  },
  {
    id: 3,
    sender: 'NEXTA Live',
    handle: '@nexta_live',
    level: 'HIGH',
    tags: ['TELEGRAM', 'HIGH'],
    text: 'Russia receives $150 million in additional oil revenues per day thanks to the war in the Middle East — Financial Times.',
    link: '#',
    avatar: 'NL',
  },
];

export function FeedPanel() {
  return (
    <aside className="feed-panel">
      <div className="feed-tabs">
        <button type="button" className="feed-tab active">FEED</button>
        <button type="button" className="feed-tab">WHALE TRACKER</button>
        <button type="button" className="feed-tab">FLIGHTS (15)</button>
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
        {FEED_ITEMS.map((item) => (
          <article key={item.id} className="feed-item">
            <div className="feed-item-header">
              <div className="feed-item-avatar">{item.avatar}</div>
              <div className="feed-item-meta">
                <span className="feed-item-sender">{item.sender}</span>
                <span className="feed-item-handle">{item.handle}</span>
                <span className={`feed-item-level level-${item.level.toLowerCase()}`}>{item.level} REP</span>
                <span className="feed-item-time">now</span>
              </div>
            </div>
            <div className="feed-item-tags">
              {item.tags.map((tag) => (
                <span key={tag} className={`feed-tag feed-tag-${tag.toLowerCase()}`}>{tag}</span>
              ))}
            </div>
            <p className="feed-item-text">{item.text}</p>
            <a href={item.link} className="feed-item-link">#Betterview found 5 markets ▼</a>
          </article>
        ))}
      </div>
    </aside>
  );
}
