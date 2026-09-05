import { useState } from 'react';
import type { PasscodeError } from '@/utils/driveApi';

interface LoginScreenProps {
  onLogin: (passcode: string) => Promise<{ success: boolean; error?: PasscodeError }>;
}

const errorMessages: Record<PasscodeError, string> = {
  wrong: 'Passcode salah. Coba lagi.',
  rate_limited: 'Terlalu banyak percobaan. Coba lagi nanti.',
  server: 'Server authentication bermasalah.',
  network: 'Tidak dapat terhubung ke server authentication.',
  not_configured: 'Admin passcode belum dikonfigurasi.',
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('Passcode salah. Coba lagi.');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!pass || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const result = await onLogin(pass);
      if (!result.success) {
        setError(true);
        setErrorMsg(result.error ? errorMessages[result.error] : 'Passcode salah. Coba lagi.');
        setPass('');
      }
    } catch {
      setError(true);
      setErrorMsg('Tidak dapat terhubung ke server authentication.');
      setPass('');
    }
    setSubmitting(false);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">S</div>
        <div className="login-brand">My Storage</div>
        <h1>Welcome back</h1>
        <p>Masukkan passcode untuk membuka storage workspace.</p>
        <div className="pass-wrap">
          <input
            type={show ? 'text' : 'password'}
            maxLength={128}
            placeholder="Enter passcode"
            value={pass}
            disabled={submitting}
            onChange={(e) => { setPass(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <button className="login-btn" onClick={handleLogin} disabled={submitting || !pass}>
          {submitting ? 'Unlocking...' : 'Unlock Workspace'}
        </button>
        {error && <div className="login-error">{errorMsg}</div>}
        <small>Private workspace · Secure authentication</small>
      </div>
    </div>
  );
}
