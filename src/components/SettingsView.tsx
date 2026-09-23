import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchDevices, revokeDevice, registerDevice, logActivity, fetchBackupData, changePasscode } from '@/utils/driveApi';
import { fetchApiKeys, createApiKey, revokeApiKey, AVAILABLE_SCOPES, type ApiKey, type CreateApiKeyResult } from '@/utils/apiKeys';
import { fetchWebhooks, createWebhook, toggleWebhook, deleteWebhook, testWebhook, fetchWebhookDeliveries, AVAILABLE_EVENTS, type Webhook, type WebhookDelivery } from '@/utils/webhooks';
import { fetchAnalytics, takeSnapshot, type AnalyticsSummary } from '@/utils/analytics';
import { setupEncryption, verifyPassphrase, isEncryptionSetup, clearEncryption } from '@/utils/encryption';
import { ShareManagementView } from '@/components/share/ShareManagementView';
import type { SettingsTab, DeviceInfo, BackupData } from '@/types';

type ExtendedTab = SettingsTab | 'api-keys' | 'webhooks' | 'analytics' | 'encryption' | 'shares';

const tabs: { id: ExtendedTab; icon: string; label: string }[] = [
  { id: 'general', icon: '\u2699', label: 'General' },
  { id: 'storage', icon: '\u25C9', label: 'Storage & Routing' },
  { id: 'shares', icon: '\u{1F517}', label: 'Share Links' },
  { id: 'security', icon: '\u2301', label: 'Security' },
  { id: 'api-keys', icon: '\u26BF', label: 'API Keys' },
  { id: 'webhooks', icon: '\u2197', label: 'Webhooks' },
  { id: 'analytics', icon: '\u25E2', label: 'Analytics' },
  { id: 'encryption', icon: '\u{1F512}', label: 'Encryption' },
  { id: 'appearance', icon: '\u25D0', label: 'Appearance' },
  { id: 'backup', icon: '\u21A5', label: 'Backup & Data' },
  { id: 'devices', icon: '\u25C9', label: 'My Devices' },
];

function detectBrowser(ua: string): string {
  if (ua.includes('Edg')) return 'Microsoft Edge';
  if (ua.includes('Chrome')) return 'Google Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Opera')) return 'Opera';
  return 'Unknown Browser';
}

function detectOS(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

function formatLastActive(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function getDeviceId(): string {
  let id = localStorage.getItem('ms_device_id');
  if (!id) {
    id = 'dev_' + crypto.randomUUID();
    localStorage.setItem('ms_device_id', id);
  }
  return id;
}

export function SettingsView() {
  const {
    storageName, setStorageName, theme, setTheme, toast, resetData,
    routingMode, setRoutingMode, storageNodes,
    notificationsEnabled, enableNotifications,
  } = useApp();

  const [active, setActive] = useState<ExtendedTab>('general');
  const [name, setName] = useState(storageName);
  const [autoSave, setAutoSave] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(true);
  const [passcode, setPasscode] = useState(true);
  const [useAll, setUseAll] = useState(true);
  const [lowWarn, setLowWarn] = useState(true);
  const [compactList, setCompactList] = useState(false);

  // Passcode change
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passChanging, setPassChanging] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  // Devices
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DeviceInfo | null>(null);
  const [currentDeviceId] = useState(() => getDeviceId());

  // Backup
  const [importData, setImportData] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['files:read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState<number>(0);
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResult | null>(null);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<ApiKey | null>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [showCreateHook, setShowCreateHook] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['file.uploaded']);
  const [creatingHook, setCreatingHook] = useState(false);
  const [deleteHookTarget, setDeleteHookTarget] = useState<Webhook | null>(null);
  const [deliveriesHook, setDeliveriesHook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [testingHookId, setTestingHookId] = useState<string | null>(null);

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Encryption
  const [encSetupDone, setEncSetupDone] = useState(() => isEncryptionSetup());
  const [encPass, setEncPass] = useState('');
  const [encPassConfirm, setEncPassConfirm] = useState('');
  const [encSetupBusy, setEncSetupBusy] = useState(false);
  const [encVerifyPass, setEncVerifyPass] = useState('');
  const [encVerifyResult, setEncVerifyResult] = useState<string | null>(null);
  const [encVerifyBusy, setEncVerifyBusy] = useState(false);

  // Loaders
  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const ua = navigator.userAgent;
      await registerDevice(currentDeviceId, detectBrowser(ua) + ' on ' + detectOS(ua), detectBrowser(ua), detectOS(ua), ua);
      const list = await fetchDevices();
      setDevices(list);
    } catch {
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [currentDeviceId]);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const keys = await fetchApiKeys();
      setApiKeys(keys);
    } catch {
      setApiKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  const loadHooks = useCallback(async () => {
    setLoadingHooks(true);
    try {
      const list = await fetchWebhooks();
      setWebhooks(list);
    } catch {
      setWebhooks([]);
    } finally {
      setLoadingHooks(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const data = await fetchAnalytics(30);
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    if (active === 'devices') void loadDevices();
    if (active === 'api-keys') void loadKeys();
    if (active === 'webhooks') void loadHooks();
    if (active === 'analytics') void loadAnalytics();
  }, [active, loadDevices, loadKeys, loadHooks, loadAnalytics]);

  // Handlers
  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeDevice(revokeTarget.device_id);
      await logActivity('settings_change', 'Device revoked: ' + (revokeTarget.device_name || revokeTarget.device_id), undefined, undefined, 'success');
      toast('Device revoked');
      setRevokeTarget(null);
      void loadDevices();
    } catch {
      toast('Failed to revoke device');
      setRevokeTarget(null);
    }
  };

  const handleExportBackup = async () => {
    try {
      const data = await fetchBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-storage-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logActivity('backup', 'Configuration exported', undefined, undefined, 'success');
      toast('Backup exported');
    } catch {
      toast('Export failed');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as BackupData;
        if (!data.version || !data.exportedAt) {
          setImportError('Invalid backup format: missing version or timestamp.');
          return;
        }
        if (!data.storageNodes || !Array.isArray(data.storageNodes)) {
          setImportError('Invalid backup format: missing storageNodes array.');
          return;
        }
        if (!data.routing || !data.settings) {
          setImportError('Invalid backup format: missing routing or settings.');
          return;
        }
        setImportData(data);
        setImportConfirm(true);
      } catch {
        setImportError('Could not parse backup file. Make sure it is a valid JSON file.');
      }
    };
    reader.onerror = () => setImportError('Could not read the file.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreConfirm = async () => {
    if (!importData) return;
    try {
      if (importData.routing?.mode) setRoutingMode(importData.routing.mode);
      if (importData.settings?.storageName) {
        setStorageName(importData.settings.storageName);
        setName(importData.settings.storageName);
      }
      if (importData.settings?.theme) setTheme(importData.settings.theme);
      await logActivity('restore', 'Configuration restored from backup', undefined, undefined, 'success');
      toast('Configuration restored from backup');
    } catch {
      toast('Restore failed');
    }
    setImportData(null);
    setImportConfirm(false);
  };

  const save = () => {
    setStorageName(name.trim() || 'My Storage');
    void logActivity('settings_change', 'Settings saved', undefined, undefined, 'success');
    toast('Settings saved');
  };

  // API Keys handlers
  const handleCreateKey = async () => {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;
    setCreatingKey(true);
    try {
      const result = await createApiKey(newKeyName.trim(), newKeyScopes, newKeyExpiry || undefined);
      setCreatedKey(result);
      setNewKeyName('');
      setNewKeyScopes(['files:read']);
      setNewKeyExpiry(0);
      setShowCreateKey(false);
      await loadKeys();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeKeyTarget) return;
    try {
      await revokeApiKey(revokeKeyTarget.id);
      toast('API key revoked');
      setRevokeKeyTarget(null);
      await loadKeys();
    } catch {
      toast('Failed to revoke key');
    }
  };

  const copyToClipboard = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      toast('Copy failed');
    }
  };

  // Webhooks handlers
  const handleCreateHook = async () => {
    if (!hookUrl.trim() || hookEvents.length === 0) return;
    setCreatingHook(true);
    try {
      await createWebhook(hookUrl.trim(), hookEvents);
      setHookUrl('');
      setHookEvents(['file.uploaded']);
      setShowCreateHook(false);
      toast('Webhook created');
      await loadHooks();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create webhook');
    } finally {
      setCreatingHook(false);
    }
  };

  const handleToggleHook = async (hook: Webhook) => {
    try {
      await toggleWebhook(hook.id, !hook.enabled);
      await loadHooks();
    } catch {
      toast('Toggle failed');
    }
  };

  const handleDeleteHook = async () => {
    if (!deleteHookTarget) return;
    try {
      await deleteWebhook(deleteHookTarget.id);
      toast('Webhook deleted');
      setDeleteHookTarget(null);
      await loadHooks();
    } catch {
      toast('Delete failed');
    }
  };

  const handleTestHook = async (hook: Webhook) => {
    setTestingHookId(hook.id);
    try {
      const result = await testWebhook(hook.id);
      if (result.success) toast(`Test delivered (${result.status})`);
      else toast(`Test failed${result.status ? ` (${result.status})` : ''}`);
    } catch {
      toast('Test failed');
    } finally {
      setTestingHookId(null);
    }
  };

  const handleShowDeliveries = async (hook: Webhook) => {
    setDeliveriesHook(hook);
    setLoadingDeliveries(true);
    try {
      const list = await fetchWebhookDeliveries(hook.id, 50);
      setDeliveries(list);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  // Analytics handlers
  const handleSnapshot = async () => {
    try {
      await takeSnapshot();
      toast('Snapshot taken');
      await loadAnalytics();
    } catch {
      toast('Snapshot failed');
    }
  };

  // Encryption handlers
  const handleSetupEncryption = async () => {
    if (encPass.length < 8) { toast('Passphrase must be at least 8 characters'); return; }
    if (encPass !== encPassConfirm) { toast('Passphrases do not match'); return; }
    setEncSetupBusy(true);
    try {
      await setupEncryption(encPass);
      setEncSetupDone(true);
      setEncPass('');
      setEncPassConfirm('');
      toast('Encryption enabled');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setEncSetupBusy(false);
    }
  };

  const handleVerifyEncryption = async () => {
    if (!encVerifyPass) return;
    setEncVerifyBusy(true);
    setEncVerifyResult(null);
    try {
      const ok = await verifyPassphrase(encVerifyPass);
      if (ok === true) setEncVerifyResult('✓ Passphrase is correct');
      else if (ok === false) setEncVerifyResult('✗ Passphrase is incorrect');
      else setEncVerifyResult('Encryption not set up yet');
    } catch {
      setEncVerifyResult('✗ Verification failed');
    } finally {
      setEncVerifyBusy(false);
    }
  };

  const handleClearEncryption = () => {
    if (!confirm('Disable encryption? Files already encrypted will not be decryptable until you re-enable with the same passphrase.')) return;
    clearEncryption();
    setEncSetupDone(false);
    toast('Encryption disabled');
  };

  // Chart
  const renderAnalyticsChart = () => {
    if (!analytics || analytics.history.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 30, color: '#9da7b8', fontSize: 12 }}>
          No data yet. Click <strong>Take Snapshot</strong> to start tracking.
        </div>
      );
    }
    const maxUsed = Math.max(...analytics.history.map((h) => Number(h.used_gb)), 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, padding: '10px 0' }}>
        {analytics.history.map((h, i) => {
          const pct = (Number(h.used_gb) / maxUsed) * 100;
          return (
            <div
              key={i}
              title={`${h.snapshot_date}: ${Number(h.used_gb).toFixed(1)} GB`}
              style={{ flex: 1, height: `${pct}%`, minHeight: 4, background: 'linear-gradient(180deg, #7c3aed, #5b5cf0)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease', cursor: 'pointer' }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="settings-layout">
      <div className="card settings-menu">
        <div className="settings-menu-title">Settings</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'setting-tab' + (active === t.id ? ' active' : '')}
            onClick={() => setActive(t.id)}
          >
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
        <div className="settings-version">
          My Storage v2.2<br /><span>Cloud storage pool</span>
        </div>
      </div>

      <div className="settings-content">
        {active === 'general' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>General</h2><p>Pengaturan dasar workspace My Storage.</p></div>
              <button className="btn primary" onClick={save}>Save Changes</button>
            </div>
            <div className="setting-card">
              <label>Storage name</label>
              <input className="setting-input" value={name} onChange={(e) => setName(e.target.value)} />
              <small>Nama yang ditampilkan pada aplikasi.</small>
            </div>
            <div className="setting-card row-setting">
              <div><b>Auto-save</b><small>Simpan perubahan interface dan data secara otomatis.</small></div>
              <label className="switch"><input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} /><i /></label>
            </div>
            <div className="setting-card row-setting">
              <div><b>Confirm destructive actions</b><small>Minta konfirmasi sebelum menghapus file atau Drive.</small></div>
              <label className="switch"><input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} /><i /></label>
            </div>
            <div className="setting-card row-setting">
              <div><b>Browser notifications</b><small>Tampilkan notifikasi saat upload selesai atau gagal.</small></div>
              <button className={notificationsEnabled ? 'btn' : 'btn primary'} onClick={() => void enableNotifications()}>
                {notificationsEnabled ? 'Enabled ✓' : 'Enable'}
              </button>
            </div>
          </section>
        )}

        {active === 'storage' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Storage & Routing</h2><p>Atur bagaimana file didistribusikan ke storage pool.</p></div>
              <button className="btn primary" onClick={save}>Save Changes</button>
            </div>
            <div className="setting-card">
              <label>Upload routing</label>
              <select className="setting-input" value={routingMode} onChange={(e) => { setRoutingMode(e.target.value as typeof routingMode); toast('Routing mode updated'); }}>
                <option value="automatic">Automatic — Drive dengan ruang terbesar</option>
                <option value="balanced">Balanced — Sebar merata</option>
                <option value="manual">Manual — Priority order</option>
              </select>
              <small>{storageNodes.length} drive(s) connected. Routing aktif ketika Drive tersedia.</small>
            </div>
            <div className="setting-card row-setting">
              <div><b>Use all connected Drives</b><small>Izinkan sistem memakai semua Drive yang online.</small></div>
              <label className="switch"><input type="checkbox" checked={useAll} onChange={(e) => setUseAll(e.target.checked)} /><i /></label>
            </div>
            <div className="setting-card row-setting">
              <div><b>Warn when storage is low</b><small>Tampilkan peringatan ketika kapasitas Drive di bawah 10%.</small></div>
              <label className="switch"><input type="checkbox" checked={lowWarn} onChange={(e) => setLowWarn(e.target.checked)} /><i /></label>
            </div>
          </section>
        )}

        {active === 'shares' && (
          <section className="setting-panel active">
            <ShareManagementView />
          </section>
        )}

        {active === 'security' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Security</h2><p>Kontrol keamanan untuk akses workspace.</p></div>
              <button className="btn primary" onClick={save}>Save Changes</button>
            </div>
            <div className="setting-card row-setting">
              <div><b>Passcode protection</b><small>Gunakan passcode sebelum membuka workspace.</small></div>
              <label className="switch"><input type="checkbox" checked={passcode} onChange={(e) => setPasscode(e.target.checked)} /><i /></label>
            </div>
            <div className="setting-card">
              <label>Change admin passcode</label>
              <small style={{ display: 'block', marginBottom: 10 }}>Ubah passcode administrator. Passcode lama akan diverifikasi.</small>
              {!showChangePass ? (
                <button className="btn" onClick={() => { setShowChangePass(true); setPassError(null); }}>Change Passcode</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="password" className="setting-input" placeholder="Current passcode" maxLength={128} value={currentPass} onChange={(e) => { setCurrentPass(e.target.value); setPassError(null); }} />
                  <input type="date" className="setting-input" placeholder="Birth date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setPassError(null); }} />
                  <small style={{ fontSize: 11, color: '#8a94a5', marginTop: -4 }}>Enter your birth date for verification.</small>
                  <input type="password" className="setting-input" placeholder="New passcode (min. 6 characters)" maxLength={128} value={newPass} onChange={(e) => { setNewPass(e.target.value); setPassError(null); }} />
                  <input type="password" className="setting-input" placeholder="Confirm new passcode" maxLength={128} value={confirmPass} onChange={(e) => { setConfirmPass(e.target.value); setPassError(null); }} />
                  {passError && <div style={{ fontSize: 11, color: '#dc2626' }}>{passError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn primary"
                      disabled={passChanging || !currentPass || !birthDate || !newPass || !confirmPass}
                      onClick={async () => {
                        if (newPass.length < 6) { setPassError('Passcode baru minimal 6 karakter.'); return; }
                        if (newPass !== confirmPass) { setPassError('Passcode baru tidak cocok.'); return; }
                        setPassChanging(true); setPassError(null);
                        try {
                          await changePasscode(currentPass, newPass, confirmPass, birthDate);
                          toast('Passcode berhasil diubah');
                          setShowChangePass(false);
                          setCurrentPass(''); setBirthDate(''); setNewPass(''); setConfirmPass('');
                        } catch (e) {
                          setPassError(e instanceof Error ? e.message : 'Gagal mengubah passcode');
                        }
                        setPassChanging(false);
                      }}
                    >
                      {passChanging ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn" onClick={() => { setShowChangePass(false); setCurrentPass(''); setBirthDate(''); setNewPass(''); setConfirmPass(''); setPassError(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="setting-card security-status">
              <div className="security-icon">{'\u2713'}</div>
              <div><b>Server-protected workspace</b><small>Data disimpan di server dengan autentikasi passcode dan session.</small></div>
            </div>
          </section>
        )}

        {active === 'api-keys' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>API Keys</h2><p>Kelola akses programmatic ke storage pool.</p></div>
              <button className="btn primary" onClick={() => setShowCreateKey(true)}>+ Create Key</button>
            </div>

            {createdKey && (
              <div style={{ padding: 14, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: 12 }}>
                <strong style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 6 }}>✓ API Key Created</strong>
                <p style={{ fontSize: 12, color: '#166534', margin: '0 0 10px' }}>
                  <strong>Simpan key ini sekarang.</strong> Tidak akan ditampilkan lagi.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', padding: 10, borderRadius: 8, fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all' }}>
                  <span style={{ flex: 1 }}>{createdKey.plaintext}</span>
                  <button className="xbtn" onClick={() => copyToClipboard(createdKey.plaintext, 'API key copied')}>Copy</button>
                </div>
                <button className="btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setCreatedKey(null)}>I've saved it</button>
              </div>
            )}

            {showCreateKey && (
              <div className="setting-card">
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>New API Key</strong>
                <input className="setting-input" placeholder="Key name (e.g. CI Pipeline)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} style={{ marginBottom: 10 }} />
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Scopes</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {AVAILABLE_SCOPES.map((s) => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '6px 10px', borderRadius: 8, background: newKeyScopes.includes(s.id) ? 'var(--hover)' : 'var(--soft)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newKeyScopes.includes(s.id)} onChange={(e) => {
                          if (e.target.checked) setNewKeyScopes([...newKeyScopes, s.id]);
                          else setNewKeyScopes(newKeyScopes.filter((x) => x !== s.id));
                        }} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Expires in</label>
                  <select className="setting-input" value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(Number(e.target.value))}>
                    <option value={0}>Never</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" disabled={creatingKey || !newKeyName.trim()} onClick={() => void handleCreateKey()}>
                    {creatingKey ? 'Creating...' : 'Create'}
                  </button>
                  <button className="btn" onClick={() => setShowCreateKey(false)}>Cancel</button>
                </div>
              </div>
            )}

            {loadingKeys ? (
              <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading keys...</div>
            ) : apiKeys.length === 0 ? (
              <div className="setting-card">
                <div className="empty-key">
                  <strong>No API keys yet</strong>
                  <span>Create your first API key to access the storage pool programmatically.</span>
                </div>
              </div>
            ) : (
              <div className="setting-card" style={{ padding: 0, overflow: 'hidden' }}>
                {apiKeys.map((k) => (
                  <div key={k.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {k.name}
                        {k.revoked && <span style={{ fontSize: 10, marginLeft: 8, padding: '2px 6px', borderRadius: 6, background: '#fee', color: '#dc2626' }}>REVOKED</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#7b8495', marginTop: 3, fontFamily: 'ui-monospace,monospace' }}>
                        {k.key_prefix}••••••••
                      </div>
                      <div style={{ fontSize: 10, color: '#7b8495', marginTop: 3 }}>
                        Scopes: {k.scopes.join(', ')}
                        {k.expires_at && ` · Expires ${new Date(k.expires_at).toLocaleDateString()}`}
                        {k.last_used_at && ` · Last used ${formatLastActive(k.last_used_at)}`}
                      </div>
                    </div>
                    {!k.revoked && (
                      <button className="xbtn danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setRevokeKeyTarget(k)}>Revoke</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {active === 'webhooks' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Webhooks</h2><p>Kirim event storage ke sistem eksternal.</p></div>
              <button className="btn primary" onClick={() => setShowCreateHook(true)}>+ Add Webhook</button>
            </div>

            {showCreateHook && (
              <div className="setting-card">
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>New Webhook</strong>
                <input className="setting-input" placeholder="https://your-domain.com/webhooks/storage" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} style={{ marginBottom: 10 }} />
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Events</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {AVAILABLE_EVENTS.map((ev) => (
                      <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '6px 10px', borderRadius: 8, background: hookEvents.includes(ev.id) ? 'var(--hover)' : 'var(--soft)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={hookEvents.includes(ev.id)} onChange={(e) => {
                          if (e.target.checked) setHookEvents([...hookEvents, ev.id]);
                          else setHookEvents(hookEvents.filter((x) => x !== ev.id));
                        }} />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" disabled={creatingHook || !hookUrl.trim() || hookEvents.length === 0} onClick={() => void handleCreateHook()}>
                    {creatingHook ? 'Creating...' : 'Create'}
                  </button>
                  <button className="btn" onClick={() => setShowCreateHook(false)}>Cancel</button>
                </div>
              </div>
            )}

            {loadingHooks ? (
              <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading webhooks...</div>
            ) : webhooks.length === 0 ? (
              <div className="setting-card">
                <div className="empty-key">
                  <strong>No webhooks yet</strong>
                  <span>Add a webhook to receive real-time events from your storage pool.</span>
                </div>
              </div>
            ) : (
              <div className="setting-card" style={{ padding: 0, overflow: 'hidden' }}>
                {webhooks.map((h) => (
                  <div key={h.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, fontFamily: 'ui-monospace,monospace', wordBreak: 'break-all' }}>{h.url}</div>
                        <div style={{ fontSize: 10, color: '#7b8495', marginTop: 3 }}>
                          {h.events.length} event{h.events.length !== 1 ? 's' : ''} · {h.enabled ? 'Enabled' : 'Disabled'}
                          {h.failure_count > 0 && ` · ${h.failure_count} failures`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="xbtn" style={{ fontSize: 11 }} onClick={() => void handleTestHook(h)} disabled={testingHookId === h.id}>
                          {testingHookId === h.id ? 'Testing...' : 'Test'}
                        </button>
                        <button className="xbtn" style={{ fontSize: 11 }} onClick={() => void handleShowDeliveries(h)}>Logs</button>
                        <button className="xbtn" style={{ fontSize: 11 }} onClick={() => void handleToggleHook(h)}>
                          {h.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button className="xbtn danger" style={{ fontSize: 11 }} onClick={() => setDeleteHookTarget(h)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {active === 'analytics' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Storage Analytics</h2><p>Pantau pertumbuhan storage pool dari waktu ke waktu.</p></div>
              <button className="btn" onClick={() => void handleSnapshot()}>Take Snapshot</button>
            </div>

            {loadingAnalytics ? (
              <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading analytics...</div>
            ) : !analytics ? (
              <div className="setting-card">
                <div className="empty-key">
                  <strong>No analytics data</strong>
                  <span>Click "Take Snapshot" to start tracking storage usage.</span>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <div className="setting-card" style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 10, color: '#7b8495', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Total Capacity</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{analytics.totalCap.toFixed(1)} GB</div>
                  </div>
                  <div className="setting-card" style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 10, color: '#7b8495', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Used</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{analytics.totalUsed.toFixed(1)} GB</div>
                  </div>
                  <div className="setting-card" style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 10, color: '#7b8495', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Total Files</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{analytics.totalFiles}</div>
                  </div>
                  <div className="setting-card" style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 10, color: '#7b8495', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>Growth</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                      {analytics.growthRateGBPerDay > 0 ? '+' : ''}{analytics.growthRateGBPerDay.toFixed(2)} GB/day
                    </div>
                  </div>
                </div>

                {analytics.daysUntilFull !== null && analytics.daysUntilFull > 0 && (
                  <div className="setting-card" style={{ background: analytics.daysUntilFull < 30 ? '#fff8e1' : '#f6f7fb', marginBottom: 12 }}>
                    <strong style={{ fontSize: 12 }}>📊 Projection</strong>
                    <p style={{ fontSize: 12, color: '#7b8495', margin: '4px 0 0' }}>
                      At current growth rate, your pool will be full in <strong>{analytics.daysUntilFull} days</strong> (~{Math.round(analytics.daysUntilFull / 30)} months).
                    </p>
                  </div>
                )}

                <div className="setting-card">
                  <strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Storage usage — last 30 days</strong>
                  {renderAnalyticsChart()}
                </div>
              </>
            )}
          </section>
        )}

        {active === 'encryption' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Client-Side Encryption</h2><p>Enkripsi file sebelum upload — Google hanya melihat ciphertext.</p></div>
            </div>

            {!encSetupDone ? (
              <div className="setting-card">
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Set Up Encryption</strong>
                <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 12px' }}>
                  Buat passphrase untuk mengenkripsi file. Passphrase disimpan <strong>hanya di browser kamu</strong> — server tidak pernah menerimanya.
                  <br /><br />
                  <strong style={{ color: '#dc2626' }}>⚠️ Penting:</strong> Kalau kamu lupa passphrase ini, file yang sudah dienkripsi <strong>tidak bisa dipulihkan</strong>. Tidak ada reset.
                </p>
                <input type="password" className="setting-input" placeholder="Encryption passphrase (min. 8 chars)" value={encPass} onChange={(e) => setEncPass(e.target.value)} style={{ marginBottom: 8 }} />
                <input type="password" className="setting-input" placeholder="Confirm passphrase" value={encPassConfirm} onChange={(e) => setEncPassConfirm(e.target.value)} style={{ marginBottom: 10 }} />
                <button className="btn primary" onClick={() => void handleSetupEncryption()} disabled={encSetupBusy || encPass.length < 8 || encPass !== encPassConfirm}>
                  {encSetupBusy ? 'Setting up...' : 'Enable Encryption'}
                </button>
              </div>
            ) : (
              <>
                <div className="setting-card" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 24 }}>🔒</div>
                    <div>
                      <strong style={{ fontSize: 13, color: '#065f46' }}>Encryption enabled</strong>
                      <p style={{ fontSize: 11, color: '#166534', margin: '3px 0 0' }}>
                        File baru akan dienkripsi dengan AES-256-GCM sebelum diupload.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="setting-card">
                  <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Verify passphrase</strong>
                  <p style={{ fontSize: 11, color: '#7b8495', margin: '0 0 10px' }}>Cek apakah passphrase yang kamu ingat benar.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="password" className="setting-input" placeholder="Passphrase" value={encVerifyPass} onChange={(e) => { setEncVerifyPass(e.target.value); setEncVerifyResult(null); }} />
                    <button className="btn" onClick={() => void handleVerifyEncryption()} disabled={encVerifyBusy || !encVerifyPass}>
                      {encVerifyBusy ? '...' : 'Verify'}
                    </button>
                  </div>
                  {encVerifyResult && (
                    <div style={{ marginTop: 8, fontSize: 12, color: encVerifyResult.startsWith('✓') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                      {encVerifyResult}
                    </div>
                  )}
                </div>

                <div className="setting-card">
                  <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Danger zone</strong>
                  <p style={{ fontSize: 11, color: '#7b8495', margin: '0 0 10px' }}>
                    Menonaktifkan encryption akan membuat file yang sudah dienkripsi tidak bisa diakses sampai kamu mengaktifkan ulang dengan passphrase yang sama.
                  </p>
                  <button className="btn danger" onClick={handleClearEncryption}>Disable Encryption</button>
                </div>
              </>
            )}
          </section>
        )}

        {active === 'appearance' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Appearance</h2><p>Sesuaikan tampilan aplikasi.</p></div>
              <button className="btn primary" onClick={save}>Save Changes</button>
            </div>
            <div className="setting-card">
              <label>Theme</label>
              <div className="theme-options">
                <button className={'theme-choice' + (theme === 'light' ? ' selected' : '')} onClick={() => setTheme('light')}>
                  {'\u2600'}<b>Light</b><small>Clean & bright</small>
                </button>
                <button className={'theme-choice' + (theme === 'dark' ? ' selected' : '')} onClick={() => setTheme('dark')}>
                  {'\u25D2'}<b>Dark</b><small>Low contrast</small>
                </button>
              </div>
            </div>
            <div className="setting-card row-setting">
              <div><b>Compact file list</b><small>Gunakan tampilan file yang lebih padat.</small></div>
              <label className="switch"><input type="checkbox" checked={compactList} onChange={(e) => setCompactList(e.target.checked)} /><i /></label>
            </div>
          </section>
        )}

        {active === 'backup' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>Backup & Data</h2><p>Kelola konfigurasi dan metadata workspace.</p></div>
            </div>
            <div className="setting-card backup-box">
              <div>
                <b>Export backup</b>
                <small>Download konfigurasi storage, routing, dan pengaturan sebagai JSON. Tidak menyertakan token OAuth atau secret.</small>
              </div>
              <button className="btn" onClick={() => void handleExportBackup()}>Export JSON</button>
            </div>
            <div className="setting-card backup-box">
              <div>
                <b>Import backup</b>
                <small>Pilih file JSON backup untuk memulihkan konfigurasi. File Google Drive tidak akan terhapus.</small>
              </div>
              <button className="btn" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
            </div>
            {importError && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>
                {importError}
              </div>
            )}
            {importConfirm && importData && (
              <div style={{ padding: 14, borderRadius: 10, background: '#fff8e1', border: '1px solid #f0c040', marginBottom: 12 }}>
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Confirm restore</strong>
                <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 8px' }}>
                  Backup version: {importData.version} · Exported: {new Date(importData.exportedAt).toLocaleString()}
                </p>
                <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 8px' }}>
                  This will restore routing mode, storage name, and appearance settings.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => void handleRestoreConfirm()}>Restore</button>
                  <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => { setImportConfirm(false); setImportData(null); }}>Cancel</button>
                </div>
              </div>
            )}
            <div className="setting-card backup-box">
              <div>
                <b>Reset data</b>
                <small>Kembalikan pengaturan ke kondisi awal. File di Google Drive tidak terhapus.</small>
              </div>
              <button className="btn danger" onClick={() => { if (confirm('Reset semua pengaturan ke kondisi awal? File Google Drive tidak terhapus.')) resetData(); }}>Reset</button>
            </div>
          </section>
        )}

        {active === 'devices' && (
          <section className="setting-panel active">
            <div className="setting-header">
              <div><h2>My Devices</h2><p>Kelola perangkat yang mengakses workspace Anda.</p></div>
              <button className="btn" onClick={() => void loadDevices()}>{'\u21BB'} Refresh</button>
            </div>
            {loadingDevices ? (
              <div style={{ textAlign: 'center', color: '#9da7b8', padding: 30, fontSize: 12 }}>Loading devices...</div>
            ) : devices.length === 0 ? (
              <div className="setting-card">
                <div className="empty-key">
                  <strong>No devices registered</strong>
                  <span>Devices will appear here when you access the workspace from different browsers.</span>
                </div>
              </div>
            ) : (
              <div style={{ borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
                {devices.map((d) => {
                  const isCurrent = d.device_id === currentDeviceId;
                  return (
                    <div key={d.id} style={{ padding: '10px 12px', fontSize: 12, borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <strong>{d.device_name || 'Unknown device'}</strong>
                        {isCurrent && <span style={{ fontSize: 9, color: '#16a34a', marginLeft: 6, fontWeight: 600 }}>(This device)</span>}
                        <div style={{ fontSize: 10, color: '#9da7b8', marginTop: 3 }}>
                          {d.browser || '—'} · {d.os || '—'} · {formatLastActive(d.last_active)}
                        </div>
                      </div>
                      {d.status === 'revoked' ? (
                        <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>REVOKED</span>
                      ) : !isCurrent ? (
                        <button className="xbtn" style={{ fontSize: 10, padding: '2px 8px', color: '#dc2626' }} onClick={() => setRevokeTarget(d)}>Revoke</button>
                      ) : (
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>ACTIVE</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modals */}
      {revokeTarget && (
        <div className="modal-wrap open" onClick={() => setRevokeTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Revoke device?</strong>
              <button className="close-btn" onClick={() => setRevokeTarget(null)}>×</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>
                {revokeTarget.device_name || revokeTarget.device_id} will no longer be able to access the workspace.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setRevokeTarget(null)}>Cancel</button>
                <button className="btn danger" onClick={() => void handleRevoke()}>Revoke</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {revokeKeyTarget && (
        <div className="modal-wrap open" onClick={() => setRevokeKeyTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Revoke API key?</strong>
              <button className="close-btn" onClick={() => setRevokeKeyTarget(null)}>×</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px' }}>
                <strong>{revokeKeyTarget.name}</strong> will stop working immediately.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setRevokeKeyTarget(null)}>Cancel</button>
                <button className="btn danger" onClick={() => void handleRevokeKey()}>Revoke</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteHookTarget && (
        <div className="modal-wrap open" onClick={() => setDeleteHookTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <strong>Delete webhook?</strong>
              <button className="close-btn" onClick={() => setDeleteHookTarget(null)}>×</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 16px', wordBreak: 'break-all' }}>
                {deleteHookTarget.url}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setDeleteHookTarget(null)}>Cancel</button>
                <button className="btn danger" onClick={() => void handleDeleteHook()}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deliveriesHook && (
        <div className="modal-wrap open" onClick={() => setDeliveriesHook(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
            <div className="modal-head">
              <strong>Delivery Logs</strong>
              <button className="close-btn" onClick={() => setDeliveriesHook(null)}>×</button>
            </div>
            <div style={{ padding: '12px 20px', maxHeight: 400, overflowY: 'auto' }}>
              {loadingDeliveries ? (
                <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20, fontSize: 12 }}>Loading...</div>
              ) : deliveries.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9da7b8', padding: 20, fontSize: 12 }}>No deliveries yet</div>
              ) : (
                deliveries.map((d) => (
                  <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{d.event_type}</strong>
                      <span style={{ color: d.status === 'delivered' ? '#16a34a' : d.status === 'failed' ? '#dc2626' : '#7b8495', fontWeight: 600 }}>
                        {d.status} {d.response_code ? `(${d.response_code})` : ''}
                      </span>
                    </div>
                    <div style={{ color: '#7b8495', marginTop: 3 }}>{new Date(d.created_at).toLocaleString()}</div>
                    {d.response_body && (
                      <div style={{ marginTop: 4, padding: 6, background: 'var(--soft)', borderRadius: 6, fontFamily: 'ui-monospace,monospace', fontSize: 10, maxHeight: 60, overflow: 'auto' }}>
                        {d.response_body}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}