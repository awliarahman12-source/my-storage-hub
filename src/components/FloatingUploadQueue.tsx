import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { UploadSession } from '@/types';

export function FloatingUploadQueue() {
  const { uploadSessions, retryUpload, cancelUpload, clearUploadSession, storageNodes } = useApp();
  const [expanded, setExpanded] = useState(true);

  const nodeName = (id: string): string => {
    const n = storageNodes.find((s) => s.id === id);
    return n ? (n.displayName || n.email) : 'Unknown';
  };

  const activeCount = uploadSessions.filter((s) => s.status === 'uploading' || s.status === 'processing').length;
  const queuedCount = uploadSessions.filter((s) => s.status === 'queued').length;
  const failedCount = uploadSessions.filter((s) => s.status === 'failed').length;
  const completedCount = uploadSessions.filter((s) => s.status === 'completed').length;

  // Show panel only when there are uploads in progress or recently finished
  const visibleSessions = uploadSessions.filter((s) =>
    s.status === 'queued' || s.status === 'uploading' || s.status === 'processing' ||
    s.status === 'failed' || s.status === 'cancelled'
  );
  const recentlyCompleted = uploadSessions.filter((s) => s.status === 'completed').slice(-3);

  const allSessions = [...visibleSessions, ...recentlyCompleted];
  if (allSessions.length === 0) return null;

  const statusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      queued: 'Queued',
      uploading: 'Uploading',
      processing: 'Processing',
      completed: 'Uploaded',
      failed: 'Failed',
      retrying: 'Retrying',
      cancelled: 'Cancelled',
    };
    return labels[status] || status;
  };

  const statusColor = (status: string): string => {
    const colors: Record<string, string> = {
      queued: '#7b8495',
      uploading: '#3b82f6',
      processing: '#8b5cf6',
      completed: '#16a34a',
      failed: '#dc2626',
      cancelled: '#9da7b8',
    };
    return colors[status] || '#7b8495';
  };

  const formatSize = (bytes: number): string => {
    if (!bytes) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let x = bytes;
    while (x >= 1024 && i < 3) { x /= 1024; i++; }
    return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
  };

  const headerText = activeCount > 0
    ? `Uploading ${activeCount} file${activeCount > 1 ? 's' : ''}${queuedCount > 0 ? ' · ' + queuedCount + ' queued' : ''}`
    : failedCount > 0
    ? `${failedCount} failed upload${failedCount > 1 ? 's' : ''}`
    : completedCount > 0
    ? `${completedCount} upload${completedCount > 1 ? 's' : ''} completed`
    : `${queuedCount} file${queuedCount > 1 ? 's' : ''} queued`;

  return (
    <div className="floating-queue">
      <div className="floating-queue-header" onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeCount > 0 && (
            <span className="fq-spinner" />
          )}
          <strong style={{ fontSize: 12 }}>{headerText}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="xbtn"
            style={{ fontSize: 10, padding: '2px 8px' }}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? '\u2013' : '+'}
          </button>
          <button
            className="xbtn"
            style={{ fontSize: 10, padding: '2px 8px' }}
            onClick={(e) => {
              e.stopPropagation();
              allSessions.forEach((s) => void clearUploadSession(s.id));
            }}
          >{'\u2715'}</button>
        </div>
      </div>

      {expanded && (
        <div className="floating-queue-body">
          {allSessions.map((session) => (
            <QueueRow
              key={session.id}
              session={session}
              nodeName={nodeName(session.storageNodeId)}
              onRetry={() => void retryUpload(session.id)}
              onCancel={() => void cancelUpload(session.id)}
              onClear={() => void clearUploadSession(session.id)}
              statusLabel={statusLabel}
              statusColor={statusColor}
              formatSize={formatSize}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  session,
  nodeName,
  onRetry,
  onCancel,
  onClear,
  statusLabel,
  statusColor,
  formatSize,
}: {
  session: UploadSession;
  nodeName: string;
  onRetry: () => void;
  onCancel: () => void;
  onClear: () => void;
  statusLabel: (s: string) => string;
  statusColor: (s: string) => string;
  formatSize: (b: number) => string;
}) {
  const isActive = session.status === 'uploading' || session.status === 'queued' || session.status === 'processing';
  const isFailed = session.status === 'failed';
  const isDone = session.status === 'completed' || session.status === 'cancelled';
  const color = statusColor(session.status);

  return (
    <div className="fq-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.filename}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: color + '20', color, flexShrink: 0 }}>{statusLabel(session.status)}</span>
        </div>
        <div style={{ fontSize: 9, color: '#9da7b8', marginTop: 2 }}>
          {formatSize(session.size)} {session.size ? '\u00B7 ' : ''}{nodeName}
          {session.errorMessage ? <span style={{ color: '#dc2626', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.errorMessage}</span> : null}
        </div>
        {isActive && (
          <div className="fq-progress">
            <span style={{ width: session.progress + '%', background: color }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {isFailed && <button className="xbtn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={onRetry}>Retry</button>}
        {isActive && <button className="xbtn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={onCancel}>Cancel</button>}
        {isDone && <button className="xbtn" style={{ fontSize: 9, padding: '2px 6px' }} onClick={onClear}>{'\u00D7'}</button>}
      </div>
    </div>
  );
}
