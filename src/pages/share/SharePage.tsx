import { useEffect, useState } from 'react';
import {
  fetchPublicShareInfo,
  verifySharePassword,
  fetchShareFolder,
  fetchComments,
  postComment,
  type PublicShareInfo,
  type ShareFile,
  type ShareComment,
} from '@/utils/shareApi';
import {
  ShareHeader,
  ShareBreadcrumb,
  ShareGrid,
  ShareList,
  ShareLightbox,
  ShareDetailsPanel,
  SharePasswordGate,
  ShareEmptyState,
  ShareErrorState,
  ShareLoadingState,
  ShareToast,
} from './shareComponents';

function parseRoute(): { token: string | null; kind: 'folder' | 'file' } {
  const path = window.location.pathname;
  const folderMatch = path.match(/^\/g\/([^/]+)/);
  if (folderMatch) return { token: folderMatch[1], kind: 'folder' };
  const fileMatch = path.match(/^\/s\/([^/]+)/);
  if (fileMatch) return { token: fileMatch[1], kind: 'file' };
  return { token: null, kind: 'folder' };
}

export function SharePage() {
  const { token, kind } = parseRoute();

  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Folder navigation
  const [currentFolderId, setCurrentFolderId] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // UI
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [detailsFile, setDetailsFile] = useState<ShareFile | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Comments
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // ============ Toast helper ============
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  // ============ Load share info ============
  useEffect(() => {
    if (!token) {
      setError('Link tidak valid');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const i = await fetchPublicShareInfo(token);
        setInfo(i);
        if (i.revoked) setError('Link ini sudah dicabut oleh pemilik.');
        else if (i.expired) setError('Link ini sudah kadaluarsa.');
        else if (!i.has_password) setPasswordOk(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error';
        if (msg === 'NOT_FOUND') setError('Link tidak ditemukan.');
        else if (msg === 'EXPIRED') setError('Link sudah kadaluarsa.');
        else setError('Gagal memuat link.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ============ Load files ============
  useEffect(() => {
    if (!token || !passwordOk || !info) return;
    void loadFiles(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, passwordOk, info, currentFolderId]);

  // Auto-open lightbox for single-file share
  useEffect(() => {
    if (info?.kind === 'file' && files.length === 1 && lightboxIndex < 0) {
      setLightboxIndex(0);
    }
  }, [info?.kind, files.length, lightboxIndex]);

  // FIX: Pastikan body selalu bisa scroll kalau lightbox tidak aktif
  useEffect(() => {
    if (lightboxIndex < 0) {
      document.body.style.overflow = '';
    }
  }, [lightboxIndex]);

  // FIX: Pastikan body di-restore saat unmount / ganti folder
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const loadFiles = async (path: string) => {
    if (!token) return;
    setFilesLoading(true);
    try {
      const res = await fetchShareFolder(token, path, password || undefined);
      setFiles(res.files);
      setBreadcrumbs(res.breadcrumbs);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  // ============ Handlers ============
  const handleVerify = async () => {
    if (!token) return;
    const res = await verifySharePassword(token, password);
    if (res.ok) {
      setPasswordOk(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setTimeout(() => setPasswordError(false), 1500);
    }
  };

  const handleItemClick = (file: ShareFile) => {
    if (file.isFolder) {
      setCurrentFolderId(file.id);
      setLightboxIndex(-1);
    } else {
      const imageItems = files.filter((f) => !f.isFolder);
      const idx = imageItems.findIndex((f) => f.id === file.id);
      if (idx >= 0) setLightboxIndex(idx);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index < 0) setCurrentFolderId('');
    else setCurrentFolderId(breadcrumbs[index].id);
  };

  const openDetails = async (file: ShareFile) => {
    setDetailsFile(file);
    setDetailsOpen(true);
    // Load comments kalau role commenter/editor
    if (info && (info.role === 'commenter' || info.role === 'editor') && !file.isFolder) {
      setCommentsLoading(true);
      try {
        const list = await fetchComments(token!, file.id, password || undefined);
        setComments(list);
      } catch {
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsFile(null);
    setComments([]);
  };

  const handlePostComment = async (content: string, authorName: string) => {
    if (!token || !detailsFile) return;
    try {
      const c = await postComment(token, detailsFile.id, authorName || 'Anonymous', content, password || undefined);
      setComments((prev) => [...prev, c]);
      showToast('💬 Komentar ditambahkan');
    } catch {
      showToast('Gagal kirim komentar');
    }
  };

  // ============ Render states ============

  if (loading) {
    return <ShareLoadingState />;
  }

  if (!token || error) {
    return <ShareErrorState message={error || 'Link tidak valid'} />;
  }

  if (!passwordOk && info?.has_password) {
    return (
      <SharePasswordGate
        name={info.name}
        password={password}
        setPassword={setPassword}
        onVerify={handleVerify}
        error={passwordError}
      />
    );
  }

  if (!info) return <ShareErrorState message="Link tidak valid" />;

  const commentsEnabled = info.role === 'commenter' || info.role === 'editor';
  const imageItems = files.filter((f) => !f.isFolder);

  return (
    <div className="share-app">
      <ShareHeader
        title={info.name}
        role={info.role}
        kind={info.kind}
        viewMode={viewMode}
        onToggleView={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
        onOpenDetails={() => {
          if (detailsFile) setDetailsOpen(true);
        }}
      />

      <ShareBreadcrumb
        breadcrumbs={breadcrumbs}
        onClick={handleBreadcrumbClick}
      />

      {filesLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
          Loading...
        </div>
      ) : files.length === 0 ? (
        <ShareEmptyState />
      ) : viewMode === 'grid' ? (
        <ShareGrid
          files={files}
          onItemClick={handleItemClick}
          onOpenDetails={openDetails}
          detailsFileId={detailsOpen ? detailsFile?.id : undefined}
        />
      ) : (
        <ShareList
          files={files}
          onItemClick={handleItemClick}
          onOpenDetails={openDetails}
          detailsFileId={detailsOpen ? detailsFile?.id : undefined}
        />
      )}

      <div className="share-footer">
        {files.length} items · {info.view_count} views · Powered by My Storage Hub
      </div>

      {lightboxIndex >= 0 && imageItems[lightboxIndex] && (
        <ShareLightbox
          files={imageItems}
          activeIndex={lightboxIndex}
          token={token}
          password={password || undefined}
          onClose={() => setLightboxIndex(-1)}
          onChange={(idx) => setLightboxIndex(idx)}
          onOpenDetails={(f) => void openDetails(f)}
        />
      )}

      {detailsOpen && detailsFile && (
        <ShareDetailsPanel
          file={detailsFile}
          role={info.role}
          token={token}
          password={password || undefined}
          comments={comments}
          commentsLoading={commentsLoading}
          commentsEnabled={commentsEnabled}
          onPostComment={handlePostComment}
          onClose={closeDetails}
        />
      )}

      {toast && <ShareToast message={toast} />}
    </div>
  );
}