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

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  last_triggered_at: string | null;
  failure_count: number;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: any;
  status: string;
  response_code: number | null;
  response_body: string | null;
  attempts: number;
  created_at: string;
  delivered_at: string | null;
}

export async function fetchWebhooks(): Promise<Webhook[]> {
  const res = await fetch(`${url()}/webhooks`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return (data.webhooks || []) as Webhook[];
}

export async function createWebhook(url: string, events: string[]): Promise<Webhook> {
  const res = await fetch(`${url()}/webhooks`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ url, events }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed (${res.status})`);
  }
  const data = await res.json();
  return data.webhook as Webhook;
}

export async function toggleWebhook(id: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${url()}/webhooks/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'omit',
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${url()}/webhooks/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
}

export async function testWebhook(id: string): Promise<{ success: boolean; status?: number; body?: string }> {
  const res = await fetch(`${url()}/webhooks/${id}/test`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return await res.json();
}

export async function fetchWebhookDeliveries(webhookId: string, limit = 30): Promise<WebhookDelivery[]> {
  const res = await fetch(`${url()}/webhooks/${webhookId}/deliveries?limit=${limit}`, {
    headers: getHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  const data = await res.json();
  return (data.deliveries || []) as WebhookDelivery[];
}

export const AVAILABLE_EVENTS = [
  { id: 'file.uploaded', label: 'File uploaded' },
  { id: 'file.deleted', label: 'File deleted' },
  { id: 'file.renamed', label: 'File renamed' },
  { id: 'file.moved', label: 'File moved' },
  { id: 'file.shared', label: 'File shared' },
  { id: 'storage.low', label: 'Storage low' },
  { id: 'storage.connected', label: 'Storage connected' },
  { id: 'storage.disconnected', label: 'Storage disconnected' },
];