import './MetricsBar.css';

type Props = {
  signalsToday?: number;
  marketsMoved?: string;
  bestCatch?: string;
};

export function MetricsBar({ signalsToday = 0, marketsMoved = '—', bestCatch = '—' }: Props) {
  return (
    <div className="metrics-bar">
      <div className="metrics-card">
        <span className="metrics-icon" aria-hidden>◇</span>
        <div className="metrics-content">
          <span className="metrics-label">SIGNALS TODAY</span>
          <span className="metrics-value">{signalsToday}</span>
        </div>
      </div>
      <div className="metrics-card">
        <span className="metrics-icon metrics-icon-chart" aria-hidden>▤</span>
        <div className="metrics-content">
          <span className="metrics-label">MARKETS MOVED</span>
          <span className="metrics-value">{marketsMoved}</span>
        </div>
      </div>
      <div className="metrics-card">
        <span className="metrics-icon metrics-icon-trophy" aria-hidden>⌖</span>
        <div className="metrics-content">
          <span className="metrics-label">BEST CATCH</span>
          <span className="metrics-value metrics-value-ellipsis">{bestCatch}</span>
        </div>
      </div>
    </div>
  );
}
