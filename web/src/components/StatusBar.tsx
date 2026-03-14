import './StatusBar.css';

const INCIDENTS = [
  { text: 'Air Force bombers struck missile storage...', time: '2M', level: 'HIGH' },
  { text: 'AFP journalists report explosions in Ba...', time: '5M', level: 'HIGH' },
  { text: 'All military infrastructure on Kharg Isla...', time: '8M', level: 'CRITICAL' },
];

export function StatusBar() {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-live">
          <span className="status-live-dot" /> LIVE
        </span>
        {INCIDENTS.map((inc, i) => (
          <span key={i} className="status-incident">
            <span className="status-incident-icon" aria-hidden>✈</span>
            {inc.text} <span className="status-incident-time">{inc.time}</span>
            <span className={`status-incident-level level-${inc.level.toLowerCase()}`}>{inc.level}</span>
          </span>
        ))}
      </div>
      <div className="status-center">
        <span className="status-risk">
          GLOBAL RISK LEVEL: <strong>85</strong> <span className="status-risk-label">SEVERE</span>
        </span>
        <button type="button" className="status-risk-help" aria-label="Info">?</button>
      </div>
      <div className="status-right" />
    </div>
  );
}
