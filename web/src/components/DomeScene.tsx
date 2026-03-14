import { useRef, useEffect } from 'react';
import './DomeScene.css';

const DOME_POINTS = [
  { x: 15, y: 25, label: 'EU Grid · 72' },
  { x: 55, y: 35, label: 'MENA · 88' },
  { x: 40, y: 55, label: 'APAC · 65' },
];

export function DomeScene() {
  const domeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = domeRef.current;
    if (!el) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      el.style.setProperty('--dome-rotate', `${(performance.now() * 0.02) % 360}deg`);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="dome-container">
      <div className="dome-scene" ref={domeRef}>
        <div className="dome-hemisphere">
          <div className="dome-grid" />
          <div className="dome-glow" />
        </div>
        {DOME_POINTS.map((p, i) => (
          <div
            key={i}
            className="dome-datapoint"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="dome-datapoint-dot" />
            <span className="dome-datapoint-label">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
