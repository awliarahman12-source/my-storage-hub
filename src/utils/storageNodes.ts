import type { StorageNode } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function getBaseUrl(): string {
  return `${SUPABASE_URL}/functions/v1/google-drive-auth`;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const token = localStorage.getItem('ms_session_token');
  if (token) headers['X-Session-Token'] = token;
  return headers;
}

export async function fetchStorageNodes(): Promise<StorageNode[]> {
  const res = await fetch(`${getBaseUrl()}/nodes`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed to fetch storage nodes (${res.status})`);
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
  if (!res.ok) throw new Error(`Failed to disconnect storage node (${res.status})`);
}

export function getOAuthUrl(): string {
  const token = localStorage.getItem('ms_session_token');
  const params = new URLSearchParams();
  if (token) params.set('st', token);
  const qs = params.toString();
  return `${getBaseUrl()}/auth${qs ? `?${qs}` : ''}`;
}

export function getOAuthCallbackUrl(): string {
  return `${getBaseUrl()}/callback`;
}
