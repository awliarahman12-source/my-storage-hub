import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { searchDb, type DbSearchResult } from '@/utils/dbSearch';
import type { DriveFileItem, DashboardFile } from '@/types';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onPreview: (file: DriveFileItem | DashboardFile, list?: DriveFileItem[]) => void;
}

export function GlobalSearchModal({ open, onClose, onPreview }: GlobalSearchModalProps) {
  const { toast } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await searchDb({ query: q, limit: 30 });
      setResults(res);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void doSearch(v), 300);
  };

  const handleSelect = (r: DbSearchResult) => {
    const fileItem: DriveFileItem = {
      id: r.id,
      nodeId: r.nodeId,
      name: r.name,
      type: guessType(r.mimeType),
      mimeType: r.mimeType,
      size: r.size,
      sizeLabel: formatSize(r.size),
      modified: new Date(r.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      modifiedRaw: r.modified,
      createdRaw: null,
      drive: r.drive,
      driveEmail: r.driveEmail,
      starred: r.starred,
      trashed: false,
      shared: r.shared,
      thumbnail: r.thumbnail || null,
      webViewLink: null,
      webContentLink: null,
      isFolder: r.isFolder,
      parentGoogleId: null,
    };
    onPreview(fileItem);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      handleSelect(results[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="modal-wrap open" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: 80 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          padding: 0,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 18, color: '#8b94a5' }}>{'\u2315'}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files by name, type, size..."
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              fontSize: 15,
              color: 'var(--text)',
            }}
          />
          <kbd style={{
            fontSize: 10,
            padding: '3px 7px',
            borderRadius: 5,
            background: 'var(--soft, #f6f7fb)',
            color: '#8b94a5',
            border: '1px solid var(--line)',
            fontFamily: 'ui-monospace,monospace',
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 480 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 30, color: '#9da7b8', fontSize: 13 }}>
              <div className="preview-spinner" style={{ margin: '0 auto 12px' }} />
              Searching...
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#9da7b8', fontSize: 13 }}>
              No results for "{query}"
            </div>
          )}
          {!loading && !query && (
            <div style={{ padding: 30 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9da7b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Quick tips
              </div>
              <div style={{ fontSize: 12, color: '#7b8495', lineHeight: 1.7 }}>
                • Ketik nama file untuk cari<br />
                • Pakai ↑ ↓ untuk navigasi, Enter untuk buka<br />
                • Filter: <code style={{ background: 'var(--soft)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>type:pdf</code> atau <code style={{ background: 'var(--soft)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>starred</code>
              </div>
            </div>
          )}
          {results.map((r, idx) => (
            <div
              key={`${r.nodeId}-${r.id}`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setSelected(idx)}
              style={{
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                background: idx === selected ? 'var(--hover, #f0f1ff)' : 'transparent',
                borderBottom: '1px solid var(--line, #f0f2f6)',
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: typeBg(r.mimeType),
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {typeIcon(r.mimeType)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlightMatch(r.name, query)}
                </div>
                <div style={{ fontSize: 11, color: '#7b8495', marginTop: 2 }}>
                  {r.drive} {'\u00B7'} {formatSize(r.size)}
                </div>
              </div>
              {idx === selected && (
                <kbd style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--soft)', color: '#7b8495', border: '1px solid var(--line)' }}>
                  Enter
                </kbd>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#9da7b8',
          background: 'var(--soft)',
        }}>
          <span>{results.length > 0 ? `${results.length} result${results.length !== 1 ? 's' : ''}` : ''}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function guessType(mime: string): DriveFileItem['type'] {
  if (mime === 'application/vnd.google-apps.folder') return 'folder';
  if (mime.startsWith('image/')) return 'img';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return 'zip';
  return 'file';
}

function typeBg(mime: string): string {
  if (mime.startsWith('image/')) return '#ecfeff';
  if (mime.startsWith('video/')) return '#eee9ff';
  if (mime === 'application/pdf') return '#fff1f2';
  if (mime.startsWith('audio/')) return '#e9f8ef';
  if (mime.includes('zip') || mime.includes('compressed')) return '#fffbeb';
  return '#f1f3f7';
}

function typeIcon(mime: string): string {
  if (mime === 'application/vnd.google-apps.folder') return '\u25B0';
  if (mime.startsWith('image/')) return '\u{1F5BC}';
  if (mime.startsWith('video/')) return '\u25B6';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('audio/')) return '\u266B';
  if (mime.includes('zip') || mime.includes('compressed')) return 'ZIP';
  return '\u{1F4C4}';
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let x = bytes;
  while (x >= 1024 && i < 3) { x /= 1024; i++; }
  return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#fef08a', color: 'inherit', padding: '0 2px', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}