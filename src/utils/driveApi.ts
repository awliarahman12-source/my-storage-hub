import type { DriveFileItem, StorageNode, StoragePoolSummary, UploadSession, RoutingMode, DrivePermission, DeviceInfo, BackupData } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SESSION_TOKEN_KEY = 'ms_session_token';

export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

function driveOpsUrl(): string {
  return `${SUPABASE_URL}/functions/v1/drive-ops`;
}

function driveUploadUrl(): string {
  return `${SUPABASE_URL}/functions/v1/drive-upload`;
}

function passcodeUrl(): string {
  return `${SUPABASE_URL}/functions/v1/passcode-auth`;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const token = getSessionToken();
  if (token) headers['X-Session-Token'] = token;
  return headers;
}

// ============ Passcode Auth ============

export type PasscodeError = 'wrong' | 'rate_limited' | 'server' | 'network' | 'not_configured';

export interface AuthStatus {
  passcodeInitialized: boolean;
  authed: boolean;
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch(`${passcodeUrl()}/status`, {
      headers: getHeaders(),
      credentials: 'omit',
    });
    if (!res.ok) return { passcodeInitialized: false, authed: false };
    const data = await res.json();
    return {
      passcodeInitialized: data.passcodeInitialized === true,
      authed: data.authed === true,
    };
  } catch {
    return { passcodeInitialized: false, authed: false };
  }
}

export async function setupPasscode(passcode: string, confirm: string): Promise<{ success: boolean; error?: PasscodeError }> {
  try {
    const res = await fetch(`${passcodeUrl()}/setup`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'omit',
      body: JSON.stringify({ passcode, confirm }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.sessionToken) setSessionToken(data.sessionToken);
      return { success: true };
    }
    if (res.status === 403) return { success: false, error: 'not_configured' };
    if (res.status === 429) return { success: false, error: 'rate_limited' };
    if (res.status >= 500) return { success: false, error: 'server' };
    return { success: false, error: 'wrong' };
  } catch {
    return { success: false, error: 'network' };
  }
}

export async function validatePasscode(passcode: string): Promise<{ success: boolean; error?: PasscodeError }> {
  try {
    const res = await fetch(`${passcodeUrl()}/login`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'omit',
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.sessionToken) setSessionToken(data.sessionToken);
      return { success: true };
    }
    if (res.status === 401) return { success: false, error: 'wrong' };
    if (res.status === 429) return { success: false, error: 'rate_limited' };
    if (res.status >= 500) return { success: false, error: 'server' };
    return { success: false, error: 'wrong' };
  } catch {
    return { success: false, error: 'network' };
  }
}

export async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch(`${passcodeUrl()}/check`, {
      headers: getHeaders(),
      credentials: 'omit',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.authed === true;
  } catch {
    return false;
  }
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${passcodeUrl()}/logout`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'omit',
    });
  } catch {
    // ignore
  }
  clearSessionToken();
}

export interface SessionInfo {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  revoked: boolean;
}

export async function fetchActiveSessions(): Promise<SessionInfo[]> {
  const res = await fetch(`${passcodeUrl()}/sessions`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch sessions (${res.status})`);
  const data = await res.json();
  return (data.sessions || []) as SessionInfo[];
}

export async function revokeSession(sessionId: string): Promise<void> {
  const res = await fetch(`${passcodeUrl()}/revoke-session`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
}

export async function changePasscode(currentPasscode: string, newPasscode: string, confirmPasscode: string): Promise<void> {
  const res = await fetch(`${passcodeUrl()}/change-passcode`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ currentPasscode, newPasscode, confirmPasscode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed (${res.status})`);
  }
}

// ============ Storage Node Management ============

function googleDriveAuthUrl(): string {
  return `${SUPABASE_URL}/functions/v1/google-drive-auth`;
}

export async function refreshNode(nodeId: string): Promise<void> {
  const res = await fetch(`${googleDriveAuthUrl()}/nodes/${nodeId}/refresh`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
}

export async function setNodePriority(nodeId: string, priority: number): Promise<void> {
  const res = await fetch(`${googleDriveAuthUrl()}/nodes/${nodeId}/priority`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ priority }),
  });
  if (!res.ok) throw new Error(`Priority update failed (${res.status})`);
}

export async function toggleNodeEnabled(nodeId: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${googleDriveAuthUrl()}/nodes/${nodeId}/toggle`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Toggle failed (${res.status})`);
}

// ============ Storage Nodes ============

export async function fetchStorageNodesWithQuota(): Promise<StorageNode[]> {
  const res = await fetch(`${driveOpsUrl()}/nodes`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch nodes (${res.status})`);
  const data = await res.json();
  return (data.nodes || []) as StorageNode[];
}

export async function fetchStoragePool(): Promise<StoragePoolSummary> {
  const res = await fetch(`${driveOpsUrl()}/pool`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch pool (${res.status})`);
  const data = await res.json();
  return data as StoragePoolSummary;
}

// ============ File Listing ============

export async function fetchFiles(opts?: {
  folderId?: string;
  typeFilter?: string;
  starredOnly?: boolean;
  trashed?: boolean;
  pageSize?: number;
}): Promise<DriveFileItem[]> {
  const params = new URLSearchParams();
  if (opts?.folderId) params.set('folderId', opts.folderId);
  if (opts?.typeFilter) params.set('type', opts.typeFilter);
  if (opts?.starredOnly) params.set('starred', 'true');
  if (opts?.trashed) params.set('trashed', 'true');
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));

  const res = await fetch(`${driveOpsUrl()}/files?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch files (${res.status})`);
  const data = await res.json();
  return (data.files || []) as DriveFileItem[];
}

export async function searchFiles(query: string): Promise<DriveFileItem[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  const res = await fetch(`${driveOpsUrl()}/search?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.files || []) as DriveFileItem[];
}

// ============ File Operations ============

export async function renameFile(fileId: string, nodeId: string, newName: string): Promise<DriveFileItem> {
  const res = await fetch(`${driveOpsUrl()}/rename`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, newName }),
  });
  if (!res.ok) throw new Error(`Rename failed (${res.status})`);
  const data = await res.json();
  return data as DriveFileItem;
}

export async function trashFile(fileId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/trash`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId }),
  });
  if (!res.ok) throw new Error(`Trash failed (${res.status})`);
}

export async function untrashFile(fileId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/untrash`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId }),
  });
  if (!res.ok) throw new Error(`Restore failed (${res.status})`);
}

export async function starFile(fileId: string, nodeId: string, starred: boolean): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/star`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, starred }),
  });
  if (!res.ok) throw new Error(`Star failed (${res.status})`);
}

export async function copyFile(fileId: string, nodeId: string): Promise<DriveFileItem> {
  const res = await fetch(`${driveOpsUrl()}/copy`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId }),
  });
  if (!res.ok) throw new Error(`Copy failed (${res.status})`);
  const data = await res.json();
  return data as DriveFileItem;
}

export async function moveFile(fileId: string, nodeId: string, newParentId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/move`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, newParentId }),
  });
  if (!res.ok) throw new Error(`Move failed (${res.status})`);
}

export async function deleteFile(fileId: string, nodeId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/delete`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId }),
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function createFolder(nodeId: string, name: string, parentId?: string): Promise<DriveFileItem> {
  const res = await fetch(`${driveOpsUrl()}/create-folder`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ nodeId, name, parentId }),
  });
  if (!res.ok) throw new Error(`Create folder failed (${res.status})`);
  const data = await res.json();
  return data as DriveFileItem;
}

export async function shareFile(fileId: string, nodeId: string, access: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/share`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, access }),
  });
  if (!res.ok) throw new Error(`Share failed (${res.status})`);
}

// ============ Download & Preview ============

export function getDownloadUrl(fileId: string, nodeId: string): string {
  const token = getSessionToken();
  const params = new URLSearchParams({ nodeId });
  if (token) params.set('st', token);
  return `${driveOpsUrl()}/download/${fileId}?${params}`;
}

export function getPreviewUrl(fileId: string, nodeId: string): string {
  const token = getSessionToken();
  const params = new URLSearchParams({ nodeId });
  if (token) params.set('st', token);
  return `${driveOpsUrl()}/preview/${fileId}?${params}`;
}

export function getAuthHeaders(): Record<string, string> {
  return getHeaders();
}

// ============ Folder Picker ============

export async function fetchFolders(nodeId: string): Promise<{ id: string; name: string; parents?: string[] }[]> {
  const params = new URLSearchParams();
  params.set('nodeId', nodeId);
  const res = await fetch(`${driveOpsUrl()}/folders?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch folders (${res.status})`);
  const data = await res.json();
  return (data.folders || []) as { id: string; name: string; parents?: string[] }[];
}

// ============ Text Preview ============

export async function fetchTextPreview(fileId: string, nodeId: string): Promise<string> {
  const params = new URLSearchParams();
  params.set('nodeId', nodeId);
  const res = await fetch(`${driveOpsUrl()}/text-preview/${fileId}?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Text preview failed (${res.status})`);
  const data = await res.json();
  return data.content as string;
}

// ============ Upload ============

export async function initUpload(nodeId: string, filename: string, mimeType: string, size: number, parentGoogleId?: string): Promise<UploadSession> {
  const res = await fetch(`${driveUploadUrl()}/init`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ nodeId, filename, mimeType, size, parentGoogleId }),
  });
  if (!res.ok) throw new Error(`Init upload failed (${res.status})`);
  const data = await res.json();
  return data as UploadSession;
}

export async function startUpload(sessionId: string, file: File | ArrayBuffer, mimeType: string): Promise<UploadSession> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': mimeType,
  };
  const token = getSessionToken();
  if (token) headers['X-Session-Token'] = token;
  const res = await fetch(`${driveUploadUrl()}/start/${sessionId}`, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: file,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Upload failed');
    throw new Error(errText);
  }
  const data = await res.json();
  return data as UploadSession;
}

export async function startUploadWithProgress(
  sessionId: string,
  file: File,
  mimeType: string,
  onProgress: (uploadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<UploadSession> {
  const xhr = new XMLHttpRequest();
  return new Promise<UploadSession>((resolve, reject) => {
    xhr.open('POST', `${driveUploadUrl()}/start/${sessionId}`);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    const sessionToken = getSessionToken();
    if (sessionToken) xhr.setRequestHeader('X-Session-Token', sessionToken);
    xhr.withCredentials = false;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadSession);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(file);
  });
}

export async function fetchUploadSessions(): Promise<UploadSession[]> {
  const res = await fetch(`${driveUploadUrl()}/sessions`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch sessions (${res.status})`);
  const data = await res.json();
  return (data.sessions || []) as UploadSession[];
}

export async function retryUpload(sessionId: string): Promise<UploadSession> {
  const res = await fetch(`${driveUploadUrl()}/retry/${sessionId}`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Retry failed (${res.status})`);
  const data = await res.json();
  return data as UploadSession;
}

export async function cancelUpload(sessionId: string): Promise<UploadSession> {
  const res = await fetch(`${driveUploadUrl()}/cancel/${sessionId}`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Cancel failed (${res.status})`);
  const data = await res.json();
  return data as UploadSession;
}

export async function deleteUploadSession(sessionId: string): Promise<void> {
  const res = await fetch(`${driveUploadUrl()}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Delete session failed (${res.status})`);
}

export async function routeUpload(fileSizeMB: number, mode: RoutingMode, preferredNodeId?: string): Promise<{ nodeId: string; email: string; displayName: string | null }> {
  const res = await fetch(`${driveUploadUrl()}/route`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileSizeMB, mode, preferredNodeId }),
  });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = await res.json();
  return data;
}

// ============ Duplicate Check ============

export async function checkDuplicate(filename: string, parentGoogleId?: string): Promise<{ exists: boolean; nodes: { nodeId: string; fileId: string; drive: string }[] }> {
  const params = new URLSearchParams();
  params.set('filename', filename);
  if (parentGoogleId) params.set('parentGoogleId', parentGoogleId);
  const res = await fetch(`${driveOpsUrl()}/check-duplicate?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) return { exists: false, nodes: [] };
  const data = await res.json();
  return data as { exists: boolean; nodes: { nodeId: string; fileId: string; drive: string }[] };
}

// ============ Activity Logs ============

export interface ActivityLogEntry {
  id: string;
  event_type: string;
  filename: string | null;
  storage_node_id: string | null;
  storage_node_name: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

export async function fetchActivityLogs(limit?: number): Promise<ActivityLogEntry[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${driveOpsUrl()}/activity?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch activity logs (${res.status})`);
  const data = await res.json();
  return (data.logs || []) as ActivityLogEntry[];
}

export async function fetchActivityLogsFiltered(filter: string, limit?: number): Promise<ActivityLogEntry[]> {
  const params = new URLSearchParams();
  params.set('filter', filter);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${driveOpsUrl()}/activity?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch activity logs (${res.status})`);
  const data = await res.json();
  return (data.logs || []) as ActivityLogEntry[];
}

export async function logActivity(action: string, target?: string, storageNodeId?: string, storageNodeName?: string, status?: string): Promise<void> {
  try {
    await fetch(`${driveOpsUrl()}/activity`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'omit',
      body: JSON.stringify({ action, target, storageNodeId, storageNodeName, status: status || 'success' }),
    });
  } catch {
    // Best-effort
  }
}

// ============ Sharing / Permissions ============

export async function fetchPermissions(fileId: string, nodeId: string): Promise<DrivePermission[]> {
  const params = new URLSearchParams();
  params.set('fileId', fileId);
  params.set('nodeId', nodeId);
  const res = await fetch(`${driveOpsUrl()}/permissions?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch permissions (${res.status})`);
  const data = await res.json();
  return (data.permissions || []) as DrivePermission[];
}

export async function addPermission(fileId: string, nodeId: string, email: string, role: string): Promise<DrivePermission> {
  const res = await fetch(`${driveOpsUrl()}/permissions`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, email, role }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Failed to add permission');
    try { const errData = JSON.parse(errText); throw new Error(errData.error || errText); } catch (e) { if (e instanceof Error && e.message !== 'Failed to add permission') throw e; throw new Error(errText); }
  }
  const data = await res.json();
  return data.permission as DrivePermission;
}

export async function removePermission(fileId: string, nodeId: string, permissionId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/permissions`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ fileId, nodeId, permissionId }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Failed to remove permission');
    try { const errData = JSON.parse(errText); throw new Error(errData.error || errText); } catch (e) { if (e instanceof Error && e.message !== 'Failed to remove permission') throw e; throw new Error(errText); }
  }
}

export async function fetchShareLink(fileId: string, nodeId: string): Promise<{ webViewLink: string | null; webContentLink: string | null }> {
  const params = new URLSearchParams();
  params.set('fileId', fileId);
  params.set('nodeId', nodeId);
  const res = await fetch(`${driveOpsUrl()}/share-link?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch share link (${res.status})`);
  const data = await res.json();
  return data;
}

// ============ Device Management ============

export async function registerDevice(deviceId: string, deviceName: string, browser: string, os: string, userAgent: string): Promise<DeviceInfo> {
  const res = await fetch(`${driveOpsUrl()}/devices/register`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ deviceId, deviceName, browser, os, userAgent }),
  });
  if (!res.ok) throw new Error(`Device registration failed (${res.status})`);
  const data = await res.json();
  return data.device as DeviceInfo;
}

export async function fetchDevices(): Promise<DeviceInfo[]> {
  const res = await fetch(`${driveOpsUrl()}/devices`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch devices (${res.status})`);
  const data = await res.json();
  return (data.devices || []) as DeviceInfo[];
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const res = await fetch(`${driveOpsUrl()}/devices/revoke`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
}

// ============ Backup ============

export async function fetchBackupData(): Promise<BackupData> {
  const [nodes, pool] = await Promise.all([fetchStorageNodesWithQuota(), fetchStoragePool()]);
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    storageNodes: nodes.map((n) => ({
      id: n.id,
      provider: n.provider,
      email: n.email,
      displayName: n.displayName,
      priority: n.priority,
      enabled: n.enabled,
      status: n.status,
    })),
    routing: { mode: 'automatic' },
    settings: { storageName: 'My Storage', theme: 'light' },
  };
}
