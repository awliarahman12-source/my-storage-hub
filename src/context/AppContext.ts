import { createContext, useContext } from 'react';
import type { Drive, DashboardFile, ExplorerFile, Theme, ViewName, ApiLog, RoutingMode, StorageNode, DriveFileItem, UploadSession, StoragePoolSummary, BreadcrumbItem } from '@/types';
import type { PasscodeError } from '@/utils/driveApi';

export interface AppContextValue {
  // Theme
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  // Toast
  toastMsg: string;
  toast: (msg: string) => void;

  // View
  currentView: ViewName;
  setView: (v: ViewName) => void;

  // Auth
  authLoading: boolean;
  authed: boolean;
  authError: boolean;
  passcodeInitialized: boolean;
  login: (passcode: string) => Promise<{ success: boolean; error?: PasscodeError }>;
  setupAdminPasscode: (passcode: string, confirm: string) => Promise<{ success: boolean; error?: PasscodeError }>;
  logout: () => Promise<void>;

  // Data (legacy compat)
  drives: Drive[];
  dashboardFiles: DashboardFile[];
  explorerFiles: ExplorerFile[];
  apiLogs: ApiLog[];

  // Settings
  storageName: string;
  setStorageName: (n: string) => void;

  // Storage Pool
  routingMode: RoutingMode;
  setRoutingMode: (m: RoutingMode) => void;
  storageNodes: StorageNode[];
  loadingNodes: boolean;
  storagePool: StoragePoolSummary | null;
  refreshStorageNodes: () => Promise<void>;
  refreshStorageNode: (nodeId: string) => Promise<void>;
  connectGoogleDrive: () => void;
  disconnectStorageNode: (nodeId: string) => Promise<void>;
  setNodePriority: (nodeId: string, priority: number) => Promise<void>;
  toggleNodeEnabled: (nodeId: string, enabled: boolean) => Promise<void>;

  // Drive Files
  driveFiles: DriveFileItem[];
  loadingFiles: boolean;
  currentFolderId: string;
  currentFolderName: string;
  breadcrumbs: BreadcrumbItem[];
  navigateToFolder: (folderId: string, folderName: string) => void;
  navigateToRoot: () => void;
  navigateToBreadcrumb: (index: number) => void;
  refreshFiles: () => Promise<void>;
  searchDriveFiles: (query: string) => Promise<DriveFileItem[]>;

  // File Operations
  renameDriveFile: (fileId: string, nodeId: string, newName: string) => Promise<void>;
  trashDriveFile: (fileId: string, nodeId: string) => Promise<void>;
  untrashDriveFile: (fileId: string, nodeId: string) => Promise<void>;
  starDriveFile: (fileId: string, nodeId: string, starred: boolean) => Promise<void>;
  copyDriveFile: (fileId: string, nodeId: string) => Promise<void>;
  moveDriveFile: (fileId: string, nodeId: string, newParentId: string) => Promise<void>;
  deleteDriveFile: (fileId: string, nodeId: string) => Promise<void>;
  createDriveFolder: (nodeId: string, name: string, parentId?: string) => Promise<void>;
  shareDriveFile: (fileId: string, nodeId: string, access: string) => Promise<void>;

  // Upload Queue
  uploadSessions: UploadSession[];
  refreshUploadSessions: () => Promise<void>;
  uploadFiles: (files: FileList, targetNodeId?: string) => Promise<void>;
  retryUpload: (sessionId: string) => Promise<void>;
  cancelUpload: (sessionId: string) => Promise<void>;
  clearUploadSession: (sessionId: string) => Promise<void>;
  checkDuplicateFile: (filename: string, parentGoogleId?: string) => Promise<{ exists: boolean; nodes: { nodeId: string; fileId: string; drive: string }[] }>;

  // Data ops
  resetData: () => void;
  exportData: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
