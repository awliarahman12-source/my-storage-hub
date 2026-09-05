import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchDevices, revokeDevice, registerDevice, logActivity, fetchBackupData, changePasscode } from '@/utils/driveApi';
import type { SettingsTab, DeviceInfo, BackupData } from '@/types';

const tabs: { id: SettingsTab; icon: string; label: string }[] = [
  { id: 'general', icon: '\u2699', label: 'General' },
  { id: 'storage', icon: '\u25C9', label: 'Storage & Routing' },
  { id: 'security', icon: '\u2301', label: 'Security' },
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
  const { storageName, setStorageName, theme, setTheme, toast, resetDemoData, routingMode, setRoutingMode, storageNodes } = useApp();
  const [active, setActive] = useState<SettingsTab>('general');
  const [name, setName] = useState(storageName);
  const [autoSave, setAutoSave] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(true);
  const [passcode, setPasscode] = useState(true);
  const [useAll, setUseAll] = useState(true);
  const [lowWarn, setLowWarn] = useState(true);
  const [compactList, setCompactList] = useState(false);

  // Change passcode state
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passChanging, setPassChanging] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  // Device state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DeviceInfo | null>(null);
  const [currentDeviceId] = useState(() => getDeviceId());

  // Backup import state
  const [importData, setImportData] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (active === 'devices') {
      void loadDevices();
    }
  }, [active, loadDevices]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeDevice(revokeTarget.device_id);
      await logActivity('settings_change', 'Device revoked: ' + (revokeTarget.device_name || revokeTarget.device_id), undefined, undefined, 'success');
      toast('Device revoked');
      setRevokeTarget(null);
      void loadDevices();
      if (revokeTarget.device_id === currentDeviceId) {
        toast('This device has been revoked. Please reload the page.');
      }
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
      if (importData.routing?.mode) {
        setRoutingMode(importData.routing.mode);
      }
      if (importData.settings?.storageName) {
        setStorageName(importData.settings.storageName);
        setName(importData.settings.storageName);
      }
      if (importData.settings?.theme) {
        setTheme(importData.settings.theme);
      }
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
          My Storage v2.0<br /><span>Cloud storage pool</span>
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
                <option value="automatic">Automatic {'\u2014'} Drive dengan ruang terbesar</option>
                <option value="balanced">Balanced {'\u2014'} Sebar merata</option>
                <option value="manual">Manual {'\u2014'} Priority order</option>
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
              <label>Session timeout</label>
              <select className="setting-input" defaultValue="30">
                <option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>Never</option>
              </select>
              <small>Pada versi Google Drive, session akan dikelola server.</small>
            </div>
            <div className="setting-card">
              <label>Change admin passcode</label>
              <small style={{ display: 'block', marginBottom: 10 }}>Ubah passcode administrator. Passcode lama akan diverifikasi.</small>
              {!showChangePass ? (
                <button className="btn" onClick={() => { setShowChangePass(true); setPassError(null); }}>Change Passcode</button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="password"
                    className="setting-input"
                    placeholder="Current passcode"
                    maxLength={128}
                    value={currentPass}
                    onChange={(e) => { setCurrentPass(e.target.value); setPassError(null); }}
                  />
                  <input
                    type="password"
                    className="setting-input"
                    placeholder="New passcode (min. 6 characters)"
                    maxLength={128}
                    value={newPass}
                    onChange={(e) => { setNewPass(e.target.value); setPassError(null); }}
                  />
                  <input
                    type="password"
                    className="setting-input"
                    placeholder="Confirm new passcode"
                    maxLength={128}
                    value={confirmPass}
                    onChange={(e) => { setConfirmPass(e.target.value); setPassError(null); }}
                  />
                  {passError && <div style={{ fontSize: 11, color: '#dc2626' }}>{passError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn primary"
                      disabled={passChanging || !currentPass || !newPass || !confirmPass}
                      onClick={async () => {
                        if (newPass.length < 6) { setPassError('Passcode baru minimal 6 karakter.'); return; }
                        if (newPass !== confirmPass) { setPassError('Passcode baru tidak cocok.'); return; }
                        setPassChanging(true); setPassError(null);
                        try {
                          await changePasscode(currentPass, newPass, confirmPass);
                          toast('Passcode berhasil diubah');
                          setShowChangePass(false);
                          setCurrentPass(''); setNewPass(''); setConfirmPass('');
                        } catch (e) {
                          setPassError(e instanceof Error ? e.message : 'Gagal mengubah passcode');
                        }
                        setPassChanging(false);
                      }}
                    >
                      {passChanging ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn" onClick={() => { setShowChangePass(false); setCurrentPass(''); setNewPass(''); setConfirmPass(''); setPassError(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="setting-card security-status">
              <div className="security-icon">{'\u2713'}</div>
              <div><b>Browser demo protected</b><small>Data demo disimpan secara lokal di browser ini.</small></div>
            </div>
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
                <button
                  className={'theme-choice' + (theme === 'light' ? ' selected' : '')}
                  onClick={() => setTheme('light')}
                >
                  {'\u2600'}<b>Light</b><small>Clean & bright</small>
                </button>
                <button
                  className={'theme-choice' + (theme === 'dark' ? ' selected' : '')}
                  onClick={() => setTheme('dark')}
                >
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
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={handleImportFile}
              />
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
                  Backup version: {importData.version} {'\u00B7'} Exported: {new Date(importData.exportedAt).toLocaleString()}
                </p>
                <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 8px' }}>
                  This will restore routing mode, storage name, and appearance settings. Storage node connections may need re-authorization.
                </p>
                <p style={{ fontSize: 11, color: '#9da7b8', margin: '0 0 10px' }}>
                  {importData.storageNodes.length} storage node(s) in backup {'\u00B7'} Files in Google Drive will not be affected.
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
              <button className="btn danger" onClick={() => { if (confirm('Reset semua pengaturan ke kondisi awal? File Google Drive tidak terhapus.')) resetDemoData(); }}>Reset</button>
            </div>

            <div className="setting-card">
              <b>What's included in backup</b>
              <small style={{ display: 'block', marginTop: 4 }}>
                Storage node configuration (name, priority, enabled), routing mode, storage name, theme.
                <br /><br />
                <strong>Not included:</strong> OAuth tokens, client secrets, passwords, file content. File content stays in Google Drive.
              </small>
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
              <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#7b8495', borderBottom: '2px solid var(--border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <span>Device</span>
                  <span>Browser</span>
                  <span>OS</span>
                  <span>Last Active</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>
                {devices.map((d) => {
                  const isCurrent = d.device_id === currentDeviceId;
                  return (
                    <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px', padding: '10px 12px', fontSize: 11, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <div>
                        <strong>{d.device_name || 'Unknown device'}</strong>
                        {isCurrent && <span style={{ fontSize: 9, color: '#16a34a', marginLeft: 6, fontWeight: 600 }}>(This device)</span>}
                        <div style={{ fontSize: 9, color: '#9da7b8' }}>{d.device_id.substring(0, 16)}...</div>
                      </div>
                      <span style={{ color: '#7b8495' }}>{d.browser || '—'}</span>
                      <span style={{ color: '#7b8495' }}>{d.os || '—'}</span>
                      <span style={{ color: '#7b8495' }}>{formatLastActive(d.last_active)}</span>
                      <div style={{ textAlign: 'right' }}>
                        {d.status === 'revoked' ? (
                          <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>REVOKED</span>
                        ) : d.status === 'active' ? (
                          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>ACTIVE</span>
                        ) : (
                          <span style={{ fontSize: 10, color: '#7b8495', fontWeight: 600 }}>INACTIVE</span>
                        )}
                        {d.status !== 'revoked' && !isCurrent && (
                          <button
                            className="xbtn"
                            style={{ fontSize: 10, padding: '2px 8px', color: '#dc2626', marginLeft: 6 }}
                            onClick={() => setRevokeTarget(d)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {revokeTarget && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: '#fee', border: '1px solid #f0c0c0' }}>
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Revoke device?</strong>
                <p style={{ fontSize: 12, color: '#7b8495', margin: '0 0 10px' }}>
                  {revokeTarget.device_name || revokeTarget.device_id} will no longer be able to access the workspace.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn danger" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => void handleRevoke()}>Revoke</button>
                  <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setRevokeTarget(null)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
