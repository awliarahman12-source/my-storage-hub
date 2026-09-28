import { useState } from 'react';
import type { ShareFile } from '@/utils/shareApi';

export function ShareEditorContextMenu({
  x, y, file, onClose, onRename, onMove, onStar, onTrash,
}: {
  x: number;
  y: number;
  file: ShareFile;
  onClose: () => void;
  onRename: () => void;
  onMove: () => void;
  onStar: () => void;
  onTrash: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
      />
      <div
        className="share-editor-menu"
        style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => { onRename(); onClose(); }}>✏️ Rename</button>
        {!file.isFolder && (
          <>
            <button onClick={() => { onMove(); onClose(); }}>📁 Move to…</button>
            <button onClick={() => { onStar(); onClose(); }}>
              {file.name && false ? '★' : '☆'} {file.sizeLabel === '★' ? 'Unstar' : 'Star'}
            </button>
          </>
        )}
        <button className="danger" onClick={() => { onTrash(); onClose(); }}>
          🗑 Move to Trash
        </button>
      </div>
    </>
  );
}

export function ShareTrashConfirmModal({
  files, onConfirm, onCancel, processing,
}: {
  files: ShareFile[];
  onConfirm: () => void;
  onCancel: () => void;
  processing: boolean;
}) {
  return (
    <div className="share-editor-modal-wrap" onClick={onCancel}>
      <div className="share-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Move to Trash?</h3>
        {files.length === 1 ? (
          <p>
            Pindahkan <strong>{files[0].name}</strong> ke trash?
          </p>
        ) : (
          <p>
            Pindahkan <strong>{files.length} file</strong> ke trash?
          </p>
        )}
        <p className="share-editor-modal-hint">
          Bisa di-restore dari Google Drive trash.
        </p>
        <div className="share-editor-modal-actions">
          <button className="share-btn" onClick={onCancel} disabled={processing}>Batal</button>
          <button
            className="share-btn danger"
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? 'Memproses…' : 'Pindah ke Trash'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareMovePickerModal({
  folders, onConfirm, onCancel, processing,
}: {
  folders: ShareFile[];
  onConfirm: (folderId: string) => void;
  onCancel: () => void;
  processing: boolean;
}) {
  const [selected, setSelected] = useState<string>('');
  return (
    <div className="share-editor-modal-wrap" onClick={onCancel}>
      <div className="share-editor-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3>Pindah ke folder</h3>
        <div className="share-move-list">
          {folders.length === 0 && (
            <div className="share-move-empty">Tidak ada subfolder di share ini.</div>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              className={'share-move-item' + (selected === f.id ? ' selected' : '')}
              onClick={() => setSelected(f.id)}
            >
              📁 {f.name}
            </button>
          ))}
        </div>
        <div className="share-editor-modal-actions">
          <button className="share-btn" onClick={onCancel} disabled={processing}>Batal</button>
          <button
            className="share-btn primary"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || processing}
          >
            {processing ? 'Memproses…' : 'Pindah'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareUploadToast({
  filename, progress, status,
}: {
  filename: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
}) {
  return (
    <div className="share-upload-toast">
      <div className="share-upload-toast-row">
        <span className="share-upload-toast-icon">
          {status === 'uploading' ? '⬆' : status === 'success' ? '✓' : '⚠'}
        </span>
        <span className="share-upload-toast-name">{filename}</span>
        <span className="share-upload-toast-status">
          {status === 'uploading' ? `${progress}%` : status === 'success' ? 'Selesai' : 'Gagal'}
        </span>
      </div>
      {status === 'uploading' && (
        <div className="share-upload-toast-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

export function ShareUndoToast({
  count, timeLeft, onUndo,
}: {
  count: number;
  timeLeft: number;
  onUndo: () => void;
}) {
  return (
    <div className="share-undo-toast">
      <span className="share-undo-text">
        {count} file dipindah ke trash
      </span>
      <button className="share-undo-btn" onClick={onUndo}>
        Undo ({timeLeft})
      </button>
    </div>
  );
}