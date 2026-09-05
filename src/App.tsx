import { useState, useEffect } from 'react';
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
import type { DashboardFile, ExplorerFile, DriveFileItem } from '@/types';

function AppContent() {
  const { currentView, authLoading, authed, authError, passcodeInitialized, login, setupAdminPasscode } = useApp();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFileItem | DashboardFile | ExplorerFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const closeContext = () => { /* context menu closes itself */ };
    document.addEventListener('click', closeContext);
    return () => document.removeEventListener('click', closeContext);
  }, []);

  const openPreview = (file: DriveFileItem | DashboardFile | ExplorerFile) => {
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg, #0f172a)', gap: 16 }}>
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

  const showExplorer = currentView === 'files';
  const showDashboard = currentView === 'dashboard';
  const showSettings = currentView === 'settings';
  const showApi = currentView === 'api';
  const showSimple = !showExplorer && !showDashboard && !showSettings && !showApi;

  return (
    <>
      <div className="app">
        <Sidebar onOpenConvert={() => setConvertOpen(true)} />
        <main>
          <MobileHead />
          <TopBar onOpenUpload={() => setUploadOpen(true)} />
          {showDashboard && <DashboardView onOpenUpload={() => setUploadOpen(true)} onPreview={openPreview} />}
          {showExplorer && <FileExplorer onPreview={openPreview} />}
          {showSettings && <SettingsView />}
          {showApi && <ApiView />}
          {showSimple && <SimpleFileView onPreview={openPreview} />}
        </main>
      </div>
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} file={previewFile} />
      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} />
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
