import { useApp } from '@/context/AppContext';

export function Toast() {
  const { toastMsg } = useApp() as any;
  if (!toastMsg) return null;
  return <div className="toast show">{toastMsg}</div>;
}
