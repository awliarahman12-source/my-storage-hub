import type { Drive, ExplorerFile } from '@/types';

export function gb(n: number): string {
  if (n >= 1) return n.toFixed(1).replace('.0', '') + ' GB';
  return Math.round(n * 1024) + ' MB';
}

export function formatSize(n: number): string {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < 3) {
    x /= 1024;
    i++;
  }
  return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
}

export function calcTotals(drives: Drive[]) {
  const cap = drives.reduce((a, d) => a + d.cap, 0);
  const used = drives.reduce((a, d) => a + d.used, 0);
  const free = Math.max(0, cap - used);
  const pct = cap ? Math.round((used / cap) * 100) : 0;
  return { cap, used, free, pct };
}

export function getFileTypeFromExt(ext: string): ExplorerFile['type'] {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(e)) return 'img';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(e)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'zip';
  if (e === 'pdf') return 'pdf';
  return 'file';
}

export function getDashboardTypeFromExt(ext: string): 'img' | 'pdf' | 'zip' | 'folder' {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e)) return 'img';
  if (e === 'pdf') return 'pdf';
  if (['zip', 'rar', '7z'].includes(e)) return 'zip';
  return 'folder';
}
