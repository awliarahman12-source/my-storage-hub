import { useApp } from '@/context/AppContext';
import { viewMeta } from '@/data/appData';
import { Moon, Sun, Upload, Zap, LogOut } from 'lucide-react';

interface TopBarProps {
  onOpenUpload: () => void;
}

export function TopBar({ onOpenUpload }: TopBarProps) {
  const { currentView, toggleTheme, toast, logout, theme } = useApp();
  const meta = viewMeta[currentView] || viewMeta.dashboard;

  return (
    <header className="top">
      <div>
        <h1>{meta.title}</h1>
        <p>{meta.desc}</p>
      </div>
      <div className="actions">
        <button className="btn icon-only" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="btn" onClick={onOpenUpload}>
          <Upload size={16} />
          <span>Upload</span>
        </button>
        <button className="btn primary" onClick={() => toast('Quick upload aktif')}>
          <Zap size={16} />
          <span>Quick Upload</span>
        </button>
        <button className="btn" onClick={() => { void logout(); }} title="Logout">
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}