import { useState, useCallback, useEffect, useRef } from 'react';
import type { Drive, DashboardFile, ExplorerFile, Theme, ViewName, ApiLog, RoutingMode, StorageNode, DriveFileItem, UploadSession, StoragePoolSummary, BreadcrumbItem } from '@/types';
import {
  EMPTY_DRIVES,
  EMPTY_DASHBOARD_FILES,
  EMPTY_EXPLORER_FILES,
  defaultApiLogs,
  CURRENT_STORAGE_VERSION,
  STORAGE_VERSION_KEY,
  DEFAULT_ROUTING_MODE,
} from '@/data/mockData';
import { deleteStorageNode, getOAuthUrl } from '@/utils/storageNodes';
import * as driveApi from '@/utils/driveApi';
import type { AppContextValue } from './AppContext';

import type { PasscodeError } from '@/utils/driveApi';

export function useAppState(): AppContextValue {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('ms_theme') as Theme) || 'light');
  const [currentView, setView] = useState<ViewName>('dashboard');
  const [toastMsg, setToastMsg] = useState('');

  const [drives] = useState<Drive[]>(EMPTY_DRIVES);
  const [dashboardFiles] = useState<DashboardFile[]>(EMPTY_DASHBOARD_FILES);
  const [explorerFiles] = useState<ExplorerFile[]>(EMPTY_EXPLORER_FILES);
  const [apiLogs] = useState<ApiLog[]>(defaultApiLogs);
  const [storageName, setStorageNameState] = useState(() => localStorage.getItem('ms_name') || 'My Storage');
  const [routingMode, setRoutingModeState] = useState<RoutingMode>(() => (localStorage.getItem('ms_routing') as RoutingMode) || DEFAULT_ROUTING_MODE);

  const [storageNodes, setStorageNodes] = useState<StorageNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [storagePool, setStoragePool] = useState<StoragePoolSummary | null>(null);

  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const login = useCallback(async (passcode: string): Promise<{ success: boolean; error?: PasscodeError }> => {
    try {
      const result = await driveApi.validatePasscode(passcode);
      if (result.success) setAuthed(true);
      return result;
    } catch {
      return { success: false, error: 'network' };
    }
  }, []);

  const logout = useCallback(async () => {
    await driveApi.logoutSession();
    setAuthed(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isAuthed = await driveApi.checkSession();
        if (!cancelled) {
          setAuthed(isAuthed);
          setAuthLoading(false);
        }
      } catch {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [currentFolderName, setCurrentFolderName] = useState('My Storage');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const [uploadSessions, setUploadSessions] = useState<UploadSession[]>([]);

  const toastTimer = useRef<number | undefined>(undefined);
  const fileLoadAbort = useRef<AbortController | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (toastMsg) {
      const id = window.setTimeout(() => setToastMsg(''), 2500);
      toastTimer.current = id;
      return () => window.clearTimeout(id);
    }
  }, [toastMsg]);

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark-demo');
    else document.body.classList.remove('dark-demo');
    localStorage.setItem('ms_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((p) => (p === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const setStorageName = useCallback((n: string) => {
    setStorageNameState(n);
    localStorage.setItem('ms_name', n);
  }, []);

  const setRoutingMode = useCallback((m: RoutingMode) => {
    setRoutingModeState(m);
    localStorage.setItem('ms_routing', m);
  }, []);

  const refreshStorageNodes = useCallback(async () => {
    setLoadingNodes(true);
    try {
      const [nodes, pool] = await Promise.all([
        driveApi.fetchStorageNodesWithQuota(),
        driveApi.fetchStoragePool().catch(() => null),
      ]);
      setStorageNodes(nodes);
      if (pool) setStoragePool(pool);
    } catch {
      setStorageNodes([]);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  // Load storage nodes on mount
  useEffect(() => {
    void refreshStorageNodes();
  }, [refreshStorageNodes]);

  // Check for OAuth redirect params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    if (oauthResult === 'success') {
      toast('Google Drive connected successfully');
      void refreshStorageNodes();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthResult === 'error') {
      toast('Unable to connect Google Drive. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, refreshStorageNodes]);

  const connectGoogleDrive = useCallback(() => {
    window.location.href = getOAuthUrl();
  }, []);

  const disconnectStorageNode = useCallback(async (nodeId: string) => {
    try {
      await deleteStorageNode(nodeId);
      setStorageNodes((prev) => prev.filter((n) => n.id !== nodeId));
      toast('Google Drive disconnected');
      void refreshStorageNodes();
    } catch {
      toast('Failed to disconnect. Please try again.');
    }
  }, [toast, refreshStorageNodes]);

  const refreshStorageNode = useCallback(async (nodeId: string) => {
    try {
      await driveApi.refreshNode(nodeId);
      toast('Drive refreshed');
      void refreshStorageNodes();
    } catch {
      toast('Failed to refresh drive');
    }
  }, [toast, refreshStorageNodes]);

  const setNodePriority = useCallback(async (nodeId: string, priority: number) => {
    try {
      await driveApi.setNodePriority(nodeId, priority);
      toast('Priority updated');
      void refreshStorageNodes();
    } catch {
      toast('Failed to update priority');
    }
  }, [toast, refreshStorageNodes]);

  const toggleNodeEnabled = useCallback(async (nodeId: string, enabled: boolean) => {
    try {
      await driveApi.toggleNodeEnabled(nodeId, enabled);
      toast(enabled ? 'Drive enabled' : 'Drive disabled');
      void refreshStorageNodes();
    } catch {
      toast('Failed to update drive');
    }
  }, [toast, refreshStorageNodes]);

  // ============ File Navigation ============

  const refreshFiles = useCallback(async () => {
    if (fileLoadAbort.current) {
      fileLoadAbort.current.abort();
    }
    setLoadingFiles(true);
    try {
      let files: DriveFileItem[];
      if (currentView === 'trash') {
        files = await driveApi.fetchFiles({ trashed: true });
      } else if (currentView === 'starred') {
        files = await driveApi.fetchFiles({ starredOnly: true });
      } else if (currentView === 'photos') {
        files = await driveApi.fetchFiles({ typeFilter: 'img', folderId: 'root' });
      } else if (currentView === 'videos') {
        files = await driveApi.fetchFiles({ typeFilter: 'video', folderId: 'root' });
      } else if (currentView === 'folders') {
        files = await driveApi.fetchFiles({ typeFilter: 'folder', folderId: 'root' });
      } else if (currentView === 'files' || currentView === 'dashboard') {
        files = await driveApi.fetchFiles({ folderId: currentFolderId });
      } else {
        files = await driveApi.fetchFiles({ folderId: 'root' });
      }
      setDriveFiles(files);
    } catch {
      setDriveFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [currentView, currentFolderId]);

  useEffect(() => {
    if (storageNodes.some((n) => n.status === 'connected')) {
      void refreshFiles();
    } else {
      setDriveFiles([]);
    }
  }, [currentView, currentFolderId, storageNodes, refreshFiles]);

  const navigateToFolder = useCallback((folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
  }, []);

  const navigateToRoot = useCallback(() => {
    setCurrentFolderId('root');
    setCurrentFolderName('My Storage');
    setBreadcrumbs([]);
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (index < 0) {
      navigateToRoot();
      return;
    }
    const item = breadcrumbs[index];
    if (item) {
      setCurrentFolderId(item.id);
      setCurrentFolderName(item.name);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
    }
  }, [breadcrumbs, navigateToRoot]);

  const searchDriveFiles = useCallback(async (query: string): Promise<DriveFileItem[]> => {
    if (!query.trim()) return [];
    return await driveApi.searchFiles(query);
  }, []);

  // ============ File Operations ============

  const renameDriveFile = useCallback(async (fileId: string, nodeId: string, newName: string) => {
    await driveApi.renameFile(fileId, nodeId, newName);
    toast('File renamed');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const trashDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.trashFile(fileId, nodeId);
    toast('Moved to trash');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const untrashDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.untrashFile(fileId, nodeId);
    toast('File restored');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const starDriveFile = useCallback(async (fileId: string, nodeId: string, starred: boolean) => {
    await driveApi.starFile(fileId, nodeId, starred);
    void refreshFiles();
  }, [refreshFiles]);

  const copyDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.copyFile(fileId, nodeId);
    toast('File copied');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const moveDriveFile = useCallback(async (fileId: string, nodeId: string, newParentId: string) => {
    await driveApi.moveFile(fileId, nodeId, newParentId);
    toast('File moved');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const deleteDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.deleteFile(fileId, nodeId);
    toast('File deleted permanently');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const createDriveFolder = useCallback(async (nodeId: string, name: string, parentId?: string) => {
    await driveApi.createFolder(nodeId, name, parentId);
    toast('Folder created');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const shareDriveFile = useCallback(async (fileId: string, nodeId: string, access: string) => {
    await driveApi.shareFile(fileId, nodeId, access);
    toast('Share setting updated: ' + access);
    void refreshFiles();
  }, [toast, refreshFiles]);

  // ============ Upload Queue ============

  const refreshUploadSessions = useCallback(async () => {
    try {
      const sessions = await driveApi.fetchUploadSessions();
      setUploadSessions(sessions);
    } catch {
      // ignore
    }
  }, []);

  // Track active AbortControllers for cancel support
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map());

  const uploadFiles = useCallback(async (files: FileList, targetNodeId?: string) => {
    if (!files?.length) return;
    const connectedNodes = storageNodes.filter((n) => n.status === 'connected');
    if (connectedNodes.length === 0) {
      toast('No connected drive. Add a Google Drive first.');
      return;
    }

    for (const file of Array.from(files)) {
      try {
        // Route the file
        let nodeId: string;
        if (targetNodeId) {
          nodeId = targetNodeId;
        } else {
          const route = await driveApi.routeUpload(file.size / 1024 / 1024, routingMode);
          nodeId = route.nodeId;
        }

        // Init upload session
        const session = await driveApi.initUpload(
          nodeId,
          file.name,
          file.type || 'application/octet-stream',
          file.size,
          currentFolderId !== 'root' ? currentFolderId : undefined,
        );

        // Update UI immediately with session
        setUploadSessions((prev) => [...prev.filter((s) => s.id !== session.id), session]);

        // Set up AbortController for cancel
        const abortController = new AbortController();
        uploadAbortControllers.current.set(session.id, abortController);

        // Start the actual upload with progress tracking
        try {
          await driveApi.startUploadWithProgress(
            session.id,
            file,
            file.type || 'application/octet-stream',
            (uploaded, total) => {
              setUploadSessions((prev) => prev.map((s) =>
                s.id === session.id
                  ? { ...s, progress: Math.round((uploaded / total) * 100), status: 'uploading' }
                  : s
              ));
            },
            abortController.signal,
          );
          setUploadSessions((prev) => prev.map((s) =>
            s.id === session.id ? { ...s, status: 'completed', progress: 100 } : s
          ));
          toast(file.name + ' uploaded');
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setUploadSessions((prev) => prev.map((s) =>
              s.id === session.id ? { ...s, status: 'cancelled' } : s
            ));
            toast(file.name + ' upload cancelled');
          } else {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setUploadSessions((prev) => prev.map((s) =>
              s.id === session.id ? { ...s, status: 'failed', errorMessage: msg } : s
            ));
            toast(file.name + ': ' + msg);
          }
        } finally {
          uploadAbortControllers.current.delete(session.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        toast(file.name + ': ' + msg);
      }
    }

    void refreshUploadSessions();
    void refreshFiles();
  }, [storageNodes, routingMode, currentFolderId, toast, refreshUploadSessions, refreshFiles]);

  const retryUpload = useCallback(async (sessionId: string) => {
    try {
      await driveApi.retryUpload(sessionId);
      setUploadSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'queued', progress: 0, errorMessage: null } : s
      ));
      toast('Upload queued for retry');
      void refreshUploadSessions();
    } catch {
      toast('Retry failed');
    }
  }, [toast, refreshUploadSessions]);

  const cancelUpload = useCallback(async (sessionId: string) => {
    const controller = uploadAbortControllers.current.get(sessionId);
    if (controller) {
      controller.abort();
      uploadAbortControllers.current.delete(sessionId);
    }
    try {
      await driveApi.cancelUpload(sessionId);
      setUploadSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'cancelled' } : s
      ));
    } catch {
      // The abort may have already updated the session
    }
  }, []);

  const clearUploadSession = useCallback(async (sessionId: string) => {
    try {
      await driveApi.deleteUploadSession(sessionId);
      setUploadSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // ignore
    }
  }, []);

  const checkDuplicateFile = useCallback(async (filename: string, parentGoogleId?: string) => {
    return await driveApi.checkDuplicate(filename, parentGoogleId);
  }, []);

  const resetDemoData = useCallback(() => {
    localStorage.removeItem('ms_drives');
    localStorage.removeItem('ms_files');
    localStorage.removeItem('myStorageV3Files');
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    setDriveFiles([]);
    void refreshStorageNodes();
    void refreshFiles();
    toast('Storage pool refreshed');
  }, [toast, refreshStorageNodes, refreshFiles]);

  const exportData = useCallback(() => {
    const data = {
      name: storageName,
      storageNodes,
      storagePool,
      files: driveFiles.map((f) => ({ name: f.name, type: f.type, size: f.sizeLabel, drive: f.drive, modified: f.modified, starred: f.starred })),
      uploadSessions,
      routingMode,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-storage-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup JSON exported');
  }, [storageName, storageNodes, storagePool, driveFiles, uploadSessions, routingMode, toast]);

  return {
    theme,
    toggleTheme,
    setTheme,
    toastMsg,
    toast,
    currentView,
    setView,
    authLoading,
    authed,
    login,
    logout,
    drives,
    dashboardFiles,
    explorerFiles,
    apiLogs,
    storageName,
    setStorageName,
    routingMode,
    setRoutingMode,
    storageNodes,
    loadingNodes,
    storagePool,
    refreshStorageNodes,
    refreshStorageNode,
    connectGoogleDrive,
    disconnectStorageNode,
    setNodePriority,
    toggleNodeEnabled,
    driveFiles,
    loadingFiles,
    currentFolderId,
    currentFolderName,
    breadcrumbs,
    navigateToFolder,
    navigateToRoot,
    navigateToBreadcrumb,
    refreshFiles,
    searchDriveFiles,
    renameDriveFile,
    trashDriveFile,
    untrashDriveFile,
    starDriveFile,
    copyDriveFile,
    moveDriveFile,
    deleteDriveFile,
    createDriveFolder,
    shareDriveFile,
    uploadSessions,
    refreshUploadSessions,
    uploadFiles,
    retryUpload,
    cancelUpload,
    clearUploadSession,
    checkDuplicateFile,
    resetDemoData,
    exportData,
  };
}
