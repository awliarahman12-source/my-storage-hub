import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { DashboardFileIcon } from '@/components/FileIcon';
import { BulkActionBar } from '@/components/BulkActionBar';
import { getDownloadUrl } from '@/utils/driveApi';
import { Search, Star, StarOff, Download, ChevronDown } from 'lucide-react';
import type { DriveFileItem, DashboardFile } from '@/types';

interface RecentFilesProps {
  onPreview: (file: DriveFileItem | DashboardFile) => void;
}

type FilterType = 'all' | 'pdf' | 'img' | 'video' | 'audio' | 'zip';

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All files' },
  { id: 'pdf', label: 'PDF only' },
  { id: 'img', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'zip', label: 'Archives' },
];

export function RecentFiles({ onPreview }: RecentFilesProps) {
  const { driveFiles, loadingFiles, storageNodes, starDriveFile, trashDriveFile, toast } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const hasDrives = storageNodes.filter((n) => n.status === 'connected').length > 0;

  const recent = useMemo(() => {
    return [...driveFiles]
      .filter((f) => !f.isFolder && !f.trashed)
      .sort((a, b) => String(b.modifiedRaw || '').localeCompare(String(a.modifiedRaw || '')))
      .slice(0, 10);
  }, [driveFiles]);

  const filtered = useMemo(() => {
    return recent.filter((f) => {
      const matchQuery =
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.drive.toLowerCase().includes(query.toLowerCase());
      if (!matchQuery) return false;
      if (filterType === 'all') return true;
      return f.type === filterType;
    });
  }, [recent, query, filterType]);

  const filterLabel = FILTER_OPTIONS.find((o) => o.id === filterType)?.label || 'All files';

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    const ns = new Set(selected);
    if (e.shiftKey && selected.size > 0) {
      const ids = filtered.map((f) => f.id);
      const last = [...selected].pop()!;
      const a = ids.indexOf(last);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [start, end] = a < b ? [a, b] : [b, a];
        for (let i = start; i <= end; i++) ns.add(ids[i]);
        setSelected(ns);
        return;
      }
    }
    ns.has(id) ? ns.delete(id) : ns.add(id);
    setSelected(ns);
  };

  const clearSelection = () => setSelected(new Set());

  const selectedFiles = filtered.filter((f) => selected.has(f.id));

  const handleStar = async (file: DriveFileItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await starDriveFile(file.id, file.nodeId, !file.starred);
    } catch {
      toast('Star failed');
    }
  };

  const handleDownload = (file: DriveFileItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = getDownloadUrl(file.id, file.nodeId);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    toast('Downloading ' + file.name);
  };

  const bulkDownload = () => {
    selectedFiles.forEach((f) => handleDownload(f));
    toast(`Downloading ${selectedFiles.length} file(s)`);
  };

  const bulkStar = async () => {
    let ok = 0;
    for (const f of selectedFiles) {
      try {
        await starDriveFile(f.id, f.nodeId, true);
        ok++;
      } catch { /* skip */ }
    }
    toast(`${ok} file di-star`);
    clearSelection();
  };

  const bulkTrash = async () => {
    if (!confirm(`Pindahkan ${selectedFiles.length} file ke Trash?`)) return;
    let ok = 0;
    for (const f of selectedFiles) {
      try {
        await trashDriveFile(f.id, f.nodeId);
        ok++;
      } catch { /* skip */ }
    }
    toast(`${ok} file ke Trash`);
    clearSelection();
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
            <Search size={14} />
            <input
              placeholder="Search files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <button
              className="filter"
              onClick={() => setFilterOpen((v) => !v)}
              type="button"
            >
              {filterLabel} <ChevronDown size={12} />
            </button>
            {filterOpen && (
              <>
                <div
                  onClick={() => setFilterOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                />
                <div className="filter-dropdown" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50 }}>
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      className={'filter-option' + (filterType === opt.id ? ' active' : '')}
                      onClick={() => { setFilterType(opt.id); setFilterOpen(false); }}
                      type="button"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
              filtered.map((f) => {
                const isSelected = selected.has(f.id);
                return (
                  <tr
                    key={f.id}
                    onClick={(e) => toggleSelect(f.id, e)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : undefined,
                    }}
                  >
                    <td>
                      <div className="file-name">
                        {f.thumbnail && f.type === 'img' ? (
                          <img src={f.thumbnail} alt="" />
                        ) : (
                          <DashboardFileIcon file={f} />
                        )}
                        <div>
                          <b
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); onPreview(f); }}
                          >
                            {f.name}
                          </b>
                          {f.starred && <Star size={11} fill="#f59e0b" stroke="none" style={{ display: 'inline', marginLeft: 4 }} />}
                        </div>
                      </div>
                    </td>
                    <td className="muted">{f.drive}</td>
                    <td className="muted">{f.sizeLabel}</td>
                    <td className="muted">{f.modified}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="xbtn"
                          style={{ fontSize: 11, padding: '2px 6px' }}
                          onClick={(e) => handleStar(f, e)}
                          title={f.starred ? 'Unstar' : 'Star'}
                        >
                          {f.starred ? <Star size={12} fill="#f59e0b" stroke="none" /> : <StarOff size={12} />}
                        </button>
                        <button
                          className="xbtn"
                          style={{ fontSize: 11, padding: '2px 6px' }}
                          onClick={(e) => handleDownload(f, e)}
                          title="Download"
                        >
                          <Download size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <BulkActionBar
        count={selected.size}
        onClear={clearSelection}
        onDownload={bulkDownload}
        onStar={bulkStar}
        onTrash={bulkTrash}
      />
    </>
  );
}