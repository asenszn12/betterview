import { useState } from 'react';
import { BetterviewWordmark } from './BetterviewWordmark';
import './Header.css';

export const NAV = ['TERMINAL', 'FEED', 'MONITOR'] as const;
export type NavTab = (typeof NAV)[number];

interface HeaderProps {
  activeTab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
}

function LogoIcon() {
  return (
    <svg className="header-logo" width="64" height="64" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d="M14 24C8 18 4 14 4 10a6 6 0 0112 0c0 4-4 8-10 14z" fill="url(#logoGrad)" opacity="0.95" />
      <ellipse cx="11" cy="11" rx="3" ry="2.2" fill="#1e1b4b" />
      <path d="M8 11c0-1 1.5-2 3-2s3 1 3 2" stroke="#a78bfa" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

export function Header({ activeTab: controlledTab, onTabChange }: HeaderProps) {
  const [internalTab, setInternalTab] = useState<NavTab>('TERMINAL');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const [lastUpdate] = useState(() => new Date());
  const [logoError, setLogoError] = useState(false);

  return (
    <header className="terminal-header">
      <div className="header-left">
        {!logoError ? (
          <img src="/logo.png" alt="" className="header-logo" onError={() => setLogoError(true)} />
        ) : (
          <LogoIcon />
        )}
        <BetterviewWordmark className="header-wordmark" />
        <nav className="header-nav">
          {NAV.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`header-nav-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <div className="header-stats">
          <span className="header-update">{lastUpdate.toLocaleTimeString()} LAST UPDATE</span>
          <button type="button" className="header-refresh" aria-label="Refresh">↻</button>
        </div>
      </div>
    </header>
  );
}
