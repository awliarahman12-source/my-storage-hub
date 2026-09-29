import { useApp } from '@/context/AppContext';
import { gb } from '@/utils/format';
import type { ViewName } from '@/types';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Files,
  Clock,
  Star,
  Image,
  Film,
  Folder,
  HardDrive,
  Share2,
  FolderOpen,
  Trash2,
  Link2,
  RefreshCw,
  Settings,
  Code2,
  FileCog,
  Sun,
  Moon,
  LogOut,
  X,
} from 'lucide-react';

interface NavItem { view: ViewName; icon: LucideIcon; label: string; }

const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    items: [
      { view: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { view: 'files', icon: Files, label: 'All Files' },
      { view: 'recent', icon: Clock, label: 'Recent' },
      { view: 'starred', icon: Star, label: 'Starred' },
    ],
  },
  {
    section: 'Storage',
    items: [
      { view: 'photos', icon: Image, label: 'Photos' },
      { view: 'videos', icon: Film, label: 'Videos' },
      { view: 'folders', icon: Folder, label: 'Folders' },
      { view: 'drives', icon: HardDrive, label: 'My Drives' },
      { view: 'shared', icon: Share2, label: 'Shared' },
      { view: 'shared-folder', icon: FolderOpen, label: 'Shared Folder' },
      { view: 'trash', icon: Trash2, label: 'Trash' },
    ],
  },
  {
    section: 'System',
    items: [
      { view: 'shares', icon: Link2, label: 'Share Links' },
      { view: 'folder-sync', icon: RefreshCw, label: 'Folder Sync' },
      { view: 'settings', icon: Settings, label: 'Settings' },
      { view: 'api', icon: Code2, label: 'API & Integrations' },
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
      <button className="sidebar-close" onClick={onMobileClose} aria-label="Close menu">
        <X size={20} />
      </button>

      <div className="brand">
        <div className="logo">S</div>
        <div>{storageName}</div>
      </div>

      <div className="nav">
        {navGroups.map((group) => (
          <div key={group.section}>
            <small>{group.section}</small>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  className={currentView === item.view ? 'active' : ''}
                  onClick={() => handleNav(item.view)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            {group.section === 'System' && (
              <button onClick={() => { onOpenConvert(); onMobileClose?.(); }}>
                <FileCog size={18} />
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
          <div className="bar"><i style={{ width: pct + '%' }} /></div>
        </div>

        <div className="side-mobile-actions">
          <button className="side-action" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
          </button>
          <button className="side-action danger" onClick={() => { void logout(); onMobileClose?.(); }}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}