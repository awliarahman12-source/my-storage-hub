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

export interface DbSearchOptions {
  query: string;
  type?: 'img' | 'video' | 'pdf' | 'audio' | 'zip' | 'folder' | 'file';
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: string;
  starredOnly?: boolean;
  limit?: number;
}

export interface DbSearchResult {
  id: string;
  nodeId: string;
  name: string;
  mimeType: string;
  size: number;
  modified: string;
  drive: string;
  driveEmail: string;
  thumbnail?: string | null;
  isFolder: boolean;
  starred: boolean;
  shared: boolean;
}

export async function searchDb(opts: DbSearchOptions): Promise<DbSearchResult[]> {
  const params = new URLSearchParams();
  params.set('q', opts.query);
  if (opts.type) params.set('type', opts.type);
  if (opts.minSize !== undefined) params.set('minSize', String(opts.minSize));
  if (opts.maxSize !== undefined) params.set('maxSize', String(opts.maxSize));
  if (opts.modifiedAfter) params.set('modifiedAfter', opts.modifiedAfter);
  if (opts.starredOnly) params.set('starred', 'true');
  params.set('limit', String(opts.limit || 100));

  const res = await fetch(`${url()}/search-db?${params}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.results || []) as DbSearchResult[];
}