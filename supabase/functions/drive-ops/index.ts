// Phase 9: Security hardening — session validation, input validation, security headers
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

function getClientId(): string { return getEnv("GOOGLE_CLIENT_ID"); }
function getClientSecret(): string { return getEnv("GOOGLE_CLIENT_SECRET"); }

// getEnv and getSupabase are imported from _shared/security.ts

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
    try { const errData = JSON.parse(errText); errMsg = errData.error_description || errData.error?.message || errMsg; } catch { /* not JSON */ }
    console.error(`Token refresh failed for node ${node.id}: ${errMsg}`);
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
    if (Date.now() > expiresAt - 60000) {
      return await refreshAccessToken(node);
    }
  }

  return node.access_token;
}

async function fetchDriveFiles(node: StorageNodeRow, query: string, pageSize: number, pageToken?: string, orderBy?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const token = await getValidAccessToken(node);
  const params = new URLSearchParams({
    q: query,
    pageSize: String(pageSize),
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webContentLink,webViewLink,starred,trashed,shared,iconLink)",
    orderBy: orderBy || "folder,name",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401) {
      const newToken = await refreshAccessToken(node);
      const retryRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!retryRes.ok) {
        const retryErr = await retryRes.text().catch(() => "");
        console.error(`Drive API list failed after refresh for node ${node.id} (${retryRes.status}): ${retryErr}`);
        throw new Error(`Drive API error (${retryRes.status})`);
      }
      return await retryRes.json();
    }
    console.error(`Drive API list failed for node ${node.id} (${res.status}): ${errText}`);
    throw new Error(`Drive API error (${res.status})`);
  }

  return await res.json();
}

async function getDriveFile(node: StorageNodeRow, fileId: string): Promise<DriveFile> {
  const token = await getValidAccessToken(node);
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webContentLink,webViewLink,starred,trashed,shared,iconLink",
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Drive API error (${res.status})`);
  return await res.json();
}

async function getStorageNode(supabase: ReturnType<typeof getSupabase>, nodeId: string): Promise<StorageNodeRow> {
  const { data, error } = await supabase
    .from("storage_nodes")
    .select("*")
    .eq("id", nodeId)
    .maybeSingle();

  if (error || !data) throw new Error("Storage node not found");
  return data as StorageNodeRow;
}

async function getAllStorageNodes(supabase: ReturnType<typeof getSupabase>): Promise<StorageNodeRow[]> {
  const { data, error } = await supabase
    .from("storage_nodes")
    .select("*")
    .order("priority", { ascending: true });

  if (error) throw new Error("Failed to fetch storage nodes");
  return (data || []) as StorageNodeRow[];
}

async function getDriveQuota(node: StorageNodeRow): Promise<{ total: number | null; used: number | null }> {
  try {
    const token = await getValidAccessToken(node);
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { total: null, used: null };
    const data = await res.json();
    const sq = data?.storageQuota;
    if (!sq) return { total: null, used: null };
    return {
      total: sq.limit ? Number(sq.limit) : null,
      used: sq.usage ? Number(sq.usage) : null,
    };
  } catch {
    return { total: null, used: null };
  }
}

function mapFileType(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "folder";
  if (mimeType.startsWith("image/")) return "img";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive")) return "zip";
  return "file";
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = bytes;
  while (x >= 1024 && i < 4) { x /= 1024; i++; }
  return (x < 10 && i ? x.toFixed(1) : Math.round(x)) + " " + u[i];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function publicFile(file: DriveFile, node: StorageNodeRow) {
  const type = mapFileType(file.mimeType);
  return {
    id: file.id,
    nodeId: node.id,
    name: file.name,
    type,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : 0,
    sizeLabel: file.size ? formatFileSize(Number(file.size)) : "—",
    modified: file.modifiedTime ? formatDate(file.modifiedTime) : "—",
    modifiedRaw: file.modifiedTime || null,
    createdRaw: file.createdTime || null,
    drive: node.display_name || node.email,
    driveEmail: node.email,
    starred: file.starred || false,
    trashed: file.trashed || false,
    shared: file.shared || false,
    thumbnail: file.thumbnailLink || null,
    webViewLink: file.webViewLink || null,
    webContentLink: file.webContentLink || null,
    isFolder: type === "folder",
    parentGoogleId: file.parents?.[0] || null,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const ch = corsHeaders(origin);
  const sh = securityHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...ch, ...sh } });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/drive-ops/, "");

  // Require valid session for all endpoints
  const session = await validateSession(req);
  if (!session) {
    return errorResponse(401, "Unauthorized", origin);
  }

  try {
    const supabase = getSupabase();
    const nodes = await getAllStorageNodes(supabase);
    const connectedNodes = nodes.filter((n) => n.status === "connected" && n.access_token && n.enabled !== false);

    // GET /drive-ops/files — list files across all connected drives
    if (path === "/files" && req.method === "GET") {
      const folderId = url.searchParams.get("folderId") || "root";
      const pageSize = Math.min(Number(url.searchParams.get("pageSize") || 100), 200);
      const pageToken = url.searchParams.get("pageToken") || undefined;
      const trashed = url.searchParams.get("trashed") === "true";
      const starredOnly = url.searchParams.get("starred") === "true";
      const sharedOnly = url.searchParams.get("shared") === "true";
      const typeFilter = url.searchParams.get("type");
      const orderBy = url.searchParams.get("orderBy") || undefined;

      if (connectedNodes.length === 0) {
        return new Response(JSON.stringify({ files: [], nodes: [], hasMore: false }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const allFiles: ReturnType<typeof publicFile>[] = [];
      const nodePageTokens: Record<string, string | undefined> = {};
      let hasMore = false;

      for (const node of connectedNodes) {
        let query = trashed ? "trashed = true" : "trashed = false";
        if (starredOnly) query += " and starred = true";
        if (sharedOnly) query += " and shared = true";
        if (folderId !== "root") {
          query += ` and '${folderId}' in parents`;
        } else if (!trashed && !starredOnly && !sharedOnly) {
          query += " and 'root' in parents";
        }

        // Add type filter
        if (typeFilter === "img") {
          query += " and mimeType contains 'image/'";
        } else if (typeFilter === "video") {
          query += " and mimeType contains 'video/'";
        } else if (typeFilter === "folder") {
          query += " and mimeType = 'application/vnd.google-apps.folder'";
        }

        try {
          const result = await fetchDriveFiles(node, query, pageSize, pageToken, orderBy);
          for (const f of result.files) {
            allFiles.push(publicFile(f, node));
          }
          if (result.nextPageToken) {
            nodePageTokens[node.id] = result.nextPageToken;
            hasMore = true;
          }
        } catch (err) {
          console.error(`File listing failed for node ${node.id}:`, err instanceof Error ? err.message : String(err));
        }
      }

      return new Response(JSON.stringify({ files: allFiles, hasMore, pageTokens: hasMore ? nodePageTokens : undefined }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/search — search across all drives
    if (path === "/search" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (!q || connectedNodes.length === 0) {
        return new Response(JSON.stringify({ files: [] }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const escapedQ = q.replace(/'/g, "\\'");
      const allFiles: ReturnType<typeof publicFile>[] = [];

      for (const node of connectedNodes) {
        const query = `name contains '${escapedQ}' and trashed = false`;
        try {
          const { files } = await fetchDriveFiles(node, query, 50);
          for (const f of files) {
            allFiles.push(publicFile(f, node));
          }
        } catch {
          // skip failed nodes
        }
      }

      return new Response(JSON.stringify({ files: allFiles }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/check-duplicate — check if filename exists in a folder across nodes
    if (path === "/check-duplicate" && req.method === "GET") {
      const filename = url.searchParams.get("filename") || "";
      const parentGoogleId = url.searchParams.get("parentGoogleId");
      if (!filename) {
        return new Response(JSON.stringify({ exists: false, nodes: [] }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const escapedName = filename.replace(/'/g, "\\'");
      const query = parentGoogleId && parentGoogleId !== "root"
        ? `name = '${escapedName}' and trashed = false`
        : `name = '${escapedName}' and trashed = false`;

      const foundNodes: { nodeId: string; fileId: string; drive: string }[] = [];

      for (const node of connectedNodes) {
        try {
          const { files } = await fetchDriveFiles(node, query, 5);
          for (const f of files) {
            foundNodes.push({
              nodeId: node.id,
              fileId: f.id,
              drive: node.display_name || node.email,
            });
          }
        } catch {
          // skip failed nodes
        }
      }

      return new Response(JSON.stringify({
        exists: foundNodes.length > 0,
        nodes: foundNodes,
      }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/nodes — list storage nodes with quota
    if (path === "/nodes" && req.method === "GET") {
      const nodesWithQuota = await Promise.all(
        nodes.map(async (n) => {
          let cap = n.cap;
          let used = n.used;
          let quotaAvailable = false;

          if (n.status === "connected" && n.access_token) {
            const quota = await getDriveQuota(n);
            if (quota.total !== null) {
              cap = quota.total / (1024 * 1024 * 1024);
              quotaAvailable = true;
            }
            if (quota.used !== null) {
              used = quota.used / (1024 * 1024 * 1024);
            }
          }

          return {
            id: n.id,
            provider: n.provider,
            providerAccountId: n.provider_account_id,
            email: n.email,
            displayName: n.display_name,
            avatar: n.avatar,
            status: n.status,
            cap,
            used,
            priority: n.priority,
            enabled: n.enabled ?? true,
            connectedAt: n.connected_at,
            lastCheckedAt: n.last_checked_at,
            quotaAvailable,
          };
        })
      );

      return new Response(JSON.stringify({ nodes: nodesWithQuota }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/pool — storage pool summary
    if (path === "/pool" && req.method === "GET") {
      let totalCap = 0;
      let totalUsed = 0;
      let connectedCount = 0;
      let healthyCount = 0;
      let quotaAvailable = false;

      for (const n of nodes) {
        if (n.status === "connected") {
          connectedCount++;
          let cap = n.cap;
          let used = n.used;

          if (n.access_token) {
            const quota = await getDriveQuota(n);
            if (quota.total !== null) {
              cap = quota.total / (1024 * 1024 * 1024);
              quotaAvailable = true;
            }
            if (quota.used !== null) {
              used = quota.used / (1024 * 1024 * 1024);
            }
            healthyCount++;
          }

          totalCap += cap;
          totalUsed += used;
        }
      }

      return new Response(JSON.stringify({
        connectedDrives: connectedCount,
        healthyDrives: healthyCount,
        totalCap,
        totalUsed,
        totalAvailable: Math.max(0, totalCap - totalUsed),
        quotaAvailable,
      }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/file/:id?nodeId=xxx — get file details
    const fileMatch = path.match(/^\/file\/([^/]+)$/);
    if (fileMatch && req.method === "GET") {
      const fileId = fileMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new Error("nodeId is required");

      const node = await getStorageNode(supabase, nodeId);
      const file = await getDriveFile(node, fileId);

      return new Response(JSON.stringify(publicFile(file, node)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/download/:id?nodeId=xxx — proxy download from Google Drive
    const downloadMatch = path.match(/^\/download\/([^/]+)$/);
    if (downloadMatch && req.method === "GET") {
      const fileId = downloadMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new Error("nodeId is required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const file = await getDriveFile(node, fileId);
      const filename = file.name;

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const headers = new Headers(ch);
      headers.set("Content-Type", file.mimeType || "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);

      return new Response(res.body, { headers });
    }

    // GET /drive-ops/preview/:id?nodeId=xxx — proxy file content for preview
    const previewMatch = path.match(/^\/preview\/([^/]+)$/);
    if (previewMatch && req.method === "GET") {
      const fileId = previewMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new Error("nodeId is required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);
      const file = await getDriveFile(node, fileId);

      // For Google Docs/Sheets/etc, use export API
      if (file.mimeType.startsWith("application/vnd.google-apps.")) {
        const exportType = file.mimeType === "application/vnd.google-apps.document" ? "application/pdf"
          : file.mimeType === "application/vnd.google-apps.spreadsheet" ? "application/pdf"
          : file.mimeType === "application/vnd.google-apps.presentation" ? "application/pdf"
          : "application/pdf";

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportType}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);

        const headers = new Headers(ch);
        headers.set("Content-Type", exportType);
        return new Response(res.body, { headers });
      }

      // For regular files, stream content
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Preview failed (${res.status})`);

      const headers = new Headers(ch);
      headers.set("Content-Type", file.mimeType || "application/octet-stream");
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(res.body, { headers });
    }

    // GET /drive-ops/text-preview/:id?nodeId=xxx — fetch text file content for preview
    const textPreviewMatch = path.match(/^\/text-preview\/([^/]+)$/);
    if (textPreviewMatch && req.method === "GET") {
      const fileId = textPreviewMatch[1];
      const nodeId = url.searchParams.get("nodeId");
      if (!nodeId) throw new Error("nodeId is required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Text preview failed (${res.status})`);

      const text = await res.text();
      const truncated = text.length > 100000 ? text.substring(0, 100000) + "\n\n... (truncated)" : text;

      return new Response(JSON.stringify({ content: truncated }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/folders?nodeId=xxx&all=true — list folders for a node or all connected nodes
    if (path === "/folders" && req.method === "GET") {
      const nodeId = url.searchParams.get("nodeId");
      const listAll = url.searchParams.get("all") === "true";
      if (!nodeId && !listAll) throw new Error("nodeId is required or all=true");

      const nodesToList = listAll ? nodes.filter((n) => n.status === "connected") : [await getStorageNode(supabase, nodeId!)];
      const allFolders: { id: string; name: string; parents?: string[]; nodeId: string; driveName: string }[] = [];

      for (const n of nodesToList) {
        try {
          const token = await getValidAccessToken(n);
          const params = new URLSearchParams({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            pageSize: "200",
            fields: "files(id,name,parents)",
            orderBy: "name",
          });
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            for (const f of data.files || []) {
              allFolders.push({ ...f, nodeId: n.id, driveName: n.display_name || n.email || n.id });
            }
          }
        } catch (err) {
          console.error(`Folders list failed for node ${n.id}:`, err instanceof Error ? err.message : String(err));
        }
      }

      return new Response(JSON.stringify({ folders: allFolders }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/rename — rename file
    if (path === "/rename" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, newName } = body;
      if (!fileId || !nodeId || !newName) throw new Error("fileId, nodeId, newName required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      const updated = await res.json();

      return new Response(JSON.stringify(publicFile(updated, node)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/trash — move file to trash
    if (path === "/trash" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });

      if (!res.ok) throw new Error(`Trash failed (${res.status})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/untrash — restore from trash
    if (path === "/untrash" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: false }),
      });

      if (!res.ok) throw new Error(`Untrash failed (${res.status})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/star — toggle star
    if (path === "/star" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, starred } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ starred: starred !== false }),
      });

      if (!res.ok) throw new Error(`Star failed (${res.status})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/copy — copy file (optionally to a different drive/folder)
    if (path === "/copy" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, destNodeId, destFolderId } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const copyBody: Record<string, unknown> = {};
      if (destFolderId && destFolderId !== "root") {
        copyBody.parents = [destFolderId];
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(copyBody),
      });

      if (!res.ok) throw new Error(`Copy failed (${res.status})`);
      const copied = await res.json();

      // If cross-drive copy requested, transfer to destination drive
      if (destNodeId && destNodeId !== nodeId) {
        const destNode = await getStorageNode(supabase, destNodeId);
        const destToken = await getValidAccessToken(destNode);
        // Create a copy on the destination drive using the file's content
        const sourceRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sourceRes.ok) throw new Error(`Cross-drive copy: source fetch failed (${sourceRes.status})`);
        const fileBlob = await sourceRes.blob();
        const uploadBody: Record<string, unknown> = { name: copied.name };
        if (destFolderId && destFolderId !== "root") {
          uploadBody.parents = [destFolderId];
        } else {
          uploadBody.parents = ["root"];
        }
        const uploadRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${destToken}`,
            "Content-Type": copied.mimeType || "application/octet-stream",
          },
          body: JSON.stringify(uploadBody),
        });
        // Upload content via resumable or simple upload
        const uploadData = await uploadRes.json();
        const contentRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${uploadData.id}?uploadType=media`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${destToken}`,
            "Content-Type": copied.mimeType || "application/octet-stream",
          },
          body: fileBlob,
        });
        if (!contentRes.ok) throw new Error(`Cross-drive copy: upload failed (${contentRes.status})`);
        const finalFile = await contentRes.json();
        // Delete the same-drive copy we made first
        await fetch(`https://www.googleapis.com/drive/v3/files/${copied.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        return new Response(JSON.stringify(publicFile(finalFile, destNode)), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(publicFile(copied, node)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/move — move file to a different parent folder (optionally cross-drive)
    if (path === "/move" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, newParentId, destNodeId } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      // Cross-drive move: copy to dest drive then delete original
      if (destNodeId && destNodeId !== nodeId) {
        const destNode = await getStorageNode(supabase, destNodeId);
        const destToken = await getValidAccessToken(destNode);
        const file = await getDriveFile(node, fileId);

        // Fetch file content
        const sourceRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sourceRes.ok) throw new Error(`Cross-drive move: source fetch failed (${sourceRes.status})`);
        const fileBlob = await sourceRes.blob();

        // Upload to destination
        const uploadBody: Record<string, unknown> = { name: file.name };
        if (newParentId && newParentId !== "root") {
          uploadBody.parents = [newParentId];
        } else {
          uploadBody.parents = ["root"];
        }
        const uploadRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${destToken}`,
            "Content-Type": file.mimeType || "application/octet-stream",
          },
          body: JSON.stringify(uploadBody),
        });
        const uploadData = await uploadRes.json();
        const contentRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${uploadData.id}?uploadType=media`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${destToken}`,
            "Content-Type": file.mimeType || "application/octet-stream",
          },
          body: fileBlob,
        });
        if (!contentRes.ok) throw new Error(`Cross-drive move: upload failed (${contentRes.status})`);

        // Delete original
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        return new Response(JSON.stringify({ success: true, crossDrive: true }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      // Same-drive move: just change parents
      const file = await getDriveFile(node, fileId);
      const currentParents = file.parents || [];

      const params = new URLSearchParams();
      if (currentParents.length > 0) {
        params.set("removeParents", currentParents.join(","));
      }
      if (newParentId) {
        params.set("addParents", newParentId);
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error(`Move failed (${res.status})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/create-folder — create a new folder
    if (path === "/create-folder" && req.method === "POST") {
      const body = await req.json();
      const { nodeId, name, parentId } = body;
      if (!nodeId || !name) throw new Error("nodeId, name required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const folderBody: Record<string, unknown> = {
        name,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parentId && parentId !== "root") {
        folderBody.parents = [parentId];
      } else {
        folderBody.parents = ["root"];
      }

      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(folderBody),
      });

      if (!res.ok) throw new Error(`Create folder failed (${res.status})`);
      const folder = await res.json();

      return new Response(JSON.stringify(publicFile(folder, node)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/share — share file with link
    if (path === "/share" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, access } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      let permission;
      if (access === "public") {
        permission = { type: "anyone", role: "reader" };
      } else if (access === "editor") {
        permission = { type: "anyone", role: "writer" };
      } else if (access === "unlisted") {
        permission = { type: "anyone", role: "reader", allowFileDiscovery: false };
      } else {
        // private — remove all anyone permissions
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (listRes.ok) {
          const perms = await listRes.json();
          for (const p of perms.permissions || []) {
            if (p.type === "anyone") {
              await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${p.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
            }
          }
        }
        return new Response(JSON.stringify({ success: true, access: "private" }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(permission),
      });

      if (!res.ok) throw new Error(`Share failed (${res.status})`);

      return new Response(JSON.stringify({ success: true, access }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/delete — permanently delete file
    if (path === "/delete" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId } = body;
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/permissions?fileId=xxx&nodeId=xxx — list permissions for a file
    if (path === "/permissions" && req.method === "GET") {
      const fileId = url.searchParams.get("fileId");
      const nodeId = url.searchParams.get("nodeId");
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink,expirationTime)`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Failed to list permissions (${res.status})`);
      const data = await res.json();

      return new Response(JSON.stringify({ permissions: data.permissions || [] }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/permissions — add a user permission by email
    if (path === "/permissions" && req.method === "POST") {
      const body = await req.json();
      const { fileId, nodeId, email, role } = body;
      if (!fileId || !nodeId || !email || !role) throw new Error("fileId, nodeId, email, role required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user",
          role,
          emailAddress: email,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `Failed to add permission (${res.status})`;
        try { const errData = JSON.parse(errText); errMsg = errData.error?.message || errMsg; } catch { /* ignore */ }
        return new Response(JSON.stringify({ error: errMsg }), {
          status: res.status,
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const perm = await res.json();
      return new Response(JSON.stringify({ permission: perm }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // DELETE /drive-ops/permissions — remove a permission
    if (path === "/permissions" && req.method === "DELETE") {
      const body = await req.json();
      const { fileId, nodeId, permissionId } = body;
      if (!fileId || !nodeId || !permissionId) throw new Error("fileId, nodeId, permissionId required");

      const node = await getStorageNode(supabase, nodeId);
      const token = await getValidAccessToken(node);

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok && res.status !== 204) {
        const errText = await res.text();
        let errMsg = `Failed to remove permission (${res.status})`;
        try { const errData = JSON.parse(errText); errMsg = errData.error?.message || errMsg; } catch { /* ignore */ }
        return new Response(JSON.stringify({ error: errMsg }), {
          status: res.status,
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/share-link?fileId=xxx&nodeId=xxx — get share link
    if (path === "/share-link" && req.method === "GET") {
      const fileId = url.searchParams.get("fileId");
      const nodeId = url.searchParams.get("nodeId");
      if (!fileId || !nodeId) throw new Error("fileId, nodeId required");

      const node = await getStorageNode(supabase, nodeId);
      const file = await getDriveFile(node, fileId);

      return new Response(JSON.stringify({
        webViewLink: file.webViewLink || null,
        webContentLink: file.webContentLink || null,
      }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // ============ Device Management ============

    // POST /drive-ops/devices/register — register or update device session
    if (path === "/devices/register" && req.method === "POST") {
      const body = await req.json();
      const { deviceId, deviceName, browser, os, userAgent } = body;
      if (!deviceId) throw new Error("deviceId required");

      const { data: existing } = await supabase.from("devices").select("*").eq("device_id", deviceId).maybeSingle();

      if (existing) {
        const { data: updated } = await supabase.from("devices").update({
          device_name: deviceName || existing.device_name,
          browser: browser || existing.browser,
          os: os || existing.os,
          user_agent: userAgent || existing.user_agent,
          status: "active",
          last_active: new Date().toISOString(),
        }).eq("id", existing.id).select("*").single();
        return new Response(JSON.stringify({ device: updated }), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      const { data: created } = await supabase.from("devices").insert({
        device_id: deviceId,
        device_name: deviceName || null,
        browser: browser || null,
        os: os || null,
        user_agent: userAgent || null,
        status: "active",
      }).select("*").single();

      return new Response(JSON.stringify({ device: created }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/devices — list all devices
    if (path === "/devices" && req.method === "GET") {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .order("last_active", { ascending: false });

      if (error) throw new Error("Failed to fetch devices");

      return new Response(JSON.stringify({ devices: data || [] }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-ops/devices/revoke — revoke a device
    if (path === "/devices/revoke" && req.method === "POST") {
      const body = await req.json();
      const { deviceId } = body;
      if (!deviceId) throw new Error("deviceId required");

      await supabase.from("devices").update({
        status: "revoked",
        last_active: new Date().toISOString(),
      }).eq("device_id", deviceId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // ============ Activity Log ============

    // POST /drive-ops/activity — log an activity
    if (path === "/activity" && req.method === "POST") {
      const body = await req.json();
      const { action, target, targetType, storageNodeId, storageNodeName, status, deviceId } = body;
      if (!action) throw new Error("action required");

      const { data, error } = await supabase.from("activity_logs").insert({
        event_type: action,
        filename: target || null,
        storage_node_id: storageNodeId || null,
        storage_node_name: storageNodeName || null,
        status: status || "success",
        message: `${action}: ${target || ""}`,
      }).select("*").single();

      if (error) throw new Error("Failed to log activity");

      return new Response(JSON.stringify({ log: data }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-ops/activity — list activity logs with optional filter
    if (path === "/activity" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const filter = url.searchParams.get("filter"); // all, files, storage, sharing, system

      let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(limit);

      if (filter && filter !== "all") {
        const fileActions = ["upload", "download", "preview", "rename", "move", "copy", "trash", "restore", "starred", "unstarred"];
        const storageActions = ["storage_connected", "storage_disconnected"];
        const sharingActions = ["share", "permission_change"];
        const systemActions = ["login", "logout", "settings_change", "backup", "restore"];

        let actions: string[] = [];
        if (filter === "files") actions = fileActions;
        else if (filter === "storage") actions = storageActions;
        else if (filter === "sharing") actions = sharingActions;
        else if (filter === "system") actions = systemActions;

        if (actions.length > 0) {
          query = query.in("event_type", actions);
        }
      }

      const { data, error } = await query;
      if (error) throw new Error("Failed to fetch activity logs");

      return new Response(JSON.stringify({ logs: data || [] }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.status, err.message, origin);
    }
    return errorResponse(500, "Internal server error", origin);
  }
});


