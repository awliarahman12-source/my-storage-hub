import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { getDownloadUrl, getPreviewUrl, fetchTextPreview } from '@/utils/driveApi';
import type { DriveFileItem, DashboardFile, ExplorerFile } from '@/types';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  file: DriveFileItem | DashboardFile | ExplorerFile | null;
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

export function PreviewModal({ open, onClose, file }: PreviewModalProps) {
  const { toast } = useApp();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isDriveFile = file && 'nodeId' in file && 'id' in file && typeof file.id === 'string';
  const driveFile = isDriveFile ? (file as DriveFileItem) : null;

  useEffect(() => {
    if (!open || !driveFile) return;
    if (driveFile.isFolder) return;

    setLoading(true);
    setPreviewUrl(null);
    setTextContent(null);

    if (driveFile.type === 'img' || driveFile.type === 'pdf' || driveFile.type === 'video' || driveFile.type === 'audio') {
      const url = getPreviewUrl(driveFile.id, driveFile.nodeId);
      setPreviewUrl(url);
      setLoading(false);
    } else if (isTextMime(driveFile.mimeType)) {
      fetchTextPreview(driveFile.id, driveFile.nodeId)
        .then((content) => {
          setTextContent(content);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          toast('Text preview failed');
        });
    } else {
      setLoading(false);
    }
  }, [open, driveFile, toast]);

  if (!open || !file) return null;

  const isExplorer = 'size' in file && typeof file.size === 'number';
  const sizeStr = isExplorer ? String((file as ExplorerFile).size) : (file as DashboardFile).size;
  const type = file.type;
  const typeLabel = type === 'img' ? 'Image' : type === 'pdf' ? 'PDF' : type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : type === 'folder' ? 'Folder' : 'File';

  const handleDownload = () => {
    if (driveFile) {
      const url = getDownloadUrl(driveFile.id, driveFile.nodeId);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      toast('Downloading ' + file.name);
    }
  };

  return (
    <div className="modal-wrap open" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-top">
          <div>
            <b>{file.name}</b>
            <small>{(file as any).drive || 'Storage'} {'\u00B7'} {driveFile ? driveFile.sizeLabel : sizeStr}</small>
          </div>
          <button className="close-btn" onClick={onClose}>{'\u00D7'}</button>
        </div>
        <div className="preview-stage">
          {loading && (
            <div style={{ color: '#9da7b8', textAlign: 'center', padding: 40 }}>
              <p>Loading preview...</p>
            </div>
          )}
          {driveFile && driveFile.type === 'img' && previewUrl && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt={file.name}
                style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }}
                onError={() => toast('Preview unavailable for this image')}
              />
            </div>
          )}
          {driveFile && driveFile.type === 'video' && previewUrl && (
            <video
              src={previewUrl}
              controls
              style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }}
            />
          )}
          {driveFile && driveFile.type === 'audio' && previewUrl && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <audio src={previewUrl} controls />
            </div>
          )}
          {driveFile && driveFile.type === 'pdf' && previewUrl && (
            <iframe
              src={previewUrl}
              style={{ width: '100%', height: 400, border: 'none', borderRadius: 8 }}
              title={file.name}
            />
          )}
          {driveFile && textContent !== null && (
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 400,
              overflow: 'auto',
              padding: 16,
              background: '#f5f7fb',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
            }}>
              {textContent}
            </pre>
          )}
          {driveFile && (driveFile.type === 'file' || driveFile.type === 'zip') && textContent === null && (
            <div style={{ color: '#9da7b8', textAlign: 'center' }}>
              <div style={{ fontSize: 50 }}>{'\u{1F4C4}'}</div>
              <p>Preview not available for this file type</p>
              <div style={{ fontSize: 12, marginTop: 8 }}>
                Type: {driveFile.mimeType} · Size: {driveFile.sizeLabel} · Storage: {driveFile.drive}
              </div>
              <button className="btn primary" style={{ marginTop: 10 }} onClick={handleDownload}>Download to view</button>
            </div>
          )}
          {driveFile && driveFile.isFolder && (
            <div style={{ color: '#9da7b8', textAlign: 'center' }}>
              <div style={{ fontSize: 50 }}>{'\u25B0'}</div>
              <p>Folder preview is not available.</p>
            </div>
          )}
          {!driveFile && (
            <>
              {type === 'img' && (
                <div style={{ color: '#9da7b8', textAlign: 'center' }}>
                  <p>Image preview not available</p>
                </div>
              )}
              {type === 'pdf' && (
                <div className="pdf-preview">
                  <div className="pdf-sheet">
                    <h3>{file.name}</h3>
                    <p>PDF preview not available for this file.</p>
                  </div>
                </div>
              )}
              {(type === 'file' || type === 'zip' || type === 'audio' || type === 'video' || type === 'folder') && (
                <div style={{ color: '#9da7b8', textAlign: 'center' }}>
                  <p>Preview not available.</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="preview-foot">
          <span>{typeLabel}</span>
          <button className="btn" onClick={handleDownload} disabled={!driveFile}>Download</button>
        </div>
      </div>
    </div>
  );
}
