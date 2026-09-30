import type { StorageNode } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function getBaseUrl(): string {
  return `${SUPABASE_URL}/functions/v1/google-drive-auth`;
}

/**
 * Ambil session token dari localStorage. Cek beberapa nama key
 * karena histori project bisa punya penamaan berbeda.
 */
export function getSessionToken(): string | null {
  try {
    const candidates = [
      'ms_session_token',
      'session_token',
      'ms_token',
      'auth_token',
      'ms_session',
    ];
    for (const key of candidates) {
      const v = localStorage.getItem(key);
      if (v && v.length > 10) return v;
    }
    return null;
  } catch {
    return null;
  }
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  };
  const token = getSessionToken();
  if (token) {
    headers['X-Session-Token'] = token;
  } else {
    console.warn('[storageNodes] No session token in localStorage — request akan 401');
  }
  return headers;
}

function handleAuthError(res: Response, action: string): never {
  if (res.status === 401) {
    throw new Error(
      'Sesi login tidak valid atau sudah kadaluarsa. Silakan login ulang.'
    );
  }
  throw new Error(`Failed to ${action} (${res.status})`);
}

export async function fetchStorageNodes(): Promise<StorageNode[]> {
  const res = await fetch(`${getBaseUrl()}/nodes`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) handleAuthError(res, 'fetch storage nodes');
  const data = await res.json();
  if (!data || !Array.isArray(data.nodes)) throw new Error('Invalid response from server');
  return data.nodes as StorageNode[];
}

export async function deleteStorageNode(nodeId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/nodes/${nodeId}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[deleteStorageNode] failed', {
      status: res.status,
      statusText: res.statusText,
      body,
      hasToken: !!getSessionToken(),
      url: `${getBaseUrl()}/nodes/${nodeId}`,
    });
    handleAuthError(res, 'disconnect storage node');
  }
}

export function getOAuthUrl(): string {
  const token = getSessionToken();
  const params = new URLSearchParams();
  if (token) params.set('st', token);
  const qs = params.toString();
  return `${getBaseUrl()}/auth${qs ? `?${qs}` : ''}`;
}

export function getOAuthCallbackUrl(): string {
  return `${getBaseUrl()}/callback`;
}