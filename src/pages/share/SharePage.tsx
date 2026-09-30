import { useEffect, useRef, useState } from 'react';
import {
  fetchPublicShareInfo,
  verifySharePassword,
  fetchShareFolder,
  fetchComments,
  postComment,
  shareUpload,
  shareCreateFolder,
  shareRename,
  shareMove,
  shareTrash,
  shareUntrash,
  shareStar,
  shareDownloadUrl,
  fetchShareFileBlob,
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
  ShareBulkBar,
} from './shareComponents';
import {
  ShareEditorContextMenu,
  ShareTrashConfirmModal,
  ShareMovePickerModal,
  ShareUploadToast,
  ShareUndoToast,
} from '@/components/share/ShareEditorMenu';
import { Search, X } from 'lucide-react';

function parseRoute(): { token: string | null; kind: 'folder' | 'file' } {
  const path = window.location.pathname;
  const folderMatch = path.match(/^\/g\/([^/]+)/);
  if (folderMatch) return { token: folderMatch[1], kind: 'folder' };
  const fileMatch = path.match(/^\/s\/([^/]+)/);
  if (fileMatch) return { token: fileMatch[1], kind: 'file' };
  return { token: null, kind: 'folder' };
}

function safeZipName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'file';
}

export function SharePage() {
  const { token, kind } = parseRoute();

  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [currentFolderId, setCurrentFolderId] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [detailsFile, setDetailsFile] = useState<ShareFile | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState('');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ filename: string; progress: number; status: 'uploading' | 'success' | 'error' }[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: ShareFile } | null>(null);
  const [trashConfirm, setTrashConfirm] = useState<ShareFile[] | null>(null);
  const [movePicker, setMovePicker] = useState<ShareFile | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [undoState, setUndoState] = useState<{ files: ShareFile[]; timeLeft: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const undoTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

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

  useEffect(() => {
    if (!token || !passwordOk || !info) return;
    void loadFiles(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, passwordOk, info, currentFolderId]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [currentFolderId]);

  useEffect(() => {
    if (info?.kind === 'file' && files.length === 1 && lightboxIndex < 0) {
      setLightboxIndex(0);
    }
  }, [info?.kind, files.length, lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex < 0) {
      document.body.style.overflow = '';
    }
  }, [lightboxIndex]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
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
    if (selectMode) {
      toggleSelect(file);
      return;
    }
    if (file.isFolder) {
      if (info?.kind === 'folder') {
        setCurrentFolderId(file.id);
        setLightboxIndex(-1);
      } else {
        showToast('Folder di share multi-item tidak bisa dibuka. Buat share folder tunggal untuk browse.');
      }
      return;
    }
    const imageItems = files.filter((f) => !f.isFolder);
    const idx = imageItems.findIndex((f) => f.id === file.id);
    if (idx >= 0) setLightboxIndex(idx);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index < 0) setCurrentFolderId('');
    else setCurrentFolderId(breadcrumbs[index].id);
  };

  const toggleSelect = (file: ShareFile) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const handleToggleSelectMode = () => {
    setSelectMode((v) => !v);
    if (selectMode) setSelectedIds(new Set());
  };

  const handleSelectAll = () => {
    const downloadable = files.filter((f) => !f.isFolder);
    setSelectedIds(new Set(downloadable.map((f) => f.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // ============ SMART BULK DOWNLOAD ============
  // 1 file → download langsung (tanpa ZIP)
  // >1 file → bungkus jadi ZIP
  const handleBulkDownload = async () => {
    if (!token || selectedIds.size === 0) return;
    const targets = files.filter((f) => selectedIds.has(f.id) && !f.isFolder);
    if (targets.length === 0) {
      showToast('Tidak ada file (bukan folder) yang dipilih');
      return;
    }

    // ==== 1 FILE → DOWNLOAD LANGSUNG ====
    if (targets.length === 1) {
      const f = targets[0];
      const dlUrl = shareDownloadUrl(token, f.id, password || undefined, f.nodeId);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = f.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`Mengunduh ${f.name}`);
      setSelectedIds(new Set());
      return;
    }

    // ==== >1 FILE → ZIP ====
    let JSZip: any;
    try {
      JSZip = (await import('jszip')).default;
    } catch {
      showToast('JSZip belum terinstall. Jalankan: npm install jszip');
      return;
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    setZipProgress({ current: 0, total: targets.length, name: '' });

    for (let i = 0; i < targets.length; i++) {
      const f = targets[i];
      setZipProgress({ current: i + 1, total: targets.length, name: f.name });
      try {
        const blob = await fetchShareFileBlob(token, f.id, password || undefined, f.nodeId);
        let name = safeZipName(f.name);
        let counter = 1;
        while (usedNames.has(name)) {
          const dot = name.lastIndexOf('.');
          if (dot > 0) name = `${name.substring(0, dot)}_${counter}${name.substring(dot)}`;
          else name = `${name}_${counter}`;
          counter++;
        }
        usedNames.add(name);
        zip.file(name, blob);
      } catch (err) {
        console.error(`Gagal fetch ${f.name}:`, err);
        zip.file(`_FAILED_${safeZipName(f.name)}.txt`, `Failed to download: ${f.name}\nReason: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    setZipProgress({ current: targets.length, total: targets.length, name: 'Membuat ZIP...' });

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    const zipName = info?.name ? safeZipName(info.name) : 'files';
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${zipName}_${dateStr}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setZipProgress(null);
    showToast(`✓ ZIP berisi ${targets.length} file diunduh`);
    setSelectedIds(new Set());
  };

  const openDetails = async (file: ShareFile) => {
    setDetailsFile(file);
    setDetailsOpen(true);
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const uploadSingleFile = async (file: File, index: number) => {
    if (!token) return;
    try {
      await shareUpload(token, file, currentFolderId || undefined, password || undefined);
      setUploadQueue((prev) =>
        prev.map((item, i) => i === index ? { ...item, progress: 100, status: 'success' as const } : item)
      );
    } catch (err) {
      setUploadQueue((prev) =>
        prev.map((item, i) => i === index ? { ...item, status: 'error' as const } : item)
      );
      showToast(err instanceof Error ? err.message : 'Upload gagal');
    }
  };

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!token) return;
    const arr = Array.from(fileList);
    if (arr.length === 0) return;

    setUploading(true);
    const queue = arr.map((f) => ({ filename: f.name, progress: 0, status: 'uploading' as const }));
    setUploadQueue(queue);

    const progressTimers = queue.map((_, i) =>
      window.setInterval(() => {
        setUploadQueue((prev) =>
          prev.map((item, idx) =>
            idx === i && item.status === 'uploading'
              ? { ...item, progress: Math.min(90, item.progress + 10) }
              : item
          )
        );
      }, 250)
    );

    for (let i = 0; i < arr.length; i++) {
      await uploadSingleFile(arr[i], i);
    }

    progressTimers.forEach((t) => window.clearInterval(t));

    const failed = uploadQueue.filter((q) => q.status === 'error').length;
    if (failed === 0) {
      showToast(`✓ ${arr.length} file diunggah`);
    }

    setTimeout(() => setUploadQueue([]), 2500);
    setUploading(false);
    await loadFiles(currentFolderId);
  };

  const handleNewFolder = async () => {
    if (!token) return;
    const name = prompt('Nama folder baru:');
    if (!name?.trim()) return;
    try {
      await shareCreateFolder(token, name.trim(), currentFolderId || undefined, password || undefined);
      showToast('✓ Folder dibuat');
      await loadFiles(currentFolderId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal bikin folder');
    }
  };

  const handleRefresh = async () => {
    await loadFiles(currentFolderId);
    showToast('Diperbarui');
  };

  const handleRename = async (file: ShareFile) => {
    if (!token) return;
    const lastDot = file.name.lastIndexOf('.');
    const hasExt = !file.isFolder && lastDot > 0 && lastDot < file.name.length - 1;
    const baseName = hasExt ? file.name.substring(0, lastDot) : file.name;
    const ext = hasExt ? file.name.substring(lastDot) : '';
    const n = prompt('Nama baru:', baseName);
    if (!n?.trim()) return;
    const newName = hasExt ? n.trim() + ext : n.trim();
    try {
      await shareRename(token, file.id, newName, file.nodeId, password || undefined);
      showToast('✓ Berhasil di-rename');
      await loadFiles(currentFolderId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rename gagal');
    }
  };

  const handleMove = (file: ShareFile) => {
    setMovePicker(file);
  };

  const handleMoveConfirm = async (destFolderId: string) => {
    if (!token || !movePicker) return;
    setProcessing(true);
    try {
      await shareMove(token, movePicker.id, destFolderId, movePicker.nodeId, password || undefined);
      showToast('✓ File dipindah');
      setMovePicker(null);
      await loadFiles(currentFolderId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Move gagal');
    } finally {
      setProcessing(false);
    }
  };

  const handleTrash = (filesToTrash: ShareFile[]) => {
    setTrashConfirm(filesToTrash);
  };

  const handleTrashConfirm = async () => {
    if (!token || !trashConfirm) return;
    setProcessing(true);
    const trashed: ShareFile[] = [];
    try {
      for (const f of trashConfirm) {
        await shareTrash(token, f.id, f.nodeId, password || undefined);
        trashed.push(f);
      }
      showToast(`✓ ${trashed.length} file ke trash`);
      setTrashConfirm(null);
      await loadFiles(currentFolderId);
      if (trashed.length > 0) startUndoWindow(trashed);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Trash gagal');
    } finally {
      setProcessing(false);
    }
  };

  const startUndoWindow = (trashedFiles: ShareFile[]) => {
    if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
    setUndoState({ files: trashedFiles, timeLeft: 8 });
    undoTimerRef.current = window.setInterval(() => {
      setUndoState((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) {
          if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
          undoTimerRef.current = null;
          return null;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
  };

  const handleUndoTrash = async () => {
    if (!token || !undoState) return;
    if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
    undoTimerRef.current = null;
    const filesToRestore = undoState.files;
    setUndoState(null);
    let ok = 0;
    for (const f of filesToRestore) {
      try {
        await shareUntrash(token, f.id, f.nodeId, password || undefined);
        ok++;
      } catch { /* skip */ }
    }
    showToast(`✓ ${ok} file di-restore`);
    await loadFiles(currentFolderId);
  };

  const handleStar = async (file: ShareFile) => {
    if (!token) return;
    try {
      await shareStar(token, file.id, !file.starred, file.nodeId, password || undefined);
      showToast('✓ Berhasil di-star');
      await loadFiles(currentFolderId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Star gagal');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: ShareFile) => {
    if (selectMode) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setContextMenu({ x, y, file });
  };

  const canUpload = info?.role === 'editor' && info?.kind === 'folder';

  const handleDragEnter = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      void handleUploadFiles(droppedFiles);
    }
  };

  if (loading) return <ShareLoadingState />;

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
  const isEditor = info.role === 'editor';

  const searchLower = searchQuery.trim().toLowerCase();
  const visibleFiles = searchLower
    ? files.filter((f) => f.name.toLowerCase().includes(searchLower))
    : files;

  const imageItems = visibleFiles.filter((f) => !f.isFolder);
  const folderItems = visibleFiles.filter((f) => f.isFolder);

  const downloadableCount = visibleFiles.filter((f) => !f.isFolder).length;
  const selectedCount = selectedIds.size;

  // Hitung berapa file (bukan folder) yang di-select, buat label dinamis
  const selectedFileCount = visibleFiles.filter((f) => selectedIds.has(f.id) && !f.isFolder).length;

  return (
    <div
      className={'share-app' + (dragging ? ' dragging' : '') + (selectedCount > 0 ? ' has-bulkbar' : '')}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ShareHeader
        title={info.name}
        role={info.role}
        kind={info.kind}
        viewMode={viewMode}
        onToggleView={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
        onOpenDetails={() => {
          if (detailsFile) setDetailsOpen(true);
        }}
        isEditor={isEditor}
        uploading={uploading}
        onUpload={handleUploadClick}
        onNewFolder={handleNewFolder}
        onRefresh={handleRefresh}
        selectMode={selectMode}
        onToggleSelectMode={handleToggleSelectMode}
        selectableCount={downloadableCount}
      />

      <ShareBreadcrumb
        breadcrumbs={breadcrumbs}
        onClick={handleBreadcrumbClick}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length > 0) void handleUploadFiles(fs);
          e.target.value = '';
        }}
      />

      {info.kind === 'folder' && files.length > 0 && (
        <div className="share-search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Cari file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="share-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {filesLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
          Loading...
        </div>
      ) : files.length === 0 ? (
        <ShareEmptyState />
      ) : visibleFiles.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
          Tidak ada file yang cocok dengan "{searchQuery}"
        </div>
      ) : viewMode === 'grid' ? (
        <ShareGrid
          files={visibleFiles}
          onItemClick={handleItemClick}
          onOpenDetails={openDetails}
          detailsFileId={detailsOpen ? detailsFile?.id : undefined}
          isEditor={isEditor}
          onContextMenu={handleContextMenu}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <ShareList
          files={visibleFiles}
          onItemClick={handleItemClick}
          onOpenDetails={openDetails}
          detailsFileId={detailsOpen ? detailsFile?.id : undefined}
          isEditor={isEditor}
          onContextMenu={handleContextMenu}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      <div className="share-footer">
        {visibleFiles.length} items · {info.view_count} views · Powered by My Storage Hub
      </div>

      {selectMode && (
        <ShareBulkBar
          count={selectedCount}
          fileCount={selectedFileCount}
          totalCount={downloadableCount}
          onSelectAll={handleSelectAll}
          onClear={handleClearSelection}
          onDownload={() => void handleBulkDownload()}
          onCancel={handleToggleSelectMode}
          downloading={!!zipProgress}
        />
      )}

      {/* ZIP progress overlay */}
      {zipProgress && (
        <div className="share-zip-overlay">
          <div className="share-zip-modal">
            <div className="share-zip-title">📦 Membuat ZIP...</div>
            <div className="share-zip-bar">
              <div
                className="share-zip-bar-fill"
                style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
              />
            </div>
            <div className="share-zip-info">
              {zipProgress.current} / {zipProgress.total}
              {zipProgress.name && <span className="share-zip-name">· {zipProgress.name}</span>}
            </div>
          </div>
        </div>
      )}

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

      {contextMenu && (
        <ShareEditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
          onRename={() => handleRename(contextMenu.file)}
          onMove={() => handleMove(contextMenu.file)}
          onStar={() => handleStar(contextMenu.file)}
          onTrash={() => handleTrash([contextMenu.file])}
        />
      )}

      {trashConfirm && (
        <ShareTrashConfirmModal
          files={trashConfirm}
          onConfirm={handleTrashConfirm}
          onCancel={() => setTrashConfirm(null)}
          processing={processing}
        />
      )}

      {movePicker && (
        <ShareMovePickerModal
          folders={folderItems}
          onConfirm={handleMoveConfirm}
          onCancel={() => setMovePicker(null)}
          processing={processing}
        />
      )}

      {uploadQueue.length > 0 && (
        <div className="share-upload-queue">
          {uploadQueue.map((item, i) => (
            <ShareUploadToast
              key={i}
              filename={item.filename}
              progress={item.progress}
              status={item.status}
            />
          ))}
        </div>
      )}

      {dragging && (
        <div className="share-dropzone-overlay">
          <div className="share-dropzone-inner">
            <div className="share-dropzone-icon">⬆</div>
            <strong>Drop file untuk upload</strong>
            <span>File akan masuk ke folder saat ini</span>
          </div>
        </div>
      )}

      {undoState && (
        <ShareUndoToast
          count={undoState.files.length}
          timeLeft={undoState.timeLeft}
          onUndo={handleUndoTrash}
        />
      )}

      {toast && <ShareToast message={toast} />}
    </div>
  );
}