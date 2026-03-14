import { useState } from 'react';
import { Header, type NavTab } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { LeftFilterPanel } from './components/LeftFilterPanel';
import { DomeScene } from './components/DomeScene';
import { FeedPanel } from './components/FeedPanel';
import { Thunderdome } from './components/Thunderdome';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('TERMINAL');

  return (
    <div className="terminal-scanline">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <StatusBar />
      <main className="terminal-main">
        <LeftFilterPanel />
        <div className="terminal-center">
          {activeTab === 'TERMINAL' ? <Thunderdome /> : <DomeScene />}
        </div>
        <FeedPanel />
      </main>
      <div className="corner-overlay" />
    </div>
  );
}
