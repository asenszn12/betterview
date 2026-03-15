import { useState } from 'react';
import { Header, type NavTab } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { LeftFilterPanel } from './components/LeftFilterPanel';
import { MonitorView, type MonitorCountry } from './components/MonitorView';
import { FeedPanel } from './components/FeedPanel';
import { Thunderdome } from './components/Thunderdome';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('TERMINAL');
  const [monitorCountry, setMonitorCountry] = useState<MonitorCountry>('ukraine');

  return (
    <div className="terminal-scanline">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onMonitorCountry={setMonitorCountry}
      />
      <StatusBar />
      <main className="terminal-main">
        <LeftFilterPanel />
        <div className="terminal-center">
          {activeTab === 'TERMINAL' && <Thunderdome />}
          {activeTab === 'MONITOR' && <MonitorView country={monitorCountry} />}
        </div>
        <FeedPanel />
      </main>
      <div className="corner-overlay" />
    </div>
  );
}
