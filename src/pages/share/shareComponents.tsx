import { useEffect, useState } from 'react';
import { PdfPreview } from '@/components/preview/PdfPreview';
import {
  shareThumbnailUrl,
  shareStreamUrl,
  shareDownloadUrl,
  type ShareFile,
  type ShareComment,
  type ShareRole,
} from '@/utils/shareApi';

// ============================================================
// HEADER
// ============================================================

const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: 'Perlihat',
  commenter: 'Pengomentar',
  editor: 'Editor',
};

export function ShareHeader({
  title, role, kind, viewMode, onToggleView, onOpenDetails,
}: {
  title: string;
  role: ShareRole;
  kind: 'folder' | 'file';
  viewMode: 'grid' | 'list';
  onToggleView: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <header className="share-topbar">
      <div className="share-brand">
        <div className="share-logo">S</div>
        <h1 className="share-title">{title}</h1>
        <span className={`share-role-badge ${role}`}>{ROLE_LABEL[role]}</span>
      </div>
      <div className="share-actions">
        {kind === 'folder' && (
          <button className="share-icon-btn" onClick={onToggleView} title="Toggle view">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </button>
        )}
        <button className="share-icon-btn" onClick={onOpenDetails} title="Details">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

// ============================================================
// BREADCRUMB
// ============================================================

export function ShareBreadcrumb({
  breadcrumbs, onClick,
}: {
  breadcrumbs: { id: string; name: string }[];
  onClick: (index: number) => void;
}) {
  return (
    <nav className="share-breadcrumb">
      <button onClick={() => onClick(-1)}>📁 Home</button>
      {breadcrumbs.map((b, i) => (
        <span key={b.id}>
          <span className="sep">›</span>
          {i === breadcrumbs.length - 1 ? (
            <button className="current">📁 {b.name}</button>
          ) : (
            <button onClick={() => onClick(i)}>📁 {b.name}</button>
          )}
        </span>
      ))}
    </nav>
  );
}

// ============================================================
// GRID
// ============================================================

export function ShareGrid({
  files, onItemClick, onOpenDetails, detailsFileId,
}: {
  files: ShareFile[];
  onItemClick: (f: ShareFile) => void;
  onOpenDetails: (f: ShareFile) => void;
  detailsFileId?: string;
}) {
  return (
    <div className="share-content">
      <div className="share-grid">
        {files.map((f) => (
          <ShareTile
            key={f.id}
            file={f}
            onClick={() => onItemClick(f)}
            onDetails={() => onOpenDetails(f)}
            isSelected={detailsFileId === f.id}
          />
        ))}
      </div>
    </div>
  );
}

function ShareTile({
  file, onClick, onDetails, isSelected,
}: {
  file: ShareFile;
  onClick: () => void;
  onDetails: () => void;
  isSelected: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const thumbUrl = file.thumbnailUrl;

  const renderIcon = () => {
    switch (file.previewKind) {
      case 'folder': return <div style={{ fontSize: 48 }}>📁</div>;
      case 'video': return <div style={{ fontSize: 40 }}>🎬</div>;
      case 'audio': return <div style={{ fontSize: 40 }}>🎵</div>;
      case 'pdf': return <div style={{ fontSize: 40 }}>📄</div>;
      case 'gdoc': return <div style={{ fontSize: 40 }}>📝</div>;
      case 'text': return <div style={{ fontSize: 40 }}>📃</div>;
      default:
        if (file.type === 'zip') return <div style={{ fontSize: 40 }}>🗜️</div>;
        return <div style={{ fontSize: 40, color: 'rgba(255,255,255,.4)' }}>📄</div>;
    }
  };

  return (
    <button
      className={`share-tile ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onDetails(); }}
    >
      <div className="share-tile-thumb">
        {thumbUrl && !failed ? (
          <>
            {!loaded && <div className="share-skeleton" />}
            <img
              src={thumbUrl}
              alt={file.name}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              loading="lazy"
              style={{ opacity: loaded ? 1 : 0 }}
            />
          </>
        ) : (
          renderIcon()
        )}
        {file.comments > 0 && (
          <span className="share-badge-comments">💬 {file.comments}</span>
        )}
      </div>
      <div className="share-tile-meta">
        <div className="share-tile-name">{file.name}</div>
        <div className="share-tile-sub">
          {file.isFolder ? 'Folder' : file.sizeLabel} · {file.modified}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// LIST
// ============================================================

export function ShareList({
  files, onItemClick, onOpenDetails, detailsFileId,
}: {
  files: ShareFile[];
  onItemClick: (f: ShareFile) => void;
  onOpenDetails: (f: ShareFile) => void;
  detailsFileId?: string;
}) {
  const renderIcon = (f: ShareFile) => {
    if (f.thumbnailUrl) {
      return <img src={f.thumbnailUrl} alt="" loading="lazy" />;
    }
    switch (f.previewKind) {
      case 'folder': return '📁';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'pdf': return '📄';
      case 'gdoc': return '📝';
      case 'text': return '📃';
      case 'image': return '🖼️';
      default: return f.type === 'zip' ? '🗜️' : '📄';
    }
  };

  return (
    <div className="share-content">
      <div className="share-list">
        {files.map((f) => (
          <button
            key={f.id}
            className={`share-list-row ${detailsFileId === f.id ? 'selected' : ''}`}
            onClick={() => onItemClick(f)}
            onContextMenu={(e) => { e.preventDefault(); onOpenDetails(f); }}
          >
            <div className="share-list-icon">{renderIcon(f)}</div>
            <div className="share-list-info">
              <strong>{f.name}</strong>
              <small>{f.isFolder ? 'Folder' : f.sizeLabel}{f.comments > 0 ? ` · 💬 ${f.comments}` : ''}</small>
            </div>
            <div className="share-list-meta">{f.modified}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// LIGHTBOX — Preview semua tipe file
// ============================================================

export function ShareLightbox({
  files, activeIndex, token, password, onClose, onChange, onOpenDetails,
}: {
  files: ShareFile[];
  activeIndex: number;
  token: string;
  password?: string;
  onClose: () => void;
  onChange: (index: number) => void;
  onOpenDetails: (f: ShareFile) => void;
}) {
  const active = files[activeIndex];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && activeIndex > 0) onChange(activeIndex - 1);
      if (e.key === 'ArrowRight' && activeIndex < files.length - 1) onChange(activeIndex + 1);
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [activeIndex, files.length, onClose, onChange]);

  if (!active) return null;

  const streamUrl = shareStreamUrl(token, active.id, password);
  const downloadUrl = shareDownloadUrl(token, active.id, password);

  const renderStage = () => {
    if (active.previewKind === 'video') {
      return (
        <video
          src={streamUrl}
          controls
          autoPlay
          playsInline
          style={{ maxWidth: '100%', maxHeight: '100%', background: '#000' }}
        />
      );
    }

    if (active.previewKind === 'audio') {
      return (
        <div style={{ textAlign: 'center', padding: 40, width: '100%' }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>🎵</div>
          <audio src={streamUrl} controls style={{ width: '100%', maxWidth: 480 }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 12 }}>
            {active.name}
          </div>
        </div>
      );
    }

if (active.previewKind === 'pdf' || active.previewKind === 'gdoc') {
  return <PdfPreview url={streamUrl} />;
}

    if (active.previewKind === 'text') {
      return <TextPreview url={streamUrl} name={active.name} />;
    }

    if (active.previewKind === 'image' || active.type === 'img') {
      return (
        <img
          src={streamUrl}
          alt={active.name}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      );
    }

    // Unsupported / fallback
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,.5)' }}>
        <div style={{ fontSize: 80, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>Preview not available</div>
        <div style={{ fontSize: 12, marginBottom: 20, color: 'rgba(255,255,255,.35)' }}>
          {active.mimeType}
        </div>
        <a href={downloadUrl} download className="share-btn primary">
          ⬇ Download
        </a>
      </div>
    );
  };

  return (
    <div className="share-lightbox">
      <div className="share-lb-head">
        <button className="share-icon-btn" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="share-icon-btn" onClick={() => onOpenDetails(active)} title="Info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          <button className="share-icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="share-lb-stage">
        {renderStage()}

        <button
          className="share-lb-arrow left"
          onClick={() => activeIndex > 0 && onChange(activeIndex - 1)}
          disabled={activeIndex === 0}
        >‹</button>
        <button
          className="share-lb-arrow right"
          onClick={() => activeIndex < files.length - 1 && onChange(activeIndex + 1)}
          disabled={activeIndex === files.length - 1}
        >›</button>
      </div>

      <div className="share-lb-foot">
        <span className="share-lb-counter">
          {String(activeIndex + 1).padStart(2, '0')} / {String(files.length).padStart(2, '0')}
        </span>
        <a href={downloadUrl} download className="share-btn">
          ⬇ Download
        </a>
      </div>
    </div>
  );
}

// ============================================================
// TEXT PREVIEW — fetch & tampilkan sebagai <pre>
// ============================================================

function TextPreview({ url, name }: { url: string; name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setContent(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.text();
      })
      .then((t) => {
        if (cancelled) return;
        setContent(t.length > 100000 ? t.slice(0, 100000) + '\n\n... (truncated)' : t);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div style={{ color: 'rgba(255,255,255,.5)', padding: 40, fontSize: 13 }}>
        Loading {name}...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'rgba(255,255,255,.5)', padding: 40, fontSize: 13 }}>
        Failed to load text content
      </div>
    );
  }

  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxWidth: '100%',
        maxHeight: '100%',
        overflow: 'auto',
        padding: 20,
        background: '#0d111b',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#e2e8f0',
        margin: 0,
        textAlign: 'left',
        minWidth: 300,
      }}
    >
      {content}
    </pre>
  );
}

// ============================================================
// DETAILS PANEL
// ============================================================

export function ShareDetailsPanel({
  file, role, token, password, comments, commentsLoading, commentsEnabled, onPostComment, onClose,
}: {
  file: ShareFile;
  role: ShareRole;
  token: string;
  password?: string;
  comments: ShareComment[];
  commentsLoading: boolean;
  commentsEnabled: boolean;
  onPostComment: (content: string, authorName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [authorName, setAuthorName] = useState(() => localStorage.getItem('ms_comment_name') || '');
  const [posting, setPosting] = useState(false);

  const downloadUrl = shareDownloadUrl(token, file.id, password);
  const thumbUrl = file.thumbnailUrl;
  const streamUrl = shareStreamUrl(token, file.id, password);

  const submit = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    if (authorName.trim()) localStorage.setItem('ms_comment_name', authorName.trim());
    await onPostComment(commentText.trim(), authorName.trim());
    setCommentText('');
    setPosting(false);
  };

  const renderPreview = () => {
    if (file.previewKind === 'video') {
      return <video src={streamUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
    }
    if (file.previewKind === 'audio') {
      return <div style={{ fontSize: 64 }}>🎵</div>;
    }
    if (file.previewKind === 'pdf' || file.previewKind === 'gdoc') {
      return <div style={{ fontSize: 64 }}>📄</div>;
    }
    if (file.previewKind === 'text') {
      return <div style={{ fontSize: 64 }}>📃</div>;
    }
    if (thumbUrl) {
      return <img src={thumbUrl} alt="" />;
    }
    if (file.isFolder) {
      return <div style={{ fontSize: 64 }}>📁</div>;
    }
    if (file.type === 'zip') {
      return <div style={{ fontSize: 64 }}>🗜️</div>;
    }
    return <div style={{ fontSize: 64 }}>📄</div>;
  };

  return (
    <>
      <div className="share-details-backdrop" onClick={onClose} />
      <aside className="share-details">
        <div className="share-details-head">
          <h2>Details</h2>
          <button className="share-icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="share-details-body">
          <div className="share-details-preview">
            {renderPreview()}
          </div>
          <div>
            <div className="share-details-name">{file.name}</div>
            <div className="share-details-sub">
              {file.isFolder ? 'Folder' : file.sizeLabel}
            </div>
          </div>

          <div>
            <div className="share-details-row"><span>Nama</span><span>{file.name}</span></div>
            <div className="share-details-row"><span>Tipe</span><span>{file.mimeType || file.type}</span></div>
            {!file.isFolder && <div className="share-details-row"><span>Ukuran</span><span>{file.sizeLabel}</span></div>}
            <div className="share-details-row"><span>Dimodifikasi</span><span>{file.modified}</span></div>
            <div className="share-details-row"><span>Akses Anda</span><span>{ROLE_LABEL[role]}</span></div>
          </div>

          {!file.isFolder && (
            <div className="share-details-actions">
              <a href={downloadUrl} download className="share-btn primary">⬇ Download</a>
            </div>
          )}

          {commentsEnabled && !file.isFolder && (
            <div className="share-comments">
              <h3>💬 Komentar {comments.length > 0 ? `(${comments.length})` : ''}</h3>
              {commentsLoading ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', padding: 12, fontSize: 12 }}>Loading...</div>
              ) : comments.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, padding: '4px 0' }}>
                  Belum ada komentar. Jadilah yang pertama!
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="share-comment">
                    <div className="share-comment-avatar">{c.author_name.charAt(0).toUpperCase()}</div>
                    <div className="share-comment-body">
                      <div className="share-comment-head">
                        <strong>{c.author_name}</strong>
                        <small>{new Date(c.created_at).toLocaleString('id-ID')}</small>
                      </div>
                      <div className="share-comment-text">{c.content}</div>
                    </div>
                  </div>
                ))
              )}

              <div style={{ marginTop: 8 }}>
                <input
                  className="share-input"
                  placeholder="Nama kamu (opsional)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  style={{ marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="share-input"
                    placeholder="Tulis komentar..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                  />
                  <button
                    className="share-btn primary"
                    style={{ flex: '0 0 auto' }}
                    onClick={() => void submit()}
                    disabled={posting || !commentText.trim()}
                  >
                    {posting ? '...' : 'Kirim'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ============================================================
// PASSWORD GATE
// ============================================================

export function SharePasswordGate({
  name, password, setPassword, onVerify, error,
}: {
  name: string;
  password: string;
  setPassword: (v: string) => void;
  onVerify: () => void;
  error: boolean;
}) {
  return (
    <div className="share-state-page">
      <div className="share-state-mark">🔒</div>
      <h1>{name}</h1>
      <p>Halaman ini dilindungi password.<br />Masukkan password untuk melanjutkan.</p>
      <div className="share-password-form">
        <input
          type="password"
          className="share-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onVerify(); }}
          autoFocus
          style={{ marginBottom: 8 }}
        />
        <button className="share-btn primary" style={{ width: '100%' }} onClick={onVerify}>
          Unlock
        </button>
        {error && <div style={{ color: '#ff8a8a', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Password salah</div>}
      </div>
    </div>
  );
}

// ============================================================
// STATES
// ============================================================

export function ShareEmptyState() {
  return (
    <div className="share-state-page">
      <div className="share-state-mark">📭</div>
      <h1>Folder kosong</h1>
      <p>Belum ada file di folder ini.</p>
    </div>
  );
}

export function ShareErrorState({ message }: { message: string }) {
  return (
    <div className="share-state-page">
      <div className="share-state-mark">⚠</div>
      <h1>Link tidak dapat diakses</h1>
      <p>{message}</p>
    </div>
  );
}

export function ShareLoadingState() {
  return (
    <div className="share-loading">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div key={n} className="share-skeleton-tile" />
      ))}
    </div>
  );
}

export function ShareToast({ message }: { message: string }) {
  return <div className="share-toast">{message}</div>;
}