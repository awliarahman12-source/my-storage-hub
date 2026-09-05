import { useApp } from '@/context/AppContext';
import { StoragePool } from './StoragePool';
import { QuickActions } from './QuickActions';
import { DriveGrid } from './DriveGrid';
import { RecentFiles } from './RecentFiles';
import type { DriveFileItem, DashboardFile } from '@/types';

interface DashboardViewProps {
  onOpenUpload: () => void;
  onPreview: (file: DriveFileItem | DashboardFile) => void;
}

export function DashboardView({ onOpenUpload, onPreview }: DashboardViewProps) {
  const { storageNodes } = useApp();

  return (
    <>
      {storageNodes.length === 0 && (
        <div className="no-drives-banner">
          <span className="banner-icon">{'\u26A0'}</span>
          <div>
            <b>No Google Drive connected</b>
            <small>Add a Google Drive account to start uploading files to your pool.</small>
          </div>
        </div>
      )}
      <section className="hero">
        <StoragePool />
        <QuickActions onOpenUpload={onOpenUpload} />
      </section>
      <DriveGrid />
      <RecentFiles onPreview={onPreview} />
    </>
  );
}
