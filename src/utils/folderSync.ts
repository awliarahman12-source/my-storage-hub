/**
 * Folder sync using File System Access API.
 * Browser support: Chrome, Edge (not Firefox/Safari).
 */

export function isFolderSyncSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export interface SyncFile {
  file: File;
  relativePath: string;
}

export interface SyncFolderOptions {
  recursive?: boolean;
  extensions?: string[];
}

/**
 * Pick a directory and enumerate all files inside it.
 */
export async function pickFolderAndEnumerate(opts: SyncFolderOptions = {}): Promise<SyncFile[]> {
  if (!isFolderSyncSupported()) {
    throw new Error('Folder picker not supported in this browser. Use Chrome or Edge.');
  }

  // @ts-expect-error showDirectoryPicker is not in standard TS lib yet
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  const files: SyncFile[] = [];

  const walk = async (handle: any, path: string) => {
    for await (const [name, entry] of handle.entries()) {
      const relative = path ? `${path}/${name}` : name;
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (opts.extensions && opts.extensions.length > 0) {
          const ext = name.split('.').pop()?.toLowerCase() || '';
          if (!opts.extensions.includes(ext)) continue;
        }
        files.push({ file, relativePath: relative });
      } else if (entry.kind === 'directory' && opts.recursive !== false) {
        await walk(entry, relative);
      }
    }
  };

  await walk(dirHandle, '');
  return files;
}

/**
 * Compare local files with already-uploaded files (by name + size).
 * Returns only new files.
 */
export function filterNewFiles(localFiles: SyncFile[], uploadedNames: Set<string>): SyncFile[] {
  return localFiles.filter((f) => {
    const key = `${f.file.name}::${f.file.size}`;
    return !uploadedNames.has(key);
  });
}

/**
 * Persist last sync time
 */
const LAST_SYNC_KEY = 'ms_folder_sync_last';

export function getLastSyncTime(): number | null {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? Number(v) : null;
}

export function setLastSyncTime(ts: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}