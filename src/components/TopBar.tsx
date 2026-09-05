import { useApp } from '@/context/AppContext';
import { viewMeta } from '@/data/appData';

interface TopBarProps {
  onOpenUpload: () => void;
}

export function TopBar({ onOpenUpload }: TopBarProps) {
  const { currentView, toggleTheme, toast, logout } = useApp();
  const meta = viewMeta[currentView] || viewMeta.dashboard;

  return (
    <header className="top">
      <div>
        <h1>{meta.title}</h1>
        <p>{meta.desc}</p>
      </div>
      <div className="actions">
        <button className="btn" onClick={toggleTheme}>{'\u263E'} / {'\u2600'}</button>
        <button className="btn" onClick={onOpenUpload}>{'\uFF0B'} Upload</button>
        <button className="btn primary" onClick={() => toast('Quick upload aktif')}>Quick Upload</button>
        <button className="btn" onClick={() => { void logout(); }} title="Logout">Logout</button>
      </div>
    </header>
  );
}
