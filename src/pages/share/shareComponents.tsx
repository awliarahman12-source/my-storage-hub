import { useEffect, useState } from 'react';
import {
  shareStreamUrl,
  shareDownloadUrl,
  type ShareFile,
  type ShareComment,
  type ShareRole,
} from '@/utils/shareApi';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Upload,
  FolderPlus,
  Info,
  LayoutGrid,
  RefreshCw,
  Folder,
  Home,
  ChevronRight,
  ChevronLeft,
  FileText,
  Film,
  Music,
  FileArchive,
  Image as ImageIcon,
  FileType,
  File as FileIconLucide,
  Download,
  MoreVertical,
  ArrowRight,
  Lock,
  MessageCircle,
  Send,
  Inbox,
  X,
  AlertTriangle,
  CheckSquare,
  Square,
  Check,
  DownloadCloud,
  Package,
} from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: 'Perlihat',
  commenter: 'Pengomentar',
  editor: 'Editor',
};

// ============================================================
// HEADER
// ============================================================

export function ShareHeader({
  title, role, kind, viewMode, onToggleView, onOpenDetails,
  isEditor, uploading, onUpload, onNewFolder, onRefresh,
  selectMode, onToggleSelectMode, selectableCount,
}: {
  title: string;
  role: ShareRole;
  kind: 'folder' | 'file';
  viewMode: 'grid' | 'list';
  onToggleView: () => void;
  onOpenDetails: () => void;
  isEditor?: boolean;
  uploading?: boolean;
  onUpload?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  selectableCount?: number;
}) {
  const canSelect = kind !== 'file' && (selectableCount ?? 0) > 0;
  return (
    <header className="share-topbar">
      <div className="share-brand">
        <div className="share-logo">S</div>
        <h1 className="share-title">{title}</h1>
        <span className={`share-role-badge ${role}`}>{ROLE_LABEL[role]}</span>
      </div>
      <div className="share-actions">
        {isEditor && kind === 'folder' && (
          <>
            <button className="share-icon-btn" onClick={onUpload} disabled={uploading} title="Upload file">
              <Upload size={18} />
            </button>
            <button className="share-icon-btn" onClick={onNewFolder} title="Folder baru">
              <FolderPlus size={18} />
            </button>
          </>
        )}
        {canSelect && onToggleSelectMode && (
          <button
            className={'share-icon-btn' + (selectMode ? ' active' : '')}
            onClick={onToggleSelectMode}
            title={selectMode ? 'Keluar mode pilih' : 'Pilih file'}
          >
            {selectMode ? <X size={18} /> : <CheckSquare size={18} />}
          </button>
        )}
        {kind === 'folder' && (
          <button className="share-icon-btn" onClick={onToggleView} title="Toggle view">
            <LayoutGrid size={18} />
          </button>
        )}
        <button className="share-icon-btn" onClick={onOpenDetails} title="Details">
          <Info size={18} />
        </button>
        {isEditor && onRefresh && (
          <button className="share-icon-btn" onClick={onRefresh} title="Refresh">
            <RefreshCw size={18} />
          </button>
        )}
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
      <button onClick={() => onClick(-1)}><Home size={14} /> Home</button>
      {breadcrumbs.map((b, i) => (
        <span key={b.id}>
          <ChevronRight size={12} className="sep" style={{ display: 'inline', verticalAlign: 'middle', opacity: 0.4 }} />
          {i === breadcrumbs.length - 1 ? (
            <button className="current"><Folder size={14} /> {b.name}</button>
          ) : (
            <button onClick={() => onClick(i)}><Folder size={14} /> {b.name}</button>
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
  files, onItemClick, onOpenDetails, detailsFileId, isEditor, onContextMenu,
  selectMode, selectedIds, onToggleSelect,
}: {
  files: ShareFile[];
  onItemClick: (f: ShareFile) => void;
  onOpenDetails: (f: ShareFile) => void;
  detailsFileId?: string;
  isEditor?: boolean;
  onContextMenu?: (e: React.MouseEvent, f: ShareFile) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (f: ShareFile) => void;
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
            isEditor={isEditor}
            onContextMenu={onContextMenu}
            selectMode={selectMode}
            isChecked={selectedIds?.has(f.id) ?? false}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ShareTile({
  file, onClick, onDetails, isSelected, isEditor, onContextMenu,
  selectMode, isChecked, onToggleSelect,
}: {
  file: ShareFile;
  onClick: () => void;
  onDetails: () => void;
  isSelected: boolean;
  isEditor?: boolean;
  onContextMenu?: (e: React.MouseEvent, f: ShareFile) => void;
  selectMode?: boolean;
  isChecked?: boolean;
  onToggleSelect?: (f: ShareFile) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const thumbUrl = file.thumbnailUrl;

  const renderIcon = () => {
    const size = 40;
    switch (file.previewKind) {
      case 'folder': return <Folder size={size} />;
      case 'video': return <Film size={size} />;
      case 'audio': return <Music size={size} />;
      case 'pdf': return <FileText size={size} />;
      case 'gdoc': return <FileType size={size} />;
      case 'text': return <FileIconLucide size={size} />;
      default:
        if (file.type === 'zip') return <FileArchive size={size} />;
        if (file.type === 'img') return <ImageIcon size={size} />;
        return <FileText size={size} />;
    }
  };

  const folderPreviews = file.isFolder ? (file.previewThumbs || []) : [];
  const hasFolderPreview = folderPreviews.length > 0;

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect(file);
      return;
    }
    onClick();
  };

  return (
    <button
      className={`share-tile ${isSelected ? 'selected' : ''} ${selectMode ? 'select-mode' : ''} ${isChecked ? 'checked' : ''}`}
      onClick={handleClick}
      onContextMenu={(e) => {
        if (selectMode) { e.preventDefault(); return; }
        if (isEditor && onContextMenu) { e.preventDefault(); onContextMenu(e, file); }
        else { e.preventDefault(); onDetails(); }
      }}
    >
      <div className="share-tile-thumb">
        {hasFolderPreview ? (
          <div className="share-folder-preview">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="share-folder-preview-cell">
                {folderPreviews[i] ? (
                  <img
                    src={folderPreviews[i].thumbnailUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : thumbUrl && !failed ? (
          <>
            {!loaded && <div className="share-skeleton" />}
            <img
              src={thumbUrl} alt={file.name}
              onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
              loading="lazy" style={{ opacity: loaded ? 1 : 0 }}
            />
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,.5)' }}>{renderIcon()}</div>
        )}
        {file.comments > 0 && !selectMode && (
          <span className="share-badge-comments">
            <MessageCircle size={10} /> {file.comments}
          </span>
        )}
        {selectMode && (
          <span className={`share-tile-check ${isChecked ? 'on' : ''}`}>
            {isChecked ? <Check size={14} /> : null}
          </span>
        )}
        {!selectMode && isEditor && onContextMenu && (
          <span
            className="share-tile-menu-btn"
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
            role="button" aria-label="More actions"
          ><MoreVertical size={14} /></span>
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
  files, onItemClick, onOpenDetails, detailsFileId, isEditor, onContextMenu,
  selectMode, selectedIds, onToggleSelect,
}: {
  files: ShareFile[];
  onItemClick: (f: ShareFile) => void;
  onOpenDetails: (f: ShareFile) => void;
  detailsFileId?: string;
  isEditor?: boolean;
  onContextMenu?: (e: React.MouseEvent, f: ShareFile) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (f: ShareFile) => void;
}) {
  const renderIcon = (f: ShareFile) => {
    if (f.isFolder && f.previewThumbs && f.previewThumbs.length > 0) {
      return (
        <div className="share-folder-preview-list">
          {f.previewThumbs.slice(0, 4).map((t, i) => (
            <img
              key={i}
              src={t.thumbnailUrl}
              alt=""
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ))}
        </div>
      );
    }
    if (f.thumbnailUrl) return <img src={f.thumbnailUrl} alt="" loading="lazy" />;
    switch (f.previewKind) {
      case 'folder': return <Folder size={20} />;
      case 'video': return <Film size={20} />;
      case 'audio': return <Music size={20} />;
      case 'pdf': return <FileText size={20} />;
      case 'gdoc': return <FileType size={20} />;
      case 'text': return <FileIconLucide size={20} />;
      case 'image': return <ImageIcon size={20} />;
      default: return f.type === 'zip' ? <FileArchive size={20} /> : <FileText size={20} />;
    }
  };

  return (
    <div className="share-content">
      <div className="share-list">
        {files.map((f) => {
          const checked = selectedIds?.has(f.id) ?? false;
          const handleClick = () => {
            if (selectMode && onToggleSelect) {
              onToggleSelect(f);
              return;
            }
            onItemClick(f);
          };
          return (
            <button
              key={f.id}
              className={`share-list-row ${detailsFileId === f.id ? 'selected' : ''} ${selectMode ? 'select-mode' : ''} ${checked ? 'checked' : ''}`}
              onClick={handleClick}
              onContextMenu={(e) => {
                if (selectMode) { e.preventDefault(); return; }
                if (isEditor && onContextMenu) { e.preventDefault(); onContextMenu(e, f); }
                else { e.preventDefault(); onOpenDetails(f); }
              }}
            >
              {selectMode && (
                <span className={`share-tile-check list ${checked ? 'on' : ''}`}>
                  {checked ? <Check size={12} /> : null}
                </span>
              )}
              <div className="share-list-icon">{renderIcon(f)}</div>
              <div className="share-list-info">
                <strong>{f.name}</strong>
                <small>
                  {f.isFolder ? 'Folder' : f.sizeLabel}
                  {f.comments > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}><MessageCircle size={10} /> {f.comments}</span> : ''}
                </small>
              </div>
              <div className="share-list-meta">
                {f.modified}
                {!selectMode && isEditor && onContextMenu && (
                  <span
                    className="share-list-menu-btn"
                    onClick={(e) => { e.stopPropagation(); onContextMenu(e, f); }}
                    role="button" aria-label="More actions"
                  ><MoreVertical size={14} /></span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// BULK ACTION BAR (SMART LABEL)
// ============================================================

export function ShareBulkBar({
  count, fileCount, totalCount, onSelectAll, onClear, onDownload, onCancel, downloading,
}: {
  count: number;
  fileCount?: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDownload: () => void;
  onCancel: () => void;
  downloading?: boolean;
}) {
  const allSelected = count === totalCount && totalCount > 0;
  // fileCount = jumlah file (non-folder) yang dipilih
  // Kalau <=1 → label "Download", kalau >1 → "Download ZIP"
  const fCount = fileCount ?? count;
  const isZip = fCount > 1;
  const isDisabled = count === 0 || downloading || fCount === 0;

  return (
    <div className="share-bulkbar">
      <div className="share-bulkbar-left">
        <button className="share-bulkbar-close" onClick={onCancel} title="Tutup">
          <X size={16} />
        </button>
        <span className="share-bulkbar-count">
          <strong>{count}</strong> dipilih
        </span>
        <button className="share-bulkbar-btn ghost" onClick={allSelected ? onClear : onSelectAll}>
          {allSelected ? <><Square size={12} /> Hilangkan semua</> : <><CheckSquare size={12} /> Pilih semua</>}
        </button>
      </div>
      <div className="share-bulkbar-right">
        <button
          className="share-bulkbar-btn primary"
          onClick={onDownload}
          disabled={isDisabled}
          title={
            fCount === 0 ? 'Pilih minimal 1 file (folder tidak bisa didownload)'
            : isZip ? `Bungkus ${fCount} file jadi 1 ZIP`
            : 'Download file'
          }
        >
          {isZip ? <Package size={14} /> : <DownloadCloud size={14} />}
          {downloading ? 'Memproses...' : (isZip ? 'Download ZIP' : 'Download')}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// LIGHTBOX
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

  const streamUrl = shareStreamUrl(token, active.id, password, active.nodeId);
  const downloadUrl = shareDownloadUrl(token, active.id, password, active.nodeId);

  const renderStage = () => {
    if (active.previewKind === 'video') {
      return <video src={streamUrl} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%', background: '#000' }} />;
    }

    if (active.previewKind === 'audio') {
      return (
        <div style={{ textAlign: 'center', padding: 40, width: '100%' }}>
          <Music size={80} style={{ color: 'rgba(255,255,255,.4)', marginBottom: 20 }} />
          <audio src={streamUrl} controls style={{ width: '100%', maxWidth: 480 }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 12 }}>{active.name}</div>
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
      return <img src={streamUrl} alt={active.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
    }

    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,.5)' }}>
        <FileText size={80} style={{ marginBottom: 16, opacity: 0.4 }} />
        <div style={{ fontSize: 14, marginBottom: 8 }}>Preview not available</div>
        <div style={{ fontSize: 12, marginBottom: 20, color: 'rgba(255,255,255,.35)' }}>{active.mimeType}</div>
        <a href={downloadUrl} download className="share-btn primary"><Download size={14} /> Download</a>
      </div>
    );
  };

  return (
    <div className="share-lightbox">
      <div className="share-lb-head">
        <button className="share-icon-btn" onClick={onClose}><ArrowRight size={22} style={{ transform: 'rotate(180deg)' }} /></button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="share-icon-btn" onClick={() => onOpenDetails(active)} title="Info"><Info size={18} /></button>
          <button className="share-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      <div className="share-lb-stage">
        {renderStage()}

        <button className="share-lb-arrow left" onClick={() => activeIndex > 0 && onChange(activeIndex - 1)} disabled={activeIndex === 0}>
          <ChevronLeft size={24} />
        </button>
        <button className="share-lb-arrow right" onClick={() => activeIndex < files.length - 1 && onChange(activeIndex + 1)} disabled={activeIndex === files.length - 1}>
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="share-lb-foot">
        <span className="share-lb-counter">
          {String(activeIndex + 1).padStart(2, '0')} / {String(files.length).padStart(2, '0')}
        </span>
        <a href={downloadUrl} download className="share-btn"><Download size={14} /> Download</a>
      </div>
    </div>
  );
}

// ============================================================
// PDF PREVIEW
// ============================================================

function PdfPreview({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);

  return (
    <div className="share-pdf-wrap">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div style={{ padding: 40, color: 'rgba(255,255,255,.5)' }}>Loading PDF…</div>}
        error={<div style={{ padding: 40, color: '#ff8a8a' }}>Gagal memuat PDF.</div>}
      >
        <Page pageNumber={page} width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 120 : 700)} />
      </Document>
      {numPages > 1 && (
        <div className="share-pdf-nav">
          <button className="share-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} /> Prev
          </button>
          <span>Page {page} / {numPages}</span>
          <button className="share-btn" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TEXT PREVIEW
// ============================================================

function TextPreview({ url, name }: { url: string; name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setContent(null);

    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`Failed (${r.status})`); return r.text(); })
      .then((t) => {
        if (cancelled) return;
        setContent(t.length > 100000 ? t.slice(0, 100000) + '\n\n... (truncated)' : t);
        setLoading(false);
      })
      .catch(() => { if (cancelled) return; setError(true); setLoading(false); });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div style={{ color: 'rgba(255,255,255,.5)', padding: 40, fontSize: 13 }}>Loading {name}...</div>;
  if (error) return <div style={{ color: 'rgba(255,255,255,.5)', padding: 40, fontSize: 13 }}>Failed to load text content</div>;

  return (
    <pre style={{
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '100%', maxHeight: '100%',
      overflow: 'auto', padding: 20, background: '#0d111b', borderRadius: 8, fontSize: 13,
      lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#e2e8f0', margin: 0, textAlign: 'left', minWidth: 300,
    }}>
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

  const downloadUrl = shareDownloadUrl(token, file.id, password, file.nodeId);
  const thumbUrl = file.thumbnailUrl;
  const streamUrl = shareStreamUrl(token, file.id, password, file.nodeId);

  const submit = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    if (authorName.trim()) localStorage.setItem('ms_comment_name', authorName.trim());
    await onPostComment(commentText.trim(), authorName.trim());
    setCommentText('');
    setPosting(false);
  };

  const renderPreview = () => {
    if (file.previewKind === 'video') return <video src={streamUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
    if (file.previewKind === 'audio') return <Music size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
    if (file.previewKind === 'pdf' || file.previewKind === 'gdoc') return <FileText size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
    if (file.previewKind === 'text') return <FileIconLucide size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
    if (thumbUrl) return <img src={thumbUrl} alt="" />;
    if (file.isFolder) return <Folder size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
    if (file.type === 'zip') return <FileArchive size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
    return <FileText size={64} style={{ color: 'rgba(255,255,255,.5)' }} />;
  };

  return (
    <>
      <div className="share-details-backdrop" onClick={onClose} />
      <aside className="share-details">
        <div className="share-details-head">
          <h2>Details</h2>
          <button className="share-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="share-details-body">
          <div className="share-details-preview">{renderPreview()}</div>
          <div>
            <div className="share-details-name">{file.name}</div>
            <div className="share-details-sub">{file.isFolder ? 'Folder' : file.sizeLabel}</div>
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
              <a href={downloadUrl} download className="share-btn primary"><Download size={14} /> Download</a>
            </div>
          )}

          {commentsEnabled && !file.isFolder && (
            <div className="share-comments">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageCircle size={13} /> Komentar {comments.length > 0 ? `(${comments.length})` : ''}
              </h3>
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
                <input className="share-input" placeholder="Nama kamu (opsional)" value={authorName} onChange={(e) => setAuthorName(e.target.value)} style={{ marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="share-input"
                    placeholder="Tulis komentar..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                  />
                  <button className="share-btn primary" style={{ flex: '0 0 auto' }} onClick={() => void submit()} disabled={posting || !commentText.trim()}>
                    {posting ? '...' : <><Send size={14} /> Kirim</>}
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
      <div className="share-state-mark"><Lock size={26} /></div>
      <h1>{name}</h1>
      <p>Halaman ini dilindungi password.<br />Masukkan password untuk melanjutkan.</p>
      <div className="share-password-form">
        <input
          type="password" className="share-input" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onVerify(); }}
          autoFocus style={{ marginBottom: 8 }}
        />
        <button className="share-btn primary" style={{ width: '100%' }} onClick={onVerify}>Unlock</button>
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
      <div className="share-state-mark"><Inbox size={26} /></div>
      <h1>Folder kosong</h1>
      <p>Belum ada file di folder ini.</p>
    </div>
  );
}

export function ShareErrorState({ message }: { message: string }) {
  return (
    <div className="share-state-page">
      <div className="share-state-mark"><AlertTriangle size={26} /></div>
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