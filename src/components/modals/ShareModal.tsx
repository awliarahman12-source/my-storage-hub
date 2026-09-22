import { useState, useEffect, useCallback } from 'react';
import { fetchPermissions, addPermission, removePermission, fetchShareLink, shareFile, logActivity } from '@/utils/driveApi';
import type { DriveFileItem, DrivePermission } from '@/types';

interface ShareModalProps {
  files: DriveFileItem[];
  open: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  organizer: 'Manager',
  writer: 'Editor',
  commenter: 'Commenter',
  reader: 'Viewer',
};

export function ShareModal({ files, open, onClose }: ShareModalProps) {
  const [permissions, setPermissions] = useState<DrivePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('reader');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkAccess, setLinkAccess] = useState<string>('private');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DrivePermission | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const isBulk = files.length > 1;
  const file = files.length > 0 ? files[0] : null;

  const loadPermissions = useCallback(async () => {
    if (!file || isBulk) return;
    setLoading(true);
    setError(null);
    try {
      const [perms, linkData] = await Promise.all([
        fetchPermissions(file.id, file.nodeId),
        fetchShareLink(file.id, file.nodeId),
      ]);
      setPermissions(perms);
      setShareLink(linkData.webViewLink);
      const anyonePerm = perms.find((p) => p.type === 'anyone');
      if (anyonePerm) {
        setLinkAccess(anyonePerm.role === 'reader' ? 'viewer' : 'editor');
      } else {
        setLinkAccess('private');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sharing info');
    } finally {
      setLoading(false);
    }
  }, [file, isBulk]);

  useEffect(() => {
    if (open && !isBulk && file) {
      void loadPermissions();
    } else if (open && isBulk) {
      setLinkAccess('private');
      setError(null);
    }
  }, [open, file, isBulk, loadPermissions]);

  const handleAddPermission = async () => {
    if (!file || !email.trim()) return;
    setError(null);
    try {
      await addPermission(file.id, file.nodeId, email.trim(), role);
      await logActivity('share', file.name, file.nodeId, file.drive, 'success');
      setEmail('');
      void loadPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add permission');
    }
  };

  const handleRemovePermission = async () => {
    if (!file || !removeTarget) return;
    setError(null);
    try {
      await removePermission(file.id, file.nodeId, removeTarget.id);
      await logActivity('permission_change', file.name, file.nodeId, file.drive, 'success');
      setRemoveTarget(null);
      void loadPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove permission');
      setRemoveTarget(null);
    }
  };

  const handleLinkAccess = async (access: string) => {
    if (!file) return;
    setError(null);
    setLinkAccess(access);
    try {
      const mapped = access === 'viewer' ? 'public' : access === 'editor' ? 'editor' : 'private';
      await shareFile(file.id, file.nodeId, mapped);
      await logActivity('permission_change', file.name, file.nodeId, file.drive, 'success');
      void loadPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update link access');
    }
  };

  const handleBulkLinkAccess = async (access: string) => {
    setError(null);
    setLinkAccess(access);
    setBulkBusy(true);
    const mapped = access === 'viewer' ? 'public' : access === 'editor' ? 'editor' : 'private';
    let ok = 0;
    let fail = 0;
    for (const f of files) {
      try {
        await shareFile(f.id, f.nodeId, mapped);
        await logActivity('permission_change', f.name, f.nodeId, f.drive, 'success');
        ok++;
      } catch {
        await logActivity('permission_change', f.name, f.nodeId, f.drive, 'failed');
        fail++;
      }
    }
    setBulkBusy(false);
    if (fail === 0) {
      setError(null);
    } else if (ok === 0) {
      setError(`Failed to update all ${fail} file(s)`);
    } else {
      setError(`${ok} updated, ${fail} failed`);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link to clipboard');
    }
  };

  if (!open || files.length === 0) return null;

  if (isBulk) {
    return (
      <div className="modal-wrap open" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <h3>Share {files.length} files</h3>
          <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>
            Apply link access to all selected files.
          </p>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fee', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Link access for all files</strong>
            <select
              className="setting-input"
              value={linkAccess}
              onChange={(e) => void handleBulkLinkAccess(e.target.value)}
              disabled={bulkBusy}
              style={{ width: '100%', padding: '8px 12px' }}
            >
              <option value="private">Restricted (private)</option>
              <option value="viewer">Anyone with link — Viewer</option>
              <option value="editor">Anyone with link — Editor</option>
            </select>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
            {files.map((f) => (
              <div key={f.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ color: '#7b8495', fontSize: 10, flexShrink: 0 }}>{f.drive}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#9da7b8', margin: '0 0 12px' }}>
            For per-user permissions, share files individually.
          </p>

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  if (!file) return null;

  return (
    <div className="modal-wrap open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3>Share "{file.name}"</h3>

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fee', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Link access</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="setting-input"
              value={linkAccess}
              onChange={(e) => void handleLinkAccess(e.target.value)}
              style={{ flex: 1, padding: '8px 12px' }}
            >
              <option value="private">Restricted (private)</option>
              <option value="viewer">Anyone with link — Viewer</option>
              <option value="editor">Anyone with link — Editor</option>
            </select>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}
              onClick={() => void handleCopyLink()}
              disabled={!shareLink}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          {shareLink && (
            <div style={{ fontSize: 11, color: '#7b8495', marginTop: 6, wordBreak: 'break-all' }}>
              {shareLink}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Share with people</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="setting-input"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: '8px 12px' }}
            />
            <select
              className="setting-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: 120, padding: '8px 12px' }}
            >
              <option value="reader">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="writer">Editor</option>
            </select>
            <button
              className="btn primary"
              style={{ fontSize: 12, padding: '8px 16px', whiteSpace: 'nowrap' }}
              onClick={() => void handleAddPermission()}
              disabled={!email.trim() || loading}
            >
              Share
            </button>
          </div>
        </div>

        <div>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>People with access</strong>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20, fontSize: 12 }}>Loading permissions...</div>
          ) : permissions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20, fontSize: 12 }}>No permissions found.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
              {permissions.map((p) => (
                <div key={p.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {p.photoLink ? (
                    <img src={p.photoLink} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8eef5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#7b8495' }}>
                      {(p.displayName || p.emailAddress || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {p.displayName || (p.type === 'anyone' ? 'Anyone with link' : p.emailAddress || 'Unknown')}
                    </div>
                    {p.emailAddress && (
                      <div style={{ fontSize: 10, color: '#7b8495', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.emailAddress}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#7b8495' }}>{ROLE_LABELS[p.role] || p.role}</span>
                  {p.role !== 'owner' && (
                    <button
                      className="xbtn"
                      style={{ fontSize: 10, padding: '2px 8px', color: '#dc2626' }}
                      onClick={() => setRemoveTarget(p)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {removeTarget && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: '#fee', border: '1px solid #f0c0c0' }}>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Remove access?</strong>
            <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 10px' }}>
              {removeTarget.displayName || removeTarget.emailAddress || 'this user'} will no longer be able to access this file.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn danger" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => void handleRemovePermission()}>Remove</button>
              <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setRemoveTarget(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}