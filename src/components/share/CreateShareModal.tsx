import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { buildShareUrl, type ShareRole, type ShareKind, type CreateShareItem } from '@/utils/shareApi';
import type { DriveFileItem } from '@/types';
import {
  Eye, MessageCircle, Pencil, Folder, FileText, Globe, Copy, Check, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CreateShareModalProps {
  open: boolean;
  onClose: () => void;
  item?: DriveFileItem | null;
  items?: DriveFileItem[];
}

const ROLES: { id: ShareRole; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'viewer', label: 'Perlihat', desc: 'Orang bisa lihat dan download', icon: Eye },
  { id: 'commenter', label: 'Pengomentar', desc: 'Bisa lihat + kasih komentar', icon: MessageCircle },
  { id: 'editor', label: 'Editor', desc: 'Bisa ubah, upload, dan hapus file', icon: Pencil },
];

export function CreateShareModal({ open, onClose, item, items }: CreateShareModalProps) {
  const { toast, createShareLink } = useApp();
  const [name, setName] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [password, setPassword] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [maxDownloads, setMaxDownloads] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ token: string; kind: ShareKind } | null>(null);
  const [copied, setCopied] = useState(false);

  const allItems: DriveFileItem[] = items && items.length > 0 ? items : item ? [item] : [];

  useEffect(() => {
    if (!open) {
      setResult(null);
      setName('');
      setRole('viewer');
      setPassword('');
      setCustomSlug('');
      setExpiresInDays(7);
      setMaxDownloads(0);
      setBusy(false);
      setCopied(false);
    }
  }, [open]);

  if (!open || allItems.length === 0) return null;

  const isBulk = allItems.length > 1;
  const uniqueNodes = new Set(allItems.map((i) => i.nodeId));
  const isMixedDrive = uniqueNodes.size > 1;
  const firstItem = allItems[0];
  const isFolderKind = isBulk || firstItem.isFolder;
  const pathPrefix = isFolderKind ? 'g' : 's';

  const firstFolderItem = allItems.find((i) => i && i.isFolder);
  const safeFirstFolderName = firstFolderItem?.name || 'Shared Folder';
  const safeFirstName = firstItem?.name || 'Shared';
  const defaultName = firstFolderItem && isBulk
    ? safeFirstFolderName
    : (isBulk ? `Share ${allItems.length} items` : safeFirstName);

  const handleCreate = async () => {
    setBusy(true);
    try {
      let kind: ShareKind;
      let nodeId: string | undefined;
      let folderId: string | undefined;
      let fileId: string | undefined;
      let shareItems: CreateShareItem[] | undefined;

      // AUTO-HANDLE: kalau ada folder di selection → pakai folder pertama jadi folder share
      const firstFolder = allItems.find((i) => i && i.isFolder && i.id && i.nodeId);

      if (firstFolder) {
        kind = 'folder';
        nodeId = firstFolder.nodeId;
        folderId = firstFolder.id;
        if (isBulk) {
          toast(`Share folder "${firstFolder.name}" dibuat. Item lain tidak diikutkan.`);
        }
      } else if (isBulk) {
        // Semua file → items share
        kind = 'items';
        shareItems = allItems.map((i) => ({
          nodeId: i.nodeId, fileId: i.id, fileName: i.name, mimeType: i.mimeType, size: i.size,
        }));
      } else {
        kind = 'file'; nodeId = firstItem.nodeId; fileId = firstItem.id;
      }

      const res = await createShareLink({
        name: name.trim() || defaultName,
        kind, nodeId, folderId, fileId, items: shareItems, role,
        password: password.trim() || undefined,
        customSlug: customSlug.trim() || undefined,
        expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
        maxDownloads: maxDownloads > 0 ? maxDownloads : undefined,
      });
      setResult({
        token: res.share.custom_slug || res.share.token,
        kind,
      });
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast('Link copied');
    } catch {
      toast('Copy failed');
    }
  };

  const close = () => onClose();

  return (
    <div className="modal-wrap open" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>
            {isBulk ? `Create Share Link (${allItems.length} items)` : 'Create Share Link'}
          </h3>
          <button className="btn" onClick={close}><X size={14} /></button>
        </div>

        {!result ? (
          <>
            <div style={{
              padding: 12, borderRadius: 10, background: 'var(--soft)',
              marginBottom: 16, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)',
            }}>
              <div style={{
                fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.5,
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span>{(() => {
                  const firstFolder = allItems.find((i) => i && i.isFolder);
                  if (firstFolder && isBulk) return `Share folder "${firstFolder.name || 'Shared Folder'}"`;
                  if (isBulk) return `${allItems.length} file akan di-share`;
                  return 'File akan di-share';
                })()}</span>
                {isMixedDrive && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(22,163,74,.15)', color: '#16a34a',
                    fontSize: 10, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <Globe size={10} /> Multi-drive ({uniqueNodes.size})
                  </span>
                )}
              </div>
              {allItems.slice(0, 20).filter((it) => it && it.id).map((it, idx) => (
                <div key={`${it.nodeId || ''}-${it.id}-${idx}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12,
                  borderBottom: idx < Math.min(allItems.length, 20) - 1 ? '1px solid var(--line)' : 'none',
                }}>
                  <span style={{ flexShrink: 0, color: '#7b8495' }}>
                    {it.isFolder ? <Folder size={14} /> : <FileText size={14} />}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.name || 'Unnamed'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.drive}
                  </span>
                </div>
              ))}
              {allItems.length > 20 && (
                <div style={{ padding: '6px 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  ... dan {allItems.length - 20} file lagi
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Nama share</label>
              <input className="setting-input" placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Izin akses</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  return (
                    <label key={r.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                      borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)',
                      background: role === r.id ? 'var(--hover)' : 'transparent',
                      transition: 'background .15s',
                    }}>
                      <input type="radio" name="role" checked={role === r.id} onChange={() => setRole(r.id)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon size={14} /> {r.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Password (opsional)</label>
              <input className="setting-input" type="password" placeholder="Kosongkan untuk tanpa password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Custom URL (opsional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0, fontFamily: 'ui-monospace,monospace' }}>
                  /{pathPrefix}/
                </span>
                <input
                  className="setting-input"
                  placeholder="foto-liburan-2024"
                  value={customSlug}
                  onChange={(e) => {
                    const raw = e?.target?.value ?? '';
                    setCustomSlug(String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                  }}
                  maxLength={60}
                  style={{ flex: 1 }}
                />
              </div>
              <small style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                Huruf kecil, angka, tanda hubung. Min. 3 karakter. Kosongkan untuk URL random.
              </small>
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

            {isMixedDrive && (
              <div style={{
                padding: 12, borderRadius: 8, background: 'rgba(22,163,74,.1)',
                border: '1px solid rgba(22,163,74,.3)', marginBottom: 14,
                fontSize: 11, color: '#16a34a', display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Globe size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Multi-drive share</strong>
                  <div style={{ marginTop: 2, color: '#15803d' }}>
                    File dari <strong>{uniqueNodes.size} akun Google Drive</strong> berbeda akan digabung jadi <strong>1 link</strong>.
                    Penerima bisa lihat & download semua file dalam satu halaman.
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={close} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? 'Creating...' : 'Create Link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: 14, borderRadius: 10, background: '#ecfdf5',
              border: '1px solid #a7f3d0', marginBottom: 14,
            }}>
              <strong style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 6 }}>
                ✓ Share link created
              </strong>
              <p style={{ fontSize: 11, color: '#166534', margin: '0 0 10px' }}>
                {isBulk ? `${allItems.length} file bisa diakses lewat link ini.` : 'File bisa diakses lewat link ini.'}
              </p>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center', background: '#fff',
                padding: 10, borderRadius: 8, fontFamily: 'ui-monospace,monospace',
                fontSize: 12, wordBreak: 'break-all', marginBottom: 10,
              }}>
                <span style={{ flex: 1 }}>{shareUrl}</span>
              </div>
              <button className="btn primary" style={{ width: '100%' }} onClick={() => void copyUrl()}>
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
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