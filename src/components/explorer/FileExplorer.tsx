import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { V3Icon } from '@/components/FileIcon';
import { getDownloadUrl, fetchAllFolders, logActivity } from '@/utils/driveApi';
import type { FolderEntry } from '@/utils/driveApi';
import type { DriveFileItem, DashboardFile } from '@/types';
import { ShareModal } from '@/components/modals/ShareModal';
import { CreateShareModal } from '@/components/share/CreateShareModal';
import { gb } from '@/utils/format';

interface SimpleFileViewProps {
  onPreview: (file: DriveFileItem | DashboardFile, list?: DriveFileItem[]) => void;
}

type SortField = 'name' | 'modified' | 'size' | 'type';
type SortDir = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

export function SimpleFileView({ onPreview }: SimpleFileViewProps) {
  const {
    driveFiles,
    loadingFiles,
    loadingMoreFiles,
    hasMoreFiles,
    filesError,
    storageNodes,
    loadingNodes,
    nodesError,
    currentView,
    searchDriveFiles,
    trashDriveFile,
    untrashDriveFile,
    deleteDriveFile,
    renameDriveFile,
    copyDriveFile,
    moveDriveFile,
    starDriveFile,
    connectGoogleDrive,
    disconnectStorageNode,
    refreshStorageNode,
    toast,
    loadMoreFiles,
  } = useApp();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DriveFileItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('simpleView') as ViewMode) || 'list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DriveFileItem } | null>(null);
  const [detailsFile, setDetailsFile] = useState<DriveFileItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareFiles, setShareFiles] = useState<DriveFileItem[]>([]);
  const [createShareItems, setCreateShareItems] = useState<DriveFileItem[]>([]);
  const [folderPicker, setFolderPicker] = useState<{ files: DriveFileItem[]; mode: 'move' | 'copy' } | null>(null);
  const [folderList, setFolderList] = useState<FolderEntry[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedDestNode, setSelectedDestNode] = useState<string>('');
  const [trashConfirm, setTrashConfirm] = useState<DriveFileItem[]>([]);

  const hasDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;
  const mode = currentView;
  const isDrivesMode = mode === 'drives';

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  useEffect(() => {
    setSelected(new Set());
    setSearchResults(null);
    setQuery('');
  }, [currentView]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    try {
      const results = await searchDriveFiles(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const sortFiles = useCallback((files: DriveFileItem[]): DriveFileItem[] => {
    const sorted = [...files];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'modified': cmp = (a.modifiedRaw || '').localeCompare(b.modifiedRaw || ''); break;
        case 'size': cmp = a.size - b.size; break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
      }
      return cmp * dir;
    });
    return sorted;
  }, [sortField, sortDir]);

  const baseFiles = searchResults !== null ? searchResults : driveFiles;
  const files = sortFiles(baseFiles);

  useEffect(() => {
    if (searchResults !== null) return;
    if (!hasMoreFiles || loadingMoreFiles) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void loadMoreFiles(); },
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
        setSelected(new Set(files.map((f) => f.id)));
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  const select = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && selected.size) {
      const ids = files.map((f) => f.id);
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

  const toggleSelectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.id)));
    }
  };

  const setViewAndSave = (v: ViewMode) => {
    setView(v);
    localStorage.setItem('simpleView', v);
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
      const keepExt = confirm('Keep extension "' + ext + '"?\n\nOK = "' + n.trim() + ext + '"\nCancel = "' + n.trim() + '" (changes extension — this does NOT convert the file format)');
      newName = keepExt ? n.trim() + ext : n.trim();
    }
    try {
      await renameDriveFile(file.id, file.nodeId, newName);
      await logActivity('rename', file.name + ' -> ' + newName, file.nodeId, file.drive, 'success');
    } catch {
      toast('Rename failed');
    }
  };

  const handleMoveOrCopy = async (targets: DriveFileItem[], m: 'move' | 'copy') => {
    if (targets.length === 0) return;
    setFolderPicker({ files: targets, mode: m });
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
    const { files: targets, mode: m } = folderPicker;
    const targetNodeId = destNodeId || selectedDestNode || targets[0].nodeId;
    setFolderPicker(null);

    const crossDrive = targetNodeId !== targets[0].nodeId;
    if (crossDrive) {
      const MAX_CROSS_DRIVE = 100 * 1024 * 1024;
      const tooLarge = targets.filter((f) => f.size > MAX_CROSS_DRIVE);
      if (tooLarge.length > 0) {
        const names = tooLarge.map((f) => `- ${f.name} (${f.sizeLabel})`).join('\n');
        const msg = `${tooLarge.length} file lebih dari 100 MB dan mungkin gagal dipindah lintas drive:\n\n${names}\n\nLanjutkan?`;
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
        if (m === 'move') {
          await moveDriveFile(file.id, file.nodeId, destFolderId, crossNodeId);
          await logActivity('move', file.name, file.nodeId, file.drive, 'success');
        } else {
          await copyDriveFile(file.id, file.nodeId, crossNodeId, destFolderId);
          await logActivity('copy', file.name, file.nodeId, file.drive, 'success');
        }
        ok++;
      } catch (err) {
        await logActivity(m, file.name, file.nodeId, file.drive, 'failed');
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

    const verb = m === 'move' ? 'moved' : 'copied';
    if (fail === 0) {
      toast(`${ok} file${ok > 1 ? 's' : ''} ${verb}`);
    } else if (ok === 0) {
      toast(`Failed to ${m} ${fail} file${fail > 1 ? 's' : ''}`);
    } else {
      toast(`${ok} ${verb}, ${fail} failed`);
    }
    setSelected(new Set());
  };

  const handleStar = async (file: DriveFileItem) => {
    try {
      await starDriveFile(file.id, file.nodeId, !file.starred);
      await logActivity(file.starred ? 'unstarred' : 'starred', file.name, file.nodeId, file.drive, 'success');
    } catch {
      toast('Star failed');
    }
  };

  const handleStarSelected = async () => {
    for (const id of selected) {
      const f = files.find((x) => x.id === id);
      if (f) await handleStar(f);
    }
    setSelected(new Set());
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

  const handleRestore = async (file: DriveFileItem) => {
    try {
      await untrashDriveFile(file.id, file.nodeId);
      toast('File restored');
    } catch {
      toast('Restore failed');
    }
  };

  const handleDelete = async (file: DriveFileItem) => {
    try {
      await deleteDriveFile(file.id, file.nodeId);
      toast('File deleted permanently');
    } catch {
      toast('Delete failed');
    }
  };

  const handleRowClick = (file: DriveFileItem) => {
    if (file.isFolder) return;
    onPreview(file, files);
  };

  const showDetails = (file: DriveFileItem) => {
    setDetailsFile(file);
    setDetailsOpen(true);
  };

  // ============ SHARE HANDLERS ============

  const handleCreateShareLink = (targets: DriveFileItem[]) => {
    if (targets.length === 0) return;
    setCreateShareItems(targets);
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

    const targets = files.filter((x) => selected.has(x.id));
    const bulk = targets.length > 0 ? targets : [file];
    const isBulk = bulk.length > 1;

    switch (action) {
      // ===== Single-only actions =====
      case 'preview': handleRowClick(file); break;
      case 'rename': handleRename(file); break;
      case 'details': showDetails(file); break;

      // ===== Bulk-capable actions =====
      case 'download': {
        bulk.forEach((f) => handleDownload(f));
        break;
      }
      case 'share-link': {
        if (isBulk) {
          toast(`Membuat 1 share link untuk ${bulk.length} file...`);
        }
        handleCreateShareLink(bulk);
        break;
      }
      case 'share-gdrive': {
        setShareFiles(bulk);
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortArrow = (field: SortField): string => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const emptyMessage = (): string => {
    if (!hasDrives) return 'No Google Drive connected. Add a storage node to get started.';
    if (filesError) return 'Failed to load files. Check your connection and try again.';
    if (loadingFiles) return 'Loading files...';
    if (searching) return 'Searching...';
    if (searchError) return 'Search failed. Please try again.';
    if (searchResults !== null && query) return 'No files found for "' + query + '"';
    if (mode === 'trash') return 'Trash is empty.';
    if (mode === 'starred') return 'No starred files yet.';
    if (mode === 'shared' || mode === 'shared-folder') return 'No shared files.';
    if (mode === 'photos') return 'No photos found.';
    if (mode === 'videos') return 'No videos found.';
    if (mode === 'folders') return 'No folders found.';
    if (mode === 'recent') return 'No recent files.';
    if (mode === 'drives') return 'No drives found.';
    return 'No files found.';
  };

  const showEmpty = files.length === 0;
  const isTrashMode = mode === 'trash';
  const allSelected = files.length > 0 && selected.size === files.length;
  const someSelected = selected.size > 0 && selected.size < files.length;

  const formatDate = (raw: string | null): string => {
    if (!raw) return 'Unavailable';
    try {
      return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return raw;
    }
  };

  return (
    <div className="card files">
      <div className="explorer-toolbar">
        <div className="group">
          {files.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: '#7b8495', padding: '0 8px' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ cursor: 'pointer' }}
              />
              {someSelected ? 'Partial' : allSelected ? 'All' : 'None'}
            </label>
          )}
          <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px', fontWeight: sortField === 'name' ? 700 : 400 }} onClick={() => toggleSort('name')}>Name{sortArrow('name')}</button>
          <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px', fontWeight: sortField === 'modified' ? 700 : 400 }} onClick={() => toggleSort('modified')}>Modified{sortArrow('modified')}</button>
          <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px', fontWeight: sortField === 'size' ? 700 : 400 }} onClick={() => toggleSort('size')}>Size{sortArrow('size')}</button>
          <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px', fontWeight: sortField === 'type' ? 700 : 400 }} onClick={() => toggleSort('type')}>Type{sortArrow('type')}</button>
        </div>
        {selected.size > 0 && (
          <div className="group">
            <span style={{ alignSelf: 'center', fontSize: 12, color: '#7b8495', marginRight: 4 }}>{selected.size} selected</span>
            {!isTrashMode && (
              <button className="xbtn" onClick={() => {
                const targets = files.filter((x) => selected.has(x.id));
                handleCreateShareLink(targets);
              }}>🔗 Share Link</button>
            )}
            <button className="xbtn" onClick={handleStarSelected}>Star</button>
            {!isTrashMode && (
              <>
                <button className="xbtn" onClick={() => {
                  const targets = files.filter((x) => selected.has(x.id));
                  targets.forEach((f) => handleDownload(f));
                }}>Download</button>
                <button className="xbtn" onClick={() => {
                  const targets = files.filter((x) => selected.has(x.id));
                  void handleMoveOrCopy(targets, 'move');
                }}>Move</button>
                <button className="xbtn" onClick={() => {
                  const targets = files.filter((x) => selected.has(x.id));
                  void handleMoveOrCopy(targets, 'copy');
                }}>Copy</button>
                <button className="xbtn" onClick={() => {
                  const targets = files.filter((x) => selected.has(x.id));
                  setShareFiles(targets);
                }}>GDrive</button>
                <button className="xbtn danger" onClick={() => {
                  const targets = files.filter((x) => selected.has(x.id));
                  setTrashConfirm(targets);
                }}>Delete</button>
              </>
            )}
            <button className="xbtn" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <input
          className="xbtn"
          style={{ padding: '6px 12px', minWidth: 160 }}
          placeholder="Search files..."
          value={query}
          onChange={(e) => void handleSearch(e.target.value)}
        />
        <div className="view-toggle">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setViewAndSave('grid')} title="Grid view">{'\u25A6'}</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setViewAndSave('list')} title="List view">{'\u2637'}</button>
        </div>
      </div>

      {isDrivesMode && (
        <div style={{ padding: '16px 0' }}>
          {loadingNodes && storageNodes.length === 0 ? (
            <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
              <div className="preview-spinner" style={{ margin: '0 auto 12px' }} />
              <p>Loading connected drives...</p>
            </div>
          ) : nodesError && storageNodes.length === 0 ? (
            <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\u26A0'}</div>
              <strong>Unable to load drives</strong>
              <br />
              <span style={{ fontSize: 12 }}>Could not reach the storage service. Check your connection and try again.</span>
              <br />
              <button className="xbtn" style={{ marginTop: 12 }} onClick={() => { void refreshStorageNode(''); }}>Retry</button>
            </div>
          ) : storageNodes.length === 0 ? (
            <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{'\u25C9'}</div>
              <h3 style={{ margin: '0 0 8px' }}>No Google Drive connected</h3>
              <p style={{ fontSize: 13, color: '#7b8495', margin: '0 0 16px' }}>Connect your Google Drive account to start building your storage pool.</p>
              <button className="xbtn primary" onClick={connectGoogleDrive}>{'\uFF0B Add Google Drive'}</button>
            </div>
          ) : (
            <>
              <div className="section-title" style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Connected Drives</h2>
                <span style={{ fontSize: 12, color: '#7b8495' }}>{storageNodes.length} drive{storageNodes.length !== 1 ? 's' : ''} connected</span>
              </div>
              <div className="drives" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {storageNodes.map((node) => {
                  const p = node.cap > 0 && node.quotaAvailable ? Math.round((node.used / node.cap) * 100) : 0;
                  const connectedDate = new Date(node.connectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <article key={node.id} className="card drive" style={{ margin: 0 }}>
                      <div className="drive-head">
                        <div className="drive-name">
                          {node.avatar ? (
                            <img src={node.avatar} alt="" className="drive-icon" style={{ borderRadius: '11px', objectFit: 'cover' }} />
                          ) : (
                            <div className="drive-icon">G</div>
                          )}
                          <div>
                            <strong>{node.displayName || node.email}</strong>
                            <div className="drive-meta">{node.email}</div>
                          </div>
                        </div>
                        <span className={'drive-status-badge ' + node.status}>
                          <span className="drive-status-dot" />
                          {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                        </span>
                      </div>
                      {node.quotaAvailable && node.cap > 0 ? (
                        <>
                          <div className="drive-cap">
                            <span>{gb(node.used)} used</span>
                            <span>{gb(node.cap)}</span>
                          </div>
                          <div className="bar"><i style={{ width: p + '%' }} /></div>
                          <div className="drive-foot">
                            <span>{gb(Math.max(0, node.cap - node.used))} free</span>
                            <span className="drive-priority">Priority {node.priority} {'\u00B7'} Connected {connectedDate}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="drive-cap">
                            <span>Quota unavailable</span>
                            <span>{'\u2014'}</span>
                          </div>
                          <div className="bar"><i style={{ width: '0%' }} /></div>
                          <div className="drive-foot">
                            <span>Storage data from Google API</span>
                            <span className="drive-priority">Priority {node.priority} {'\u00B7'} Connected {connectedDate}</span>
                          </div>
                        </>
                      )}
                      <div className="drive-actions">
                        <button className="xbtn" style={{ fontSize: 11 }} onClick={() => void refreshStorageNode(node.id)}>Refresh</button>
                        <button className="xbtn danger" style={{ fontSize: 11 }} onClick={() => { if (confirm('Disconnect ' + node.email + '? Your files will not be deleted.')) void disconnectStorageNode(node.id); }}>Disconnect</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button className="xbtn primary" onClick={connectGoogleDrive}>{'\uFF0B Add Google Drive'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {!isDrivesMode && (
      <>
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
        </div>
      ) : showEmpty ? (
        <div className="upload-drop" style={{ display: 'block', textAlign: 'center' }}>
          {emptyMessage()}
        </div>
      ) : view === 'grid' ? (
        <div className="file-grid">
          {files.map((f) => (
            <div
              key={f.id}
              className={'file-card' + (selected.has(f.id) ? ' selected' : '')}
              onClick={(e) => select(f.id, e)}
              onDoubleClick={() => handleRowClick(f)}
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
              }}
              title="Double click to preview"
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
              <div className="file-name">
                {f.name}
                {f.starred && <span style={{ color: '#f59e0b' }}> {'\u2605'}</span>}
              </div>
              <div className="file-meta">{f.isFolder ? 'Folder' : f.sizeLabel} {'\u00B7'} {f.drive}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list">
          <div className="file-row header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ cursor: 'pointer' }}
              />
            </div>
            <div>Name</div><div>Location</div><div>Size</div><div>Modified</div><div></div>
          </div>
          {files.map((f) => (
            <div
              key={f.id}
              className={'file-row' + (selected.has(f.id) ? ' selected' : '')}
              onClick={(e) => select(f.id, e)}
              onDoubleClick={() => handleRowClick(f)}
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
              }}
            >
              <div className="file-icon" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => { const ns = new Set(selected); ns.has(f.id) ? ns.delete(f.id) : ns.add(f.id); setSelected(ns); }}
                  style={{ cursor: 'pointer' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.thumbnail && f.type === 'img' ? (
                    <img src={f.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
                  ) : (
                    <V3Icon file={f} />
                  )}
                  <strong
                    style={{ cursor: f.isFolder ? 'default' : 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (!f.isFolder) handleRowClick(f); }}
                  >
                    {f.name}
                  </strong>
                  {f.starred && <span style={{ color: '#f59e0b' }}>{'\u2605'}</span>}
                </div>
              </div>
              <div className="muted">{f.drive}</div>
              <div className="muted">{f.isFolder ? '\u2014' : f.sizeLabel}</div>
              <div className="muted">{f.modified}</div>
              <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                {isTrashMode ? (
                  <>
                    <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void handleRestore(f)}>Restore</button>
                    <button className="xbtn danger" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void handleDelete(f)}>Delete</button>
                  </>
                ) : (
                  <>
                    {!f.isFolder && <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleDownload(f)} title="Download">{'\u2193'}</button>}
                    <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => void handleStar(f)} title={f.starred ? 'Unstar' : 'Star'}>{f.starred ? '\u2605' : '\u2606'}</button>
                    <button className="xbtn danger" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => void handleTrashMultiple([f])} title="Trash">{'\u232B'}</button>
                    <button
                      className="xbtn"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      title="More actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        openContextMenu(f, Math.min(e.clientX, window.innerWidth - 240), Math.min(e.clientY, window.innerHeight - 460));
                      }}
                    >{'\u22EE'}</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {searchResults === null && !showEmpty && (
        <div ref={sentinelRef} style={{ padding: '12px', textAlign: 'center' }}>
          {loadingMoreFiles && <span className="muted" style={{ fontSize: 13 }}>Loading more...</span>}
          {!loadingMoreFiles && !hasMoreFiles && !loadingFiles && (
            <span className="muted" style={{ fontSize: 12 }}>End of list</span>
          )}
        </div>
      )}

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
          {!contextMenu.file.isFolder && <button onClick={() => contextAction('preview')}>Preview</button>}
          <button onClick={() => contextAction('download')}>Download</button>
          <button onClick={() => contextAction('share-link')}>🔗 Create Share Link</button>
          <button onClick={() => contextAction('share-gdrive')}>👥 Google Drive Share</button>
          <button onClick={() => contextAction('rename')}>Rename</button>
          <button onClick={() => contextAction('move')}>Move to{'\u2026'}</button>
          <button onClick={() => contextAction('copy')}>Copy</button>
          <button onClick={() => contextAction('star')}>{contextMenu.file.starred ? 'Remove from Starred' : 'Add to Starred'}</button>
          <button onClick={() => contextAction('details')}>Properties</button>
          <button className="danger" onClick={() => contextAction('trash')}>Delete</button>
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
              {!detailsFile.isFolder && <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setDetailsOpen(false); handleRowClick(detailsFile); }}>Open</button>}
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleDownload(detailsFile)}>Download</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleCreateShareLink([detailsFile])}>🔗 Share Link</button>
              <button className="xbtn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setShareFiles([detailsFile]); }}>Share</button>
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
              ['Size', detailsFile.isFolder ? '\u2014' : detailsFile.sizeLabel],
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
      )}
    </div>
  );
}