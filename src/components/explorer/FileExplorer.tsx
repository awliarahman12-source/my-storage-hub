import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { V3Icon } from '@/components/FileIcon';
import { getDownloadUrl, fetchFolders, logActivity } from '@/utils/driveApi';
import { ShareModal } from '@/components/modals/ShareModal';
import type { DriveFileItem } from '@/types';

type SortMode = 'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest' | 'size-largest' | 'size-smallest' | 'type';

const SORT_LABELS: Record<SortMode, string> = {
  'name-asc': 'Name A–Z',
  'name-desc': 'Name Z–A',
  'date-newest': 'Modified newest',
  'date-oldest': 'Modified oldest',
  'size-largest': 'Size largest',
  'size-smallest': 'Size smallest',
  'type': 'Type',
};

interface FileExplorerProps {
  onPreview: (file: DriveFileItem) => void;
}

export function FileExplorer({ onPreview }: FileExplorerProps) {
  const {
    driveFiles,
    loadingFiles,
    storageNodes,
    currentFolderId,
    currentFolderName,
    breadcrumbs,
    navigateToFolder,
    navigateToRoot,
    navigateToBreadcrumb,
    refreshFiles,
    refreshStorageNodes,
    renameDriveFile,
    trashDriveFile,
    starDriveFile,
    copyDriveFile,
    moveDriveFile,
    createDriveFolder,
    uploadFiles,
    routingMode,
    searchDriveFiles,
    toast,
  } = useApp();

  const hasDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('v3View') as 'grid' | 'list') || 'grid');
  const [sort, setSort] = useState<SortMode>('name-asc');
  const [showDrop, setShowDrop] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFile, setDetailsFile] = useState<DriveFileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DriveFileItem } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DriveFileItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [folderPicker, setFolderPicker] = useState<{ file: DriveFileItem; mode: 'move' | 'copy' } | null>(null);
  const [folderList, setFolderList] = useState<{ id: string; name: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<DriveFileItem | null>(null);
  const [shareFile, setShareFile] = useState<DriveFileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...(searchResults || driveFiles)].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    switch (sort) {
      case 'name-desc': return String(b.name).localeCompare(String(a.name));
      case 'date-newest': return String(b.modifiedRaw || '').localeCompare(String(a.modifiedRaw || ''));
      case 'date-oldest': return String(a.modifiedRaw || '').localeCompare(String(b.modifiedRaw || ''));
      case 'size-largest': return (b.size || 0) - (a.size || 0);
      case 'size-smallest': return (a.size || 0) - (b.size || 0);
      case 'type': return String(a.type).localeCompare(String(b.type));
      default: return String(a.name).localeCompare(String(b.name));
    }
  });

  // Track file loading errors
  useEffect(() => {
    if (!loadingFiles && driveFiles.length === 0 && hasDrives && !searchQuery) {
      // Could be empty folder or error — we track error state separately
      setFileError(false);
    }
  }, [loadingFiles, driveFiles.length, hasDrives, searchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setDetailsOpen(false);
        setFolderPicker(null);
        setTrashConfirm(null);
        setSelected(new Set());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setSelected(new Set(sorted.map((f) => f.id)));
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Delete' && selected.size > 0 && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const firstFile = driveFiles.find((x) => selected.has(x.id));
        if (firstFile) setTrashConfirm(firstFile);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  const select = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && selected.size) {
      const ids = sorted.map((f) => f.id);
      const lastIdx = ids.indexOf([...selected].pop()!);
      const currIdx = ids.indexOf(id);
      const a = Math.min(lastIdx, currIdx), b = Math.max(lastIdx, currIdx);
      const ns = new Set(selected);
      for (let i = a; i <= b; i++) ns.add(ids[i]);
      setSelected(ns);
    } else if (e.ctrlKey || e.metaKey) {
      const ns = new Set(selected);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      setSelected(ns);
    } else {
      setSelected(new Set([id]));
    }
  };

  const open = (file: DriveFileItem) => {
    if (file.isFolder) {
      navigateToFolder(file.id, file.name);
      setSelected(new Set());
      setSearchResults(null);
      setSearchQuery('');
    } else {
      onPreview(file);
    }
  };

  const handleNewFolder = async () => {
    if (!hasDrives) { toast('Add a storage node before creating folders'); return; }
    const name = prompt('New folder name:');
    if (!name?.trim()) return;
    const firstNode = storageNodes.find((n) => n.status === 'connected');
    if (!firstNode) return;
    try {
      await createDriveFolder(firstNode.id, name.trim(), currentFolderId !== 'root' ? currentFolderId : undefined);
    } catch {
      toast('Failed to create folder');
    }
  };

  const handleUpload = async (list: FileList) => {
    if (!list?.length) return;
    if (!hasDrives) { toast('Add a storage node before uploading files'); return; }
    setUploading(true);
    setShowDrop(false);
    try {
      await uploadFiles(list);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (file: DriveFileItem) => {
    const url = getDownloadUrl(file.id, file.nodeId);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    toast('Downloading ' + file.name);
  };

  const handleRename = async (file: DriveFileItem) => {
    const n = prompt('Rename:', file.name);
    if (n?.trim()) {
      try {
        await renameDriveFile(file.id, file.nodeId, n.trim());
        await logActivity('rename', file.name + ' → ' + n.trim(), file.nodeId, file.drive, 'success');
      } catch {
        toast('Rename failed');
        await logActivity('rename', file.name, file.nodeId, file.drive, 'failed');
      }
    }
  };

  const handleMoveOrCopy = async (file: DriveFileItem, mode: 'move' | 'copy') => {
    setFolderPicker({ file, mode });
    setLoadingFolders(true);
    try {
      const firstNode = storageNodes.find((n) => n.status === 'connected');
      if (!firstNode) { toast('No connected drive'); return; }
      const folders = await fetchFolders(file.nodeId);
      setFolderList(folders.filter((f) => f.id !== file.id));
    } catch {
      toast('Failed to load folders');
      setFolderPicker(null);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleFolderPick = async (destFolderId: string) => {
    if (!folderPicker) return;
    try {
      if (folderPicker.mode === 'move') {
        await moveDriveFile(folderPicker.file.id, folderPicker.file.nodeId, destFolderId);
        await logActivity('move', folderPicker.file.name, folderPicker.file.nodeId, folderPicker.file.drive, 'success');
        toast('File moved');
      } else {
        await copyDriveFile(folderPicker.file.id, folderPicker.file.nodeId);
        await logActivity('copy', folderPicker.file.name, folderPicker.file.nodeId, folderPicker.file.drive, 'success');
        toast('File copied');
      }
    } catch {
      toast(folderPicker.mode === 'move' ? 'Move failed' : 'Copy failed');
      await logActivity(folderPicker.mode, folderPicker.file.name, folderPicker.file.nodeId, folderPicker.file.drive, 'failed');
    }
    setFolderPicker(null);
  };

  const handleShare = (file: DriveFileItem) => {
    setShareFile(file);
  };

  const handleStar = async (file: DriveFileItem) => {
    try {
      await starDriveFile(file.id, file.nodeId, !file.starred);
      await logActivity(file.starred ? 'unstarred' : 'starred', file.name, file.nodeId, file.drive, 'success');
    } catch {
      toast('Star failed');
      await logActivity('starred', file.name, file.nodeId, file.drive, 'failed');
    }
  };

  const handleTrashConfirm = async () => {
    if (!trashConfirm) return;
    try {
      await trashDriveFile(trashConfirm.id, trashConfirm.nodeId);
      await logActivity('trash', trashConfirm.name, trashConfirm.nodeId, trashConfirm.drive, 'success');
      setSelected(new Set());
    } catch {
      toast('Trash failed');
      await logActivity('trash', trashConfirm.name, trashConfirm.nodeId, trashConfirm.drive, 'failed');
    }
    setTrashConfirm(null);
  };

  const handleTrashSelected = () => {
    const firstFile = driveFiles.find((x) => selected.has(x.id));
    if (firstFile) setTrashConfirm(firstFile);
  };

  const showDetails = (file: DriveFileItem) => {
    setDetailsFile(file);
    setDetailsOpen(true);
  };

  const contextAction = (action: string) => {
    if (!contextMenu) return;
    const file = contextMenu.file;
    setContextMenu(null);
    setSelected(new Set([file.id]));
    switch (action) {
      case 'open': open(file); break;
      case 'download': handleDownload(file); break;
      case 'share': handleShare(file); break;
      case 'rename': handleRename(file); break;
      case 'move': handleMoveOrCopy(file, 'move'); break;
      case 'copy': handleMoveOrCopy(file, 'copy'); break;
      case 'star': handleStar(file); break;
      case 'details': showDetails(file); break;
      case 'trash': setTrashConfirm(file); break;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setShowDrop(false);
    if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
  };

  const setViewAndSave = (v: 'grid' | 'list') => {
    setView(v);
    localStorage.setItem('v3View', v);
  };

  const handleSearchInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await searchDriveFiles(query);
      setSearchResults(results);
    } catch {
      setFileError(true);
    }
  };

  const handleRefresh = async () => {
    setFileError(false);
    try {
      await Promise.all([refreshFiles(), refreshStorageNodes()]);
      toast('Refreshed');
    } catch {
      setFileError(true);
      toast('Refresh failed');
    }
  };

  const formatDate = (raw: string | null): string => {
    if (!raw) return 'Unavailable';
    try {
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return raw;
    }
  };

  return (
    <>
      <div className="breadcrumbs">
        <button onClick={() => { navigateToRoot(); setSelected(new Set()); setSearchResults(null); setSearchQuery(''); }}>My Storage</button>
        {breadcrumbs.map((x, i) => (
          <span key={x.id}>
            <span> {'\u203A'} </span>
            <button onClick={() => { navigateToBreadcrumb(i); setSelected(new Set()); setSearchResults(null); setSearchQuery(''); }}>{x.name}</button>
          </span>
        ))}
      </div>

      <div className="explorer-toolbar">
        <div className="group">
          <button className="xbtn primary" onClick={handleNewFolder}>{'\uFF0B'} New</button>
          <button className="xbtn" onClick={() => { setShowDrop(true); fileInputRef.current?.click(); }} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
          <button className="xbtn" onClick={handleRefresh}>{'\u21BB'} Refresh</button>
        </div>
        {selected.size > 0 && (
          <div className="group">
            <span style={{ alignSelf: 'center', fontSize: 12, color: '#7b8495', marginRight: 4 }}>{selected.size} selected</span>
            <button className="xbtn" onClick={() => { selected.forEach(id => { const f = driveFiles.find(x => x.id === id); if (f) handleDownload(f); }); }}>{'\u2193'} Download</button>
            <button className="xbtn" onClick={() => { const f = driveFiles.find(x => selected.has(x.id)); if (f) handleMoveOrCopy(f, 'move'); }}>Move</button>
            <button className="xbtn" onClick={() => { const f = driveFiles.find(x => selected.has(x.id)); if (f) handleMoveOrCopy(f, 'copy'); }}>Copy</button>
            <button className="xbtn" onClick={() => { const f = driveFiles.find(x => selected.has(x.id)); if (f) handleShare(f); }}>Share</button>
            <button className="xbtn danger" onClick={handleTrashSelected}>Delete</button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <input
          ref={searchInputRef}
          className="xbtn"
          style={{ padding: '6px 12px', minWidth: 180 }}
          placeholder="Search files... (press /)"
          value={searchQuery}
          onChange={handleSearchInput}
        />
        <select className="xbtn" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setViewAndSave('grid')}>{'\u25A6'}</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setViewAndSave('list')}>{'\u2637'}</button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && handleUpload(e.target.files)}
      />

      {showDrop && (
        <div
          className={'upload-drop' + (dragOver ? ' drag' : '')}
          style={{ marginBottom: 14 }}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={handleDrop}
        >
          <strong>Drop files here</strong>
          <div className="muted">Files will be routed to the storage pool{currentFolderId !== 'root' ? ' · ' + currentFolderName : ''}.</div>
        </div>
      )}

      {loadingFiles ? (
        <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
          Loading files from Google Drive...
        </div>
      ) : fileError ? (
        <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u26A0'}</div>
          <strong>Storage connection unavailable</strong>
          <br />
          <span style={{ fontSize: 12 }}>Could not reach Google Drive. Check your connection and try refreshing.</span>
          <br />
          <button className="xbtn" style={{ marginTop: 10 }} onClick={handleRefresh}>{'\u21BB'} Retry</button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="upload-drop" style={{ display: 'block' }}>
          {searchQuery ? (
            <>No files found for "{searchQuery}"</>
          ) : !hasDrives ? (
            <>
              No Google Drive connected.<br />
              <span style={{ fontSize: 12 }}>Add a storage node from the Dashboard to start uploading files.</span>
            </>
          ) : (
            <>
              This folder is empty.<br />
              <button className="xbtn" style={{ marginTop: 10 }} onClick={() => { setShowDrop(true); fileInputRef.current?.click(); }}>Upload files</button>
            </>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="file-grid">
          {sorted.map((f) => (
            <div
              key={f.id}
              className={'file-card' + (selected.has(f.id) ? ' selected' : '')}
              onClick={(e) => select(f.id, e)}
              onDoubleClick={() => open(f)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 360), file: f }); }}
              title="Double click to open"
            >
              <input
                className="file-check"
                type="checkbox"
                checked={selected.has(f.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => select(f.id, { shiftKey: false, ctrlKey: false, metaKey: false } as any)}
              />
              <div className="file-thumb">
                {f.thumbnail && f.type === 'img' ? (
                  <img src={f.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <V3Icon file={f} />
                )}
              </div>
              <div className="file-name">{f.name}</div>
              <div className="file-meta">{f.isFolder ? 'Folder' : f.sizeLabel} · {f.drive}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list">
          <div className="file-row header">
            <div></div><div>Name</div><div>Type</div><div>Size</div><div>Modified</div><div>Storage</div><div></div>
          </div>
          {sorted.map((f) => (
            <div
              key={f.id}
              className={'file-row' + (selected.has(f.id) ? ' selected' : '')}
              onClick={(e) => select(f.id, e)}
              onDoubleClick={() => open(f)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 360), file: f }); }}
            >
              <div className="file-icon">
                {f.thumbnail && f.type === 'img' ? (
                  <img src={f.thumbnail} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                ) : (
                  <V3Icon file={f} />
                )}
              </div>
              <div><strong>{f.name}</strong>{f.starred ? ' \u2605' : ''}</div>
              <div className="muted">{f.type}</div>
              <div className="muted">{f.isFolder ? '—' : f.sizeLabel}</div>
              <div className="muted">{f.modified}</div>
              <div className="muted">{f.drive}</div>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7b8495', fontSize: 16 }}
                onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, file: f }); }}
              >{'\u22EE'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Details / Properties Panel */}
      <div className={'details-panel' + (detailsOpen ? ' open' : '')}>
        <div className="details-head">
          <strong>Properties</strong>
          <button className="xbtn" onClick={() => setDetailsOpen(false)}>{'\u00D7'}</button>
        </div>
        {detailsFile && (
          <>
            <div className="detail-big"><V3Icon file={detailsFile} /></div>
            {([
              ['Name', detailsFile.name],
              ['Type', detailsFile.mimeType],
              ['Size', detailsFile.isFolder ? '—' : detailsFile.sizeLabel],
              ['Created', formatDate(detailsFile.createdRaw)],
              ['Modified', detailsFile.modified],
              ['Storage Node', detailsFile.drive],
              ['Google Account', detailsFile.driveEmail],
              ['Google File ID', detailsFile.id],
              ['Parent Folder', detailsFile.parentGoogleId || 'root'],
              ['Starred', detailsFile.starred ? 'Yes' : 'No'],
              ['Trashed', detailsFile.trashed ? 'Yes' : 'No'],
              ['Shared', detailsFile.shared ? 'Yes' : 'No'],
              ['Web View Link', detailsFile.webViewLink || 'Unavailable'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="detail-item">
                <span>{k}</span>
                <strong style={{ wordBreak: 'break-all' }}>{v}</strong>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu open"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => contextAction('open')}>Open / Preview</button>
          <button onClick={() => contextAction('download')}>Download</button>
          <button onClick={() => contextAction('share')}>Share</button>
          <button onClick={() => contextAction('rename')}>Rename</button>
          <button onClick={() => contextAction('move')}>Move to{'\u2026'}</button>
          <button onClick={() => contextAction('copy')}>Copy</button>
          <button onClick={() => contextAction('star')}>{contextMenu.file.starred ? 'Remove from Starred' : 'Add to Starred'}</button>
          <button onClick={() => contextAction('details')}>Properties</button>
          <button className="danger" onClick={() => contextAction('trash')}>Delete</button>
        </div>
      )}

      {/* Folder Picker Modal */}
      {folderPicker && (
        <div className="modal-wrap open" onClick={() => setFolderPicker(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <strong>{folderPicker.mode === 'move' ? 'Move to folder' : 'Copy to folder'}</strong>
              <button className="close-btn" onClick={() => setFolderPicker(null)}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px', maxHeight: 360, overflowY: 'auto' }}>
              <div className="muted" style={{ marginBottom: 8 }}>
                {folderPicker.file.name} → {folderPicker.mode === 'move' ? 'move' : 'copy'} to:
              </div>
              {loadingFolders ? (
                <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20 }}>Loading folders...</div>
              ) : folderList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20 }}>No folders available. Create a folder first.</div>
              ) : (
                <>
                  <button
                    className="xbtn"
                    style={{ width: '100%', textAlign: 'left', marginBottom: 4, padding: '8px 12px' }}
                    onClick={() => handleFolderPick('root')}
                  >
                    {'\u25B9'} My Storage (root)
                  </button>
                  {folderList.map((f) => (
                    <button
                      key={f.id}
                      className="xbtn"
                      style={{ width: '100%', textAlign: 'left', marginBottom: 4, padding: '8px 12px' }}
                      onClick={() => handleFolderPick(f.id)}
                    >
                      {'\u25B8'} {f.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trash Confirmation Modal */}
      {trashConfirm && (
        <div className="modal-wrap open" onClick={() => setTrashConfirm(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Move to Trash?</strong>
              <button className="close-btn" onClick={() => setTrashConfirm(null)}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 8px' }}>
                Move <strong>{trashConfirm.name}</strong> to trash?
              </p>
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>
                You can restore it later from the Trash view.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="xbtn" onClick={() => setTrashConfirm(null)}>Cancel</button>
                <button className="xbtn danger" onClick={handleTrashConfirm}>Move to Trash</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareModal file={shareFile} open={!!shareFile} onClose={() => setShareFile(null)} />
    </>
  );
}
