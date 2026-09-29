import { Download, Star, Trash2, X, Link2, Users, FolderInput, Copy, Info } from 'lucide-react';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  onDownload?: () => void;
  onStar?: () => void;
  onTrash?: () => void;
  onShareLink?: () => void;
  onGDriveShare?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onDetails?: () => void;
}

export function BulkActionBar({
  count, onClear,
  onDownload, onStar, onTrash,
  onShareLink, onGDriveShare,
  onMove, onCopy, onDetails,
}: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-count">
        <span className="bulk-count-badge">{count}</span>
        <span>dipilih</span>
      </div>
      <div className="bulk-action-list">
        {onDownload && (
          <button className="bulk-action-btn" onClick={onDownload} title="Download">
            <Download size={16} /><span>Download</span>
          </button>
        )}
        {onShareLink && (
          <button className="bulk-action-btn" onClick={onShareLink} title="Share Link">
            <Link2 size={16} /><span>Share Link</span>
          </button>
        )}
        {onGDriveShare && (
          <button className="bulk-action-btn" onClick={onGDriveShare} title="Google Drive Share">
            <Users size={16} /><span>GDrive</span>
          </button>
        )}
        {onMove && (
          <button className="bulk-action-btn" onClick={onMove} title="Move">
            <FolderInput size={16} /><span>Move</span>
          </button>
        )}
        {onCopy && (
          <button className="bulk-action-btn" onClick={onCopy} title="Copy">
            <Copy size={16} /><span>Copy</span>
          </button>
        )}
        {onStar && (
          <button className="bulk-action-btn" onClick={onStar} title="Star">
            <Star size={16} /><span>Star</span>
          </button>
        )}
        {onDetails && (
          <button className="bulk-action-btn" onClick={onDetails} title="Details">
            <Info size={16} /><span>Details</span>
          </button>
        )}
        {onTrash && (
          <button className="bulk-action-btn danger" onClick={onTrash} title="Delete">
            <Trash2 size={16} /><span>Delete</span>
          </button>
        )}
      </div>
      <button className="bulk-action-close" onClick={onClear} title="Clear selection" aria-label="Clear selection">
        <X size={16} />
      </button>
    </div>
  );
}
