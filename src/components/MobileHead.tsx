import { useApp } from '@/context/AppContext';
import { Menu } from 'lucide-react';

interface MobileHeadProps {
  onMenuClick?: () => void;
}

export function MobileHead({ onMenuClick }: MobileHeadProps) {
  const { storageName } = useApp();
  return (
    <div className="mobile-head">
      <button className="menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={22} />
      </button>
      <div className="brand">
        <div className="logo">S</div>
        <div>{storageName}</div>
      </div>
      <div style={{ width: 42, flexShrink: 0 }} />
    </div>
  );
}