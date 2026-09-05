import { useState } from 'react';
import type { PasscodeError } from '@/utils/driveApi';

interface SetupScreenProps {
  onSetup: (passcode: string, confirm: string) => Promise<{ success: boolean; error?: PasscodeError }>;
}

const errorMessages: Record<PasscodeError, string> = {
  wrong: 'Passcode tidak valid.',
  rate_limited: 'Terlalu banyak percobaan. Coba lagi nanti.',
  server: 'Server authentication bermasalah.',
  network: 'Tidak dapat terhubung ke server authentication.',
  not_configured: 'Admin passcode sudah dikonfigurasi.',
};

export function SetupScreen({ onSetup }: SetupScreenProps) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSetup = async () => {
    if (!pass || !confirm || submitting) return;
    setError('');

    if (pass.length < 6) {
      setError('Passcode minimal 6 karakter.');
      return;
    }
    if (pass !== confirm) {
      setError('Passcode tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSetup(pass, confirm);
      if (!result.success) {
        setError(result.error ? errorMessages[result.error] : 'Gagal membuat passcode.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server authentication.');
    }
    setSubmitting(false);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">S</div>
        <div className="login-brand">My Storage</div>
        <h1>Set Admin Passcode</h1>
        <p>Buat passcode administrator untuk mengamankan My Storage Hub.</p>
        <div className="pass-wrap">
          <input
            type={show ? 'text' : 'password'}
            maxLength={128}
            placeholder="Admin Passcode"
            value={pass}
            disabled={submitting}
            onChange={(e) => { setPass(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
          />
          <button onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <div className="pass-wrap" style={{ marginTop: 8 }}>
          <input
            type={show ? 'text' : 'password'}
            maxLength={128}
            placeholder="Confirm Passcode"
            value={confirm}
            disabled={submitting}
            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
          />
        </div>
        <button className="login-btn" onClick={handleSetup} disabled={submitting || !pass || !confirm}>
          {submitting ? 'Creating...' : 'Create Passcode'}
        </button>
        {error && <div className="login-error">{error}</div>}
        <small>Passcode disimpan terenkripsi di server. Tidak ada passcode default.</small>
      </div>
    </div>
  );
}
