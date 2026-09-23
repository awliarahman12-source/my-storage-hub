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

export interface StorageSnapshot {
  id: string;
  storage_node_id: string;
  snapshot_date: string;
  cap_gb: number;
  used_gb: number;
  file_count: number;
}

export interface AnalyticsSummary {
  totalCap: number;
  totalUsed: number;
  totalFiles: number;
  growthRateGBPerDay: number;
  daysUntilFull: number | null;
  history: StorageSnapshot[];
}

export async function fetchAnalytics(days = 30): Promise<AnalyticsSummary> {
  const res = await fetch(`${url()}/analytics?days=${days}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return await res.json();
}

export async function takeSnapshot(): Promise<void> {
  const res = await fetch(`${url()}/analytics/snapshot`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}