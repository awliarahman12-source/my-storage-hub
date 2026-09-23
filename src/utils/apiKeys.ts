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

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  /** Shown ONCE — copy and store safely */
  plaintext: string;
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(`${url()}/api-keys`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return (data.keys || []) as ApiKey[];
}

export async function createApiKey(name: string, scopes: string[], expiresInDays?: number): Promise<CreateApiKeyResult> {
  const res = await fetch(`${url()}/api-keys`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ name, scopes, expiresInDays }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed (${res.status})`);
  }
  return await res.json();
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`${url()}/api-keys/${keyId}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}

export const AVAILABLE_SCOPES = [
  { id: 'files:read', label: 'Read files' },
  { id: 'files:write', label: 'Write / upload files' },
  { id: 'files:delete', label: 'Delete files' },
  { id: 'nodes:read', label: 'Read storage nodes' },
  { id: 'admin', label: 'Full admin access' },
];