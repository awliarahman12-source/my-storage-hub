import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import type { UploadSession, StorageNode } from '@/types';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const {
    storageNodes,
    uploadFiles,
    uploadSessions,
    retryUpload,
    cancelUpload,
    clearUploadSession,
    refreshUploadSessions,
    routingMode,
    currentFolderId,
    currentFolderName,
    checkDuplicateFile,
    toast,
  } = useApp();

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ filename: string; drives: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileList | File[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasUsableDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;
  const connectedNodes = storageNodes.filter((n) => n.status === 'connected');

  const nodeNameById = (id: string): string => {
    const n = storageNodes.find((s) => s.id === id);
    return n ? (n.displayName || n.email) : 'Unknown Drive';
  };

  useEffect(() => {
    if (open) void refreshUploadSessions();
  }, [open, refreshUploadSessions]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;

    // Check for duplicates before uploading
    const duplicates: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const check = await checkDuplicateFile(file.name, currentFolderId !== 'root' ? currentFolderId : undefined);
        if (check.exists) {
          const driveNames = check.nodes.map((n) => n.drive).join(', ');
          duplicates.push(`${file.name} (on ${driveNames})`);
        }
      } catch {
        // If check fails, proceed with upload
      }
    }

    if (duplicates.length > 0) {
      setDuplicatePrompt({ filename: duplicates.join('; '), drives: duplicates.length + ' duplicate(s) found' });
      setPendingFiles(files);
      return;
    }

    setUploading(true);
    try {
      await uploadFiles(files, routingMode === 'manual' && selectedNodeId ? selectedNodeId : undefined);
    } finally {
      setUploading(false);
    }
  }, [uploadFiles, routingMode, selectedNodeId, currentFolderId, checkDuplicateFile]);

  const proceedWithUpload = async (replace: boolean) => {
    setDuplicatePrompt(null);
    if (!pendingFiles) return;
    if (!replace) {
      // Upload as new — Google Drive will create duplicate names automatically
      toast('Uploading as new copy');
    } else {
      // Replace — we still upload, the old file remains (Google Drive allows duplicate names)
      toast('Uploading — old file will remain, new copy created');
    }
    setUploading(true);
    try {
      await uploadFiles(pendingFiles, routingMode === 'manual' && selectedNodeId ? selectedNodeId : undefined);
    } finally {
      setUploading(false);
      setPendingFiles(null);
    }
  };

  const cancelDuplicate = () => {
    setDuplicatePrompt(null);
    setPendingFiles(null);
  };

  const activeSessions = uploadSessions.filter((s) => s.status === 'queued' || s.status === 'uploading' || s.status === 'retrying');
  const completedSessions = uploadSessions.filter((s) => s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled');

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      queued: 'Queued',
      uploading: 'Uploading',
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
      retrying: 'Retrying',
      cancelled: 'Cancelled',
    };
    return labels[status] || status;
  };

  const formatSize = (bytes: number): string => {
    if (!bytes) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let x = bytes;
    while (x >= 1024 && i < 3) { x /= 1024; i++; }
    return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
  };

  if (!open) return null;

  return (
    <div className="modal-wrap open">
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>Upload files</h3>
        <p>Files will be routed to the best available drive{currentFolderId !== 'root' ? ' · Folder: ' + currentFolderName : ''}.</p>

        {!hasUsableDrives ? (
          <div className="pool-empty" style={{ padding: '30px 20px' }}>
            <div className="pool-icon">{'\u25C9'}</div>
            <strong>No connected drive with space</strong>
            <p>Add a storage node to your pool before uploading files.</p>
          </div>
        ) : (
          <>
            {routingMode === 'manual' && connectedNodes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#7b8495', display: 'block', marginBottom: 4 }}>Upload to specific drive:</label>
                <select
                  className="setting-input"
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px' }}
                >
                  <option value="">Select a drive...</option>
                  {connectedNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.displayName || n.email}</option>
                  ))}
                </select>
              </div>
            )}

            <div
              className={'drop' + (dragging ? ' dragging' : '')}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void handleUpload(e.dataTransfer.files); }}
              style={{ cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}
            >
              <div className="upload-cloud">{'\u2191'}</div>
              <strong>{uploading ? 'Uploading...' : 'Drag & drop files here'}</strong>
              <span>or click to select · JPG, PNG, PDF, ZIP, video, and more</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => void handleUpload(e.target.files)}
              />
            </div>
          </>
        )}

        {/* Duplicate Warning Modal */}
        {duplicatePrompt && (
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 10,
            background: '#fff8e1', border: '1px solid #f0c040',
          }}>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>{'\u26A0'} Duplicate file detected</strong>
            <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 10px' }}>
              {duplicatePrompt.filename}
            </p>
            <p style={{ fontSize: 11, color: '#7b8495', margin: '0 0 10px' }}>
              A file with the same name already exists in this folder. Choose how to proceed:
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => void proceedWithUpload(true)}>
                Upload as New
              </button>
              <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={cancelDuplicate}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Upload Queue */}
        {uploadSessions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Upload Queue ({uploadSessions.length})</strong>
              {completedSessions.length > 0 && (
                <button
                  className="xbtn"
                  style={{ fontSize: 11 }}
                  onClick={() => completedSessions.forEach((s) => void clearUploadSession(s.id))}
                >Clear completed</button>
              )}
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              {uploadSessions.map((session) => (
                <UploadQueueItem
                  key={session.id}
                  session={session}
                  nodeName={nodeNameById(session.storageNodeId)}
                  onRetry={() => void retryUpload(session.id)}
                  onCancel={() => void cancelUpload(session.id)}
                  onClear={() => void clearUploadSession(session.id)}
                  statusLabel={statusLabel}
                  formatSize={formatSize}
                />
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          {hasUsableDrives && (
            <button className="btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Choose Files'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadQueueItem({
  session,
  nodeName,
  onRetry,
  onCancel,
  onClear,
  statusLabel,
  formatSize,
}: {
  session: UploadSession;
  nodeName: string;
  onRetry: () => void;
  onCancel: () => void;
  onClear: () => void;
  statusLabel: (s: string) => string;
  formatSize: (b: number) => string;
}) {
  const isActive = session.status === 'uploading' || session.status === 'queued' || session.status === 'retrying';
  const isFailed = session.status === 'failed';
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.filename}</strong>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            background: isActive ? '#e6f0ff' : isFailed ? '#fee' : isCompleted ? '#e6f7ee' : '#f5f5f5',
            color: isActive ? '#2563eb' : isFailed ? '#dc2626' : isCompleted ? '#16a34a' : '#7b8495',
            flexShrink: 0,
          }}>{statusLabel(session.status)}</span>
        </div>
        <div style={{ fontSize: 10, color: '#7b8495', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>{formatSize(session.size)}</span>
          <span style={{ color: '#9da7b8' }}>{'\u2192'}</span>
          <span style={{ color: '#2563eb' }}>{nodeName}</span>
          {session.errorMessage ? <span style={{ color: '#dc2626' }}>· {session.errorMessage}</span> : null}
        </div>
        {isActive && (
          <div style={{ marginTop: 4 }}>
            <div className="upload-progress" style={{ height: 4 }}>
              <span style={{ width: session.progress + '%' }} />
            </div>
            <span style={{ fontSize: 9, color: '#9da7b8', marginTop: 2, display: 'block' }}>{session.progress}%</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isFailed && (
          <button className="xbtn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onRetry}>Retry</button>
        )}
        {isActive && (
          <button className="xbtn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onCancel}>Cancel</button>
        )}
        {(isCompleted || isCancelled || isFailed) && (
          <button className="xbtn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onClear}>{'\u00D7'}</button>
        )}
      </div>
    </div>
  );
}
