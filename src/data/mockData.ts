import type { Drive, DashboardFile, ExplorerFile, ApiLog, RoutingMode } from '@/types';

export const PASSCODE = '110106';

export const STORAGE_VERSION_KEY = 'ms_storage_version';
export const CURRENT_STORAGE_VERSION = '2';

export const EMPTY_DRIVES: Drive[] = [];
export const EMPTY_DASHBOARD_FILES: DashboardFile[] = [];
export const EMPTY_EXPLORER_FILES: ExplorerFile[] = [];

export const DEFAULT_ROUTING_MODE: RoutingMode = 'automatic';

export const defaultApiLogs: ApiLog[] = [
  { time: '21:42:18', status: '200', endpoint: 'GET /api/stores', duration: '42ms', type: 'ok' },
  { time: '21:41:53', status: '200', endpoint: 'GET /api/files', duration: '86ms', type: 'ok' },
  { time: '21:39:02', status: 'DEMO', endpoint: 'POST /api/upload', duration: 'Local', type: 'warn' },
];

export const viewMeta: Record<string, { title: string; desc: string }> = {
  dashboard: { title: 'Dashboard', desc: 'Satu ruang kerja untuk seluruh storage Anda.' },
  files: { title: 'All Files', desc: 'Semua file dari seluruh storage account.' },
  recent: { title: 'Recent', desc: 'File yang baru ditambahkan atau diubah.' },
  starred: { title: 'Starred', desc: 'File penting yang Anda tandai.' },
  drives: { title: 'My Drives', desc: 'Semua storage account yang tergabung dalam pool.' },
  trash: { title: 'Trash', desc: 'File yang berada di tempat sampah.' },
  photos: { title: 'Photos', desc: 'Semua foto dan gambar dari storage pool.' },
  videos: { title: 'Videos', desc: 'Semua video dari storage pool.' },
  folders: { title: 'Folders', desc: 'Semua folder dari storage pool.' },
  shared: { title: 'Shared', desc: 'Kelola file yang dibagikan.' },
  'shared-folder': { title: 'Shared Folder', desc: 'Kelola folder yang dibagikan.' },
  settings: { title: 'Settings', desc: 'Kelola workspace, storage, keamanan, dan tampilan.' },
  api: { title: 'API & Integrations', desc: 'Konfigurasi koneksi API dan integrasi.' },
};
