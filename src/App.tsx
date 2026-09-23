import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { AppProvider } from '@/context/AppProvider';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { MobileHead } from '@/components/MobileHead';
import { Toast } from '@/components/Toast';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { FileExplorer } from '@/components/explorer/FileExplorer';
import { SimpleFileView } from '@/components/SimpleFileView';
import { SettingsView } from '@/components/SettingsView';
import { ApiView } from '@/components/ApiView';
import { LoginScreen } from '@/components/LoginScreen';
import { SetupScreen } from '@/components/SetupScreen';
import { UploadModal } from '@/components/modals/UploadModal';
import { PreviewModal } from '@/components/modals/PreviewModal';
import { ConvertModal } from '@/components/modals/ConvertModal';
import { GlobalSearchModal } from '@/components/modals/GlobalSearchModal';
import { ShortcutsHelpModal } from '@/components/modals/ShortcutsHelpModal';
import { FloatingUploadQueue } from '@/components/FloatingUploadQueue';
import { FolderSyncView } from '@/components/FolderSyncView';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { DashboardFile, ExplorerFile, DriveFileItem } from '@/types';

function AppContent() {
  const {
    currentView,
    authLoading,
    authed,
    authError,
    passcodeInitialized,
    login,
    setupAdminPasscode,
    uploadFiles,
    toast,
    setShortcutsHelpOpen,
    globalSearchOpen,
    setGlobalSearchOpen,
  } = useApp();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFileItem | DashboardFile | ExplorerFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewList, setPreviewList] = useState<DriveFileItem[]>([]);
  const [globalDragOver, setGlobalDragOver] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentView]);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    if (!authed) return;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setGlobalDragOver(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setGlobalDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setGlobalDragOver(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        void uploadFiles(e.dataTransfer.files);
        toast(e.dataTransfer.files.length + ' file' + (e.dataTransfer.files.length > 1 ? 's' : '') + ' added to upload queue');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [authed, uploadFiles, toast]);

  const shortcuts = useMemo(() => [
    { key: 'k', ctrl: true, handler: () => setGlobalSearchOpen(true) },
    { key: 'u', ctrl: true, handler: () => setUploadOpen(true) },
    { key: '/', ctrl: true, handler: () => setShortcutsHelpOpen(true) },
    { key: '/', handler: () => {
      const el = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null;
      el?.focus();
    } },
    { key: '?', handler: () => setShortcutsHelpOpen(true) },
  ], [setGlobalSearchOpen, setShortcutsHelpOpen]);

  useKeyboardShortcuts(shortcuts);

  const openPreview = (file: DriveFileItem | DashboardFile | ExplorerFile) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const openPreviewWithList = (file: DriveFileItem | DashboardFile | ExplorerFile, list?: DriveFileItem[]) => {
    setPreviewList(list || []);
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg, #0f172a)' }}>
        <div style={{ color: 'var(--text-dim, #94a3b8)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg, #0f172a)', gap: 16, padding: 20 }}>
        <div style={{ color: 'var(--text, #e2e8f0)', fontSize: 18, fontWeight: 600 }}>Connection Error</div>
        <div style={{ color: 'var(--text-dim, #94a3b8)', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
          Unable to reach the authentication server. Please check your connection and try again.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!authed && !passcodeInitialized) {
    return <SetupScreen onSetup={setupAdminPasscode} />;
  }

  if (!authed) {
    return <LoginScreen onLogin={login} />;
  }

  const showDashboard = currentView === 'dashboard';
  const showSettings = currentView === 'settings';
  const showApi = currentView === 'api';
  const showFolderSync = currentView === 'folder-sync';
  const explorerViews = ['files', 'shared', 'shared-folder', 'folders'];
  const showExplorer = explorerViews.includes(currentView);
  const simpleViews = ['recent', 'starred', 'photos', 'videos', 'trash', 'drives'];
  const showSimple = simpleViews.includes(currentView);

  return (
    <>
      <div className="app">
        <Sidebar
          onOpenConvert={() => setConvertOpen(true)}
          mobileOpen={drawerOpen}
          onMobileClose={() => setDrawerOpen(false)}
        />

        {drawerOpen && (
          <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
        )}

        <main>
          <MobileHead onMenuClick={() => setDrawerOpen(true)} />
          <TopBar onOpenUpload={() => setUploadOpen(true)} />
          {showDashboard && <DashboardView onOpenUpload={() => setUploadOpen(true)} onPreview={openPreview} />}
          {showExplorer && <FileExplorer onPreview={openPreviewWithList} />}
          {showSettings && <SettingsView />}
          {showApi && <ApiView />}
          {showFolderSync && <FolderSyncView />}
          {showSimple && <SimpleFileView onPreview={openPreviewWithList} />}
        </main>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} file={previewFile} fileList={previewList} />
      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} />
      <GlobalSearchModal open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} onPreview={openPreviewWithList} />
      <ShortcutsHelpModal />

      {globalDragOver && (
        <div className="global-drop-overlay">
          <div className="global-drop-inner">
            <div className="global-drop-icon">{'\u2191'}</div>
            <strong>Drop files to upload</strong>
            <span>Files will be routed to the best available drive</span>
          </div>
        </div>
      )}

      <FloatingUploadQueue />
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}