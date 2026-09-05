import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchActivityLogsFiltered, type ActivityLogEntry } from '@/utils/driveApi';
import { getOAuthUrl } from '@/utils/storageNodes';
import type { ApiTab, ActivityFilter } from '@/types';

const tabs: { id: ApiTab; icon: string; label: string }[] = [
  { id: 'overview', icon: '\u25A6', label: 'Overview' },
  { id: 'google', icon: 'G', label: 'Google Drive API' },
  { id: 'keys', icon: '\u2301', label: 'API Keys' },
  { id: 'upload', icon: '\u2191', label: 'Upload Engine' },
  { id: 'webhook', icon: '\u2197', label: 'Webhooks' },
  { id: 'logs', icon: '\u2261', label: 'API Logs' },
];

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files' },
  { id: 'storage', label: 'Storage' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'system', label: 'System' },
];

function formatLogTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  if (status === 'success') return '#16a34a';
  if (status === 'failed' || status === 'error') return '#dc2626';
  if (status === 'warning') return '#f0a040';
  return '#7b8495';
}

export function ApiView() {
  const { apiLogs, toast, uploadSessions } = useApp();
  const [active, setActive] = useState<ApiTab>('overview');
  const [showSecret, setShowSecret] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<ActivityFilter>('all');

  const loadActivityLogs = useCallback(async (filter: ActivityFilter) => {
    setLoadingLogs(true);
    try {
      const logs = await fetchActivityLogsFiltered(filter, 100);
      setActivityLogs(logs);
    } catch {
      setActivityLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (active === 'logs') {
      void loadActivityLogs(logFilter);
    }
  }, [active, logFilter, loadActivityLogs, uploadSessions.length]);

  const handleRefresh = () => {
    void loadActivityLogs(logFilter);
    toast('Activity log refreshed');
  };

  const clearLogs = () => {
    toast('API logs cleared');
  };

  return (
    <div className="api-layout">
      <div className="card api-menu">
        <div className="api-menu-title">API & Integrations</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'api-tab' + (active === t.id ? ' active' : '')}
            onClick={() => setActive(t.id)}
          >
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
        <div className="api-menu-note">
          <b>Developer Mode</b>
          <span>Configure API connections and integrations for your storage pool.</span>
        </div>
      </div>
      <div className="api-content">
        {active === 'overview' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>Integration Overview</h2><p>Monitor all API connections from one place.</p></div>
              <button className="btn primary" onClick={() => toast('Running API checks...')}>Test All</button>
            </div>
            <div className="api-status-grid">
              <div className="api-status-card">
                <div className="api-status-icon">G</div>
                <div><b>Google Drive API</b><small>Not connected</small></div>
                <span className="api-dot off" />
              </div>
              <div className="api-status-card">
                <div className="api-status-icon">{'\u2194'}</div>
                <div><b>Storage API</b><small>Not configured</small></div>
                <span className="api-dot off" />
              </div>
              <div className="api-status-card">
                <div className="api-status-icon">DB</div>
                <div><b>Database</b><small>Supabase</small></div>
                <span className="api-dot on" />
              </div>
              <div className="api-status-card">
                <div className="api-status-icon">{'\u2197'}</div>
                <div><b>Webhooks</b><small>{webhookEnabled ? 'Enabled' : 'Disabled'}</small></div>
                <span className={'api-dot ' + (webhookEnabled ? 'on' : 'off')} />
              </div>
            </div>
            <div className="api-card">
              <div className="api-card-head">
                <div><b>API Base URL</b><small>Endpoint utama aplikasi.</small></div>
              </div>
              <div className="api-code">https://iahedaeqytmfmscgagcu.supabase.co/functions/v1</div>
            </div>
            <div className="api-card">
              <div className="api-card-head">
                <div><b>Recommended production architecture</b><small>Frontend tidak menyimpan Google refresh token atau client secret.</small></div>
              </div>
              <div className="architecture">
                <span>Web App</span><i>{'\u2192'}</i>
                <span>Backend API</span><i>{'\u2192'}</i>
                <span>OAuth</span><i>{'\u2192'}</i>
                <span>Google Drive</span>
              </div>
            </div>
          </section>
        )}
        {active === 'google' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>Google Drive API</h2><p>Konfigurasi koneksi Google Drive untuk storage pool.</p></div>
              <button className="btn primary" onClick={() => toast('Testing Google Drive API connection...')}>Test Connection</button>
            </div>
            <div className="api-card">
              <div className="api-card-head">
                <div><b>OAuth 2.0 Configuration</b><small>Credential sebaiknya hanya berada di server.</small></div>
                <span className="pill warning">SECURE</span>
              </div>
              <label>Client ID</label>
              <input className="api-input" placeholder="xxxx.apps.googleusercontent.com" />
              <label>Client Secret</label>
              <div className="secret-wrap">
                <input className="api-input" type={showSecret ? 'text' : 'password'} placeholder="Stored on backend" />
                <button onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Show'}</button>
              </div>
              <label>Redirect URI</label>
              <input className="api-input" placeholder="Configured on the server" disabled />
              <div className="api-info">Scope yang disarankan akan ditentukan backend. Jangan menaruh refresh token di HTML, localStorage, atau repository GitHub.</div>
            </div>
            <div className="api-card row-api">
              <div><b>OAuth connection</b><small>Connect your Google Drive account via OAuth.</small></div>
              <button className="btn primary" onClick={() => window.location.href = getOAuthUrl()}>Connect Google</button>
            </div>
          </section>
        )}
        {active === 'keys' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>API Keys</h2><p>Kelola akses programmatic ke Storage API.</p></div>
              <button className="btn primary" onClick={() => toast('API key creation requires backend authentication')}>{'\uFF0B'} Create Key</button>
            </div>
            <div className="api-card">
              <div className="empty-key">
                <strong>No API keys</strong>
                <span>API key baru sebaiknya dibuat dari backend setelah autentikasi aktif.</span>
              </div>
            </div>
          </section>
        )}
        {active === 'upload' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>Upload Engine</h2><p>Atur performa dan reliability proses upload.</p></div>
              <button className="btn primary" onClick={() => toast('API settings saved')}>Save Changes</button>
            </div>
            <div className="api-card">
              <label>Upload strategy</label>
              <select className="api-input"><option>Resumable / Chunked Upload</option><option>Standard Upload</option></select>
              <small>Resumable upload cocok untuk file besar atau koneksi tidak stabil.</small>
            </div>
            <div className="api-two">
              <div className="api-card">
                <label>Concurrent uploads</label>
                <select className="api-input"><option>3</option><option>5</option><option>10</option></select>
              </div>
              <div className="api-card">
                <label>Retry attempts</label>
                <select className="api-input"><option>5</option><option>3</option><option>10</option></select>
              </div>
            </div>
            <div className="api-card row-api">
              <div><b>Automatic retry & backoff</b><small>Retry ketika API mengalami rate limit atau temporary error.</small></div>
              <label className="switch"><input type="checkbox" defaultChecked /><i /></label>
            </div>
          </section>
        )}
        {active === 'webhook' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>Webhooks</h2><p>Kirim event storage ke sistem eksternal.</p></div>
              <button className="btn primary" onClick={() => toast(webhookEnabled ? 'Webhook test sent' : 'Enable webhook first')}>Test Webhook</button>
            </div>
            <div className="api-card row-api">
              <div><b>Enable webhooks</b><small>File uploaded, deleted, renamed, dan storage events.</small></div>
              <label className="switch">
                <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} /><i />
              </label>
            </div>
            <div className="api-card">
              <label>Webhook URL</label>
              <input className="api-input" placeholder="https://your-domain.com/webhooks/storage" />
              <small>URL tujuan menerima event dari backend.</small>
            </div>
            <div className="api-card">
              <label>Events</label>
              <div className="event-chips">
                <span>file.uploaded</span><span>file.deleted</span><span>file.renamed</span><span>storage.low</span>
              </div>
            </div>
          </section>
        )}
        {active === 'logs' && (
          <section className="api-panel active">
            <div className="api-header">
              <div><h2>Activity Log</h2><p>Aktivitas file, storage, sharing, dan sistem terbaru.</p></div>
              <button className="btn" onClick={handleRefresh}>{'\u21BB'} Refresh</button>
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={'xbtn' + (logFilter === f.id ? ' primary' : '')}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 16 }}
                  onClick={() => setLogFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Activity Log Table */}
            <div className="api-card" style={{ padding: 0, overflow: 'hidden' }}>
              {loadingLogs ? (
                <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading activity logs...</div>
              ) : activityLogs.length === 0 ? (
                <div className="empty-key">
                  <strong>No activity yet</strong><span>File operations, sharing, and system events will appear here.</span>
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 80px 70px', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#7b8495', borderBottom: '2px solid var(--border)', textTransform: 'uppercase', letterSpacing: 0.5, position: 'sticky', top: 0, background: 'var(--card-bg, #fff)' }}>
                    <span>Action</span>
                    <span>File / Target</span>
                    <span>Storage Node</span>
                    <span>Status</span>
                    <span style={{ textAlign: 'right' }}>Time</span>
                  </div>
                  {activityLogs.map((log) => (
                    <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 80px 70px', padding: '8px 12px', fontSize: 11, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.event_type.replace(/_/g, ' ')}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5a6a7e' }}>{log.filename || log.message || '—'}</span>
                      <span style={{ color: '#7b8495', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.storage_node_name || '—'}</span>
                      <span style={{ fontWeight: 600, color: statusColor(log.status), textTransform: 'uppercase', fontSize: 10 }}>{log.status}</span>
                      <span style={{ textAlign: 'right', color: '#9da7b8', fontSize: 10 }}>{formatLogTime(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Legacy API request logs */}
            <div style={{ marginTop: 16 }}>
              <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>API Request Logs</strong>
              <div className="api-card logs">
                {apiLogs.length === 0 ? (
                  <div className="empty-key">
                    <strong>No API request logs</strong><span>Log history cleared.</span>
                  </div>
                ) : (
                  apiLogs.map((log, i) => (
                    <div key={i} className="log">
                      <span className="log-time">{log.time}</span>
                      <b className={log.type === 'ok' ? 'ok-text' : 'warn-text'}>{log.status}</b>
                      <span>{log.endpoint}</span>
                      <span className="muted">{log.duration}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
