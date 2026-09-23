import { useState, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import {
  isFolderSyncSupported,
  pickFolderAndEnumerate,
  filterNewFiles,
  getLastSyncTime,
  setLastSyncTime,
  type SyncFile,
} from '@/utils/folderSync';

export function FolderSyncView() {
  const { storageNodes, uploadFiles, toast, driveFiles } = useApp();

  const [localFiles, setLocalFiles] = useState<SyncFile[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(() => getLastSyncTime());
  const [filterExt, setFilterExt] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [onlyNew, setOnlyNew] = useState(true);

  const connectedCount = storageNodes.filter((n) => n.status === 'connected').length;

  const handlePickFolder = useCallback(async () => {
    if (!isFolderSyncSupported()) {
      toast('Folder picker tidak didukung. Gunakan Chrome atau Edge.');
      return;
    }
    if (connectedCount === 0) {
      toast('Tambahkan Google Drive dulu.');
      return;
    }
    try {
      setSyncBusy(true);
      const extensions = filterExt
        .split(',')
        .map((s) => s.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean);
      const files = await pickFolderAndEnumerate({
        recursive,
        extensions: extensions.length > 0 ? extensions : undefined,
      });
      setLocalFiles(files);
      toast(`${files.length} file ditemukan`);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast(err.message || 'Gagal membaca folder');
      }
    } finally {
      setSyncBusy(false);
    }
  }, [connectedCount, filterExt, recursive, toast]);

  const handleSync = useCallback(async () => {
    if (localFiles.length === 0) return;
    if (connectedCount === 0) {
      toast('Tambahkan Google Drive dulu.');
      return;
    }

    // Build set of already-uploaded (name + size) from currently listed drive files
    const uploadedKeys = new Set<string>(
      driveFiles.map((f) => `${f.name}::${f.size}`),
    );

    const filesToUpload = onlyNew
      ? filterNewFiles(localFiles, uploadedKeys)
      : localFiles;

    if (filesToUpload.length === 0) {
      toast('Semua file sudah ada di cloud.');
      return;
    }

    setSyncBusy(true);
    try {
      const rawFiles = filesToUpload.map((sf) => sf.file);
      await uploadFiles(rawFiles);
      setLastSyncTime(Date.now());
      setLastSync(Date.now());
      toast(`${filesToUpload.length} file masuk ke queue upload`);
    } catch {
      toast('Sync gagal');
    } finally {
      setSyncBusy(false);
    }
  }, [localFiles, driveFiles, connectedCount, onlyNew, uploadFiles, toast]);

  const totalSize = localFiles.reduce((sum, f) => sum + f.file.size, 0);

  const formatSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let x = bytes;
    while (x >= 1024 && i < 3) { x /= 1024; i++; }
    return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
  };

  const formatRelative = (ts: number | null): string => {
    if (!ts) return 'Belum pernah';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' menit lalu';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' jam lalu';
    return new Date(ts).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!isFolderSyncSupported()) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>📁</div>
        <h2 style={{ margin: '0 0 8px' }}>Folder Sync</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400, margin: '0 auto 20px' }}>
          Fitur ini membutuhkan <strong>File System Access API</strong>. Browser kamu (atau versi lama) belum mendukung.
          <br /><br />
          Coba gunakan <strong>Chrome</strong> atau <strong>Edge</strong> versi terbaru.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>📁 Folder Sync</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Pilih folder lokal, semua file di dalamnya akan diupload ke storage pool.
              File baru otomatis dideteksi (berdasarkan nama &amp; ukuran).
            </p>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Last sync: <strong>{formatRelative(lastSync)}</strong>
              {connectedCount === 0 && <span style={{ marginLeft: 12, color: '#dc2626', fontWeight: 600 }}>· Tidak ada Drive terkoneksi</span>}
            </div>
          </div>
          <button className="btn primary" onClick={() => void handlePickFolder()} disabled={syncBusy || connectedCount === 0}>
            {syncBusy ? 'Memproses...' : '📂 Pilih Folder'}
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Filter ekstensi (opsional)</label>
            <input
              className="setting-input"
              placeholder="jpg, png, pdf"
              value={filterExt}
              onChange={(e) => setFilterExt(e.target.value)}
            />
            <small style={{ fontSize: 10, color: 'var(--muted)' }}>Pisahkan dengan koma. Kosongkan untuk semua.</small>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8 }}>Opsi</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} />
              Rekursif (termasuk subfolder)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              Hanya upload file yang belum ada
            </label>
          </div>
        </div>
      </div>

      {/* Files list */}
      {localFiles.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 13 }}>{localFiles.length} file ditemukan</strong>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>({formatSize(totalSize)})</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setLocalFiles([])} disabled={syncBusy}>Clear</button>
              <button className="btn primary" onClick={() => void handleSync()} disabled={syncBusy}>
                {syncBusy ? 'Uploading...' : `⬆ Upload ${onlyNew ? 'yang baru' : 'semua'}`}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {localFiles.slice(0, 200).map((sf, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sf.relativePath}
                </span>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{formatSize(sf.file.size)}</span>
              </div>
            ))}
            {localFiles.length > 200 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
                ... dan {localFiles.length - 200} file lain (akan tetap diupload)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {localFiles.length === 0 && (
        <div className="card" style={{ padding: 50, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>Belum ada folder dipilih</strong>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Klik <strong>Pilih Folder</strong> untuk memulai. File akan dipindai dulu sebelum upload.
          </span>
        </div>
      )}

      {/* Info */}
      <div className="card" style={{ padding: 14, background: 'var(--soft)', fontSize: 11, color: 'var(--muted)' }}>
        <strong style={{ display: 'block', marginBottom: 4, color: 'var(--text)' }}>ℹ️ Cara kerja</strong>
        1. Pilih folder lokal — browser akan minta izin (read-only).<br />
        2. Semua file di dalam folder (dan subfolder kalau recursive) di-enumerate.<br />
        3. Klik <strong>Upload</strong> — file masuk ke queue upload yang sama seperti drag &amp; drop.<br />
        4. File dideteksi "baru" berdasarkan <strong>nama + ukuran</strong>. Kalau file diubah, akan diupload ulang.<br />
        5. Folder TIDAK di-sync otomatis. Jalankan manual kapanpun kamu mau.
      </div>
    </div>
  );
}