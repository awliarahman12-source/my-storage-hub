import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { DashboardFileIcon } from '@/components/FileIcon';
import { getDownloadUrl } from '@/utils/driveApi';
import type { DriveFileItem, DashboardFile } from '@/types';

interface RecentFilesProps {
  onPreview: (file: DriveFileItem | DashboardFile) => void;
}

export function RecentFiles({ onPreview }: RecentFilesProps) {
  const { driveFiles, loadingFiles, storageNodes, starDriveFile, toast } = useApp();
  const [query, setQuery] = useState('');
  const hasDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;

  // Show the 10 most recent files (sorted by modified date)
  const recent = [...driveFiles]
    .filter((f) => !f.isFolder && !f.trashed)
    .sort((a, b) => String(b.modifiedRaw || '').localeCompare(String(a.modifiedRaw || '')))
    .slice(0, 10);

  const filtered = recent.filter(
    (f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      f.drive.toLowerCase().includes(query.toLowerCase())
  );

  const handleStar = async (file: DriveFileItem) => {
    try {
      await starDriveFile(file.id, file.nodeId, !file.starred);
    } catch {
      toast('Star failed');
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

  return (
    <>
      <div className="section-title">
        <h2>Recent Files</h2>
        <span>{filtered.length} items</span>
      </div>
      <section className="card files">
        <div className="toolbar">
          <div className="search">
            <span>{'\u2315'}</span>
            <input
              placeholder="Search files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="filter" onClick={() => {}}>All files {'\u25BE'}</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Location</th><th>Size</th><th>Modified</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!hasDrives ? (
              <tr><td colSpan={5} className="muted" style={{textAlign:'center',padding:'30px'}}>No Google Drive connected. Add a storage node to get started.</td></tr>
            ) : loadingFiles ? (
              <tr><td colSpan={5} className="muted" style={{textAlign:'center',padding:'30px'}}>Loading files...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="muted" style={{textAlign:'center',padding:'30px'}}>No files found. {query ? 'Try another search keyword.' : 'Upload files to get started.'}</td></tr>
            ) : (
              filtered.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="file-name">
                      {f.thumbnail && f.type === 'img' ? (
                        <img src={f.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
                      ) : (
                        <DashboardFileIcon file={f} />
                      )}
                      <div>
                        <b
                          style={{ cursor: 'pointer' }}
                          onClick={() => onPreview(f)}
                        >
                          {f.name}
                        </b>
                        {f.starred && <span style={{ color: '#f59e0b' }}> {'\u2605'}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{f.drive}</td>
                  <td className="muted">{f.sizeLabel}</td>
                  <td className="muted">{f.modified}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleStar(f)} title={f.starred ? 'Unstar' : 'Star'}>{'\u2606'}</button>
                      <button className="xbtn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleDownload(f)} title="Download">{'\u2193'}</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
