/**
 * Client-side AES-256-GCM encryption.
 * Key is derived from user passphrase using PBKDF2.
 * Server never sees the plaintext or the key.
 */

const PBKDF2_ITERATIONS = 250_000;
const SALT_KEY = 'ms_encryption_salt';
const VERIFY_KEY = 'ms_encryption_verify';

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function getOrCreateSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) {
    const arr = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return arr;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
  return salt;
}

/**
 * Verify passphrase by checking against a stored verification blob.
 * Returns true if correct, false if wrong, null if never set up.
 */
export async function verifyPassphrase(passphrase: string): Promise<boolean | null> {
  const verifyBlob = localStorage.getItem(VERIFY_KEY);
  if (!verifyBlob) return null;
  try {
    const { iv, data } = JSON.parse(verifyBlob);
    const salt = getOrCreateSalt();
    const key = await deriveKey(passphrase, salt);
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize encryption: derive key from passphrase and store verification blob.
 */
export async function setupEncryption(passphrase: string): Promise<void> {
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters');
  const salt = getOrCreateSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const testData = new TextEncoder().encode('verification');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, testData);
  localStorage.setItem(VERIFY_KEY, JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  }));
}

/**
 * Encrypt file bytes. Returns { encrypted, iv }.
 */
export async function encryptFile(
  fileData: ArrayBuffer,
  passphrase: string,
): Promise<{ encrypted: Uint8Array; iv: string }> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileData,
  );
  return {
    encrypted: new Uint8Array(encrypted),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt file bytes.
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  ivBase64: string,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData,
  );
  return new Uint8Array(decrypted);
}

/**
 * Check if encryption is set up
 */
export function isEncryptionSetup(): boolean {
  return !!localStorage.getItem(VERIFY_KEY);
}

export function clearEncryption(): void {
  localStorage.removeItem(VERIFY_KEY);
  localStorage.removeItem(SALT_KEY);
}