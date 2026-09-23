// Phase 14: DB search + Analytics + API Keys + Webhooks + Share Links + Cross-drive
import {
  getEnv,
  getSupabase,
  corsHeaders,
  securityHeaders,
  jsonHeaders,
  validateSession,
  HttpError,
  errorResponse,
  validateId,
  validateString,
  validateEmail,
  validateRole,
  validateNumber,
  validateRoutingMode,
  validateBoolean,
  validateOptionalString,
} from "../_shared/security.ts";

interface StorageNodeRow {
  id: string;
  provider: string;
  provider_account_id: string;
  email: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  cap: number;
  used: number;
  priority: number;
  enabled: boolean;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  iconLink?: string;
  hasThumbnail?: boolean;
}

interface SessionInfo {
  id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  ip_address: string | null;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
}

function getClientId(): string { return getEnv("GOOGLE_CLIENT_ID"); }
function getClientSecret(): string { return getEnv("GOOGLE_CLIENT_SECRET"); }

// ============ Retry helper ============

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 && res.status !== 503) return res;
    lastRes = res;
    const retryAfter = res.headers.get("Retry-After");
    const delayMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 30000) : Math.min(1000 * Math.pow(2, attempt), 15000);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return lastRes!;
}

async function refreshAccessToken(node: StorageNodeRow): Promise<string> {
  if (!node.refresh_token) throw new Error("No refresh token for this storage node");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: node.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let errMsg = `Token refresh failed (${res.status})`;
    try { const errData = JSON.parse(errText); errMsg = errData.error_description || errData.error?.message || errMsg; } catch { /* */ }
    throw new Error(errMsg);
  }
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  const supabase = getSupabase();
  await supabase.from("storage_nodes").update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
    last_checked_at: new Date().toISOString(),
    status: "connected",
  }).eq("id", node.id);
  return data.access_token;
}

async function getValidAccessToken(node: StorageNodeRow): Promise<string> {
  if (!node.access_token) throw new Error("No access token for this node");
  if (node.token_expires_at) {
    const expiresAt = new Date(node.token_expires_at).getTime();
    if (Date.now() > expiresAt - 60000) return await refreshAccessToken(node);
  }
  return node.access_token;
}

// ============ Cross-drive helpers ============

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";
const MAX_CROSS_DRIVE_BYTES = 100 * 1024 * 1024;

function isGoogleNative(m: string): boolean { return m.startsWith(GOOGLE_APPS_PREFIX); }

function exportMimeFor(m: string): { exportMime: string; ext: string } {
  if (m === "application/vnd.google-apps.document") return { exportMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" };
  if (m === "application/vnd.google-apps.spreadsheet") return { exportMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" };
  if (m === "application/vnd.google-apps.presentation") return { exportMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx" };
  return { exportMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" };
}

async function fetchDriveContent(token: string, fileId: string, originalName: string, originalMime: string) {
  if (isGoogleNative(originalMime)) {
    const { exportMime, ext } = exportMimeFor(originalMime);
    const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const filename = originalName.toLowerCase().endsWith(ext) ? originalName : originalName + ext;
    return { blob, mimeType: exportMime, filename };
  }
  const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return { blob: await res.blob(), mimeType: originalMime, filename: originalName };
}

async function uploadToDrive(destToken: string, filename: string, mimeType: string, parentFolderId: string | null, blob: Blob): Promise<DriveFile> {
  const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isXlsx = mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const isPptx = mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const needsConvert = isDocx || isXlsx || isPptx;
  const targetMime = isDocx ? "application/vnd.google-apps.document" : isXlsx ? "application/vnd.google-apps.spreadsheet" : isPptx ? "application/vnd.google-apps.presentation" : mimeType;
  const uploadName = needsConvert ? filename.replace(/\.(docx|xlsx|pptx)$/i, "") : filename;
  const metadata: Record<string, unknown> = { name: uploadName, mimeType: targetMime, parents: [parentFolderId && parentFolderId !== "root" ? parentFolderId : "root"] };
  const size = blob.size;
  const useResumable = size >= 5 * 1024 * 1024;
  const fields = "id,name,mimeType,size,parents,modifiedTime,createdTime,thumbnailLink,webViewLink,webContentLink,starred,trashed,shared,iconLink";
  const convertParam = needsConvert ? "&convert=true" : "";

  if (useResumable) {
    const initRes = await fetchWithRetry(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable${convertParam}&fields=${encodeURIComponent(fields)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${destToken}`, "Content-Type": "application/json", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(size) },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) throw new Error(`Resumable init failed (${initRes.status})`);
    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) throw new Error("No Location header");
    const putRes = await fetchWithRetry(uploadUrl, { method: "PUT", headers: { "Content-Length": String(size) }, body: blob });
    if (!putRes.ok) throw new Error(`Resumable upload failed (${putRes.status})`);
    return await putRes.json() as DriveFile;
  }

  const boundary = "mshub_" + Math.random().toString(36).slice(2);
  const encoder = new TextEncoder();
  const contentBuffer = new Uint8Array(await blob.arrayBuffer());
  const parts: Uint8Array[] = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    encoder.encode(JSON.stringify(metadata)),
    encoder.encode(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    contentBuffer,
    encoder.encode(`\r\n--${boundary}--`),
  ];
  const body = new Blob(parts);
  const res = await fetchWithRetry(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart${convertParam}&fields=${encodeURIComponent(fields)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${destToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Multipart upload failed (${res.status})`);
  return await res.json() as DriveFile;
}

// ============ Storage helpers ============

async function fetchDriveFiles(node: StorageNodeRow, query: string, pageSize: number, pageToken?: string, orderBy?: string) {
  const token = await getValidAccessToken(node);
  const params = new URLSearchParams({
    q: query, pageSize: String(pageSize),
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webContentLink,webViewLink,starred,trashed,shared,iconLink)",
    orderBy: orderBy || "folder,name",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) {
      const newToken = await refreshAccessToken(node);
      const retryRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${newToken}` } });
      if (!retryRes.ok) throw new Error(`Drive API error (${retryRes.status})`);
      return await retryRes.json();
    }
    throw new Error(`Drive API error (${res.status})`);
  }
  return await res.json();
}

async function getDriveFile(node: StorageNodeRow, fileId: string): Promise<DriveFile> {
  const token = await getValidAccessToken(node);
  const params = new URLSearchParams({ fields: "id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webContentLink,webViewLink,starred,trashed,shared,iconLink" });
  const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error (${res.status})`);
  return await res.json();
}

async function getStorageNode(supabase: ReturnType<typeof getSupabase>, nodeId: string): Promise<StorageNodeRow> {
  const { data, error } = await supabase.from("storage_nodes").select("*").eq("id", nodeId).maybeSingle();
  if (error || !data) throw new Error("Storage node not found");
  return data as StorageNodeRow;
}

async function getAllStorageNodes(supabase: ReturnType<typeof getSupabase>): Promise<StorageNodeRow[]> {
  const { data, error } = await supabase.from("storage_nodes").select("*").order("priority", { ascending: true });
  if (error) throw new Error("Failed to fetch storage nodes");
  return (data || []) as StorageNodeRow[];
}

async function getDriveQuota(node: StorageNodeRow): Promise<{ total: number | null; used: number | null }> {
  try {
    const token = await getValidAccessToken(node);
    const res = await fetchWithRetry("https://www.googleapis.com/drive/v3/about?fields=storageQuota", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { total: null, used: null };
    const data = await res.json();
    const sq = data?.storageQuota;
    return { total: sq?.limit ? Number(sq.limit) : null, used: sq?.usage ? Number(sq.usage) : null };
  } catch {
    return { total: null, used: null };
  }
}

function mapFileType(m: string): string {
  if (m === "application/vnd.google-apps.folder") return "folder";
  if (m.startsWith("image/")) return "img";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("audio/")) return "audio";
  if (m.includes("zip") || m.includes("compressed") || m.includes("archive")) return "zip";
  return "file";
}

function formatFileSize(b: number): string {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, x = b;
  while (x >= 1024 && i < 4) { x /= 1024; i++; }
  return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + " " + u[i];
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
}

function publicFile(file: DriveFile, node: StorageNodeRow) {
  const type = mapFileType(file.mimeType);
  return {
    id: file.id, nodeId: node.id, name: file.name, type, mimeType: file.mimeType,
    size: file.size ? Number(file.size) : 0,
    sizeLabel: file.size ? formatFileSize(Number(file.size)) : "—",
    modified: file.modifiedTime ? formatDate(file.modifiedTime) : "—",
    modifiedRaw: file.modifiedTime || null, createdRaw: file.createdTime || null,
    drive: node.display_name || node.email, driveEmail: node.email,
    starred: file.starred || false, trashed: file.trashed || false, shared: file.shared || false,
    thumbnail: file.thumbnailLink || null, webViewLink: file.webViewLink || null, webContentLink: file.webContentLink || null,
    isFolder: type === "folder", parentGoogleId: file.parents?.[0] || null,
  };
}

// ============ API Key helpers ============

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < arr.length; i++) result += chars[arr[i] % chars.length];
  return "msk_" + result;
}

function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < arr.length; i++) result += chars[arr[i] % chars.length];
  return result;
}

// ============ Webhook helpers ============

async function signWebhookPayload(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function dispatchWebhook(supabase: ReturnType<typeof getSupabase>, eventType: string, payload: Record<string, unknown>) {
  try {
    const { data: hooks } = await supabase.from("webhooks").select("*").eq("enabled", true).contains("events", [eventType]);
    if (!hooks || hooks.length === 0) return;
    for (const hook of hooks) {
      const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data: payload });
      const signature = await signWebhookPayload(hook.secret, body);
      const { data: delivery } = await supabase.from("webhook_deliveries").insert({ webhook_id: hook.id, event_type: eventType, payload, status: "pending" }).select("*").single();
      void (async () => {
        try {
          const res = await fetch(hook.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Webhook-Signature": `sha256=${signature}`, "X-Webhook-Event": eventType },
            body,
          });
          const responseBody = await res.text().catch(() => "");
          await supabase.from("webhook_deliveries").update({ status: res.ok ? "delivered" : "failed", response_code: res.status, response_body: responseBody.substring(0, 500), delivered_at: new Date().toISOString(), attempts: 1 }).eq("id", delivery?.id || "");
          await supabase.from("webhooks").update({ last_triggered_at: new Date().toISOString(), failure_count: res.ok ? 0 : (hook.failure_count || 0) + 1 }).eq("id", hook.id);
        } catch (err) {
          await supabase.from("webhook_deliveries").update({ status: "failed", response_body: err instanceof Error ? err.message : "Network error", attempts: 1 }).eq("id", delivery?.id || "");
        }
      })();
    }
  } catch { /* best-effort */ }
}

// ============ Share helpers ============

interface ShareRow {
  id: string;
  token: string;
  name: string;
  kind: string;
  node_id: string;
  folder_id: string | null;
  file_id: string | null;
  role: string;
  password_hash: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  view_count: number;
  revoked: boolean;
  created_at: string;
  updated_at: string;
}

function publicShare(s: ShareRow) {
  return {
    id: s.id,
    token: s.token,
    name: s.name,
    kind: s.kind,
    node_id: s.node_id,
    folder_id: s.folder_id,
    file_id: s.file_id,
    role: s.role,
    has_password: !!s.password_hash,
    expires_at: s.expires_at,
    max_downloads: s.max_downloads,
    download_count: s.download_count,
    view_count: s.view_count,
    revoked: s.revoked,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

async function loadShareByToken(supabase: ReturnType<typeof getSupabase>, token: string): Promise<ShareRow | null> {
  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as ShareRow;
}

function isShareExpired(s: ShareRow): boolean {
  if (!s.expires_at) return false;
  return new Date(s.expires_at) < new Date();
}

function checkSharePassword(s: ShareRow, password: string | null): boolean {
  if (!s.password_hash) return true;
  if (!password) return false;
  // password_hash stored as SHA-256 hex of password
  return false; // placeholder, verified async in endpoint
}

async function verifySharePw(s: ShareRow, password: string | null): Promise<boolean> {
  if (!s.password_hash) return true;
  if (!password) return false;
  const hash = await sha256Hex(password);
  return hash === s.password_hash;
}

// ============ Main handler ============

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const ch = corsHeaders(origin);
  const sh = securityHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...ch, ...sh } });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/drive-ops/, "");

  // ============ PUBLIC SHARE ENDPOINTS (no auth) ============
  if (path.startsWith("/share/")) {
    try {
      const supabase = getSupabase();
      const parts = path.split("/").filter(Boolean);
      // /share/:token/... → parts = ['share', token, ...rest]
      const token = parts[1];
      const rest = parts.slice(2);
      if (!token) throw new HttpError(400, "Missing token");

      const share = await loadShareByToken(supabase, token);
      if (!share) throw new HttpError(404, "Not found");

      // Info endpoint
      if (rest.length === 0 && req.method === "GET") {
        return new Response(JSON.stringify({
          name: share.name,
          kind: share.kind,
          role: share.role,
          has_password: !!share.password_hash,
          expires_at: share.expires_at,
          revoked: share.revoked,
          expired: isShareExpired(share),
        }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      if (share.revoked) throw new HttpError(410, "Revoked");
      if (isShareExpired(share)) throw new HttpError(410, "Expired");

      // Verify password endpoint
      if (rest[0] === "verify" && req.method === "POST") {
        const body = await req.json();
        const ok = await verifySharePw(share, body.password || null);
        return new Response(JSON.stringify({ ok }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // All other endpoints need password verified
      const pw = url.searchParams.get("pw");
      const pwOk = await verifySharePw(share, pw);
      if (!pwOk) throw new HttpError(401, "Password required");

      // Increment view count on info access (roughly)
      if (rest.length === 0 || rest[0] === "files") {
        void supabase.from("share_links").update({ view_count: share.view_count + 1 }).eq("id", share.id);
      }

      const node = await getStorageNode(supabase, share.node_id);

      // Files listing
      if (rest[0] === "files" && req.method === "GET") {
        const folderId = url.searchParams.get("path") || share.folder_id || "root";
        const query = folderId === "root" ? "'root' in parents and trashed = false" : `'${folderId}' in parents and trashed = false`;
        const result = await fetchDriveFiles(node, query, 200, undefined, "folder,name");

        // Get comment counts
        const fileIds = (result.files || []).map((f: DriveFile) => f.id);
        let commentCounts: Record<string, number> = {};
        if (fileIds.length > 0) {
          const { data: comments } = await supabase
            .from("share_comments")
            .select("file_id")
            .eq("share_link_id", share.id)
            .in("file_id", fileIds);
          if (comments) {
            for (const c of comments) {
              commentCounts[c.file_id] = (commentCounts[c.file_id] || 0) + 1;
            }
          }
        }

        const files = (result.files || []).map((f: DriveFile) => {
          const type = mapFileType(f.mimeType);
          const canPreview = type === "folder" || type === "img" || type === "video" || type === "audio" || type === "pdf" || f.mimeType.startsWith("text/") || f.mimeType.includes("json") || f.mimeType.includes("xml") || f.mimeType.includes("markdown") || f.mimeType.startsWith("application/vnd.google-apps.");
          const previewKind =
            type === "folder" ? "folder"
            : type === "img" ? "image"
            : type === "video" ? "video"
            : type === "audio" ? "audio"
            : type === "pdf" ? "pdf"
            : f.mimeType.startsWith("application/vnd.google-apps.") ? "gdoc"
            : (f.mimeType.startsWith("text/") || f.mimeType.includes("json") || f.mimeType.includes("xml") || f.mimeType.includes("markdown")) ? "text"
            : "unsupported";
          return {
            id: f.id,
            name: f.name,
            type,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : 0,
            sizeLabel: f.size ? formatFileSize(Number(f.size)) : "—",
            modified: f.modifiedTime ? formatDate(f.modifiedTime) : "—",
            modifiedRaw: f.modifiedTime || null,
            isFolder: type === "folder",
            canPreview,
            previewKind,
            thumbnailUrl: type === "folder" ? null : `/functions/v1/drive-ops/share/${share.token}/thumb/${f.id}${pw ? `?pw=${encodeURIComponent(pw)}` : ""}`,
            streamUrl: type === "folder" ? null : `/functions/v1/drive-ops/share/${share.token}/stream/${f.id}${pw ? `?pw=${encodeURIComponent(pw)}` : ""}`,
            downloadUrl: type === "folder" ? null : `/functions/v1/drive-ops/share/${share.token}/download/${f.id}${pw ? `?pw=${encodeURIComponent(pw)}` : ""}`,
            comments: commentCounts[f.id] || 0,
          };
        });

        // Breadcrumbs — just simple for now
        const breadcrumbs: { id: string; name: string }[] = [];
        if (folderId && folderId !== share.folder_id && folderId !== "root") {
          try {
            const folderMeta = await getDriveFile(node, folderId);
            breadcrumbs.push({ id: folderMeta.id, name: folderMeta.name });
          } catch { /* ignore */ }
        }

        return new Response(JSON.stringify({ files, breadcrumbs }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // File metadata
      const fileMetaMatch = rest[0] === "file" && rest[1];
      if (fileMetaMatch && req.method === "GET") {
        const file = await getDriveFile(node, rest[1]);
        return new Response(JSON.stringify(publicFile(file, node)), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // Thumbnail proxy
      if (rest[0] === "thumb" && rest[1] && req.method === "GET") {
        const fileId = rest[1];
        const token2 = await getValidAccessToken(node);
        const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&fields=thumbnailLink`, {
          headers: { Authorization: `Bearer ${token2}` },
        });
        // Fallback: use thumbnailLink
        const fileMeta = await getDriveFile(node, fileId);
        if (fileMeta.thumbnailLink) {
          const imgRes = await fetch(fileMeta.thumbnailLink);
          if (imgRes.ok) {
            const headers = new Headers(ch);
            headers.set("Content-Type", imgRes.headers.get("Content-Type") || "image/jpeg");
            headers.set("Cache-Control", "public, max-age=3600");
            return new Response(imgRes.body, { headers });
          }
        }
        // Fallback: stream full file
        const fullRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token2}` },
        });
        if (!fullRes.ok) throw new HttpError(fullRes.status, "Failed");
        const headers = new Headers(ch);
        headers.set("Content-Type", fileMeta.mimeType || "image/jpeg");
        headers.set("Cache-Control", "public, max-age=3600");
        return new Response(fullRes.body, { headers });
      }

      // Stream (for video/image/audio/pdf/text preview)
      if (rest[0] === "stream" && rest[1] && req.method === "GET") {
        const fileId = rest[1];
        const token2 = await getValidAccessToken(node);
        const fileMeta = await getDriveFile(node, fileId);

        // Google Docs/Sheets/Slides → export as PDF
        if (fileMeta.mimeType.startsWith("application/vnd.google-apps.")) {
          if (fileMeta.mimeType === "application/vnd.google-apps.folder") {
            throw new HttpError(400, "Cannot preview folder");
          }
          const exportType = "application/pdf";
          const res = await fetchWithRetry(
            `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportType)}`,
            { headers: { Authorization: `Bearer ${token2}` } },
          );
          if (!res.ok) throw new HttpError(res.status, "Export failed");
          const outHeaders = new Headers(ch);
          outHeaders.set("Content-Type", exportType);
          outHeaders.set("Content-Disposition", `inline; filename="${fileMeta.name}.pdf"`);
          outHeaders.set("Cache-Control", "public, max-age=3600");
          return new Response(res.body, { headers: outHeaders });
        }

        // Regular file → stream with range support
        const range = req.headers.get("Range");
        const headers: Record<string, string> = { Authorization: `Bearer ${token2}` };
        if (range) headers.Range = range;
        const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
        if (!res.ok) throw new HttpError(res.status, "Failed");
        const outHeaders = new Headers(ch);
        outHeaders.set("Content-Type", fileMeta.mimeType || res.headers.get("Content-Type") || "application/octet-stream");
        if (res.headers.get("Content-Length")) outHeaders.set("Content-Length", res.headers.get("Content-Length")!);
        if (res.headers.get("Content-Range")) outHeaders.set("Content-Range", res.headers.get("Content-Range")!);
        outHeaders.set("Accept-Ranges", "bytes");
        outHeaders.set("Cache-Control", "public, max-age=3600");
        return new Response(res.body, { status: res.status, headers: outHeaders });
      }

      // Download
      if (rest[0] === "download" && rest[1] && req.method === "GET") {
        const fileId = rest[1];
        const fileMeta = await getDriveFile(node, fileId);
        if (share.max_downloads && share.download_count >= share.max_downloads) {
          throw new HttpError(429, "Download limit reached");
        }
        const token2 = await getValidAccessToken(node);
        const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token2}` },
        });
        if (!res.ok) throw new HttpError(res.status, "Failed");
        void supabase.from("share_links").update({ download_count: share.download_count + 1 }).eq("id", share.id);
        const headers = new Headers(ch);
        headers.set("Content-Type", fileMeta.mimeType || "application/octet-stream");
        headers.set("Content-Disposition", `attachment; filename="${fileMeta.name}"`);
        return new Response(res.body, { headers });
      }

      // Comments GET
      if (rest[0] === "comments" && req.method === "GET") {
        const fileId = url.searchParams.get("fileId");
        if (!fileId) throw new HttpError(400, "fileId required");
        const { data, error } = await supabase
          .from("share_comments")
          .select("*")
          .eq("share_link_id", share.id)
          .eq("file_id", fileId)
          .order("created_at", { ascending: true });
        if (error) throw new Error("Failed to fetch comments");
        return new Response(JSON.stringify({ comments: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      // Comments POST
      if (rest[0] === "comments" && req.method === "POST") {
        if (share.role !== "commenter" && share.role !== "editor") {
          throw new HttpError(403, "Only commenters and editors can post comments");
        }
        const body = await req.json();
        const fileId = body.fileId;
        const authorName = body.authorName || "Anonymous";
        const content = body.content;
        const pwParam = body.pw;
        // Verify password again if provided in body
        if (share.password_hash && pwParam) {
          const ok = await verifySharePw(share, pwParam);
          if (!ok) throw new HttpError(401, "Invalid password");
        }
        if (!fileId || !content || typeof content !== "string" || content.length > 2000) {
          throw new HttpError(400, "fileId and content required (max 2000 chars)");
        }
        const { data, error } = await supabase.from("share_comments").insert({
          share_link_id: share.id,
          file_id: fileId,
          author_name: String(authorName).substring(0, 60),
          content: String(content).substring(0, 2000),
        }).select("*").single();
        if (error) throw new Error("Failed to post comment");
        return new Response(JSON.stringify({ comment: data }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      throw new HttpError(404, "Not found");
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.message, origin);
      console.error("public share error:", err instanceof Error ? err.message : String(err));
      return errorResponse(500, "Internal server error", origin);
    }
  }

  // ============ AUTHENTICATED ENDPOINTS ============

  const apiKeyHeader = req.headers.get("X-API-Key");
  let session: SessionInfo | null = null;
  let authedViaApiKey = false;
  let apiKeyScopes: string[] = [];

  if (apiKeyHeader) {
    const keyHash = await sha256Hex(apiKeyHeader);
    const supabase = getSupabase();
    const { data: key } = await supabase.from("api_keys").select("*").eq("key_hash", keyHash).eq("revoked", false).maybeSingle();
    if (key) {
      if (key.expires_at && new Date(key.expires_at) < new Date()) return errorResponse(401, "API key expired", origin);
      authedViaApiKey = true;
      apiKeyScopes = key.scopes || [];
      void supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    } else {
      return errorResponse(401, "Invalid API key", origin);
    }
  } else {
    session = await validateSession(req);
    if (!session) return errorResponse(401, "Unauthorized", origin);
  }

  const requireScope = (scope: string) => {
    if (!authedViaApiKey) return;
    if (apiKeyScopes.includes("admin")) return;
    if (!apiKeyScopes.includes(scope)) throw new HttpError(403, `API key missing scope: ${scope}`);
  };

  try {
    const supabase = getSupabase();
    const nodes = await getAllStorageNodes(supabase);
    const connectedNodes = nodes.filter((n) => n.status === "connected" && n.access_token && n.enabled !== false);

    // ============ SHARE MANAGEMENT (auth) ============

    if (path === "/shares" && req.method === "GET") {
      const { data, error } = await supabase
        .from("share_links")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error("Failed to fetch shares");
      return new Response(JSON.stringify({ shares: (data || []).map(publicShare) }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/shares" && req.method === "POST") {
      const body = await req.json();
      const { name, kind, nodeId, folderId, fileId, role, password, expiresInDays, maxDownloads } = body;
      if (!kind || !nodeId || !role) throw new HttpError(400, "kind, nodeId, role required");
      if (kind !== "folder" && kind !== "file") throw new HttpError(400, "kind must be folder or file");
      if (!["viewer", "commenter", "editor"].includes(role)) throw new HttpError(400, "invalid role");

      const token = generateShareToken();
      const password_hash = password ? await sha256Hex(password) : null;
      const expires_at = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400 * 1000).toISOString() : null;

      const { data, error } = await supabase.from("share_links").insert({
        token,
        name: String(name || "Shared").substring(0, 100),
        kind,
        node_id: nodeId,
        folder_id: kind === "folder" ? (folderId || null) : null,
        file_id: kind === "file" ? (fileId || null) : null,
        role,
        password_hash,
        expires_at,
        max_downloads: maxDownloads || null,
      }).select("*").single();

      if (error) throw new Error("Failed to create share");

      const baseUrl = `${url.origin}/functions/v1/drive-ops/share/${token}`;
      return new Response(JSON.stringify({ share: publicShare(data as ShareRow), url: baseUrl }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const shareIdMatch = path.match(/^\/shares\/([^/]+)$/);
    if (shareIdMatch && req.method === "DELETE") {
      const id = shareIdMatch[1];
      await supabase.from("share_links").update({ revoked: true }).eq("id", id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (shareIdMatch && req.method === "PATCH") {
      const id = shareIdMatch[1];
      const body = await req.json();
      const patch: Record<string, unknown> = {};
      if (body.role) patch.role = body.role;
      if (body.expires_at !== undefined) patch.expires_at = body.expires_at;
      if (body.max_downloads !== undefined) patch.max_downloads = body.max_downloads;
      const { data, error } = await supabase.from("share_links").update(patch).eq("id", id).select("*").single();
      if (error) throw new Error("Failed to update share");
      return new Response(JSON.stringify({ share: publicShare(data as ShareRow) }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // ============ EXISTING ENDPOINTS (files, nodes, etc.) ============

    if (path === "/files" && req.method === "GET") {
      requireScope("files:read");
      const folderId = url.searchParams.get("folderId") || "root";
      const pageSize = Math.min(Number(url.searchParams.get("pageSize") || 100), 200);
      const pageToken = url.searchParams.get("pageToken") || undefined;
      const trashed = url.searchParams.get("trashed") === "true";
      const starredOnly = url.searchParams.get("starred") === "true";
      const sharedOnly = url.searchParams.get("shared") === "true";
      const typeFilter = url.searchParams.get("type");
      const orderBy = url.searchParams.get("orderBy") || undefined;

      if (connectedNodes.length === 0) return new Response(JSON.stringify({ files: [], nodes: [], hasMore: false }), { headers: { ...ch, "Content-Type": "application/json" } });

      const allFiles: ReturnType<typeof publicFile>[] = [];
      const nodePageTokens: Record<string, string | undefined> = {};
      let hasMore = false;

      for (const node of connectedNodes) {
        let query = trashed ? "trashed = true" : "trashed = false";
        if (starredOnly) query += " and starred = true";
        if (sharedOnly) query += " and shared = true";
        if (folderId !== "root") query += ` and '${folderId}' in parents`;
        else if (!trashed && !starredOnly && !sharedOnly) query += " and 'root' in parents";
        if (typeFilter === "img") query += " and mimeType contains 'image/'";
        else if (typeFilter === "video") query += " and mimeType contains 'video/'";
        else if (typeFilter === "folder") query += " and mimeType = 'application/vnd.google-apps.folder'";

        try {
          const result = await fetchDriveFiles(node, query, pageSize, pageToken, orderBy);
          for (const f of result.files) allFiles.push(publicFile(f, node));
          if (result.nextPageToken) { nodePageTokens[node.id] = result.nextPageToken; hasMore = true; }
        } catch { /* skip */ }
      }

      return new Response(JSON.stringify({ files: allFiles, hasMore, pageTokens: hasMore ? nodePageTokens : undefined }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/search" && req.method === "GET") {
      requireScope("files:read");
      const q = url.searchParams.get("q") || "";
      if (!q || connectedNodes.length === 0) return new Response(JSON.stringify({ files: [] }), { headers: { ...ch, "Content-Type": "application/json" } });
      const escapedQ = q.replace(/'/g, "\\'");
      const allFiles: ReturnType<typeof publicFile>[] = [];
      for (const node of connectedNodes) {
        const query = `name contains '${escapedQ}' and trashed = false`;
        try {
          const { files } = await fetchDriveFiles(node, query, 50);
          for (const f of files) allFiles.push(publicFile(f, node));
        } catch { /* skip */ }
      }
      return new Response(JSON.stringify({ files: allFiles }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/search-db" && req.method === "GET") {
      requireScope("files:read");
      const q = url.searchParams.get("q") || "";
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 200);
      if (!q.trim()) return new Response(JSON.stringify({ results: [] }), { headers: { ...ch, "Content-Type": "application/json" } });
      const tsQuery = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\w]/g, "") + ":*").join(" & ");
      let query = supabase.from("file_mappings").select("id, storage_node_id, google_file_id, filename, mime_type, size, starred, trashed, updated_at").eq("trashed", false).limit(limit);
      if (tsQuery) query = query.textSearch("search_vector", tsQuery, { config: "simple" });
      const { data, error } = await query;
      if (error) return new Response(JSON.stringify({ results: [], error: error.message }), { headers: { ...ch, "Content-Type": "application/json" } });
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const results = (data || []).map((row) => {
        const node = nodeMap.get(row.storage_node_id);
        return {
          id: row.google_file_id, nodeId: row.storage_node_id, name: row.filename,
          mimeType: row.mime_type || "application/octet-stream", size: Number(row.size || 0),
          modified: row.updated_at, drive: node?.display_name || node?.email || "Unknown",
          driveEmail: node?.email || "", thumbnail: null,
          isFolder: row.mime_type === "application/vnd.google-apps.folder",
          starred: row.starred || false, shared: false,
        };
      });
      return new Response(JSON.stringify({ results }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/check-duplicate" && req.method === "GET") {
      requireScope("files:read");
      const filename = url.searchParams.get("filename") || "";
      const parentGoogleId = url.searchParams.get("parentGoogleId");
      if (!filename) return new Response(JSON.stringify({ exists: false, nodes: [] }), { headers: { ...ch, "Content-Type": "application/json" } });
      const escapedName = filename.replace(/'/g, "\\'");
      const query = parentGoogleId && parentGoogleId !== "root"
        ? `name = '${escapedName}' and '${parentGoogleId}' in parents and trashed = false`
        : `name = '${escapedName}' and trashed = false`;
      const foundNodes: { nodeId: string; fileId: string; drive: string }[] = [];
      for (const node of connectedNodes) {
        try {
          const { files } = await fetchDriveFiles(node, query, 5);
          for (const f of files) foundNodes.push({ nodeId: node.id, fileId: f.id, drive: node.display_name || node.email });
        } catch { /* skip */ }
      }
      return new Response(JSON.stringify({ exists: foundNodes.length > 0, nodes: foundNodes }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/nodes" && req.method === "GET") {
      requireScope("nodes:read");
      const nodesWithQuota = await Promise.all(nodes.map(async (n) => {
        let cap = n.cap, used = n.used, quotaAvailable = false;
        if (n.status === "connected" && n.access_token) {
          const quota = await getDriveQuota(n);
          if (quota.total !== null) { cap = quota.total / (1024 ** 3); quotaAvailable = true; }
          if (quota.used !== null) used = quota.used / (1024 ** 3);
        }
        return { id: n.id, provider: n.provider, providerAccountId: n.provider_account_id, email: n.email, displayName: n.display_name, avatar: n.avatar, status: n.status, cap, used, priority: n.priority, enabled: n.enabled ?? true, connectedAt: n.connected_at, lastCheckedAt: n.last_checked_at, quotaAvailable };
      }));
      return new Response(JSON.stringify({ nodes: nodesWithQuota }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/pool" && req.method === "GET") {
      let totalCap = 0, totalUsed = 0, connectedCount = 0, healthyCount = 0, quotaAvailable = false;
      for (const n of nodes) {
        if (n.status === "connected") {
          connectedCount++;
          let cap = n.cap, used = n.used;
          if (n.access_token) {
            const quota = await getDriveQuota(n);
            if (quota.total !== null) { cap = quota.total / (1024 ** 3); quotaAvailable = true; }
            if (quota.used !== null) used = quota.used / (1024 ** 3);
            healthyCount++;
          }
          totalCap += cap; totalUsed += used;
        }
      }
      return new Response(JSON.stringify({ connectedDrives: connectedCount, healthyDrives: healthyCount, totalCap, totalUsed, totalAvailable: Math.max(0, totalCap - totalUsed), quotaAvailable }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const fileMatch = path.match(/^\/file\/([^/]+)$/);
    if (fileMatch && req.method === "GET") {
      requireScope("files:read");
      const fileId = fileMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new HttpError(400, "nodeId is required");
      const node = await getStorageNode(supabase, nodeId);
      const file = await getDriveFile(node, fileId);
      return new Response(JSON.stringify(publicFile(file, node)), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const downloadMatch = path.match(/^\/download\/([^/]+)$/);
    if (downloadMatch && req.method === "GET") {
      requireScope("files:read");
      const fileId = downloadMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new HttpError(400, "nodeId is required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const file = await getDriveFile(node, fileId);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(res.status, `Download failed`);
      const headers = new Headers(ch);
      headers.set("Content-Type", file.mimeType || "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename="${file.name}"`);
      return new Response(res.body, { headers });
    }

    const previewMatch = path.match(/^\/preview\/([^/]+)$/);
    if (previewMatch && req.method === "GET") {
      requireScope("files:read");
      const fileId = previewMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new HttpError(400, "nodeId is required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const file = await getDriveFile(node, fileId);
      if (file.mimeType.startsWith("application/vnd.google-apps.")) {
        const exportType = "application/pdf";
        const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportType}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new HttpError(res.status, `Export failed`);
        const headers = new Headers(ch);
        headers.set("Content-Type", exportType);
        return new Response(res.body, { headers });
      }
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(res.status, `Preview failed`);
      const headers = new Headers(ch);
      headers.set("Content-Type", file.mimeType || "application/octet-stream");
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(res.body, { headers });
    }

    const textPreviewMatch = path.match(/^\/text-preview\/([^/]+)$/);
    if (textPreviewMatch && req.method === "GET") {
      requireScope("files:read");
      const fileId = textPreviewMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new HttpError(400, "nodeId is required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(res.status, `Text preview failed`);
      const text = await res.text();
      const truncated = text.length > 100000 ? text.substring(0, 100000) + "\n\n... (truncated)" : text;
      return new Response(JSON.stringify({ content: truncated }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/folders" && req.method === "GET") {
      requireScope("files:read");
      const nodeId = url.searchParams.get("nodeId");
      const listAll = url.searchParams.get("all") === "true";
      if (!nodeId && !listAll) throw new HttpError(400, "nodeId or all=true required");
      const nodesToList = listAll ? nodes.filter((n) => n.status === "connected") : [await getStorageNode(supabase, nodeId!)];
      const allFolders: { id: string; name: string; parents?: string[]; nodeId: string; driveName: string }[] = [];
      for (const n of nodesToList) {
        try {
          const token = await getValidAccessToken(n);
          const params = new URLSearchParams({ q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false", pageSize: "200", fields: "files(id,name,parents)", orderBy: "name" });
          const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            for (const f of data.files || []) allFolders.push({ ...f, nodeId: n.id, driveName: n.display_name || n.email || n.id });
          }
        } catch { /* skip */ }
      }
      return new Response(JSON.stringify({ folders: allFolders }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/rename" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, newName } = body;
      if (!fileId || !nodeId || !newName) throw new HttpError(400, "fileId, nodeId, newName required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new HttpError(res.status, `Rename failed`);
      const updated = await res.json();
      void dispatchWebhook(supabase, "file.renamed", { fileId, nodeId, newName });
      return new Response(JSON.stringify(publicFile(updated, node)), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/trash" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
      if (!res.ok) throw new HttpError(res.status, `Trash failed`);
      void dispatchWebhook(supabase, "file.deleted", { fileId, nodeId });
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/untrash" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: false }),
      });
      if (!res.ok) throw new HttpError(res.status, `Untrash failed`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/star" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, starred } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ starred: starred !== false }),
      });
      if (!res.ok) throw new HttpError(res.status, `Star failed`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/copy" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, destNodeId, destFolderId } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      if (!destNodeId || destNodeId === nodeId) {
        const copyBody: Record<string, unknown> = {};
        if (destFolderId && destFolderId !== "root") copyBody.parents = [destFolderId];
        const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(copyBody),
        });
        if (!res.ok) throw new HttpError(res.status, `Copy failed`);
        const copied = await res.json();
        return new Response(JSON.stringify(publicFile(copied, node)), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      const sourceMeta = await getDriveFile(node, fileId);
      const sizeBytes = sourceMeta.size ? Number(sourceMeta.size) : 0;
      if (sizeBytes > MAX_CROSS_DRIVE_BYTES) throw new HttpError(413, `File too large (max 100 MB)`);
      const destNode = await getStorageNode(supabase, destNodeId);
      const destToken = await getValidAccessToken(destNode);
      const { blob, mimeType, filename } = await fetchDriveContent(token, fileId, sourceMeta.name, sourceMeta.mimeType);
      const uploaded = await uploadToDrive(destToken, filename, mimeType, destFolderId || null, blob);
      await supabase.from("file_mappings").upsert({
        storage_node_id: destNode.id, google_file_id: uploaded.id, filename: uploaded.name,
        mime_type: uploaded.mimeType, size: Number(uploaded.size || 0),
        parent_google_id: uploaded.parents?.[0] || null, is_folder: false,
      }, { onConflict: "storage_node_id,google_file_id" });
      return new Response(JSON.stringify(publicFile(uploaded, destNode)), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/move" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, newParentId, destNodeId } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      if (destNodeId && destNodeId !== nodeId) {
        const sourceMeta = await getDriveFile(node, fileId);
        const sizeBytes = sourceMeta.size ? Number(sourceMeta.size) : 0;
        if (sizeBytes > MAX_CROSS_DRIVE_BYTES) throw new HttpError(413, `File too large (max 100 MB)`);
        const destNode = await getStorageNode(supabase, destNodeId);
        const destToken = await getValidAccessToken(destNode);
        const { blob, mimeType, filename } = await fetchDriveContent(token, fileId, sourceMeta.name, sourceMeta.mimeType);
        const uploaded = await uploadToDrive(destToken, filename, mimeType, newParentId || null, blob);
        const delRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!delRes.ok && delRes.status !== 204) {
          return new Response(JSON.stringify({ success: true, crossDrive: true, warning: "Source not deleted" }), { status: 207, headers: { ...ch, "Content-Type": "application/json" } });
        }
        await supabase.from("file_mappings").upsert({
          storage_node_id: destNode.id, google_file_id: uploaded.id, filename: uploaded.name,
          mime_type: uploaded.mimeType, size: Number(uploaded.size || 0),
          parent_google_id: uploaded.parents?.[0] || null, is_folder: false,
        }, { onConflict: "storage_node_id,google_file_id" });
        await supabase.from("file_mappings").delete().eq("storage_node_id", node.id).eq("google_file_id", fileId);
        void dispatchWebhook(supabase, "file.moved", { fileId, fromNode: nodeId, toNode: destNodeId });
        return new Response(JSON.stringify({ success: true, crossDrive: true }), { headers: { ...ch, "Content-Type": "application/json" } });
      }

      const file = await getDriveFile(node, fileId);
      const currentParents = file.parents || [];
      const params = new URLSearchParams();
      if (currentParents.length > 0) params.set("removeParents", currentParents.join(","));
      if (newParentId) params.set("addParents", newParentId);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new HttpError(res.status, `Move failed`);
      void dispatchWebhook(supabase, "file.moved", { fileId, nodeId, newParentId });
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/create-folder" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { nodeId, name, parentId } = body;
      if (!nodeId || !name) throw new HttpError(400, "nodeId, name required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry("https://www.googleapis.com/drive/v3/files", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId && parentId !== "root" ? parentId : "root"] }),
      });
      if (!res.ok) throw new HttpError(res.status, `Create folder failed`);
      const folder = await res.json();
      return new Response(JSON.stringify(publicFile(folder, node)), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/share" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, access } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      let permission;
      if (access === "public") permission = { type: "anyone", role: "reader" };
      else if (access === "editor") permission = { type: "anyone", role: "writer" };
      else if (access === "unlisted") permission = { type: "anyone", role: "reader", allowFileDiscovery: false };
      else {
        const listRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, { headers: { Authorization: `Bearer ${token}` } });
        if (listRes.ok) {
          const perms = await listRes.json();
          for (const p of perms.permissions || []) {
            if (p.type === "anyone") await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${p.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          }
        }
        return new Response(JSON.stringify({ success: true, access: "private" }), { headers: { ...ch, "Content-Type": "application/json" } });
      }
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(permission),
      });
      if (!res.ok) throw new HttpError(res.status, `Share failed`);
      void dispatchWebhook(supabase, "file.shared", { fileId, nodeId, access });
      return new Response(JSON.stringify({ success: true, access }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/delete" && req.method === "POST") {
      requireScope("files:delete");
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok && res.status !== 204) throw new HttpError(res.status, `Delete failed`);
      void dispatchWebhook(supabase, "file.deleted", { fileId, nodeId, permanent: true });
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Versioning
    if (path === "/versions" && req.method === "GET") {
      requireScope("files:read");
      const fileId = url.searchParams.get("fileId");
      const nodeId = url.searchParams.get("nodeId");
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const { data, error } = await supabase.from("file_versions").select("*").eq("storage_node_id", nodeId).eq("google_file_id", fileId).order("version_number", { ascending: false });
      if (error) throw new Error("Failed to fetch versions");
      return new Response(JSON.stringify({ versions: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/versions/restore" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { versionId } = body;
      if (!versionId) throw new HttpError(400, "versionId required");
      const { data: version, error: vErr } = await supabase.from("file_versions").select("*").eq("id", versionId).maybeSingle();
      if (vErr || !version) throw new HttpError(404, "Version not found");
      if (!version.archived_google_file_id) throw new HttpError(400, "No archived content");
      const node = await getStorageNode(supabase, version.storage_node_id);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${version.archived_google_file_id}/copy`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: version.filename }),
      });
      if (!res.ok) throw new HttpError(res.status, `Restore failed`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Deduplication
    if (path === "/dedup/check" && req.method === "GET") {
      requireScope("files:read");
      const hash = url.searchParams.get("hash");
      const size = Number(url.searchParams.get("size") || "0");
      if (!hash) throw new HttpError(400, "hash required");
      const { data, error } = await supabase.from("content_hashes").select("hash, storage_node_id, google_file_id, filename, size, mime_type").eq("hash", hash).eq("size", size).limit(1).maybeSingle();
      if (error || !data) return new Response(JSON.stringify({ exists: false }), { headers: { ...ch, "Content-Type": "application/json" } });
      const node = await getStorageNode(supabase, data.storage_node_id);
      return new Response(JSON.stringify({ exists: true, match: { hash: data.hash, storageNodeId: data.storage_node_id, googleFileId: data.google_file_id, filename: data.filename, size: data.size, drive: node.display_name || node.email } }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/dedup/register" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { hash, nodeId, googleFileId, filename, size, mimeType } = body;
      if (!hash || !nodeId || !googleFileId) throw new HttpError(400, "hash, nodeId, googleFileId required");
      await supabase.from("content_hashes").upsert({ hash, storage_node_id: nodeId, google_file_id: googleFileId, filename, size: size || 0, mime_type: mimeType || null }, { onConflict: "hash,storage_node_id,google_file_id" });
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Permissions
    if (path === "/permissions" && req.method === "GET") {
      requireScope("files:read");
      const fileId = url.searchParams.get("fileId");
      const nodeId = url.searchParams.get("nodeId");
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink,expirationTime)`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(res.status, `Failed`);
      const data = await res.json();
      return new Response(JSON.stringify({ permissions: data.permissions || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/permissions" && req.method === "POST") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, email, role } = body;
      if (!fileId || !nodeId || !email || !role) throw new HttpError(400, "fileId, nodeId, email, role required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role, emailAddress: email }),
      });
      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `Failed`;
        try { const errData = JSON.parse(errText); errMsg = errData.error?.message || errMsg; } catch { /* */ }
        return new Response(JSON.stringify({ error: errMsg }), { status: res.status, headers: { ...ch, "Content-Type": "application/json" } });
      }
      const perm = await res.json();
      return new Response(JSON.stringify({ permission: perm }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/permissions" && req.method === "DELETE") {
      requireScope("files:write");
      const body = await req.json();
      const { fileId, nodeId, permissionId } = body;
      if (!fileId || !nodeId || !permissionId) throw new HttpError(400, "required");
      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok && res.status !== 204) return new Response(JSON.stringify({ error: "Failed" }), { status: res.status, headers: { ...ch, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/share-link" && req.method === "GET") {
      requireScope("files:read");
      const fileId = url.searchParams.get("fileId");
      const nodeId = url.searchParams.get("nodeId");
      if (!fileId || !nodeId) throw new HttpError(400, "fileId, nodeId required");
      const node = await getStorageNode(supabase, nodeId);
      const file = await getDriveFile(node, fileId);
      return new Response(JSON.stringify({ webViewLink: file.webViewLink || null, webContentLink: file.webContentLink || null }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Devices
    if (path === "/devices/register" && req.method === "POST") {
      const body = await req.json();
      const { deviceId, deviceName, browser, os, userAgent } = body;
      if (!deviceId) throw new HttpError(400, "deviceId required");
      const { data: existing } = await supabase.from("devices").select("*").eq("device_id", deviceId).maybeSingle();
      if (existing) {
        const { data: updated } = await supabase.from("devices").update({ device_name: deviceName || existing.device_name, browser: browser || existing.browser, os: os || existing.os, user_agent: userAgent || existing.user_agent, status: "active", last_active: new Date().toISOString() }).eq("id", existing.id).select("*").single();
        return new Response(JSON.stringify({ device: updated }), { headers: { ...ch, "Content-Type": "application/json" } });
      }
      const { data: created } = await supabase.from("devices").insert({ device_id: deviceId, device_name: deviceName || null, browser: browser || null, os: os || null, user_agent: userAgent || null, status: "active" }).select("*").single();
      return new Response(JSON.stringify({ device: created }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/devices" && req.method === "GET") {
      const { data, error } = await supabase.from("devices").select("*").order("last_active", { ascending: false });
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ devices: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/devices/revoke" && req.method === "POST") {
      const body = await req.json();
      const { deviceId } = body;
      if (!deviceId) throw new HttpError(400, "deviceId required");
      await supabase.from("devices").update({ status: "revoked", last_active: new Date().toISOString() }).eq("device_id", deviceId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Activity
    if (path === "/activity" && req.method === "POST") {
      const body = await req.json();
      const { action, target, storageNodeId, storageNodeName, status } = body;
      if (!action) throw new HttpError(400, "action required");
      const { data, error } = await supabase.from("activity_logs").insert({ event_type: action, filename: target || null, storage_node_id: storageNodeId || null, storage_node_name: storageNodeName || null, status: status || "success", message: `${action}: ${target || ""}` }).select("*").single();
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ log: data }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/activity" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const filter = url.searchParams.get("filter");
      let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (filter && filter !== "all") {
        const map: Record<string, string[]> = {
          files: ["upload", "download", "preview", "rename", "move", "copy", "trash", "restore", "starred", "unstarred"],
          storage: ["storage_connected", "storage_disconnected"],
          sharing: ["share", "permission_change"],
          system: ["login", "logout", "settings_change", "backup", "restore"],
        };
        const actions = map[filter] || [];
        if (actions.length > 0) query = query.in("event_type", actions);
      }
      const { data, error } = await query;
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ logs: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // API Keys
    if (path === "/api-keys" && req.method === "GET") {
      requireScope("admin");
      const { data, error } = await supabase.from("api_keys").select("id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked").order("created_at", { ascending: false });
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ keys: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/api-keys" && req.method === "POST") {
      requireScope("admin");
      const body = await req.json();
      const { name, scopes, expiresInDays } = body;
      if (!name || !Array.isArray(scopes) || scopes.length === 0) throw new HttpError(400, "name and scopes[] required");
      const plaintext = generateApiKey();
      const keyHash = await sha256Hex(plaintext);
      const keyPrefix = plaintext.slice(0, 8);
      const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400 * 1000).toISOString() : null;
      const { data: key, error } = await supabase.from("api_keys").insert({ name, key_prefix: keyPrefix, key_hash: keyHash, scopes, expires_at: expiresAt }).select("id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked").single();
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ apiKey: key, plaintext }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const apiKeyDeleteMatch = path.match(/^\/api-keys\/([^/]+)$/);
    if (apiKeyDeleteMatch && req.method === "DELETE") {
      requireScope("admin");
      await supabase.from("api_keys").update({ revoked: true }).eq("id", apiKeyDeleteMatch[1]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Webhooks
    if (path === "/webhooks" && req.method === "GET") {
      requireScope("admin");
      const { data, error } = await supabase.from("webhooks").select("*").order("created_at", { ascending: false });
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ webhooks: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/webhooks" && req.method === "POST") {
      requireScope("admin");
      const body = await req.json();
      const { url: hookUrl, events } = body;
      if (!hookUrl || !Array.isArray(events)) throw new HttpError(400, "url and events[] required");
      const secretArr = new Uint8Array(32);
      crypto.getRandomValues(secretArr);
      const secret = Array.from(secretArr).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data: hook, error } = await supabase.from("webhooks").insert({ url: hookUrl, secret, events, enabled: true }).select("*").single();
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ webhook: hook }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const webhookIdMatch = path.match(/^\/webhooks\/([^/]+)$/);
    if (webhookIdMatch && req.method === "PATCH") {
      requireScope("admin");
      const body = await req.json();
      await supabase.from("webhooks").update({ enabled: body.enabled }).eq("id", webhookIdMatch[1]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (webhookIdMatch && req.method === "DELETE") {
      requireScope("admin");
      await supabase.from("webhooks").delete().eq("id", webhookIdMatch[1]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    const webhookTestMatch = path.match(/^\/webhooks\/([^/]+)\/test$/);
    if (webhookTestMatch && req.method === "POST") {
      requireScope("admin");
      const { data: hook } = await supabase.from("webhooks").select("*").eq("id", webhookTestMatch[1]).maybeSingle();
      if (!hook) throw new HttpError(404, "Webhook not found");
      const body = JSON.stringify({ event: "test", timestamp: new Date().toISOString(), data: { message: "Test webhook" } });
      const signature = await signWebhookPayload(hook.secret, body);
      try {
        const res = await fetch(hook.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": `sha256=${signature}`, "X-Webhook-Event": "test" }, body });
        const responseBody = await res.text().catch(() => "");
        return new Response(JSON.stringify({ success: res.ok, status: res.status, body: responseBody.substring(0, 500) }), { headers: { ...ch, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, body: err instanceof Error ? err.message : "Network error" }), { headers: { ...ch, "Content-Type": "application/json" } });
      }
    }

    const webhookDeliveriesMatch = path.match(/^\/webhooks\/([^/]+)\/deliveries$/);
    if (webhookDeliveriesMatch && req.method === "GET") {
      requireScope("admin");
      const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
      const { data, error } = await supabase.from("webhook_deliveries").select("*").eq("webhook_id", webhookDeliveriesMatch[1]).order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error("Failed");
      return new Response(JSON.stringify({ deliveries: data || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Analytics
    if (path === "/analytics" && req.method === "GET") {
      requireScope("files:read");
      const days = Math.min(Number(url.searchParams.get("days") || 30), 365);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString().split("T")[0];
      const { data: history } = await supabase.from("storage_snapshots").select("*").gte("snapshot_date", since).order("snapshot_date", { ascending: true });
      let totalCap = 0, totalUsed = 0;
      for (const n of nodes) { totalCap += n.cap || 0; totalUsed += n.used || 0; }
      const { count: fileCount } = await supabase.from("file_mappings").select("*", { count: "exact", head: true }).eq("trashed", false);
      let growthRateGBPerDay = 0, daysUntilFull: number | null = null;
      if (history && history.length >= 2) {
        const first = history[0];
        const last = history[history.length - 1];
        const daysSpan = Math.max(1, (new Date(last.snapshot_date).getTime() - new Date(first.snapshot_date).getTime()) / 86400000);
        growthRateGBPerDay = (Number(last.used_gb) - Number(first.used_gb)) / daysSpan;
        if (growthRateGBPerDay > 0) daysUntilFull = Math.round((totalCap - totalUsed) / growthRateGBPerDay);
      }
      return new Response(JSON.stringify({ totalCap, totalUsed, totalFiles: fileCount || 0, growthRateGBPerDay, daysUntilFull, history: history || [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    if (path === "/analytics/snapshot" && req.method === "POST") {
      requireScope("admin");
      const today = new Date().toISOString().split("T")[0];
      const { count: fileCount } = await supabase.from("file_mappings").select("*", { count: "exact", head: true }).eq("trashed", false);
      for (const n of nodes) {
        if (n.status !== "connected") continue;
        const quota = await getDriveQuota(n);
        const capGb = quota.total ? quota.total / (1024 ** 3) : n.cap;
        const usedGb = quota.used ? quota.used / (1024 ** 3) : n.used;
        await supabase.from("storage_snapshots").upsert({ storage_node_id: n.id, snapshot_date: today, cap_gb: capGb, used_gb: usedGb, file_count: fileCount || 0 }, { onConflict: "storage_node_id,snapshot_date" });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...ch, "Content-Type": "application/json" } });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.status, err.message, origin);
    console.error("drive-ops error:", err instanceof Error ? err.message : String(err));
    return errorResponse(500, "Internal server error", origin);
  }
});