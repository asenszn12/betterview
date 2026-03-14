import './LeftFilterPanel.css';

const FILTERS = [
  { id: 'all', label: 'ALL', color: null },
  { id: 'critical', label: 'Critical', color: 'var(--critical)' },
  { id: 'high', label: 'High', color: 'var(--high)' },
  { id: 'low', label: 'Low', color: 'var(--low)' },
  { id: 'telegram', label: 'Data Source: Telegram', color: 'var(--accent-cyan)' },
];

export function LeftFilterPanel() {
  return (
    <aside className="left-filter-panel">
      <button type="button" className="left-filter-btn active">
        ALL
      </button>
      {FILTERS.slice(1).map((f) => (
        <button key={f.id} type="button" className="left-filter-btn">
          {f.color && <span className="left-filter-dot" style={{ background: f.color }} />}
          {f.label}
        </button>
      ))}
    </aside>
  );
}
