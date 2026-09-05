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
  validateNumber,
  validateRoutingMode,
} from "../_shared/security.ts";

interface StorageNodeRow {
  id: string;
  provider: string;
  provider_account_id: string;
  email: string;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
  priority: number;
  enabled: boolean;
}

interface UploadSessionRow {
  id: string;
  storage_node_id: string;
  upload_id: string | null;
  google_file_id: string | null;
  filename: string;
  mime_type: string;
  size: number;
  parent_google_id: string | null;
  status: string;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function getClientId(): string { return getEnv("GOOGLE_CLIENT_ID"); }
function getClientSecret(): string { return getEnv("GOOGLE_CLIENT_SECRET"); }

async function refreshAccessToken(node: StorageNodeRow): Promise<string> {
  if (!node.refresh_token) throw new Error("No refresh token");
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
  if (!node.access_token) throw new Error("No access token");
  if (node.token_expires_at) {
    const expiresAt = new Date(node.token_expires_at).getTime();
    if (Date.now() > expiresAt - 60000) {
      return await refreshAccessToken(node);
    }
  }
  return node.access_token;
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

async function getConnectedNodes(supabase: ReturnType<typeof getSupabase>): Promise<StorageNodeRow[]> {
  const { data, error } = await supabase
    .from("storage_nodes")
    .select("*")
    .eq("status", "connected")
    .eq("enabled", true)
    .not("access_token", "is", null)
    .order("priority", { ascending: true });
  if (error) throw new Error("Failed to fetch storage nodes");
  return (data || []) as StorageNodeRow[];
}

async function getDriveQuotaBytes(node: StorageNodeRow): Promise<{ total: number | null; used: number | null }> {
  try {
    const token = await getValidAccessToken(node);
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Drive quota fetch failed for node ${node.id} (${res.status}): ${errText}`);
      return { total: null, used: null };
    }
    const data = await res.json();
    const sq = data?.storageQuota;
    return {
      total: sq?.limit ? Number(sq.limit) : null,
      used: sq?.usage ? Number(sq.usage) : null,
    };
  } catch (err) {
    console.error(`Drive quota error for node ${node.id}:`, err instanceof Error ? err.message : String(err));
    return { total: null, used: null };
  }
}

async function selectBestNode(
  nodes: StorageNodeRow[],
  fileSizeBytes: number,
  mode: string,
  supabase: ReturnType<typeof getSupabase>,
): Promise<StorageNodeRow | null> {
  if (nodes.length === 0) return null;

  if (mode === "balanced") {
    // Pick node with most free space to balance distribution
    let best: StorageNodeRow | null = null;
    let bestFree = -1;
    for (const n of nodes) {
      const quota = await getDriveQuotaBytes(n);
      if (quota.total !== null && quota.used !== null) {
        const free = quota.total - quota.used;
        if (free >= fileSizeBytes && free > bestFree) {
          best = n;
          bestFree = free;
        }
      } else {
        // No quota info — treat as eligible with lowest priority
        if (!best) best = n;
      }
    }
    return best || nodes[0];
  }

  // automatic: pick first node with enough space (priority order)
  for (const n of nodes) {
    const quota = await getDriveQuotaBytes(n);
    if (quota.total !== null && quota.used !== null) {
      const free = quota.total - quota.used;
      if (free >= fileSizeBytes) return n;
    } else {
      // No quota info — allow it
      return n;
    }
  }
  return nodes[0];
}

async function logActivity(
  supabase: ReturnType<typeof getSupabase>,
  eventType: string,
  filename: string,
  nodeId: string | null,
  nodeEmail: string | null,
  status: string,
  message?: string,
) {
  try {
    await supabase.from("activity_logs").insert({
      event_type: eventType,
      filename,
      storage_node_id: nodeId || null,
      storage_node_name: nodeEmail || null,
      status,
      message: message || null,
    });
  } catch {
    // Best-effort logging — don't fail the upload if logging fails
  }
}

function publicUploadSession(row: UploadSessionRow) {
  return {
    id: row.id,
    storageNodeId: row.storage_node_id,
    uploadId: row.upload_id,
    googleFileId: row.google_file_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    parentGoogleId: row.parent_google_id,
    status: row.status,
    progress: row.progress,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const path = url.pathname.replace(/^\/drive-upload/, "");

  // Require valid session for all endpoints
  const session = await validateSession(req);
  if (!session) {
    return errorResponse(401, "Unauthorized", origin);
  }

  try {
    const supabase = getSupabase();

    // GET /drive-upload/activity — list recent activity logs
    if (path === "/activity" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error("Failed to fetch activity logs");

      return new Response(JSON.stringify({ logs: data || [] }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // GET /drive-upload/sessions — list all upload sessions
    if (path === "/sessions" && req.method === "GET") {
      const { data, error } = await supabase
        .from("upload_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw new Error("Failed to fetch upload sessions");

      const sessions = (data as UploadSessionRow[]).map(publicUploadSession);
      return new Response(JSON.stringify({ sessions }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-upload/init — initialize an upload session
    if (path === "/init" && req.method === "POST") {
      const body = await req.json();
      const { nodeId, filename, mimeType, size, parentGoogleId } = body;
      if (!nodeId || !filename || !mimeType) throw new Error("nodeId, filename, mimeType required");

      // Verify node exists and is connected
      const node = await getStorageNode(supabase, nodeId);
      if (node.status !== "connected") throw new Error("Storage node is not connected");

      // Create upload session record
      const { data, error } = await supabase
        .from("upload_sessions")
        .insert({
          storage_node_id: nodeId,
          filename,
          mime_type: mimeType,
          size: size || 0,
          parent_google_id: parentGoogleId || null,
          status: "queued",
          progress: 0,
        })
        .select("*")
        .single();

      if (error) throw new Error("Failed to create upload session");

      await logActivity(supabase, "upload_started", filename, nodeId, node.email, "info", `Upload queued for ${filename}`);

      return new Response(JSON.stringify(publicUploadSession(data as UploadSessionRow)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-upload/start/:id — start/resume upload (receives file data)
    const startMatch = path.match(/^\/start\/([^/]+)$/);
    if (startMatch && req.method === "POST") {
      const sessionId = startMatch[1];

      const { data: session } = await supabase
        .from("upload_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session) throw new Error("Upload session not found");
      const sessionRow = session as UploadSessionRow;

      if (sessionRow.status === "completed") {
        return new Response(JSON.stringify(publicUploadSession(sessionRow)), {
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      if (sessionRow.status === "cancelled") {
        throw new Error("Upload was cancelled");
      }

      const node = await getStorageNode(supabase, sessionRow.storage_node_id);
      const token = await getValidAccessToken(node);

      // Update status to uploading
      await supabase.from("upload_sessions").update({
        status: "uploading",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      const fileBuffer = await req.arrayBuffer();

      // Build metadata for the file
      const metadata: Record<string, unknown> = {
        name: sessionRow.filename,
        mimeType: sessionRow.mime_type,
      };
      if (sessionRow.parent_google_id && sessionRow.parent_google_id !== "root") {
        metadata.parents = [sessionRow.parent_google_id];
      } else {
        metadata.parents = ["root"];
      }

      // Use resumable upload for files > 5MB, simple upload for smaller
      const isResumable = sessionRow.size > 5 * 1024 * 1024;

      let googleFileId: string | null = null;

      if (isResumable) {
        // Initiate resumable upload session
        const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": sessionRow.mime_type,
            "X-Upload-Content-Length": String(fileBuffer.byteLength),
          },
          body: JSON.stringify(metadata),
        });

        if (!initRes.ok) {
          const errMsg = `Resumable upload init failed (${initRes.status})`;
          await supabase.from("upload_sessions").update({
            status: "failed",
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          }).eq("id", sessionId);
          await logActivity(supabase, "upload_failed", sessionRow.filename, sessionRow.storage_node_id, node.email, "error", errMsg);
          throw new Error(errMsg);
        }

        const uploadUrl = initRes.headers.get("Location");
        if (!uploadUrl) {
          const errMsg = "No upload URL returned";
          await supabase.from("upload_sessions").update({
            status: "failed",
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          }).eq("id", sessionId);
          throw new Error(errMsg);
        }

        // Save upload URL as upload_id
        await supabase.from("upload_sessions").update({
          upload_id: uploadUrl,
          updated_at: new Date().toISOString(),
        }).eq("id", sessionId);

        // Upload the file content
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(fileBuffer.byteLength),
          },
          body: fileBuffer,
        });

        if (!uploadRes.ok) {
          const errMsg = `Upload failed (${uploadRes.status})`;
          await supabase.from("upload_sessions").update({
            status: "failed",
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          }).eq("id", sessionId);
          await logActivity(supabase, "upload_failed", sessionRow.filename, sessionRow.storage_node_id, node.email, "error", errMsg);
          throw new Error(errMsg);
        }

        const uploaded = await uploadRes.json();
        googleFileId = uploaded.id;
      } else {
        // Simple multipart upload
        const boundary = "my_storage_" + Date.now();
        const parts: Uint8Array[] = [];
        const encoder = new TextEncoder();

        parts.push(encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`));
        parts.push(encoder.encode(JSON.stringify(metadata)));
        parts.push(encoder.encode(`\r\n--${boundary}\r\nContent-Type: ${sessionRow.mime_type}\r\n\r\n`));
        parts.push(new Uint8Array(fileBuffer));
        parts.push(encoder.encode(`\r\n--${boundary}--`));

        const body = new Blob(parts);

        const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        });

        if (!uploadRes.ok) {
          const errMsg = `Upload failed (${uploadRes.status})`;
          await supabase.from("upload_sessions").update({
            status: "failed",
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          }).eq("id", sessionId);
          await logActivity(supabase, "upload_failed", sessionRow.filename, sessionRow.storage_node_id, node.email, "error", errMsg);
          throw new Error(errMsg);
        }

        const uploaded = await uploadRes.json();
        googleFileId = uploaded.id;
      }

      // Mark as completed
      const { data: completedSession } = await supabase
        .from("upload_sessions")
        .update({
          status: "completed",
          progress: 100,
          google_file_id: googleFileId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .select("*")
        .single();

      await logActivity(supabase, "upload_completed", sessionRow.filename, sessionRow.storage_node_id, node.email, "success", `Upload completed: ${sessionRow.filename} → ${node.email}`);

      // Save file mapping
      if (googleFileId) {
        await supabase.from("file_mappings").upsert({
          storage_node_id: sessionRow.storage_node_id,
          google_file_id: googleFileId,
          filename: sessionRow.filename,
          mime_type: sessionRow.mime_type,
          size: sessionRow.size,
          parent_google_id: sessionRow.parent_google_id,
          is_folder: false,
        }, { onConflict: "storage_node_id,google_file_id" });
      }

      return new Response(JSON.stringify(publicUploadSession(completedSession as UploadSessionRow)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-upload/retry/:id — retry a failed upload
    const retryMatch = path.match(/^\/retry\/([^/]+)$/);
    if (retryMatch && req.method === "POST") {
      const sessionId = retryMatch[1];

      await supabase.from("upload_sessions").update({
        status: "queued",
        progress: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      const { data: retriedRow } = await supabase
        .from("upload_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      const retriedSession = retriedRow as UploadSessionRow;

      if (retriedSession) {
        const { data: retryNode } = await supabase.from("storage_nodes").select("email").eq("id", retriedSession.storage_node_id).maybeSingle();
        await logActivity(supabase, "upload_retry", retriedSession.filename, retriedSession.storage_node_id, (retryNode as any)?.email || null, "info", `Retry upload: ${retriedSession.filename}`);
      }

      return new Response(JSON.stringify(publicUploadSession(retriedSession as UploadSessionRow)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-upload/cancel/:id — cancel an upload
    const cancelMatch = path.match(/^\/cancel\/([^/]+)$/);
    if (cancelMatch && req.method === "POST") {
      const sessionId = cancelMatch[1];

      await supabase.from("upload_sessions").update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      const { data: cancelledRow } = await supabase
        .from("upload_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      const cancelledSession = cancelledRow as UploadSessionRow;

      if (cancelledSession) {
        const { data: cancelNode } = await supabase.from("storage_nodes").select("email").eq("id", cancelledSession.storage_node_id).maybeSingle();
        await logActivity(supabase, "upload_cancelled", cancelledSession.filename, cancelledSession.storage_node_id, (cancelNode as any)?.email || null, "warning", `Upload cancelled: ${cancelledSession.filename}`);
      }

      return new Response(JSON.stringify(publicUploadSession(cancelledSession as UploadSessionRow)), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // DELETE /drive-upload/sessions/:id — delete an upload session
    const deleteMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const sessionId = deleteMatch[1];
      await supabase.from("upload_sessions").delete().eq("id", sessionId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...ch, "Content-Type": "application/json" },
      });
    }

    // POST /drive-upload/route — get routing recommendation
    if (path === "/route" && req.method === "POST") {
      const body = await req.json();
      const { fileSizeMB, mode, preferredNodeId } = body;
      const fileSizeBytes = Math.round((fileSizeMB || 0) * 1024 * 1024);
      const nodes = await getConnectedNodes(supabase);

      if (nodes.length === 0) {
        return new Response(JSON.stringify({ error: "No storage node is ready for upload. Connect a Google Drive account and ensure it is enabled." }), {
          status: 400,
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      let selectedNode: StorageNodeRow | null = null;

      if (mode === "manual" && preferredNodeId) {
        selectedNode = nodes.find((n) => n.id === preferredNodeId) || null;
        if (!selectedNode) {
          return new Response(JSON.stringify({ error: "Selected drive is not available" }), {
            status: 400,
            headers: { ...ch, "Content-Type": "application/json" },
          });
        }
      } else {
        selectedNode = await selectBestNode(nodes, fileSizeBytes, mode || "automatic", supabase);
      }

      if (!selectedNode) {
        return new Response(JSON.stringify({ error: "No storage node with enough free space is available." }), {
          status: 400,
          headers: { ...ch, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        nodeId: selectedNode.id,
        email: selectedNode.email,
        displayName: selectedNode.display_name,
      }), {
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


