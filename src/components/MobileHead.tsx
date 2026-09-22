import { useApp } from '@/context/AppContext';

interface MobileHeadProps {
  onMenuClick?: () => void;
}

export function MobileHead({ onMenuClick }: MobileHeadProps) {
  const { storageName } = useApp();
  return (
    <div className="mobile-head">
      <button className="menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="brand">
        <div className="logo">S</div>
        <div>{storageName}</div>
      </div>
      <div style={{ width: 42, flexShrink: 0 }} />
    </div>
  );
}