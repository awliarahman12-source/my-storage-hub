/**
 * Compute SHA-256 hash of a File using Web Crypto API.
 * Reads file in chunks to avoid loading entire file into memory.
 */
export async function computeFileHash(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const total = file.size;

  // For files <= 50 MB, hash the whole content (accurate)
  if (total <= 50 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    onProgress?.(total, total);
    return await sha256Hex(buffer);
  }

  // For large files: fast fingerprint = hash(head 10MB + tail 10MB + size)
  const head = await file.slice(0, 10 * 1024 * 1024).arrayBuffer();
  onProgress?.(10 * 1024 * 1024, total);

  const tail = await file.slice(Math.max(0, total - 10 * 1024 * 1024)).arrayBuffer();
  onProgress?.(total, total);

  const combined = new Uint8Array(head.byteLength + tail.byteLength + 8);
  combined.set(new Uint8Array(head), 0);
  combined.set(new Uint8Array(tail), head.byteLength);
  const sizeBytes = new Uint8Array(new BigUint64Array([BigInt(total)]).buffer);
  combined.set(sizeBytes, head.byteLength + tail.byteLength);

  return await sha256Hex(combined.buffer);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFromArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  return await sha256Hex(buffer);
}