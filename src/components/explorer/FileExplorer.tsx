import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { V3Icon } from '@/components/FileIcon';
import { getDownloadUrl, fetchFolders, fetchAllFolders, logActivity } from '@/utils/driveApi';
import type { FolderEntry } from '@/utils/driveApi';
import { ShareModal } from '@/components/modals/ShareModal';
import { CreateShareModal } from '@/components/share/CreateShareModal';
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
  onPreview: (file: DriveFileItem, list?: DriveFileItem[]) => void;
}

export function FileExplorer({ onPreview }: FileExplorerProps) {
  const {
    driveFiles,
    loadingFiles,
    loadingMoreFiles,
    hasMoreFiles,
    filesError,
    storageNodes,
    currentFolderId,
    currentFolderName,
    breadcrumbs,
    navigateToFolder,
    navigateToRoot,
    navigateToBreadcrumb,
    refreshFiles,
    loadMoreFiles,
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
  const [searchError, setSearchError] = useState(false);
  const [folderPicker, setFolderPicker] = useState<{ files: DriveFileItem[]; mode: 'move' | 'copy' } | null>(null);
  const [folderList, setFolderList] = useState<FolderEntry[]>([]);
  const [selectedDestNode, setSelectedDestNode] = useState<string>('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<DriveFileItem[]>([]);
  const [shareFiles, setShareFiles] = useState<DriveFileItem[]>([]);
  const [createShareItems, setCreateShareItems] = useState<DriveFileItem[]>([]);
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

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (searchResults !== null) return;
    if (!hasMoreFiles || loadingMoreFiles) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMoreFiles();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreFiles, loadingMoreFiles, loadMoreFiles, searchResults]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setDetailsOpen(false);
        setFolderPicker(null);
        setTrashConfirm([]);
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
        const targets = sorted.filter((x) => selected.has(x.id));
        if (targets.length > 0) setTrashConfirm(targets);
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
      onPreview(file, sorted);
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
    const lastDot = file.name.lastIndexOf('.');
    const hasExt = lastDot > 0 && lastDot < file.name.length - 1;
    const baseName = hasExt ? file.name.substring(0, lastDot) : file.name;
    const ext = hasExt ? file.name.substring(lastDot) : '';
    const n = prompt('Rename file:', baseName);
    if (!n?.trim()) return;
    let newName = n.trim();
    if (hasExt) {
      const changeExt = confirm('Keep extension "' + ext + '"?\n\nOK = Keep "' + n.trim() + ext + '"\nCancel = Use "' + n.trim() + '" (changes extension)\n\nWarning: Changing the extension does NOT convert the file format.');
      if (changeExt) {
        newName = n.trim() + ext;
      } else {
        newName = n.trim();
      }
    }
    try {
      await renameDriveFile(file.id, file.nodeId, newName);
      await logActivity('rename', file.name + ' → ' + newName, file.nodeId, file.drive, 'success');
    } catch {
      toast('Rename failed');
      await logActivity('rename', file.name, file.nodeId, file.drive, 'failed');
    }
  };

  const handleMoveOrCopy = async (targets: DriveFileItem[], mode: 'move' | 'copy') => {
    if (targets.length === 0) return;
    setFolderPicker({ files: targets, mode });
    setLoadingFolders(true);
    setSelectedDestNode(targets[0].nodeId);
    try {
      const folders = await fetchAllFolders();
      const targetIds = new Set(targets.map((f) => f.id));
      setFolderList(folders.filter((f) => !targetIds.has(f.id)));
    } catch {
      toast('Failed to load folders');
      setFolderPicker(null);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleFolderPick = async (destFolderId: string, destNodeId?: string) => {
    if (!folderPicker) return;
    const { files: targets, mode } = folderPicker;
    const targetNodeId = destNodeId || selectedDestNode || targets[0].nodeId;
    setFolderPicker(null);

    const crossDrive = targetNodeId !== targets[0].nodeId;
    if (crossDrive) {
      const MAX_CROSS_DRIVE = 100 * 1024 * 1024;
      const tooLarge = targets.filter((f) => f.size > MAX_CROSS_DRIVE);
      if (tooLarge.length > 0) {
        const names = tooLarge.map((f) => `- ${f.name} (${f.sizeLabel})`).join('\n');
        const msg = `${tooLarge.length} file lebih dari 100 MB dan mungkin gagal dipindah lintas drive:\n\n${names}\n\nLanjutkan? (File besar sebaiknya download lalu upload manual)`;
        if (!confirm(msg)) return;
      }
    }

    let ok = 0;
    let fail = 0;
    const BATCH_DELAY_MS = 500;
    for (let i = 0; i < targets.length; i++) {
      const file = targets[i];
      try {
        const crossNodeId = targetNodeId !== file.nodeId ? targetNodeId : undefined;
        if (mode === 'move') {
          await moveDriveFile(file.id, file.nodeId, destFolderId, crossNodeId);
          await logActivity('move', file.name, file.nodeId, file.drive, 'success');
        } else {
          await copyDriveFile(file.id, file.nodeId, crossNodeId, destFolderId);
          await logActivity('copy', file.name, file.nodeId, file.drive, 'success');
        }
        ok++;
      } catch (err) {
        await logActivity(mode, file.name, file.nodeId, file.drive, 'failed');
        fail++;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('429') || msg.includes('Rate limit')) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      if (i < targets.length - 1 && fail === 0) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const verb = mode === 'move' ? 'moved' : 'copied';
    if (fail === 0) {
      toast(`${ok} file${ok > 1 ? 's' : ''} ${verb}`);
    } else if (ok === 0) {
      toast(`Failed to ${mode} ${fail} file${fail > 1 ? 's' : ''}`);
    } else {
      toast(`${ok} ${verb}, ${fail} failed`);
    }
    setSelected(new Set());
  };

  const handleShare = (file: DriveFileItem) => {
    setShareFiles([file]);
  };

  const handleCreateShareLink = (targets: DriveFileItem[]) => {
    if (targets.length === 0) return;
    setCreateShareItems(targets);
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

  const handleTrashMultiple = async (targets: DriveFileItem[]) => {
    if (targets.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const file of targets) {
      try {
        await trashDriveFile(file.id, file.nodeId);
        await logActivity('trash', file.name, file.nodeId, file.drive, 'success');
        ok++;
      } catch {
        await logActivity('trash', file.name, file.nodeId, file.drive, 'failed');
        fail++;
      }
    }
    if (fail === 0) {
      toast(`${ok} file${ok > 1 ? 's' : ''} moved to trash`);
    } else if (ok === 0) {
      toast(`Failed to trash ${fail} file${fail > 1 ? 's' : ''}`);
    } else {
      toast(`${ok} trashed, ${fail} failed`);
    }
    setSelected(new Set());
  };

  const handleTrashSelected = () => {
    const targets = driveFiles.filter((x) => selected.has(x.id));
    if (targets.length > 0) setTrashConfirm(targets);
  };

  const showDetails = (file: DriveFileItem) => {
    setDetailsFile(file);
    setDetailsOpen(true);
  };

  // ============ CONTEXT MENU ============

  const openContextMenu = (file: DriveFileItem, x: number, y: number) => {
    if (!selected.has(file.id)) {
      setSelected(new Set([file.id]));
    }
    setContextMenu({ x, y, file });
  };

  const contextAction = (action: string) => {
    if (!contextMenu) return;
    const file = contextMenu.file;
    setContextMenu(null);

    const targets = sorted.filter((x) => selected.has(x.id));
    const bulk = targets.length > 0 ? targets : [file];
    const isBulk = bulk.length > 1;

    switch (action) {
      case 'open': open(file); break;
      case 'rename': handleRename(file); break;
      case 'details': showDetails(file); break;

      case 'download': {
        bulk.forEach((f) => handleDownload(f));
        break;
      }
      case 'share': {
        setShareFiles(bulk);
        break;
      }
      case 'share-link': {
        if (isBulk) {
          toast(`Membuat 1 share link untuk ${bulk.length} file...`);
        }
        handleCreateShareLink(bulk);
        break;
      }
      case 'move': {
        void handleMoveOrCopy(bulk, 'move');
        break;
      }
      case 'copy': {
        void handleMoveOrCopy(bulk, 'copy');
        break;
      }
      case 'star': {
        for (const f of bulk) {
          void handleStar(f);
        }
        break;
      }
      case 'trash': {
        setTrashConfirm(bulk);
        break;
      }
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
      setSearchError(false);
    } catch {
      setSearchError(true);
      setSearchResults([]);
    }
  };

  const handleRefresh = async () => {
    try {
      await Promise.all([refreshFiles(), refreshStorageNodes()]);
      toast('Refreshed');
    } catch {
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
          {sorted.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: '#7b8495', padding: '0 8px' }}>
              <input
                type="checkbox"
                checked={selected.size === sorted.length}
                onChange={() => {
                  if (selected.size === sorted.length) setSelected(new Set());
                  else setSelected(new Set(sorted.map((f) => f.id)));
                }}
                style={{ cursor: 'pointer' }}
              />
              {selected.size > 0 && selected.size < sorted.length ? 'Partial' : selected.size === sorted.length ? 'All' : 'None'}
            </label>
          )}
          <button className="xbtn primary" onClick={handleNewFolder}>{'\uFF0B'} New</button>
          <button className="xbtn" onClick={() => { setShowDrop(true); fileInputRef.current?.click(); }} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
          <button className="xbtn" onClick={handleRefresh}>{'\u21BB'} Refresh</button>
        </div>
        {selected.size > 0 && (
          <div className="group">
            <span style={{ alignSelf: 'center', fontSize: 12, color: '#7b8495', marginRight: 4 }}>{selected.size} selected</span>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              targets.forEach((f) => handleDownload(f));
            }}>{'\u2193'} Download</button>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              void handleMoveOrCopy(targets, 'move');
            }}>Move</button>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              void handleMoveOrCopy(targets, 'copy');
            }}>Copy</button>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              handleCreateShareLink(targets);
            }}>🔗 Share Link</button>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              setShareFiles(targets);
            }}>👥 GDrive</button>
            <button className="xbtn" onClick={() => {
              const targets = driveFiles.filter((x) => selected.has(x.id));
              targets.forEach((f) => void handleStar(f));
            }}>Star</button>
            <button className="xbtn danger" onClick={handleTrashSelected}>Delete</button>
            <button className="xbtn" onClick={() => setSelected(new Set())}>Clear</button>
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
      ) : filesError ? (
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
            <>
              {searchError ? 'Search failed. Please try again.' : 'No files found for "' + searchQuery + '"'}
            </>
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
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
              }}
              title="Double click to open"
            >
              <input
                className="file-check"
                type="checkbox"
                checked={selected.has(f.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => { const ns = new Set(selected); ns.has(f.id) ? ns.delete(f.id) : ns.add(f.id); setSelected(ns); }}
              />
              <div className="file-thumb">
                {f.thumbnail && f.type === 'img' ? (
                  <img src={f.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <V3Icon file={f} />
                )}
              </div>
              <div className="file-name">{f.name}{f.starred ? <span style={{ color: '#f59e0b' }}> ★</span> : null}</div>
              <div className="file-meta">{f.isFolder ? 'Folder' : f.sizeLabel} · {f.drive}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list">
          <div className="file-row header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={selected.size === sorted.length && sorted.length > 0}
                onChange={() => {
                  if (selected.size === sorted.length) setSelected(new Set());
                  else setSelected(new Set(sorted.map((f) => f.id)));
                }}
                style={{ cursor: 'pointer' }}
              />
            </div>
            <div>Name</div><div>Type</div><div>Size</div><div>Modified</div><div>Storage</div><div></div>
          </div>
          {sorted.map((f) => (
            <div
              key={f.id}
              className={'file-row' + (selected.has(f.id) ? ' selected' : '')}
              onClick={(e) => select(f.id, e)}
              onDoubleClick={() => open(f)}
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
              }}
            >
              <div className="file-icon" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => { const ns = new Set(selected); ns.has(f.id) ? ns.delete(f.id) : ns.add(f.id); setSelected(ns); }}
                  style={{ cursor: 'pointer' }}
                />
                {f.thumbnail && f.type === 'img' ? (
                  <img src={f.thumbnail} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                ) : (
                  <V3Icon file={f} />
                )}
              </div>
              <div><strong>{f.name}</strong>{f.starred ? ' ★' : ''}</div>
              <div className="muted">{f.type}</div>
              <div className="muted">{f.isFolder ? '—' : f.sizeLabel}</div>
              <div className="muted">{f.modified}</div>
              <div className="muted">{f.drive}</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => void handleStar(f)} title={f.starred ? 'Unstar' : 'Star'}>{f.starred ? '\u2605' : '\u2606'}</button>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7b8495', fontSize: 16 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
                  }}
                >{'\u22EE'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {searchResults === null && sorted.length > 0 && (
        <div ref={sentinelRef} style={{ padding: '12px', textAlign: 'center' }}>
          {loadingMoreFiles && <span className="muted" style={{ fontSize: 13 }}>Loading more files...</span>}
          {!loadingMoreFiles && !hasMoreFiles && !loadingFiles && (
            <span className="muted" style={{ fontSize: 12 }}>End of list</span>
          )}
        </div>
      )}

      <div className={'details-panel' + (detailsOpen ? ' open' : '')}>
        <div className="details-head">
          <strong>Properties</strong>
          <button className="xbtn" onClick={() => setDetailsOpen(false)}>{'\u00D7'}</button>
        </div>
        {detailsFile && (
          <>
            <div className="detail-big"><V3Icon file={detailsFile} /></div>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 14, wordBreak: 'break-word' }}>{detailsFile.name}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, justifyContent: 'center' }}>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { open(detailsFile); }}>Open</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleDownload(detailsFile)}>Download</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleCreateShareLink([detailsFile])}>🔗 Share Link</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleShare(detailsFile)}>Share</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setDetailsOpen(false); handleRename(detailsFile); }}>Rename</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setDetailsOpen(false); void handleMoveOrCopy([detailsFile], 'move'); }}>Move</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setDetailsOpen(false); void handleMoveOrCopy([detailsFile], 'copy'); }}>Copy</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void handleStar(detailsFile)}>{detailsFile.starred ? 'Unstar' : 'Star'}</button>
              <button className="xbtn danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setDetailsOpen(false); setTrashConfirm([detailsFile]); }}>Delete</button>
            </div>
            <div style={{ fontSize: 11, color: '#9da7b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>File</div>
            {([
              ['Name', detailsFile.name],
              ['Type', detailsFile.isFolder ? 'Folder' : detailsFile.type.toUpperCase()],
              ['Extension', detailsFile.name.includes('.') ? '.' + detailsFile.name.split('.').pop() : 'None'],
              ['MIME', detailsFile.mimeType],
              ['Size', detailsFile.isFolder ? '—' : detailsFile.sizeLabel],
              ['Created', formatDate(detailsFile.createdRaw)],
              ['Modified', detailsFile.modified],
              ['Starred', detailsFile.starred ? 'Yes' : 'No'],
              ['Shared', detailsFile.shared ? 'Yes' : 'No'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="detail-item">
                <span>{k}</span>
                <strong style={{ wordBreak: 'break-all' }}>{v}</strong>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9da7b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: '16px 0 6px' }}>Storage</div>
            {([
              ['Provider', 'Google Drive'],
              ['Drive / Account', detailsFile.drive],
              ['Account Email', detailsFile.driveEmail],
              ['Storage Node ID', detailsFile.nodeId],
              ['File ID', detailsFile.id],
              ['Parent Folder', detailsFile.parentGoogleId || 'root'],
              ['Web View Link', detailsFile.webViewLink || 'Unavailable'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="detail-item">
                <span>{k}</span>
                <strong style={{ wordBreak: 'break-all', fontSize: 11 }}>{v}</strong>
              </div>
            ))}
          </>
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu open"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {selected.size > 1 && (
            <div style={{ padding: '6px 12px', fontSize: 10, color: '#7b8495', borderBottom: '1px solid var(--line)' }}>
              {selected.size} file dipilih
            </div>
          )}
          <button onClick={() => contextAction('open')}>Open</button>
          <button onClick={() => contextAction('download')}>Download</button>
          <button onClick={() => contextAction('share-link')}>🔗 Create Share Link</button>
          <button onClick={() => contextAction('share')}>👥 Google Drive Share</button>
          <button onClick={() => contextAction('rename')}>Rename</button>
          <button onClick={() => contextAction('move')}>Move to{'\u2026'}</button>
          <button onClick={() => contextAction('copy')}>Copy</button>
          <button onClick={() => contextAction('star')}>{contextMenu.file.starred ? 'Remove from Starred' : 'Add to Starred'}</button>
          <button onClick={() => contextAction('details')}>Properties</button>
          <button className="danger" onClick={() => contextAction('trash')}>Delete</button>
        </div>
      )}

      {folderPicker && (
        <div className="modal-wrap open" onClick={() => setFolderPicker(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <strong>{folderPicker.mode === 'move' ? 'Move to folder' : 'Copy to folder'}</strong>
              <button className="close-btn" onClick={() => setFolderPicker(null)}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
                {folderPicker.files.length === 1
                  ? folderPicker.files[0].name
                  : `${folderPicker.files.length} files`} → {folderPicker.mode === 'move' ? 'move' : 'copy'} to:
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

      {trashConfirm.length > 0 && (
        <div className="modal-wrap open" onClick={() => setTrashConfirm([])}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Move to Trash?</strong>
              <button className="close-btn" onClick={() => setTrashConfirm([])}>{'\u00D7'}</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {trashConfirm.length === 1 ? (
                <p style={{ margin: '0 0 8px' }}>Move <strong>{trashConfirm[0].name}</strong> to trash?</p>
              ) : (
                <p style={{ margin: '0 0 8px' }}>Move <strong>{trashConfirm.length} files</strong> to trash?</p>
              )}
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>You can restore them later from the Trash view.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="xbtn" onClick={() => setTrashConfirm([])}>Cancel</button>
                <button className="xbtn danger" onClick={() => { void handleTrashMultiple(trashConfirm); setTrashConfirm([]); }}>Move to Trash</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ShareModal
        files={shareFiles}
        open={shareFiles.length > 0}
        onClose={() => setShareFiles([])}
      />

      <CreateShareModal
        open={createShareItems.length > 0}
        onClose={() => setCreateShareItems([])}
        items={createShareItems}
      />
    </>
  );
}

export default FileExplorer;