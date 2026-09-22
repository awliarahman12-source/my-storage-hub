import { useApp } from '@/context/AppContext';
import { gb } from '@/utils/format';
import type { ViewName } from '@/types';

interface NavItem {
  view: ViewName;
  icon: string;
  label: string;
}

const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    items: [
      { view: 'dashboard', icon: '\u2302', label: 'Dashboard' },
      { view: 'files', icon: '\u25A3', label: 'All Files' },
      { view: 'recent', icon: '\u25F7', label: 'Recent' },
      { view: 'starred', icon: '\u2606', label: 'Starred' },
    ],
  },
  {
    section: 'Storage',
    items: [
      { view: 'photos', icon: '\u25A7', label: 'Photos' },
      { view: 'videos', icon: '\u25B6', label: 'Videos' },
      { view: 'folders', icon: '\u25B0', label: 'Folders' },
      { view: 'drives', icon: '\u25C9', label: 'My Drives' },
      { view: 'shared', icon: '\u2197', label: 'Shared' },
      { view: 'shared-folder', icon: '\u25A3', label: 'Shared Folder' },
      { view: 'trash', icon: '\u232B', label: 'Trash' },
    ],
  },
  {
    section: 'System',
    items: [
      { view: 'settings', icon: '\u2699', label: 'Settings' },
      { view: 'api', icon: '\u2301', label: 'API & Integrations' },
    ],
  },
];

interface SidebarProps {
  onOpenConvert: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ onOpenConvert, mobileOpen = false, onMobileClose }: SidebarProps) {
  const { currentView, setView, storageNodes, storageName, theme, toggleTheme, logout } = useApp();
  const cap = storageNodes.reduce((a, n) => a + n.cap, 0);
  const used = storageNodes.reduce((a, n) => a + n.used, 0);
  const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;

  const handleNav = (view: ViewName) => {
    setView(view);
    onMobileClose?.();
  };

  return (
    <aside className={'sidebar' + (mobileOpen ? ' mobile-open' : '')}>
      {/* Mobile close button */}
      <button className="sidebar-close" onClick={onMobileClose} aria-label="Close menu">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="brand">
        <div className="logo">S</div>
        <div>{storageName}</div>
      </div>

      <div className="nav">
        {navGroups.map((group) => (
          <div key={group.section}>
            <small>{group.section}</small>
            {group.items.map((item) => (
              <button
                key={item.view}
                className={currentView === item.view ? 'active' : ''}
                onClick={() => handleNav(item.view)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            {group.section === 'System' && (
              <button onClick={() => { onOpenConvert(); onMobileClose?.(); }}>
                <span>{'\u25B4'}</span>
                <span>Tools PDF</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="side-bottom">
        <div className="pool-mini">
          <strong>{gb(cap)}</strong>
          <span>{gb(used)} used</span>
          <div className="bar">
            <i style={{ width: pct + '%' }} />
          </div>
        </div>

        {/* Mobile-only quick actions */}
        <div className="side-mobile-actions">
          <button className="side-action" onClick={toggleTheme}>
            <span>{theme === 'dark' ? '\u2600' : '\u263E'}</span>
            <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
          </button>
          <button className="side-action danger" onClick={() => { void logout(); onMobileClose?.(); }}>
            <span>{'\u2192'}</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}