import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { gb } from '@/utils/format';
import type { DriveStatus } from '@/types';

export function DriveGrid() {
  const {
    storageNodes,
    loadingNodes,
    connectGoogleDrive,
    disconnectStorageNode,
    routingMode,
    setRoutingMode,
    toast,
  } = useApp();
  const [connecting, setConnecting] = useState(false);

  const statusLabel = (s: DriveStatus) => s.charAt(0).toUpperCase() + s.slice(1);

  const handleConnect = () => {
    setConnecting(true);
    connectGoogleDrive();
  };

  const handleDisconnect = (nodeId: string, email: string) => {
    if (confirm('Disconnect ' + email + ' from the storage pool? Your Google Drive files will not be deleted.')) {
      void disconnectStorageNode(nodeId);
    }
  };

  if (loadingNodes && storageNodes.length === 0) {
    return (
      <>
        <div className="section-title">
          <h2>Storage Accounts</h2>
          <span>Loading...</span>
        </div>
        <section className="card pool-empty">
          <div className="pool-icon">{'\u25C9'}</div>
          <h3>Checking connected drives...</h3>
        </section>
      </>
    );
  }

  if (storageNodes.length === 0) {
    return (
      <>
        <div className="section-title">
          <h2>Storage Accounts</h2>
          <span>0 drives connected</span>
        </div>
        <section className="card pool-empty">
          <div className="pool-icon">{'\u25C9'}</div>
          <h3>No Google Drive connected</h3>
          <p>Connect your Google Drive account to start building your storage pool. Files will be distributed automatically across all connected drives.</p>
          <button className="btn primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : '\uFF0B Add Google Drive'}
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="section-title">
        <h2>Storage Accounts</h2>
        <span>{storageNodes.length} drive{storageNodes.length !== 1 ? 's' : ''} connected</span>
      </div>
      <div className="routing-selector">
        <label>Routing:</label>
        <select value={routingMode} onChange={(e) => { setRoutingMode(e.target.value as typeof routingMode); toast('Routing mode: ' + e.target.value); }}>
          <option value="automatic">Automatic — Most available space</option>
          <option value="balanced">Balanced — Even distribution</option>
          <option value="manual">Manual — Priority order</option>
        </select>
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Connecting...' : '\uFF0B Add Google Drive'}
        </button>
      </div>
      <section className="drives">
        {storageNodes.map((node) => {
          const p = node.cap > 0 && node.quotaAvailable ? Math.round((node.used / node.cap) * 100) : 0;
          const connectedDate = new Date(node.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return (
            <article key={node.id} className="card drive">
              <div className="drive-head">
                <div className="drive-name">
                  {node.avatar ? (
                    <img src={node.avatar} alt="" className="drive-icon" style={{ borderRadius: '11px', objectFit: 'cover' }} />
                  ) : (
                    <div className="drive-icon">G</div>
                  )}
                  <div>
                    <strong>{node.displayName || node.email}</strong>
                    <div className="drive-meta">{node.email}</div>
                  </div>
                </div>
                <span className={'drive-status-badge ' + node.status}>
                  <span className="drive-status-dot" />
                  {statusLabel(node.status)}
                </span>
              </div>
              {node.quotaAvailable && node.cap > 0 ? (
                <>
                  <div className="drive-cap">
                    <span>{gb(node.used)} used</span>
                    <span>{gb(node.cap)}</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: p + '%' }} />
                  </div>
                  <div className="drive-foot">
                    <span>{gb(Math.max(0, node.cap - node.used))} free</span>
                    <span className="drive-priority">Priority {node.priority} · Connected {connectedDate}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="drive-cap">
                    <span>Quota unavailable</span>
                    <span>—</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: '0%' }} />
                  </div>
                  <div className="drive-foot">
                    <span>Storage data from Google API</span>
                    <span className="drive-priority">Priority {node.priority} · Connected {connectedDate}</span>
                  </div>
                </>
              )}
              <div className="drive-actions">
                <button
                  className="danger"
                  onClick={() => handleDisconnect(node.id, node.email)}
                >
                  Disconnect
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
