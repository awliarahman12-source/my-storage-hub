import { useApp } from '@/context/AppContext';

export function MobileHead() {
  const { storageName } = useApp();
  return (
    <div className="mobile-head">
      <div className="brand">
        <div className="logo">S</div>
        <div>{storageName}</div>
      </div>
    </div>
  );
}
