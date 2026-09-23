import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { buildShareUrl, type ShareRole, type ShareKind } from '@/utils/shareApi';
import type { DriveFileItem } from '@/types';

interface CreateShareModalProps {
  open: boolean;
  onClose: () => void;
  item: DriveFileItem | null;
}

const ROLES: { id: ShareRole; label: string; desc: string; icon: string }[] = [
  { id: 'viewer', label: 'Perlihat', desc: 'Orang bisa lihat dan download', icon: '👁' },
  { id: 'commenter', label: 'Pengomentar', desc: 'Bisa lihat + kasih komentar', icon: '💬' },
  { id: 'editor', label: 'Editor', desc: 'Bisa ubah, upload, dan hapus file', icon: '✏️' },
];

export function CreateShareModal({ open, onClose, item }: CreateShareModalProps) {
  const { toast, createShareLink } = useApp();
  const [name, setName] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [maxDownloads, setMaxDownloads] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ token: string; kind: ShareKind } | null>(null);

  if (!open || !item) return null;

  const handleCreate = async () => {
    setBusy(true);
    try {
      const kind: ShareKind = item.isFolder ? 'folder' : 'file';
      const res = await createShareLink({
        name: name.trim() || item.name,
        kind,
        nodeId: item.nodeId,
        folderId: kind === 'folder' ? item.id : undefined,
        fileId: kind === 'file' ? item.id : undefined,
        role,
        password: password.trim() || undefined,
        expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
        maxDownloads: maxDownloads > 0 ? maxDownloads : undefined,
      });
      setResult({ token: res.share.token, kind });
      toast('Share link created');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = result ? buildShareUrl(result.token, result.kind) : '';

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied');
    } catch {
      toast('Copy failed');
    }
  };

  const close = () => {
    setName('');
    setRole('viewer');
    setPassword('');
    setExpiresInDays(7);
    setMaxDownloads(0);
    setResult(null);
    onClose();
  };

  return (
    <div className="modal-wrap open" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Create Share Link</h3>
          <button className="btn" onClick={close}>×</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
          {item.isFolder ? '📁' : '📄'} {item.name}
        </p>

        {!result ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Nama share</label>
              <input className="setting-input" placeholder={item.name} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Izin akses</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ROLES.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid var(--line)',
                      background: role === r.id ? 'var(--hover)' : 'transparent',
                    }}
                  >
                    <input type="radio" name="role" checked={role === r.id} onChange={() => setRole(r.id)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.icon} {r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Password (opsional)</label>
              <input className="setting-input" type="password" placeholder="Kosongkan untuk tanpa password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Berakhir dalam</label>
                <select className="setting-input" value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
                  <option value={1}>1 hari</option>
                  <option value={7}>7 hari</option>
                  <option value={30}>30 hari</option>
                  <option value={0}>Selamanya</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Limit download</label>
                <input type="number" className="setting-input" value={maxDownloads} min={0} onChange={(e) => setMaxDownloads(Number(e.target.value) || 0)} />
                <small style={{ fontSize: 10, color: 'var(--muted)' }}>0 = unlimited</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={close} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? 'Creating...' : 'Create Link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: 14, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: 14 }}>
              <strong style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 8 }}>
                ✓ Share link created
              </strong>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                background: '#fff', padding: 10, borderRadius: 8,
                fontFamily: 'ui-monospace,monospace', fontSize: 12,
                wordBreak: 'break-all', marginBottom: 10,
              }}>
                <span style={{ flex: 1 }}>{shareUrl}</span>
              </div>
              <button className="btn primary" style={{ width: '100%' }} onClick={() => void copyUrl()}>
                📋 Copy Link
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={close}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}