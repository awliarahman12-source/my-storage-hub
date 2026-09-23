export type FileType =
  | 'folder' | 'img' | 'video' | 'pdf' | 'audio' | 'zip' | 'file';

export type ViewName =
  | 'dashboard' | 'files' | 'recent' | 'starred'
  | 'photos' | 'videos' | 'folders' | 'drives'
  | 'shared' | 'shared-folder' | 'trash'
  | 'settings' | 'api' | 'folder-sync' | 'shares';

export type Theme = 'light' | 'dark';

export type ApiTab = 'overview' | 'google' | 'keys' | 'upload' | 'webhook' | 'logs';

export type SettingsTab =
  | 'general' | 'storage' | 'security' | 'appearance' | 'backup' | 'devices' | 'shares';

export type DriveStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export type RoutingMode = 'automatic' | 'balanced' | 'manual';

export interface Drive {
  id: number;
  name: string;
  email: string;
  cap: number;
  used: number;
  status: DriveStatus;
  priority: number;
}

export interface StorageNode {
  id: string;
  provider: string;
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  status: DriveStatus;
  cap: number;
  used: number;
  priority: number;
  enabled: boolean;
  connectedAt: string;
  lastCheckedAt: string;
  quotaAvailable?: boolean;
}

export interface DriveFileItem {
  id: string;
  nodeId: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number;
  sizeLabel: string;
  modified: string;
  modifiedRaw: string | null;
  createdRaw: string | null;
  drive: string;
  driveEmail: string;
  starred: boolean;
  trashed: boolean;
  shared: boolean;
  thumbnail: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  isFolder: boolean;
  parentGoogleId: string | null;
}

export interface UploadSession {
  id: string;
  storageNodeId: string;
  uploadId: string | null;
  googleFileId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  parentGoogleId: string | null;
  status: 'queued' | 'uploading' | 'processing' | 'completed' | 'failed' | 'retrying' | 'cancelled';
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoragePoolSummary {
  connectedDrives: number;
  healthyDrives: number;
  totalCap: number;
  totalUsed: number;
  totalAvailable: number;
  quotaAvailable: boolean;
}

export interface DashboardFile {
  name: string;
  type: FileType;
  drive: string;
  size: string;
  modified: string;
  star: boolean;
}

export interface ExplorerFile {
  name: string;
  type: FileType;
  size: number;
  drive: string;
  modified: string;
  parent: number | null;
  star: boolean;
  trash?: boolean;
  shared?: boolean;
  access?: string;
  preview?: string;
}

export interface ApiLog {
  time: string;
  status: string;
  endpoint: string;
  duration: string;
  type: 'ok' | 'warn';
}

export interface ViewMeta { title: string; desc: string; }
export interface BreadcrumbItem { id: string; name: string; }

export interface DrivePermission {
  id: string;
  type: string;
  role: string;
  emailAddress: string | null;
  displayName: string | null;
  photoLink: string | null;
  expirationTime: string | null;
}

export interface DeviceInfo {
  id: string;
  device_id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  status: 'active' | 'inactive' | 'revoked';
  last_active: string;
  created_at: string;
}

export type ActivityFilter = 'all' | 'files' | 'storage' | 'sharing' | 'system';

export interface BackupData {
  version: string;
  exportedAt: string;
  storageNodes: {
    id: string; provider: string; email: string;
    displayName: string | null; priority: number;
    enabled: boolean; status: string;
  }[];
  routing: { mode: RoutingMode };
  settings: { storageName: string; theme: Theme };
}