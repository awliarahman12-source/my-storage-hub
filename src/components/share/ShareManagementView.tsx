import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { buildShareUrl, type ShareRole } from '@/utils/shareApi';

const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: 'Perlihat',
  commenter: 'Pengomentar',
  editor: 'Editor',
};

const ROLE_ICON: Record<ShareRole, string> = {
  viewer: '👁',
  commenter: '💬',
  editor: '✏️',
};

export function ShareManagementView() {
  const { shareLinks, loadingShares, refreshShares, revokeShareLink, updateShareLink, toast } = useApp();

  useEffect(() => {
    void refreshShares();
  }, [refreshShares]);

  const copyLink = async (token: string, kind: 'folder' | 'file') => {
    const url = buildShareUrl(token, kind);
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Copy failed');
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke share "${name}"? Link akan langsung tidak bisa diakses.`)) return;
    try {
      await revokeShareLink(id);
    } catch {
      toast('Revoke failed');
    }
  };

  const handleRoleChange = async (id: string, role: ShareRole) => {
    try {
      await updateShareLink(id, { role });
    } catch {
      toast('Update failed');
    }
  };

  const isExpired = (expires: string | null) => expires ? new Date(expires) < new Date() : false;

  return (
    <div>
      <div className="setting-header">
        <div>
          <h2>Share Links</h2>
          <p>Kelola semua link yang sudah kamu buat.</p>
        </div>
        <button className="btn" onClick={() => void refreshShares()}>↻ Refresh</button>
      </div>

      {loadingShares ? (
        <div className="setting-card">
          <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading...</div>
        </div>
      ) : shareLinks.length === 0 ? (
        <div className="setting-card">
          <div className="empty-key">
            <strong>Belum ada share link</strong>
            <span>Buka file/folder di Drive, lalu klik "Share" untuk bikin link pertama.</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shareLinks.map((s) => {
            const expired = isExpired(s.expires_at);
            const linkUrl = buildShareUrl(s.token, s.kind);
            return (
              <div key={s.id} className="setting-card" style={{ marginBottom: 0, opacity: s.revoked || expired ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14 }}>{s.kind === 'folder' ? '📁' : '📄'}</span>
                      <strong style={{ fontSize: 14 }}>{s.name}</strong>
                      {s.revoked && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#fee', color: '#dc2626', fontWeight: 700 }}>REVOKED</span>}
                      {!s.revoked && expired && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#fee', color: '#dc2626', fontWeight: 700 }}>EXPIRED</span>}
                      {s.has_password && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#fff8e1', color: '#b7791f', fontWeight: 700 }}>🔒 PASSWORD</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#7b8495', fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all', marginBottom: 6 }}>
                      {linkUrl}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: '#7b8495' }}>
                      <span>{ROLE_ICON[s.role]} {ROLE_LABEL[s.role]}</span>
                      <span>·</span>
                      <span>👁 {s.view_count} views</span>
                      <span>·</span>
                      <span>⬇ {s.download_count} downloads</span>
                      {s.expires_at && (
                        <>
                          <span>·</span>
                          <span>⏰ {new Date(s.expires_at).toLocaleDateString('id-ID')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="xbtn" style={{ fontSize: 11 }} onClick={() => void copyLink(s.token, s.kind)}>Copy</button>
                    {!s.revoked && (
                      <>
                        <select
                          className="setting-input"
                          style={{ fontSize: 11, padding: '4px 8px', width: 'auto' }}
                          value={s.role}
                          onChange={(e) => void handleRoleChange(s.id, e.target.value as ShareRole)}
                        >
                          <option value="viewer">👁 Perlihat</option>
                          <option value="commenter">💬 Pengomentar</option>
                          <option value="editor">✏️ Editor</option>
                        </select>
                        <button className="xbtn danger" style={{ fontSize: 11 }} onClick={() => void handleRevoke(s.id, s.name)}>Revoke</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}