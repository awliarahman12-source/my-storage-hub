import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { DashboardFileIcon } from '@/components/FileIcon';
import { getDownloadUrl } from '@/utils/driveApi';
import type { DriveFileItem, DashboardFile } from '@/types';

interface SimpleFileViewProps {
  onPreview: (file: DriveFileItem | DashboardFile) => void;
}

type FilterMode = 'recent' | 'starred' | 'trash' | 'photos' | 'videos' | 'folders' | 'shared' | 'shared-folder' | 'drives' | 'files';

export function SimpleFileView({ onPreview }: SimpleFileViewProps) {
  const { driveFiles, loadingFiles, storageNodes, currentView, searchDriveFiles, trashDriveFile, untrashDriveFile, deleteDriveFile, toast, refreshFiles } = useApp();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DriveFileItem[] | null>(null);
  const [localFiles, setLocalFiles] = useState<DriveFileItem[]>([]);

  const hasDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;
  const mode = currentView as FilterMode;

  useEffect(() => {
    if (!hasDrives) {
      setLocalFiles([]);
      return;
    }
    // Use driveFiles from context which already filters based on currentView
    setLocalFiles(driveFiles);
  }, [driveFiles, hasDrives]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await searchDriveFiles(q);
      setSearchResults(results);
    } catch {
      // ignore
    }
  };

  const files = searchResults || localFiles;

  const handleDownload = (file: DriveFileItem) => {
    const url = getDownloadUrl(file.id, file.nodeId);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    toast('Downloading ' + file.name);
  };

  const handleTrash = async (file: DriveFileItem) => {
    if (!confirm('Move ' + file.name + ' to Trash?')) return;
    try {
      await trashDriveFile(file.id, file.nodeId);
    } catch {
      toast('Trash failed');
    }
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
    if (!confirm('Permanently delete ' + file.name + '? This cannot be undone.')) return;
    try {
      await deleteDriveFile(file.id, file.nodeId);
      toast('File deleted permanently');
    } catch {
      toast('Delete failed');
    }
  };

  const emptyMessage = () => {
    if (!hasDrives) return 'No Google Drive connected. Add a storage node to get started.';
    if (loadingFiles) return 'Loading files...';
    if (searchResults !== null && query) return 'No files found for "' + query + '"';
    if (mode === 'trash') return 'Trash is empty.';
    if (mode === 'starred') return 'No starred files yet.';
    if (mode === 'shared' || mode === 'shared-folder') return 'No shared files.';
    if (mode === 'photos') return 'No photos found.';
    if (mode === 'videos') return 'No videos found.';
    if (mode === 'folders') return 'No folders found.';
    if (mode === 'recent') return 'No recent files.';
    return 'No files found.';
  };

  return (
    <div className="card files">
      <div className="toolbar">
        <div className="search">
          <span>{'\u2315'}</span>
          <input
            placeholder="Search files..."
            value={query}
            onChange={(e) => void handleSearch(e.target.value)}
          />
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Location</th><th>Size</th><th>Modified</th>{mode === 'trash' && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {files.length === 0 ? (
            <tr>
              <td colSpan={mode === 'trash' ? 5 : 4} className="muted" style={{ textAlign: 'center', padding: '30px' }}>
                {emptyMessage()}
              </td>
            </tr>
          ) : (
            files.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="file-name">
                    {f.thumbnail && f.type === 'img' ? (
                      <img src={f.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
                    ) : (
                      <DashboardFileIcon file={f} />
                    )}
                    <b
                      style={{ cursor: 'pointer' }}
                      onClick={() => onPreview(f)}
                    >
                      {f.name}
                    </b>
                    {f.starred && <span style={{ color: '#f59e0b' }}> {'\u2605'}</span>}
                  </div>
                </td>
                <td className="muted">{f.drive}</td>
                <td className="muted">{f.isFolder ? '—' : f.sizeLabel}</td>
                <td className="muted">{f.modified}</td>
                {mode === 'trash' && (
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="xbtn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void handleRestore(f)}>Restore</button>
                      <button className="xbtn danger" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => void handleDelete(f)}>Delete</button>
                    </div>
                  </td>
                )}
                {mode !== 'trash' && (
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleDownload(f)} title="Download">{'\u2193'}</button>
                      <button className="xbtn danger" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => void handleTrash(f)} title="Trash">{'\u232B'}</button>
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
