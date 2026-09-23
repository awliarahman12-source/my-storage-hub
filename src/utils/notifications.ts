/**
 * Browser notifications utility (Phase 11 - Feature L)
 */

export type NotificationPermission = 'default' | 'granted' | 'denied';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission as NotificationPermission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermission;
  } catch {
    return 'denied';
  }
}

export interface NotifyOptions {
  body?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function notify(title: string, opts: NotifyOptions = {}): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body: opts.body,
      icon: opts.icon || '/favicon.ico',
      tag: opts.tag,
      requireInteraction: opts.requireInteraction,
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
    // Auto close after 6s unless requireInteraction
    if (!opts.requireInteraction) {
      setTimeout(() => n.close(), 6000);
    }
  } catch {
    // Notification might fail in some contexts — ignore
  }
}

/**
 * High-level helpers
 */
export function notifyUploadComplete(filename: string, count: number = 1): void {
  if (count === 1) {
    notify('Upload complete', {
      body: filename,
      tag: 'upload-done',
      icon: '/favicon.ico',
    });
  } else {
    notify(`${count} uploads complete`, {
      body: 'Check your storage pool',
      tag: 'upload-done',
    });
  }
}

export function notifyUploadFailed(filename: string, error: string): void {
  notify('Upload failed', {
    body: `${filename}\n${error}`,
    tag: 'upload-fail',
    requireInteraction: true,
  });
}

export function notifyStorageLow(nodeName: string, percent: number): void {
  notify('Storage low', {
    body: `${nodeName} is ${percent}% full`,
    tag: 'storage-low',
    requireInteraction: true,
  });
}

export function notifyResumed(count: number): void {
  notify('Upload resumed', {
    body: `${count} interrupted upload(s) resumed`,
    tag: 'resumed',
  });
}