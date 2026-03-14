import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { LeftFilterPanel } from './components/LeftFilterPanel';
import { DomeScene } from './components/DomeScene';
import { FeedPanel } from './components/FeedPanel';
import './App.css';

export default function App() {
  return (
    <div className="terminal-scanline">
      <Header />
      <StatusBar />
      <main className="terminal-main">
        <LeftFilterPanel />
        <div className="terminal-center">
          <DomeScene />
        </div>
        <FeedPanel />
      </main>
      <div className="corner-overlay" />
    </div>
  );
}
