import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { V3Icon } from '@/components/FileIcon';
import { ShareModal } from '@/components/modals/ShareModal';
import {
  getDownloadUrl,
  getPreviewUrl,
  fetchTextPreview,
  fetchAllFolders,
  logActivity,
} from '@/utils/driveApi';
import type { FolderEntry } from '@/utils/driveApi';
import type { DriveFileItem, DashboardFile, ExplorerFile } from '@/types';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  file: DriveFileItem | DashboardFile | ExplorerFile | null;
  fileList?: DriveFileItem[];
}

const TEXT_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'text/markdown',
];

function isTextMime(mimeType: string): boolean {
  return TEXT_MIME_TYPES.some((t) => mimeType.startsWith(t));
}

const IMAGE_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'image/bmp', 'image/x-icon', 'image/apng',
];

const VIDEO_MIMES = [
  'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm',
  'video/x-msvideo', 'video/x-matroska', 'video/x-ms-wmv',
  'video/x-flv',
];

function isImageMime(mimeType: string): boolean {
  return IMAGE_MIMES.some((m) => mimeType === m);
}

function isVideoMime(mimeType: string): boolean {
  return VIDEO_MIMES.some((m) => mimeType === m);
}

function isHeic(mimeType: string): boolean {
  return mimeType === 'image/heic' || mimeType === 'image/heif';
}

export function PreviewModal({ open, onClose, file, fileList }: PreviewModalProps) {
  const {
    toast,
    renameDriveFile,
    trashDriveFile,
    starDriveFile,
    copyDriveFile,
    moveDriveFile,
    storageNodes,
    currentView,
  } = useApp();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Image controls
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit');

  // Navigation
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Actions
  const [shareFile, setShareFile] = useState<DriveFileItem | null>(null);
  const [folderPicker, setFolderPicker] = useState<{ file: DriveFileItem; mode: 'move' | 'copy' } | null>(null);
  const [folderList, setFolderList] = useState<FolderEntry[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedDestNode, setSelectedDestNode] = useState<string>('');
  const [trashConfirm, setTrashConfirm] = useState<DriveFileItem | null>(null);
  const [showActions, setShowActions] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const isDriveFile = file && 'nodeId' in file && 'id' in file && typeof file.id === 'string';
  const driveFile = isDriveFile ? (file as DriveFileItem) : null;

  // Build navigable list from fileList (only non-folder items)
  const navList: DriveFileItem[] = fileList
    ? fileList.filter((f) => !f.isFolder)
    : driveFile && !driveFile.isFolder
      ? [driveFile]
      : [];

  // Update current index when file changes
  useEffect(() => {
    if (!open || !driveFile) return;
    const idx = navList.findIndex((f) => f.id === driveFile.id);
    setCurrentIndex(idx);
  }, [open, driveFile?.id]);

  // Reset image controls when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setFitMode('fit');
  }, [driveFile?.id]);

  // Load preview content
  useEffect(() => {
    if (!open || !driveFile) return;
    if (driveFile.isFolder) return;

    setLoading(true);
    setLoadError(null);
    setPreviewUrl(null);
    setTextContent(null);

    const mime = driveFile.mimeType;

    if (isImageMime(mime) || isHeic(mime) || driveFile.type === 'img') {
      const url = getPreviewUrl(driveFile.id, driveFile.nodeId);
      setPreviewUrl(url);
      setLoading(false);
    } else if (isVideoMime(mime) || driveFile.type === 'video') {
      const url = getPreviewUrl(driveFile.id, driveFile.nodeId);
      setPreviewUrl(url);
      setLoading(false);
    } else if (driveFile.type === 'audio' || mime.startsWith('audio/')) {
      const url = getPreviewUrl(driveFile.id, driveFile.nodeId);
      setPreviewUrl(url);
      setLoading(false);
    } else if (driveFile.type === 'pdf' || mime === 'application/pdf') {
      const url = getPreviewUrl(driveFile.id, driveFile.nodeId);
      setPreviewUrl(url);
      setLoading(false);
    } else if (isTextMime(mime)) {
      fetchTextPreview(driveFile.id, driveFile.nodeId)
        .then((content) => {
          setTextContent(content);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          setLoadError('Failed to load text content');
        });
    } else {
      setLoading(false);
    }
  }, [open, driveFile?.id, driveFile?.nodeId, driveFile?.mimeType]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) { setFullscreen(false); return; }
        onClose();
      }
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        navigatePrev();
      }
      if (e.key === 'ArrowRight' && currentIndex < navList.length - 1) {
        e.preventDefault();
        navigateNext();
      }
      if (e.key === '+' || e.key === '=') {
        if (driveFile?.type === 'img') { e.preventDefault(); setZoom((z) => Math.min(z + 0.25, 5)); setFitMode('actual'); }
      }
      if (e.key === '-') {
        if (driveFile?.type === 'img') { e.preventDefault(); setZoom((z) => Math.max(z - 0.25, 0.1)); }
      }
      if (e.key === '0') {
        if (driveFile?.type === 'img') { e.preventDefault(); setZoom(1); setRotation(0); setFitMode('fit'); }
      }
      if (e.key === 'r' && driveFile?.type === 'img') {
        e.preventDefault();
        setRotation((r) => (r + 90) % 360);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  const navigatePrev = useCallback(() => {
    if (currentIndex > 0 && navList[currentIndex - 1]) {
      const prevFile = navList[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      // Simulate file change by calling onClose then openPreview
      // Actually we need to update the file prop — use a different approach
      // We'll use a local state to override
      setLocalFile(prevFile);
    }
  }, [currentIndex, navList]);

  const navigateNext = useCallback(() => {
    if (currentIndex < navList.length - 1 && navList[currentIndex + 1]) {
      const nextFile = navList[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      setLocalFile(nextFile);
    }
  }, [currentIndex, navList]);

  // Local file override for navigation
  const [localFile, setLocalFile] = useState<DriveFileItem | null>(null);
  const effectiveFile = localFile || file;
  const effectiveDriveFile = effectiveFile && 'nodeId' in effectiveFile && 'id' in effectiveFile && typeof (effectiveFile as DriveFileItem).id === 'string'
    ? (effectiveFile as DriveFileItem)
    : null;

  // Reset local file when modal closes
  useEffect(() => {
    if (!open) {
      setLocalFile(null);
      setFullscreen(false);
      setShowActions(false);
    }
  }, [open]);

  // Re-derive preview URL when effective file changes via navigation
  useEffect(() => {
    if (!open || !effectiveDriveFile) return;
    if (effectiveDriveFile.isFolder) return;
    if (effectiveDriveFile.id === driveFile?.id && localFile === null) return; // already loaded

    setLoading(true);
    setLoadError(null);
    setPreviewUrl(null);
    setTextContent(null);
    setZoom(1);
    setRotation(0);
    setFitMode('fit');

    const mime = effectiveDriveFile.mimeType;
    if (isImageMime(mime) || isHeic(mime) || effectiveDriveFile.type === 'img') {
      setPreviewUrl(getPreviewUrl(effectiveDriveFile.id, effectiveDriveFile.nodeId));
      setLoading(false);
    } else if (isVideoMime(mime) || effectiveDriveFile.type === 'video') {
      setPreviewUrl(getPreviewUrl(effectiveDriveFile.id, effectiveDriveFile.nodeId));
      setLoading(false);
    } else if (effectiveDriveFile.type === 'audio' || mime.startsWith('audio/')) {
      setPreviewUrl(getPreviewUrl(effectiveDriveFile.id, effectiveDriveFile.nodeId));
      setLoading(false);
    } else if (effectiveDriveFile.type === 'pdf' || mime === 'application/pdf') {
      setPreviewUrl(getPreviewUrl(effectiveDriveFile.id, effectiveDriveFile.nodeId));
      setLoading(false);
    } else if (isTextMime(mime)) {
      fetchTextPreview(effectiveDriveFile.id, effectiveDriveFile.nodeId)
        .then((content) => { setTextContent(content); setLoading(false); })
        .catch(() => { setLoading(false); setLoadError('Failed to load text content'); });
    } else {
      setLoading(false);
    }
  }, [localFile]);

  if (!open || !effectiveFile) return null;

  const ef = effectiveFile;
  const edf = effectiveDriveFile;
  const isExplorer = 'size' in ef && typeof ef.size === 'number';
  const sizeStr = isExplorer ? String((ef as ExplorerFile).size) : (ef as DashboardFile).size;
  const type = ef.type;
  const typeLabel =
    type === 'img' ? 'Image' :
    type === 'pdf' ? 'PDF' :
    type === 'video' ? 'Video' :
    type === 'audio' ? 'Audio' :
    type === 'folder' ? 'Folder' :
    type === 'zip' ? 'Archive' : 'File';

  const handleDownload = () => {
    if (edf) {
      const url = getDownloadUrl(edf.id, edf.nodeId);
      const a = document.createElement('a');
      a.href = url;
      a.download = ef.name;
      a.click();
      toast('Downloading ' + ef.name);
    }
  };

  const handleRename = async () => {
    if (!edf) return;
    const lastDot = edf.name.lastIndexOf('.');
    const hasExt = lastDot > 0 && lastDot < edf.name.length - 1;
    const baseName = hasExt ? edf.name.substring(0, lastDot) : edf.name;
    const ext = hasExt ? edf.name.substring(lastDot) : '';
    const n = prompt('Rename file:', baseName);
    if (!n?.trim()) return;
    let newName = n.trim();
    if (hasExt) {
      const keepExt = confirm('Keep extension "' + ext + '"?\n\nOK = "' + n.trim() + ext + '"\nCancel = "' + n.trim() + '"');
      newName = keepExt ? n.trim() + ext : n.trim();
    }
    try {
      await renameDriveFile(edf.id, edf.nodeId, newName);
      await logActivity('rename', edf.name + ' -> ' + newName, edf.nodeId, edf.drive, 'success');
      toast('Renamed');
    } catch {
      toast('Rename failed');
    }
  };

  const handleStar = async () => {
    if (!edf) return;
    try {
      await starDriveFile(edf.id, edf.nodeId, !edf.starred);
      await logActivity(edf.starred ? 'unstarred' : 'starred', edf.name, edf.nodeId, edf.drive, 'success');
      toast(edf.starred ? 'Removed from Starred' : 'Added to Starred');
    } catch {
      toast('Star failed');
    }
  };

  const handleMoveOrCopy = async (mode: 'move' | 'copy') => {
    if (!edf) return;
    setFolderPicker({ file: edf, mode });
    setLoadingFolders(true);
    setSelectedDestNode(edf.nodeId);
    try {
      const folders = await fetchAllFolders();
      setFolderList(folders.filter((f) => f.id !== edf.id));
    } catch {
      toast('Failed to load folders');
      setFolderPicker(null);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleFolderPick = async (destFolderId: string, destNodeId?: string) => {
    if (!folderPicker) return;
    const targetNodeId = destNodeId || selectedDestNode || folderPicker.file.nodeId;
    try {
      if (folderPicker.mode === 'move') {
        await moveDriveFile(folderPicker.file.id, folderPicker.file.nodeId, destFolderId, targetNodeId !== folderPicker.file.nodeId ? targetNodeId : undefined);
        await logActivity('move', folderPicker.file.name, folderPicker.file.nodeId, folderPicker.file.drive, 'success');
        toast('File moved');
      } else {
        await copyDriveFile(folderPicker.file.id, folderPicker.file.nodeId, targetNodeId !== folderPicker.file.nodeId ? targetNodeId : undefined, destFolderId);
        await logActivity('copy', folderPicker.file.name, folderPicker.file.nodeId, folderPicker.file.drive, 'success');
        toast('File copied');
      }
    } catch {
      toast(folderPicker.mode === 'move' ? 'Move failed' : 'Copy failed');
    }
    setFolderPicker(null);
  };

  const handleTrash = async () => {
    if (!trashConfirm) return;
    try {
      await trashDriveFile(trashConfirm.id, trashConfirm.nodeId);
      await logActivity('trash', trashConfirm.name, trashConfirm.nodeId, trashConfirm.drive, 'success');
      toast('Moved to trash');
      onClose();
    } catch {
      toast('Trash failed');
    }
    setTrashConfirm(null);
  };

  const toggleFullscreen = () => {
    setFullscreen((f) => !f);
  };

  const zoomIn = () => { setZoom((z) => Math.min(z + 0.25, 5)); setFitMode('actual'); };
  const zoomOut = () => { setZoom((z) => Math.max(z - 0.25, 0.1)); };
  const rotate = () => { setRotation((r) => (r + 90) % 360); };
  const resetView = () => { setZoom(1); setRotation(0); setFitMode('fit'); };
  const toggleFit = () => {
    if (fitMode === 'fit') { setFitMode('actual'); setZoom(1); }
    else { setFitMode('fit'); setZoom(1); }
  };

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < navList.length - 1 && navList.length > 1;
  const hasNav = navList.length > 1;

  const imgStyle: React.CSSProperties = fitMode === 'fit'
    ? {
        maxWidth: '100%',
        maxHeight: fullscreen ? '100vh' : 'calc(90vh - 140px)',
        objectFit: 'contain',
        transform: `scale(${zoom}) rotate(${rotation}deg)`,
        transition: 'transform 0.2s ease',
        borderRadius: 8,
      }
    : {
        transform: `scale(${zoom}) rotate(${rotation}deg)`,
        transition: 'transform 0.2s ease',
        borderRadius: 8,
      };

  return (
    <>
      {/* Main modal */}
      <div className="modal-wrap open" onClick={onClose} style={fullscreen ? { background: '#000' } : undefined}>
        <div
          className="preview-modal"
          onClick={(e) => e.stopPropagation()}
          style={fullscreen ? { width: '100vw', height: '100vh', borderRadius: 0, maxWidth: '100vw', maxHeight: '100vh' } : undefined}
        >
          {/* Top bar */}
          <div className="preview-top">
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ef.name}</b>
              <small>
                {(ef as any).drive || 'Storage'} {'\u00B7'} {edf ? edf.sizeLabel : sizeStr}
                {edf && edf.starred ? ' \u2605' : ''}
                {hasNav ? ' (' + (currentIndex + 1) + '/' + navList.length + ')' : ''}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {hasNav && (
                <>
                  <button
                    className="preview-nav-btn"
                    onClick={navigatePrev}
                    disabled={!canPrev}
                    title="Previous (Left arrow)"
                    style={!canPrev ? { opacity: 0.3, cursor: 'default' } : undefined}
                  >{'\u2039'}</button>
                  <button
                    className="preview-nav-btn"
                    onClick={navigateNext}
                    disabled={!canNext}
                    title="Next (Right arrow)"
                    style={!canNext ? { opacity: 0.3, cursor: 'default' } : undefined}
                  >{'\u203A'}</button>
                </>
              )}
              <button className="close-btn" onClick={onClose}>{'\u00D7'}</button>
            </div>
          </div>

          {/* Stage */}
          <div className="preview-stage" ref={stageRef} style={fullscreen ? { padding: 0 } : undefined}>
            {loading && (
              <div style={{ color: '#9da7b8', textAlign: 'center', padding: 40 }}>
                <div className="preview-spinner" />
                <p style={{ marginTop: 12 }}>Loading preview...</p>
              </div>
            )}

            {loadError && !loading && (
              <div style={{ color: '#9da7b8', textAlign: 'center' }}>
                <div style={{ fontSize: 40 }}>{'\u26A0'}</div>
                <p>{loadError}</p>
              </div>
            )}

            {/* Image preview */}
            {edf && (edf.type === 'img' || isImageMime(edf.mimeType) || isHeic(edf.mimeType)) && previewUrl && !loading && (
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <img
                  ref={imgRef}
                  src={previewUrl}
                  alt={ef.name}
                  style={imgStyle}
                  onError={() => {
                    if (isHeic(edf.mimeType)) {
                      setLoadError('HEIC/HEIF preview not supported in this browser. Download to view.');
                    } else {
                      setLoadError('Failed to load image. The file may be corrupted or inaccessible.');
                    }
                    setPreviewUrl(null);
                  }}
                />
              </div>
            )}

            {/* Video preview */}
            {edf && (edf.type === 'video' || isVideoMime(edf.mimeType)) && previewUrl && !loading && (
              <video
                src={previewUrl}
                controls
                style={{
                  maxWidth: '100%',
                  maxHeight: fullscreen ? '100vh' : 'calc(90vh - 140px)',
                  borderRadius: 8,
                }}
                onError={() => {
                  setLoadError('Failed to load video. The format may not be supported by your browser.');
                  setPreviewUrl(null);
                }}
              />
            )}

            {/* Audio preview */}
            {edf && (edf.type === 'audio' || edf.mimeType.startsWith('audio/')) && previewUrl && !loading && (
              <div style={{ textAlign: 'center', padding: 40, width: '100%' }}>
                <div style={{ fontSize: 60, marginBottom: 16 }}>{'\u266B'}</div>
                <audio
                  src={previewUrl}
                  controls
                  style={{ width: '100%', maxWidth: 400 }}
                  onError={() => {
                    setLoadError('Failed to load audio.');
                    setPreviewUrl(null);
                  }}
                />
              </div>
            )}

            {/* PDF preview */}
            {edf && (edf.type === 'pdf' || edf.mimeType === 'application/pdf') && previewUrl && !loading && (
              <iframe
                src={previewUrl}
                style={{
                  width: '100%',
                  height: fullscreen ? 'calc(100vh - 100px)' : 'calc(90vh - 140px)',
                  border: 'none',
                  borderRadius: 8,
                }}
                title={ef.name}
                onError={() => {
                  setLoadError('Failed to load PDF.');
                  setPreviewUrl(null);
                }}
              />
            )}

            {/* Text preview */}
            {edf && textContent !== null && !loading && (
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: fullscreen ? 'calc(100vh - 140px)' : 400,
                maxWidth: '100%',
                overflow: 'auto',
                padding: 16,
                background: '#f5f7fb',
                color: '#111827',
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
              }}>
                {textContent}
              </pre>
            )}

            {/* Unsupported / fallback */}
            {edf && !loading && !loadError && !previewUrl && textContent === null && !edf.isFolder && (
              <div style={{ color: '#9da7b8', textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 50 }}>{'\u{1F4C4}'}</div>
                <p style={{ fontSize: 15, margin: '12px 0 6px' }}>Preview not available for this file type</p>
                <div style={{ fontSize: 12, marginTop: 8, color: '#7b8495' }}>
                  Type: {edf.mimeType} {'\u00B7'} Size: {edf.sizeLabel} {'\u00B7'} Storage: {edf.drive}
                </div>
                <button className="xbtn primary" style={{ marginTop: 14, fontSize: 12, padding: '8px 16px' }} onClick={handleDownload}>
                  {'\u2193'} Download to view
                </button>
              </div>
            )}

            {/* Folder */}
            {edf && edf.isFolder && (
              <div style={{ color: '#9da7b8', textAlign: 'center' }}>
                <div style={{ fontSize: 50 }}>{'\u{1F4C1}'}</div>
                <p style={{ fontSize: 15, marginTop: 12 }}>This is a folder. Use the file list to browse its contents.</p>
              </div>
            )}

            {/* Non-drive file fallback */}
            {!edf && (
              <div style={{ color: '#9da7b8', textAlign: 'center' }}>
                <div style={{ fontSize: 40 }}>{'\u{1F4C4}'}</div>
                <p>Preview not available for this file.</p>
              </div>
            )}
          </div>

          {/* Image controls bar */}
          {edf && (edf.type === 'img' || isImageMime(edf.mimeType)) && previewUrl && !loading && !loadError && (
            <div className="preview-controls">
              <button className="preview-ctrl-btn" onClick={zoomOut} title="Zoom out (-)">{'\u2212'}</button>
              <span className="preview-zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="preview-ctrl-btn" onClick={zoomIn} title="Zoom in (+)">{'\uFF0B'}</button>
              <button className="preview-ctrl-btn" onClick={rotate} title="Rotate (R)">{'\u21BB'}</button>
              <button className="preview-ctrl-btn" onClick={toggleFit} title={fitMode === 'fit' ? 'Actual size' : 'Fit to screen'}>
                {fitMode === 'fit' ? '1:1' : 'Fit'}
              </button>
              <button className="preview-ctrl-btn" onClick={resetView} title="Reset (0)">{'\u21BA'}</button>
              <button className="preview-ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">{fullscreen ? '\u29C9' : '\u26F6'}</button>
            </div>
          )}

          {/* Video/PDF fullscreen button */}
          {edf && (edf.type === 'video' || isVideoMime(edf.mimeType) || edf.type === 'pdf' || edf.mimeType === 'application/pdf') && previewUrl && !loading && !loadError && !fullscreen && (
            <div className="preview-controls">
              <button className="preview-ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">{'\u26F6'}</button>
            </div>
          )}

          {/* Footer with actions */}
          <div className="preview-foot">
            <span>{typeLabel}{edf ? ' \u00B7 ' + edf.mimeType : ''}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="preview-action-btn" onClick={handleDownload} disabled={!edf} title="Download">
                {'\u2193'} <span className="preview-action-label">Download</span>
              </button>
              <button className="preview-action-btn" onClick={() => edf && setShareFile(edf)} disabled={!edf} title="Share">
                {'\u2197'} <span className="preview-action-label">Share</span>
              </button>
              <button className="preview-action-btn" onClick={() => setShowActions((s) => !s)} disabled={!edf} title="More actions">
                {'\u22EE'} <span className="preview-action-label">More</span>
              </button>
            </div>
          </div>

          {/* Expanded actions */}
          {showActions && edf && (
            <div className="preview-actions-popup" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleRename}>{'\u270E'} Rename</button>
              <button onClick={() => handleMoveOrCopy('move')}>{'\u2192'} Move</button>
              <button onClick={() => handleMoveOrCopy('copy')}>{'\u29C9'} Copy</button>
              <button onClick={handleStar}>{edf.starred ? '\u2605 Remove Star' : '\u2606 Add Star'}</button>
              <button className="danger" onClick={() => setTrashConfirm(edf)}>{'\u232B'} Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <ShareModal file={shareFile} open={!!shareFile} onClose={() => setShareFile(null)} />

      {/* Folder Picker Modal */}
      {folderPicker && (
        <div className="modal-wrap open" onClick={() => setFolderPicker(null)} style={{ zIndex: 310 }}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <strong>{folderPicker.mode === 'move' ? 'Move to folder' : 'Copy to folder'}</strong>
              <button className="close-btn" onClick={() => setFolderPicker(null)}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
                {folderPicker.file.name} {'\u2192'} {folderPicker.mode === 'move' ? 'move' : 'copy'} to:
              </div>
              <select
                className="setting-input"
                style={{ width: '100%', padding: '8px 12px', marginBottom: 12 }}
                value={selectedDestNode}
                onChange={(e) => setSelectedDestNode(e.target.value)}
              >
                {storageNodes.filter((n) => n.status === 'connected').map((n) => (
                  <option key={n.id} value={n.id}>{n.displayName || n.email || n.id}</option>
                ))}
              </select>
              <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                {loadingFolders ? (
                  <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20 }}>Loading folders...</div>
                ) : (
                  <>
                    <button
                      className="xbtn"
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 0, border: 0, borderBottom: '1px solid var(--border)' }}
                      onClick={() => handleFolderPick('root', selectedDestNode)}
                    >
                      {'\u25B9'} My Storage (root)
                    </button>
                    {folderList
                      .filter((f) => f.nodeId === selectedDestNode)
                      .map((f) => (
                        <button
                          key={f.id}
                          className="xbtn"
                          style={{ width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 0, border: 0, borderBottom: '1px solid var(--border)' }}
                          onClick={() => handleFolderPick(f.id, f.nodeId)}
                        >
                          {'\u25B8'} {f.name}
                        </button>
                      ))}
                    {folderList.filter((f) => f.nodeId === selectedDestNode).length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20, fontSize: 12 }}>No folders in this drive. Using root.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trash Confirmation */}
      {trashConfirm && (
        <div className="modal-wrap open" onClick={() => setTrashConfirm(null)} style={{ zIndex: 310 }}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Move to Trash?</strong>
              <button className="close-btn" onClick={() => setTrashConfirm(null)}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 8px' }}>Move <strong>{trashConfirm.name}</strong> to trash?</p>
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>You can restore it later from the Trash view.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="xbtn" onClick={() => setTrashConfirm(null)}>Cancel</button>
                <button className="xbtn danger" onClick={handleTrash}>Move to Trash</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
