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
import * as notifications from '@/utils/notifications';
import * as shareApi from '@/utils/shareApi';
import type { ShareLink, CreateShareParams, ShareRole } from '@/utils/shareApi';
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

  const [authLoading, setAuthLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [passcodeInitialized, setPasscodeInitialized] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    () => notifications.isNotificationSupported() && notifications.getNotificationPermission() === 'granted'
  );
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    const perm = await notifications.requestNotificationPermission();
    const granted = perm === 'granted';
    setNotificationsEnabled(granted);
    if (granted) {
      notifications.notify('Notifications enabled', { body: 'You will be notified about uploads.' });
    }
    return granted;
  }, []);

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
    setCurrentVirtualFolderId(null); // FEDERATED
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
  const [currentVirtualFolderId, setCurrentVirtualFolderId] = useState<string | null>(null); // FEDERATED
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

  useEffect(() => {
    void refreshStorageNodes();
  }, [refreshStorageNodes]);

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
      case 'trash': return { trashed: true, pageSize: 50 };
      case 'starred': return { starredOnly: true, pageSize: 50 };
      case 'photos': return { typeFilter: 'img', pageSize: 50 };
      case 'videos': return { typeFilter: 'video', pageSize: 50 };
      case 'folders': return { typeFilter: 'folder', pageSize: 50 };
      case 'shared': return { sharedOnly: true, pageSize: 50 };
      case 'shared-folder': return { sharedOnly: true, typeFilter: 'folder', pageSize: 50 };
      case 'recent': return { pageSize: 50, orderBy: 'modifiedTime desc' };
      case 'drives': return { typeFilter: 'folder', pageSize: 50 };
      case 'files':
      case 'dashboard':
      default: return { folderId: currentFolderId, pageSize: 50 };
    }
  }, [currentView, currentFolderId]);

  // FEDERATED: refreshFiles cek virtualFolderId dulu
  const refreshFiles = useCallback(async () => {
    if (fileLoadAbort.current) fileLoadAbort.current.abort();
    setLoadingFiles(true);
    setFilesError(false);
    pageTokensRef.current = undefined;
    try {
      // Kalau sedang di virtual folder & bukan view spesial → pakai federated
      if (currentVirtualFolderId && (currentView === 'files' || currentView === 'dashboard')) {
        const files = await driveApi.fetchFederatedFolderFiles(currentVirtualFolderId);
        setDriveFiles(files);
        setHasMoreFiles(false);
        return;
      }

      // ROOT view: merge virtual folders
      if (!currentVirtualFolderId && currentFolderId === 'root' && (currentView === 'files' || currentView === 'dashboard')) {
        const [result, tree] = await Promise.all([
          driveApi.fetchFiles(buildFetchOpts()),
          driveApi.fetchVirtualFolderTree().catch(() => [] as any[]),
        ]);

        const ROOT_VF = '00000000-0000-0000-0000-000000000001';
        const rootVirtuals = (tree as any[]).filter((v) => v.parent_id === ROOT_VF || v.parent_id === null);

        // Nama folder fisik yang sudah ada (biar tidak duplikat)
        const physicalFolders = new Set(
          result.files.filter((f) => f.isFolder).map((f) => f.name.toLowerCase())
        );

        // Virtual folder yang belum ada fisiknya → tambahkan sebagai item
        const virtualItems = rootVirtuals
          .filter((v) => !physicalFolders.has(v.name.toLowerCase()))
          .map((v) => ({
            id: 'vf:' + v.id,
            nodeId: '__virtual__',
            name: v.name,
            type: 'folder' as const,
            mimeType: 'application/vnd.google-apps.folder',
            size: 0,
            sizeLabel: '—',
            modified: '—',
            modifiedRaw: null,
            createdRaw: v.created_at || null,
            drive: 'Virtual',
            driveEmail: '',
            starred: false,
            trashed: false,
            shared: false,
            thumbnail: null,
            webViewLink: null,
            webContentLink: null,
            isFolder: true,
            parentGoogleId: null,
          }));

        setDriveFiles([...virtualItems, ...result.files]);
        setHasMoreFiles(result.hasMore);
        pageTokensRef.current = result.pageTokens;
        return;
      }

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
  }, [buildFetchOpts, currentVirtualFolderId, currentView, currentFolderId]);

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
          if (!seen.has(f.id)) { merged.push(f); seen.add(f.id); }
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
      setCurrentVirtualFolderId(null); // FEDERATED
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
  }, [currentView, currentFolderId, currentVirtualFolderId, storageNodes, refreshFiles]);

  // LAZY MIGRATION: cek folder existing yang belum punya virtual ID
  useEffect(() => {
    if (currentView !== 'files' && currentView !== 'dashboard') return;
    if (currentVirtualFolderId) return; // sudah punya

    const currentF = driveFiles.find((f) => f.id === currentFolderId && f.isFolder);
    if (!currentF || currentF.id === 'root' || !currentF.nodeId) return;
    if (currentF.nodeId === '__virtual__') return;

    // Cek apakah folder fisik ini sudah punya virtual folder
    void (async () => {
      try {
        const tree = await driveApi.fetchVirtualFolderTree();
        for (const vf of tree) {
          try {
            const mappings = await driveApi.fetchVirtualFolderMappings(vf.id);
            if (mappings.some((m) => m.google_folder_id === currentFolderId)) {
              setCurrentVirtualFolderId(vf.id);
              return;
            }
          } catch { /* skip */ }
        }
        // Belum ada → register
        const result = await driveApi.registerExistingFolder(
          currentF.nodeId,
          currentFolderId,
          currentF.name,
          undefined,
          currentF.parentGoogleId || undefined,
        );
        setCurrentVirtualFolderId(result.virtualFolderId);
      } catch (err) {
        console.warn('Auto lazy migration failed:', err);
      }
    })();
  }, [currentFolderId, driveFiles, currentView, currentVirtualFolderId]);

  // FEDERATED: navigateToFolder terima virtualFolderId optional
  const navigateToFolder = useCallback((folderId: string, folderName: string) => {
    // Pindah ke view 'files' kalau dari view lain (Folders, Recent, dll)
    if (currentView !== 'files' && currentView !== 'dashboard') {
      setView('files');
    }

    // Kalau id berformat 'vf:uuid' → ini virtual folder
    if (folderId.startsWith('vf:')) {
      const vfId = folderId.slice(3);
      setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
      setCurrentFolderName(folderName);
      setCurrentVirtualFolderId(vfId);
      void (async () => {
        try {
          const mappings = await driveApi.fetchVirtualFolderMappings(vfId);
          if (mappings.length > 0) {
            setCurrentFolderId(mappings[0].google_folder_id);
          } else {
            setCurrentFolderId('root');
          }
        } catch {
          setCurrentFolderId('root');
        }
      })();
      return;
    }

    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
    
    // Kalau id berformat 'vf:uuid' → ini virtual folder
    if (folderId.startsWith('vf:')) {
      const vfId = folderId.slice(3);
      setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
      setCurrentFolderName(folderName);
      setCurrentVirtualFolderId(vfId);
      void (async () => {
        try {
          const mappings = await driveApi.fetchVirtualFolderMappings(vfId);
          if (mappings.length > 0) {
            setCurrentFolderId(mappings[0].google_folder_id);
          } else {
            setCurrentFolderId('root');
          }
        } catch {
          setCurrentFolderId('root');
        }
      })();
      return;
    }

    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    setBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);

    // LAZY MIGRATION: cari virtual folder yang match dengan google folder ID
    void (async () => {
      try {
        const tree = await driveApi.fetchVirtualFolderTree();
        for (const vf of tree) {
          try {
            const mappings = await driveApi.fetchVirtualFolderMappings(vf.id);
            if (mappings.some((m) => m.google_folder_id === folderId)) {
              // Sudah punya virtual folder → pakai
              setCurrentVirtualFolderId(vf.id);
              return;
            }
          } catch { /* skip */ }
        }

        // Belum ada virtual folder → LAZY MIGRATE
        // Cari nodeId dari folder fisik via driveFiles state
        const matchingFile = driveFiles.find((f) => f.id === folderId && f.isFolder);
        if (matchingFile && matchingFile.nodeId) {
          try {
            const result = await driveApi.registerExistingFolder(
              matchingFile.nodeId,
              folderId,
              folderName,
              undefined,
              matchingFile.parentGoogleId || undefined,
            );
            setCurrentVirtualFolderId(result.virtualFolderId);
          } catch (err) {
            console.warn('Lazy migration failed:', err);
            setCurrentVirtualFolderId(null);
          }
        } else {
          setCurrentVirtualFolderId(null);
        }
      } catch {
        setCurrentVirtualFolderId(null);
      }
    })();
  }, [driveFiles]);

  // FEDERATED: navigate pakai virtual folder ID eksplisit (dipanggil dari createVirtualFolder)
  const navigateToVirtualFolder = useCallback((virtualFolderId: string, googleFolderId: string, folderName: string) => {
    setCurrentVirtualFolderId(virtualFolderId);
    setCurrentFolderId(googleFolderId);
    setCurrentFolderName(folderName);
    setBreadcrumbs((prev) => [...prev, { id: googleFolderId, name: folderName }]);
  }, []);

  const navigateToRoot = useCallback(() => {
    setCurrentFolderId('root');
    setCurrentVirtualFolderId(null); // FEDERATED
    setCurrentFolderName('My Storage');
    setBreadcrumbs([]);
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (index < 0) { navigateToRoot(); return; }
    const item = breadcrumbs[index];
    if (item) {
      setCurrentFolderId(item.id);
      setCurrentFolderName(item.name);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      // Virtual ID tidak bisa di-restore dari breadcrumb, akan di-resolve otomatis
      void (async () => {
        try {
          const tree = await driveApi.fetchVirtualFolderTree();
          for (const vf of tree) {
            try {
              const mappings = await driveApi.fetchVirtualFolderMappings(vf.id);
              if (mappings.some((m) => m.google_folder_id === item.id)) {
                setCurrentVirtualFolderId(vf.id);
                return;
              }
            } catch { /* skip */ }
          }
          setCurrentVirtualFolderId(null);
        } catch {
          setCurrentVirtualFolderId(null);
        }
      })();
    }
  }, [breadcrumbs, navigateToRoot]);

  const searchDriveFiles = useCallback(async (query: string): Promise<DriveFileItem[]> => {
    if (!query.trim()) return [];
    return await driveApi.searchFiles(query);
  }, []);

  // ============ File Operations ============

  const renameDriveFile = useCallback(async (fileId: string, nodeId: string, newName: string) => {
    // Kalau virtual folder (id format 'vf:uuid' atau nodeId '__virtual__')
    if (fileId.startsWith('vf:') || nodeId === '__virtual__') {
      const vfId = fileId.startsWith('vf:') ? fileId.slice(3) : fileId;
      const result = await driveApi.renameVirtualFolder(vfId, newName);
      // Update UI di semua tempat
      setDriveFiles((prev) =>
        prev.map((f) =>
          f.id === fileId || f.id === vfId
            ? { ...f, name: newName }
            : f
        )
      );
      if (result.failed > 0) {
        toast(`Renamed di ${result.renamed} drive, ${result.failed} gagal`);
      } else if (result.renamed === 0) {
        toast('Renamed (belum ada folder fisik)');
      } else {
        toast(`Renamed di ${result.renamed} drive`);
      }
      return;
    }

    // File biasa
    const updated = await driveApi.renameFile(fileId, nodeId, newName);
    setDriveFiles((prev) => prev.map((f) => f.id === fileId && f.nodeId === nodeId ? { ...f, name: updated.name } : f));
    toast('File renamed');
  }, [toast]);
  const trashDriveFile = useCallback(async (fileId: string, nodeId: string) => {
    // Kalau virtual folder
    if (fileId.startsWith('vf:') || nodeId === '__virtual__') {
      const vfId = fileId.startsWith('vf:') ? fileId.slice(3) : fileId;
      const result = await driveApi.deleteVirtualFolder(vfId);
      setDriveFiles((prev) => prev.filter((f) => f.id !== fileId && f.id !== vfId));
      if (result.failed > 0) {
        toast(`Dihapus di ${result.trashed} drive, ${result.failed} gagal`);
      } else {
        toast(`Folder dipindah ke Trash di ${result.trashed} drive`);
      }
      return;
    }

    // File biasa
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

  // FEDERATED: createDriveFolder bikin virtual folder + mapping
  const createDriveFolder = useCallback(async (nodeId: string, name: string, parentId?: string) => {
    try {
      // 1. Bikin virtual folder di DB (parent = root kalau tidak ada)
      const virtualFolder = await driveApi.createVirtualFolder(name, parentId ? undefined : undefined);

      // 2. Bikin folder fisik di node yang dipilih
      const physical = await driveApi.createFolder(nodeId, name, parentId);

      // 3. Bikin mapping virtual → physical
      // Endpoint ensure-mapping akan bikin folder di node target (kalau belum ada), jadi tinggal panggil
      await driveApi.ensureFolderMapping(virtualFolder.id, nodeId);

      toast('Folder created');
      // Navigasi ke folder baru (dengan virtual ID)
      navigateToVirtualFolder(virtualFolder.id, physical.id, name);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create folder');
      throw err;
    }
  }, [toast, navigateToVirtualFolder]);

  const shareDriveFile = useCallback(async (fileId: string, nodeId: string, access: string) => {
    await driveApi.shareFile(fileId, nodeId, access);
    toast('Share setting updated: ' + access);
    void refreshFiles();
  }, [toast, refreshFiles]);

  // ============ Upload Queue ============

  const MAX_CONCURRENT_UPLOADS = 5;

  const fileRegistry = useRef<Map<string, File>>(new Map());
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const uploadQueueRef = useRef<string[]>([]);
  const activeUploadCount = useRef(0);

  const refreshUploadSessions = useCallback(async () => {
    try {
      const sessions = await driveApi.fetchUploadSessions();
      setUploadSessions(sessions);
    } catch { /* ignore */ }
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

        setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'uploading', progress: 0 } : s));

        try {
          await driveApi.startUploadWithProgress(
            sessionId, file, file.type || 'application/octet-stream',
            (uploaded, total) => {
              setUploadSessions((prev) => prev.map((s) =>
                s.id === sessionId ? { ...s, progress: Math.round((uploaded / total) * 100), status: 'uploading' } : s
              ));
            },
            abortController.signal,
          );
          setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'completed', progress: 100 } : s));
          if (uploadQueue.isIndexedDBSupported()) void uploadQueue.deletePendingUpload(sessionId);
          toast(file.name + ' uploaded');
          if (notificationsEnabled) notifications.notifyUploadComplete(file.name);
          void refreshFiles();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'cancelled' } : s));
          } else {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'failed', errorMessage: msg } : s));
            if (notificationsEnabled) notifications.notifyUploadFailed(file.name, msg);
          }
        } finally {
          uploadAbortControllers.current.delete(sessionId);
          activeUploadCount.current--;
          void processQueue();
        }
      })();
    }
  }, [toast, refreshFiles, notificationsEnabled]);

  const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  };

  // FEDERATED: uploadFiles ensure-mapping sebelum upload
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
        if (targetNodeId) nodeId = targetNodeId;
        else {
          const route = await driveApi.routeUpload(file.size / 1024 / 1024, routingMode);
          nodeId = route.nodeId;
        }

        // FEDERATED: kalau di virtual folder, ensure-mapping dulu supaya folder fisik ada di drive target
        let effectiveParentId: string | undefined = currentFolderId !== 'root' ? currentFolderId : undefined;

        if (currentVirtualFolderId) {
          try {
            const mapping = await driveApi.ensureFolderMapping(currentVirtualFolderId, nodeId);
            effectiveParentId = mapping.folderId;
          } catch (err) {
            console.warn('ensure-mapping failed, falling back to current folder:', err);
          }
        }

        const session = await driveApi.initUpload(
          nodeId, cleanName, mimeType, file.size,
          effectiveParentId,
        );

        fileRegistry.current.set(session.id, file);

        if (uploadQueue.isIndexedDBSupported()) {
          try {
            await uploadQueue.savePendingUpload({
              sessionId: session.id, nodeId, filename: cleanName, mimeType,
              size: file.size,
              parentGoogleId: effectiveParentId || null,
              blob: file.slice(0, file.size),
              createdAt: Date.now(),
            });
          } catch { /* ignore */ }
        }

        setUploadSessions((prev) => [...prev.filter((s) => s.id !== session.id), { ...session, status: 'queued', progress: 0 }]);
        uploadQueueRef.current.push(session.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to queue upload';
        toast(file.name + ': ' + msg);
      }
    }

    void processQueue();
  }, [storageNodes, routingMode, currentFolderId, currentVirtualFolderId, toast, processQueue]);

  const retryUpload = useCallback(async (sessionId: string) => {
    const file = fileRegistry.current.get(sessionId);
    if (!file) { toast('Cannot retry — file data no longer available'); return; }
    try {
      await driveApi.retryUpload(sessionId);
      setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'queued', progress: 0, errorMessage: null } : s));
      uploadQueueRef.current.push(sessionId);
      void processQueue();
    } catch { toast('Retry failed'); }
  }, [toast, processQueue]);

  const cancelUpload = useCallback(async (sessionId: string) => {
    const controller = uploadAbortControllers.current.get(sessionId);
    if (controller) { controller.abort(); uploadAbortControllers.current.delete(sessionId); }
    uploadQueueRef.current = uploadQueueRef.current.filter((id) => id !== sessionId);
    try {
      await driveApi.cancelUpload(sessionId);
      setUploadSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'cancelled' } : s));
    } catch { /* ignore */ }
  }, []);

  const clearUploadSession = useCallback(async (sessionId: string) => {
    if (uploadQueue.isIndexedDBSupported()) void uploadQueue.deletePendingUpload(sessionId);
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

  // ============ Versioning ============

  const fetchVersions = useCallback(async (fileId: string, nodeId: string) => {
    return await driveApi.fetchFileVersions(fileId, nodeId);
  }, []);

  const restoreVersion = useCallback(async (versionId: string) => {
    await driveApi.restoreFileVersion(versionId);
    toast('Version restored');
    void refreshFiles();
  }, [toast, refreshFiles]);

  // ============ Deduplication ============

  const checkDeduplication = useCallback(async (file: File) => {
    try {
      const hash = await computeFileHash(file);
      const result = await driveApi.checkDedup(hash, file.size);
      return { ...result, hash };
    } catch {
      return { exists: false };
    }
  }, []);

  // ============ Share Links ============

  const refreshShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const list = await shareApi.fetchShares();
      setShareLinks(list);
    } catch {
      setShareLinks([]);
    } finally {
      setLoadingShares(false);
    }
  }, []);

  const createShareLink = useCallback(async (params: CreateShareParams) => {
    const result = await shareApi.createShare(params);
    await refreshShares();
    return result;
  }, [refreshShares]);

  const revokeShareLink = useCallback(async (id: string) => {
    await shareApi.revokeShare(id);
    setShareLinks((prev) => prev.filter((s) => s.id !== id));
    toast('Share link revoked');
  }, [toast]);

  const updateShareLink = useCallback(async (id: string, patch: Partial<{ role: ShareRole }>) => {
    await shareApi.updateShare(id, patch);
    await refreshShares();
    toast('Share updated');
  }, [refreshShares, toast]);

  // ============ Data ops ============

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

  useEffect(() => {
    if (!authed) return;
    if (!uploadQueue.isIndexedDBSupported()) return;

    void (async () => {
      try {
        const pending = await uploadQueue.getAllPendingUploads();
        if (pending.length === 0) return;

        toast(`${pending.length} upload(s) interrupted — resuming...`);
        if (notificationsEnabled) notifications.notifyResumed(pending.length);

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
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  return {
    theme, toggleTheme, setTheme,
    toastMsg, toast,
    currentView, setView,
    authLoading, authed, authError, passcodeInitialized,
    login, setupAdminPasscode, logout,
    drives, dashboardFiles, explorerFiles, apiLogs,
    storageName, setStorageName,
    routingMode, setRoutingMode,
    storageNodes, loadingNodes, nodesError, storagePool,
    refreshStorageNodes, refreshStorageNode,
    connectGoogleDrive, disconnectStorageNode,
    setNodePriority, toggleNodeEnabled,
    driveFiles, loadingFiles, loadingMoreFiles, hasMoreFiles, filesError,
    currentFolderId, currentFolderName, breadcrumbs,
    currentVirtualFolderId, // FEDERATED
    navigateToFolder, navigateToVirtualFolder, navigateToRoot, navigateToBreadcrumb, // FEDERATED: navigateToVirtualFolder
    refreshFiles, loadMoreFiles, searchDriveFiles,
    renameDriveFile, trashDriveFile, untrashDriveFile, starDriveFile,
    copyDriveFile, moveDriveFile, deleteDriveFile, createDriveFolder, shareDriveFile,
    uploadSessions, refreshUploadSessions, uploadFiles, retryUpload, cancelUpload, clearUploadSession,
    checkDuplicateFile,
    resetData, exportData,
    fetchVersions, restoreVersion,
    checkDeduplication,
    notificationsEnabled, enableNotifications,
    shortcutsHelpOpen, setShortcutsHelpOpen,
    globalSearchOpen, setGlobalSearchOpen,
    shareLinks, loadingShares, refreshShares, createShareLink, revokeShareLink, updateShareLink,
  };
}