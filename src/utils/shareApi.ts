const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SESSION_TOKEN_KEY = 'ms_session_token';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (token) headers['X-Session-Token'] = token;
  return headers;
}

function url(): string {
  return `${SUPABASE_URL}/functions/v1/drive-ops`;
}

function publicUrl(): string {
  return `${SUPABASE_URL}/functions/v1/drive-ops`;
}

export type ShareRole = 'viewer' | 'commenter' | 'editor';
export type ShareKind = 'folder' | 'file';

export interface ShareLink {
  id: string;
  token: string;
  name: string;
  kind: ShareKind;
  node_id: string;
  folder_id: string | null;
  file_id: string | null;
  role: ShareRole;
  has_password: boolean;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  view_count: number;
  revoked: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateShareParams {
  name: string;
  kind: ShareKind;
  nodeId: string;
  folderId?: string;
  fileId?: string;
  role: ShareRole;
  password?: string;
  expiresInDays?: number;
  maxDownloads?: number;
}

// ============ Authenticated APIs ============

export async function createShare(params: CreateShareParams): Promise<{ share: ShareLink; url: string }> {
  const res = await fetch(`${url()}/shares`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed (${res.status})`);
  }
  return await res.json();
}

export async function fetchShares(): Promise<ShareLink[]> {
  const res = await fetch(`${url()}/shares`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return (data.shares || []) as ShareLink[];
}

export async function revokeShare(id: string): Promise<void> {
  const res = await fetch(`${url()}/shares/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}

export async function updateShare(id: string, patch: Partial<{ role: ShareRole; expires_at: string | null; max_downloads: number | null }>): Promise<ShareLink> {
  const res = await fetch(`${url()}/shares/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return data.share as ShareLink;
}

// ============ Public APIs (tanpa auth) ============

export interface PublicShareInfo {
  name: string;
  kind: ShareKind;
  role: ShareRole;
  has_password: boolean;
  expires_at: string | null;
  revoked: boolean;
  expired: boolean;
}

export async function fetchPublicShareInfo(token: string): Promise<PublicShareInfo> {
  const res = await fetch(`${publicUrl()}/share/${token}`, {
    credentials: 'omit',
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('NOT_FOUND');
    if (res.status === 410) throw new Error('EXPIRED');
    throw new Error(`Failed (${res.status})`);
  }
  return await res.json();
}

export async function verifySharePassword(token: string, password: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${publicUrl()}/share/${token}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    credentials: 'omit',
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return { ok: false };
  return await res.json();
}

export interface ShareFile {
  id: string;
  name: string;
  type: 'folder' | 'img' | 'video' | 'pdf' | 'audio' | 'zip' | 'file';
  mimeType: string;
  size: number;
  sizeLabel: string;
  modified: string;
  modifiedRaw: string | null;
  isFolder: boolean;
  thumbnailUrl: string | null;
  streamUrl: string | null;
  downloadUrl: string | null;
  comments: number;
}

export async function fetchShareFolder(
  token: string,
  path: string,
  password?: string,
): Promise<{ files: ShareFile[]; breadcrumbs: { id: string; name: string }[] }> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (password) params.set('pw', password);
  const res = await fetch(`${publicUrl()}/share/${token}/files?${params}`, {
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return await res.json();
}

export function shareThumbnailUrl(token: string, fileId: string, password?: string): string {
  const params = new URLSearchParams();
  if (password) params.set('pw', password);
  return `${publicUrl()}/share/${token}/thumb/${fileId}?${params}`;
}

export function shareStreamUrl(token: string, fileId: string, password?: string): string {
  const params = new URLSearchParams();
  if (password) params.set('pw', password);
  return `${publicUrl()}/share/${token}/stream/${fileId}?${params}`;
}

export function shareDownloadUrl(token: string, fileId: string, password?: string): string {
  const params = new URLSearchParams();
  if (password) params.set('pw', password);
  return `${publicUrl()}/share/${token}/download/${fileId}?${params}`;
}

// ============ Comments ============

export interface ShareComment {
  id: string;
  file_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export async function fetchComments(token: string, fileId: string, password?: string): Promise<ShareComment[]> {
  const params = new URLSearchParams();
  params.set('fileId', fileId);
  if (password) params.set('pw', password);
  const res = await fetch(`${publicUrl()}/share/${token}/comments?${params}`, {
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return (data.comments || []) as ShareComment[];
}

export async function postComment(token: string, fileId: string, authorName: string, content: string, password?: string): Promise<ShareComment> {
  const res = await fetch(`${publicUrl()}/share/${token}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    credentials: 'omit',
    body: JSON.stringify({ fileId, authorName, content, pw: password }),
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return data.comment as ShareComment;
}

// ============ Helper: build share URL ============

export function buildShareUrl(token: string, kind: ShareKind): string {
  const origin = window.location.origin;
  return `${origin}/${kind === 'folder' ? 'g' : 's'}/${token}`;
}