import { useState, useCallback, useEffect, useRef } from 'react';
import type { Drive, DashboardFile, ExplorerFile, Theme, ViewName, ApiLog, RoutingMode, StorageNode, DriveFileItem, UploadSession, StoragePoolSummary, BreadcrumbItem } from '@/types';
import {
  EMPTY_DRIVES,
  EMPTY_DASHBOARD_FILES,
  EMPTY_EXPLORER_FILES,
  CURRENT_STORAGE_VERSION,
  STORAGE_VERSION_KEY,
  DEFAULT_ROUTING_MODE,
} from '@/data/appData';
import { deleteStorageNode, getOAuthUrl } from '@/utils/storageNodes';
import * as driveApi from '@/utils/driveApi';
import { computeFileHash } from '@/utils/fileHash';
import * as uploadQueue from '@/utils/uploadQueue';
import type { AppContextValue } from './AppContext';

import type { PasscodeError } from '@/utils/driveApi';
import { checkAuthStatus, setupPasscode as setupPasscodeApi } from '@/utils/driveApi';

export function useAppState(): AppContextValue {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('ms_theme') as Theme) || 'light');
  const [currentView, setView] = useState<ViewName>('dashboard');
  const [toastMsg, setToastMsg] = useState('');

  const [drives] = useState<Drive[]>(EMPTY_DRIVES);
  const [dashboardFiles] = useState<DashboardFile[]>(EMPTY_DASHBOARD_FILES);
  const [explorerFiles] = useState<ExplorerFile[]>(EMPTY_EXPLORER_FILES);
  const [apiLogs] = useState<ApiLog[]>([]);
  const [storageName, setStorageNameState] = useState(() => localStorage.getItem('ms_name') || 'My Storage');
  const [routingMode, setRoutingModeState] = useState<RoutingMode>(() => (localStorage.getItem('ms_routing') as RoutingMode) || DEFAULT_ROUTING_MODE);

  const [storageNodes, setStorageNodes] = useState<StorageNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [nodesError, setNodesError] = useState(false);
  const [storagePool, setStoragePool] = useState<StoragePoolSummary | null>(null);

  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [passcodeInitialized, setPasscodeInitialized] = useState(false);

  const refreshStorageNodes = useCallback(async () => {
    setLoadingNodes(true);
    setNodesError(false);
    try {
      const [nodes, pool] = await Promise.all([
        driveApi.fetchStorageNodesWithQuota(),
        driveApi.fetchStoragePool().catch(() => null),
      ]);
      setStorageNodes(nodes);
      if (pool) setStoragePool(pool);
    } catch {
      setStorageNodes([]);
      setNodesError(true);
    } finally {
      setLoadingNodes(false);
    }
  }, []);

  const login = useCallback(async (passcode: string): Promise<{ success: boolean; error?: PasscodeError }> => {
    try {
      const result = await driveApi.validatePasscode(passcode);
      if (result.success) {
        setAuthed(true);
        void refreshStorageNodes();
      }
      return result;
    } catch {
      return { success: false, error: 'network' };
    }
  }, [refreshStorageNodes]);

  const setupAdminPasscode = useCallback(async (passcode: string, confirm: string): Promise<{ success: boolean; error?: PasscodeError }> => {
    try {
      const result = await setupPasscodeApi(passcode, confirm);
      if (result.success) {
        setAuthed(true);
        setPasscodeInitialized(true);
        void refreshStorageNodes();
      }
      return result;
    } catch {
      return { success: false, error: 'network' };
    }
  }, [refreshStorageNodes]);

  const logout = useCallback(async () => {
    await driveApi.logoutSession();
    setAuthed(false);
    setDriveFiles([]);
    setHasMoreFiles(false);
    setFilesError(false);
    setCurrentFolderId('root');
    setCurrentFolderName('My Storage');
    setBreadcrumbs([]);
    setUploadSessions([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await checkAuthStatus();
        if (!cancelled) {
          if (status.error) {
            setAuthError(true);
          } else {
            setAuthError(false);
            setPasscodeInitialized(status.passcodeInitialized);
            setAuthed(status.authed);
          }
          setAuthLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAuthError(true);
          setAuthLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingMoreFiles, setLoadingMoreFiles] = useState(false);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [filesError, setFilesError] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [currentFolderName, setCurrentFolderName] = useState('My Storage');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const pageTokensRef = useRef<Record<string, string> | undefined>(undefined);

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
    if (theme === 'dark') document.body.classList.add('dark-theme');
    else document.body.classList.remove('dark-theme');
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

  const buildFetchOpts = useCallback((): Parameters<typeof driveApi.fetchFiles>[0] => {
    switch (currentView) {
      case 'trash':
        return { trashed: true, pageSize: 50 };
      case 'starred':
        return { starredOnly: true, pageSize: 50 };
      case 'photos':
        return { typeFilter: 'img', pageSize: 50 };
      case 'videos':
        return { typeFilter: 'video', pageSize: 50 };
      case 'folders':
        return { typeFilter: 'folder', pageSize: 50 };
      case 'shared':
        return { sharedOnly: true, pageSize: 50 };
      case 'shared-folder':
        return { sharedOnly: true, typeFilter: 'folder', pageSize: 50 };
      case 'recent':
        return { pageSize: 50, orderBy: 'modifiedTime desc' };
      case 'drives':
        return { typeFilter: 'folder', pageSize: 50 };
      case 'files':
      case 'dashboard':
      default:
        return { folderId: currentFolderId, pageSize: 50 };
    }
  }, [currentView, currentFolderId]);

  const refreshFiles = useCallback(async () => {
    if (fileLoadAbort.current) {
      fileLoadAbort.current.abort();
    }
    setLoadingFiles(true);
    setFilesError(false);
    pageTokensRef.current = undefined;
    try {
      const result = await driveApi.fetchFiles(buildFetchOpts());
      setDriveFiles(result.files);
      setHasMoreFiles(result.hasMore);
      pageTokensRef.current = result.pageTokens;
    } catch {
      setDriveFiles([]);
      setHasMoreFiles(false);
      setFilesError(true);
    } finally {
      setLoadingFiles(false);
    }
  }, [buildFetchOpts]);

  const loadMoreFiles = useCallback(async () => {
    if (loadingMoreFiles || !hasMoreFiles) return;
    const tokens = pageTokensRef.current;
    if (!tokens) return;
    setLoadingMoreFiles(true);
    try {
      const firstToken = Object.values(tokens)[0];
      const result = await driveApi.fetchFiles({ ...buildFetchOpts(), pageToken: firstToken });
      setDriveFiles((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        const merged = [...prev];
        for (const f of result.files) {
          if (!seen.has(f.id)) {
            merged.push(f);
            seen.add(f.id);
          }
        }
        return merged;
      });
      setHasMoreFiles(result.hasMore);
      pageTokensRef.current = result.pageTokens;
    } catch {
      setHasMoreFiles(false);
    } finally {
      setLoadingMoreFiles(false);
    }
  }, [buildFetchOpts, loadingMoreFiles, hasMoreFiles]);

  useEffect(() => {
    if (currentView !== 'files' && currentView !== 'dashboard') {
      setCurrentFolderId('root');
      setCurrentFolderName('My Storage');
      setBreadcrumbs([]);
    }
  }, [currentView]);

  useEffect(() => {
    if (storageNodes.some((n) => n.status === 'connected')) {
      void refreshFiles();
    } else {
      setDriveFiles([]);
      setHasMoreFiles(false);
      setFilesError(false);
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
    const updated = await driveApi.renameFile(fileId, nodeId, newName);
    setDriveFiles((prev) => prev.map((f) => f.id === fileId && f.nodeId === nodeId ? { ...f, name: updated.name } : f));
    toast('File renamed');
  }, [toast]);

  const trashDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.trashFile(fileId, nodeId);
    setDriveFiles((prev) => prev.filter((f) => !(f.id === fileId && f.nodeId === nodeId)));
    toast('Moved to trash');
  }, [toast]);

  const untrashDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.untrashFile(fileId, nodeId);
    toast('File restored');
    void refreshFiles();
  }, [toast, refreshFiles]);

  const starDriveFile = useCallback(async (fileId: string, nodeId: string, starred: boolean) => {
    await driveApi.starFile(fileId, nodeId, starred);
    setDriveFiles((prev) => prev.map((f) => f.id === fileId && f.nodeId === nodeId ? { ...f, starred } : f));
  }, []);

  const copyDriveFile = useCallback(async (fileId: string, nodeId: string, destNodeId?: string, destFolderId?: string) => {
    const copied = await driveApi.copyFile(fileId, nodeId, destNodeId, destFolderId);
    if (!destNodeId || destNodeId === nodeId) {
      setDriveFiles((prev) => [...prev, copied]);
    } else {
      void refreshFiles();
    }
    toast('File copied');
  }, [toast, refreshFiles]);

  const moveDriveFile = useCallback(async (fileId: string, nodeId: string, newParentId: string, destNodeId?: string) => {
    await driveApi.moveFile(fileId, nodeId, newParentId, destNodeId);
    setDriveFiles((prev) => prev.filter((f) => !(f.id === fileId && f.nodeId === nodeId)));
    toast('File moved');
  }, [toast]);

  const deleteDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    await driveApi.deleteFile(fileId, nodeId);
    setDriveFiles((prev) => prev.filter((f) => !(f.id === fileId && f.nodeId === nodeId)));
    toast('File deleted permanently');
  }, [toast]);

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

  // ============ Upload Queue (5-concurrent) ============

  const MAX_CONCURRENT_UPLOADS = 5;

  const fileRegistry = useRef<Map<string, File>>(new Map());
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const uploadQueueRef = useRef<string[]>([]);
  const activeUploadCount = useRef(0);

  const refreshUploadSessions = useCallback(async () => {
    try {
      const sessions = await driveApi.fetchUploadSessions();
      setUploadSessions(sessions);
    } catch {
      // ignore
    }
  }, []);

  const processQueue = useCallback(async () => {
    while (uploadQueueRef.current.length > 0 && activeUploadCount.current < MAX_CONCURRENT_UPLOADS) {
      const sessionId = uploadQueueRef.current.shift();
      if (!sessionId) break;
      const file = fileRegistry.current.get(sessionId);
      if (!file) continue;

      activeUploadCount.current++;
      void (async () => {
        const abortController = new AbortController();
        uploadAbortControllers.current.set(sessionId, abortController);

        setUploadSessions((prev) => prev.map((s) =>
          s.id === sessionId ? { ...s, status: 'uploading', progress: 0 } : s
        ));

        try {
          await driveApi.startUploadWithProgress(
            sessionId,
            file,
            file.type || 'application/octet-stream',
            (uploaded, total) => {
              setUploadSessions((prev) => prev.map((s) =>
                s.id === sessionId
                  ? { ...s, progress: Math.round((uploaded / total) * 100), status: 'uploading' }
                  : s
              ));
            },
            abortController.signal,
          );
          setUploadSessions((prev) => prev.map((s) =>
            s.id === sessionId ? { ...s, status: 'completed', progress: 100 } : s
          ));
          // Remove from IndexedDB queue
          if (uploadQueue.isIndexedDBSupported()) {
            void uploadQueue.deletePendingUpload(sessionId);
          }
          toast(file.name + ' uploaded');
          void refreshFiles();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setUploadSessions((prev) => prev.map((s) =>
              s.id === sessionId ? { ...s, status: 'cancelled' } : s
            ));
          } else {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setUploadSessions((prev) => prev.map((s) =>
              s.id === sessionId ? { ...s, status: 'failed', errorMessage: msg } : s
            ));
          }
        } finally {
          uploadAbortControllers.current.delete(sessionId);
          activeUploadCount.current--;
          void processQueue();
        }
      })();
    }
  }, [toast, refreshFiles]);

  const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  };

  const uploadFiles = useCallback(async (files: FileList | File[], targetNodeId?: string) => {
    if (!files || (files instanceof FileList ? files.length === 0 : (files as File[]).length === 0)) return;
    const connectedNodes = storageNodes.filter((n) => n.status === 'connected');
    if (connectedNodes.length === 0) {
      toast('No connected drive. Add a Google Drive first.');
      return;
    }

    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const cleanName = sanitizeFilename(file.name);
      const mimeType = file.type || 'application/octet-stream';

      try {
        let nodeId: string;
        if (targetNodeId) {
          nodeId = targetNodeId;
        } else {
          const route = await driveApi.routeUpload(file.size / 1024 / 1024, routingMode);
          nodeId = route.nodeId;
        }

        const session = await driveApi.initUpload(
          nodeId,
          cleanName,
          mimeType,
          file.size,
          currentFolderId !== 'root' ? currentFolderId : undefined,
        );

        fileRegistry.current.set(session.id, file);

        // Persist to IndexedDB for resume-after-reload
        if (uploadQueue.isIndexedDBSupported()) {
          try {
            await uploadQueue.savePendingUpload({
              sessionId: session.id,
              nodeId,
              filename: cleanName,
              mimeType,
              size: file.size,
              parentGoogleId: currentFolderId !== 'root' ? currentFolderId : null,
              blob: file.slice(0, file.size),
              createdAt: Date.now(),
            });
          } catch {
            // IndexedDB might fail in private mode — ignore
          }
        }

        setUploadSessions((prev) => [...prev.filter((s) => s.id !== session.id), { ...session, status: 'queued', progress: 0 }]);
        uploadQueueRef.current.push(session.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to queue upload';
        toast(file.name + ': ' + msg);
      }
    }

    void processQueue();
  }, [storageNodes, routingMode, currentFolderId, toast, processQueue]);

  const retryUpload = useCallback(async (sessionId: string) => {
    const file = fileRegistry.current.get(sessionId);
    if (!file) {
      toast('Cannot retry — file data no longer available');
      return;
    }

    try {
      await driveApi.retryUpload(sessionId);
      setUploadSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'queued', progress: 0, errorMessage: null } : s
      ));
      uploadQueueRef.current.push(sessionId);
      void processQueue();
    } catch {
      toast('Retry failed');
    }
  }, [toast, processQueue]);

  const cancelUpload = useCallback(async (sessionId: string) => {
    const controller = uploadAbortControllers.current.get(sessionId);
    if (controller) {
      controller.abort();
      uploadAbortControllers.current.delete(sessionId);
    }
    uploadQueueRef.current = uploadQueueRef.current.filter((id) => id !== sessionId);
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
    if (uploadQueue.isIndexedDBSupported()) {
      void uploadQueue.deletePendingUpload(sessionId);
    }
    uploadQueueRef.current = uploadQueueRef.current.filter((id) => id !== sessionId);
    fileRegistry.current.delete(sessionId);
    try {
      await driveApi.deleteUploadSession(sessionId);
      setUploadSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      setUploadSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
  }, []);

  const checkDuplicateFile = useCallback(async (filename: string, parentGoogleId?: string) => {
    return await driveApi.checkDuplicate(filename, parentGoogleId);
  }, []);

  // ============ Versioning (Phase 10) ============

  const fetchVersions = useCallback(async (fileId: string, nodeId: string) => {
    return await driveApi.fetchFileVersions(fileId, nodeId);
  }, []);

  const restoreVersion = useCallback(async (versionId: string) => {
    await driveApi.restoreFileVersion(versionId);
    toast('Version restored');
    void refreshFiles();
  }, [toast, refreshFiles]);

  // ============ Deduplication (Phase 10) ============

  const checkDeduplication = useCallback(async (file: File) => {
    try {
      const hash = await computeFileHash(file);
      const result = await driveApi.checkDedup(hash, file.size);
      return { ...result, hash };
    } catch {
      return { exists: false };
    }
  }, []);

  const resetData = useCallback(() => {
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

  // Resume pending uploads from IndexedDB on mount
  useEffect(() => {
    if (!authed) return;
    if (!uploadQueue.isIndexedDBSupported()) return;

    void (async () => {
      try {
        const pending = await uploadQueue.getAllPendingUploads();
        if (pending.length === 0) return;

        toast(`${pending.length} upload(s) interrupted — resuming...`);

        for (const item of pending) {
          try {
            const file = new File([item.blob], item.filename, { type: item.mimeType });
            fileRegistry.current.set(item.sessionId, file);
            uploadQueueRef.current.push(item.sessionId);
          } catch {
            await uploadQueue.deletePendingUpload(item.sessionId);
          }
        }
        void processQueue();
      } catch {
        // ignore
      }
    })();
  }, [authed, toast, processQueue]);

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
    authError,
    passcodeInitialized,
    login,
    setupAdminPasscode,
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
    nodesError,
    storagePool,
    refreshStorageNodes,
    refreshStorageNode,
    connectGoogleDrive,
    disconnectStorageNode,
    setNodePriority,
    toggleNodeEnabled,
    driveFiles,
    loadingFiles,
    loadingMoreFiles,
    hasMoreFiles,
    filesError,
    currentFolderId,
    currentFolderName,
    breadcrumbs,
    navigateToFolder,
    navigateToRoot,
    navigateToBreadcrumb,
    refreshFiles,
    loadMoreFiles,
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
    resetData,
    exportData,
    fetchVersions,
    restoreVersion,
    checkDeduplication,
  };
}