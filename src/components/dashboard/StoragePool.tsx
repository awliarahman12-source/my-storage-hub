import { useApp } from '@/context/AppContext';
import { gb } from '@/utils/format';

export function StoragePool() {
  const { storagePool, storageNodes } = useApp();

  const cap = storagePool?.totalCap ?? storageNodes.reduce((a, n) => a + n.cap, 0);
  const used = storagePool?.totalUsed ?? storageNodes.reduce((a, n) => a + n.used, 0);
  const free = Math.max(0, cap - used);
  const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
  const quotaAvailable = storagePool?.quotaAvailable ?? false;

  if (storageNodes.length === 0) {
    return (
      <div className="card storage">
        <div className="eyebrow">Logical Storage Pool</div>
        <div className="big">0 GB</div>
        <div className="sub">
          <b>0 GB</b> used · <span>0 GB</span> available
        </div>
        <div className="usage">
          <div className="usage-row">
            <span>Pool usage</span>
            <span>0%</span>
          </div>
          <div className="bar">
            <i style={{ width: '0%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card storage">
      <div className="eyebrow">Logical Storage Pool</div>
      {quotaAvailable ? (
        <>
          <div className="big">{gb(cap)}</div>
          <div className="sub">
            <b>{gb(used)}</b> used · <span>{gb(free)}</span> available
          </div>
          <div className="usage">
            <div className="usage-row">
              <span>Pool usage</span>
              <span>{pct}%</span>
            </div>
            <div className="bar">
              <i style={{ width: pct + '%' }} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="big">{storageNodes.length} {storageNodes.length === 1 ? 'Drive' : 'Drives'}</div>
          <div className="sub">
            <b>{storagePool?.connectedDrives || storageNodes.length}</b> connected · <span>{storagePool?.healthyDrives || 0} healthy</span>
          </div>
          <div className="usage">
            <div className="usage-row">
              <span>Quota</span>
              <span>Unavailable</span>
            </div>
            <div className="bar">
              <i style={{ width: '0%' }} />
            </div>
          </div>
          <small style={{ color: '#7b8495', fontSize: 11, display: 'block', marginTop: 4 }}>Google Drive quota data requires Drive API access</small>
        </>
      )}
    </div>
  );
}
