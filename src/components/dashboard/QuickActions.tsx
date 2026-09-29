import { useApp } from '@/context/AppContext';
import { Plus, HardDrive, ArrowLeftRight, Settings, Code2, FolderPlus } from 'lucide-react';

interface QuickActionsProps {
  onOpenUpload: () => void;
}

export function QuickActions({ onOpenUpload }: QuickActionsProps) {
  const { toast, setView, storageNodes, routingMode, createDriveFolder, currentFolderId } = useApp();
  const hasDrives = storageNodes.length > 0;
  const connectedNodes = storageNodes.filter((n) => n.status === 'connected');

  const handleNewFolder = async () => {
    if (!hasDrives || connectedNodes.length === 0) {
      toast('Add a storage node first');
      return;
    }
    const name = prompt('New folder name:');
    if (!name?.trim()) return;
    try {
      const firstNode = connectedNodes[0];
      await createDriveFolder(firstNode.id, name.trim(), currentFolderId !== 'root' ? currentFolderId : undefined);
    } catch {
      toast('Failed to create folder');
    }
  };

  const routingLabel = routingMode === 'automatic' ? 'Automatic' : routingMode === 'balanced' ? 'Balanced' : 'Manual';

  return (
    <div className="card quick">
      <h3>Quick Actions</h3>
      <div className="quickgrid">
        <button onClick={() => hasDrives ? onOpenUpload() : toast('Add a storage node first')}>
          <b><Plus size={13} /> Upload</b><span>Tambah file ke pool</span>
        </button>
        <button onClick={handleNewFolder}>
          <b><FolderPlus size={13} /> Folder</b><span>Buat folder baru</span>
        </button>
        <button onClick={() => setView('drives')}>
          <b><HardDrive size={13} /> Drives</b><span>Kelola storage</span>
        </button>
        <button onClick={() => toast('Routing mode: ' + routingLabel + ' · ' + connectedNodes.length + ' drives active')}>
          <b><ArrowLeftRight size={13} /> Routing</b><span>{routingLabel} · {connectedNodes.length} drives</span>
        </button>
        <button onClick={() => setView('settings')}>
          <b><Settings size={13} /> Settings</b><span>Konfigurasi pool</span>
        </button>
        <button onClick={() => setView('api')}>
          <b><Code2 size={13} /> API</b><span>Activity & logs</span>
        </button>
      </div>
    </div>
  );
}