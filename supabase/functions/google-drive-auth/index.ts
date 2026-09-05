// Phase 9: Security hardening — session validation, OAuth state validation, security headers
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
  validateNumber,
  validateBoolean,
  getCookie,
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
  connected_at: string;
  last_checked_at: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

function getClientId(): string { return getEnv("GOOGLE_CLIENT_ID"); }
function getClientSecret(): string { return getEnv("GOOGLE_CLIENT_SECRET"); }
function getRedirectUri(): string { return getEnv("GOOGLE_REDIRECT_URI"); }

function generateState(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < arr.length; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${errText}`);
  }
  const data = await res.json() as GoogleTokenResponse;
  if (!data.access_token) throw new Error("Token exchange returned no access_token");
  return data;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to get user info (${res.status}): ${errText}`);
  }
  const data = await res.json() as GoogleUserInfo;
  if (!data.sub || !data.email) throw new Error("User info response missing required fields");
  return data;
}

async function upsertStorageNode(
  supabase: ReturnType<typeof getSupabase>,
  userInfo: GoogleUserInfo,
  tokens: GoogleTokenResponse,
): Promise<StorageNodeRow> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("storage_nodes")
    .select("*")
    .eq("provider", "google_drive")
    .eq("provider_account_id", userInfo.sub)
    .maybeSingle();

  if (selectError) {
    console.error("Error fetching existing storage node:", selectError.message);
    throw new Error("Failed to check existing storage node");
  }

  if (existing) {
    const refreshToken = tokens.refresh_token || existing.refresh_token;
    if (!refreshToken) {
      console.warn("No refresh token available for node:", existing.id);
    }

    const { data, error } = await supabase
      .from("storage_nodes")
      .update({
        email: userInfo.email,
        display_name: userInfo.name,
        avatar: userInfo.picture,
        status: "connected",
        access_token: tokens.access_token,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update storage node:", error.message);
      throw new Error("Failed to update storage node");
    }
    return data as StorageNodeRow;
  }

  const { data: maxPriority } = await supabase
    .from("storage_nodes")
    .select("priority")
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPriority = maxPriority ? maxPriority.priority + 1 : 1;

  const { data, error } = await supabase
    .from("storage_nodes")
    .insert({
      provider: "google_drive",
      provider_account_id: userInfo.sub,
      email: userInfo.email,
      display_name: userInfo.name,
      avatar: userInfo.picture,
      status: "connected",
      cap: 15,
      used: 0,
      priority: nextPriority,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create storage node:", error.message);
    throw new Error("Failed to create storage node");
  }
  return data as StorageNodeRow;
}

async function deleteStorageNode(
  supabase: ReturnType<typeof getSupabase>,
  nodeId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("storage_nodes")
    .delete()
    .eq("id", nodeId);
  if (error) throw new Error("Failed to delete storage node");
  return true;
}

function publicNode(row: StorageNodeRow) {
  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
    status: row.status,
    cap: Number(row.cap),
    used: Number(row.used),
    priority: row.priority,
    enabled: row.enabled,
    connectedAt: row.connected_at,
    lastCheckedAt: row.last_checked_at,
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
  const path = url.pathname.replace(/^\/google-drive-auth/, "");

  try {
    // GET /google-drive-auth/auth — redirect to Google OAuth consent (public, no session needed)
    if (path === "/auth" && req.method === "GET") {
      const session = await validateSession(req);
      if (!session) return errorResponse(401, "Unauthorized", origin);

      const clientId = getClientId();
      const redirectUri = getRedirectUri();

      const state = generateState();
      const stateCookie = `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        state,
        access_type: "offline",
        prompt: "consent",
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      return new Response(null, {
        status: 302,
        headers: {
          ...ch,
          ...sh,
          Location: authUrl,
          "Set-Cookie": stateCookie,
        },
      });
    }

    // GET /google-drive-auth/callback — handle OAuth callback (public, validates state cookie)
    if (path === "/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam === "access_denied") {
        const redirectUrl = `${getEnv("SUPABASE_URL")}/functions/v1/google-drive-auth/redirect?error=access_denied`;
        return new Response(null, { status: 302, headers: { ...ch, ...sh, Location: redirectUrl } });
      }

      if (!code || !state) {
        const redirectUrl = `${getEnv("SUPABASE_URL")}/functions/v1/google-drive-auth/redirect?error=invalid_callback`;
        return new Response(null, { status: 302, headers: { ...ch, ...sh, Location: redirectUrl } });
      }

      // Validate OAuth state against cookie
      const cookieState = getCookie(req, "oauth_state");
      if (!cookieState || cookieState !== state) {
        const redirectUrl = `${getEnv("SUPABASE_URL")}/functions/v1/google-drive-auth/redirect?error=invalid_state`;
        return new Response(null, { status: 302, headers: { ...ch, ...sh, Location: redirectUrl } });
      }

      try {
        const tokens = await exchangeCodeForToken(code);
        const userInfo = await getGoogleUserInfo(tokens.access_token);
        const supabase = getSupabase();
        const node = await upsertStorageNode(supabase, userInfo, tokens);

        const appOrigin = getEnv("APP_ORIGIN");
        const redirectUrl = `${appOrigin}/?oauth=success&node=${node.id}`;
        const clearStateCookie = "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
        return new Response(null, {
          status: 302,
          headers: { ...ch, ...sh, Location: redirectUrl, "Set-Cookie": clearStateCookie },
        });
      } catch (err) {
        console.error("OAuth callback error:", err instanceof Error ? err.message : String(err));
        const appOrigin = getEnv("APP_ORIGIN");
        const redirectUrl = `${appOrigin}/?oauth=error`;
        const clearStateCookie = "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
        return new Response(null, {
          status: 302,
          headers: { ...ch, ...sh, Location: redirectUrl, "Set-Cookie": clearStateCookie },
        });
      }
    }

    // GET /google-drive-auth/redirect — show error page for OAuth failures (public)
    if (path === "/redirect" && req.method === "GET") {
      const errorType = url.searchParams.get("error") || "unknown";
      const messages: Record<string, string> = {
        access_denied: "You denied access to your Google account. No storage node was created.",
        invalid_callback: "The OAuth callback was invalid. Please try again.",
        invalid_state: "Security validation failed. Please try connecting again.",
        unknown: "An unknown error occurred during Google authentication.",
      };
      const msg = messages[errorType] || messages.unknown;
      const appOrigin = getEnv("APP_ORIGIN");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OAuth Error</title><meta http-equiv="refresh" content="3;url=${appOrigin}"></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fb;color:#172033"><div style="text-align:center;padding:40px;background:#fff;border-radius:18px;box-shadow:0 12px 35px rgba(25,35,60,.08);max-width:400px"><div style="font-size:36px;margin-bottom:12px">\u26A0</div><h2 style="margin:0 0 10px;font-size:18px">Connection Failed</h2><p style="color:#718096;font-size:13px;margin:0">${msg}</p><p style="color:#a0a8b7;font-size:11px;margin-top:16px">Redirecting back...</p></div></body></html>`;

      return new Response(html, {
        status: 200,
        headers: { ...ch, ...sh, "Content-Type": "text/html" },
      });
    }

    // All remaining endpoints require a valid session
    const session = await validateSession(req);
    if (!session) return errorResponse(401, "Unauthorized", origin);

    // GET /google-drive-auth/nodes — list all storage nodes
    if (path === "/nodes" && req.method === "GET") {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("storage_nodes")
        .select("*")
        .order("priority", { ascending: true })
        .order("connected_at", { ascending: true });

      if (error) return errorResponse(500, "Failed to fetch storage nodes", origin);

      const nodes = (data as StorageNodeRow[]).map(publicNode);
      return new Response(JSON.stringify({ nodes }), {
        headers: jsonHeaders(origin),
      });
    }

    // DELETE /google-drive-auth/nodes/:id — disconnect a storage node
    if (path.startsWith("/nodes/") && req.method === "DELETE") {
      const parts = path.split("/");
      const nodeId = validateId(parts[2], "node ID");

      const supabase = getSupabase();
      await deleteStorageNode(supabase, nodeId);

      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders(origin),
      });
    }

    // POST /google-drive-auth/nodes/:id/refresh — refresh node quota & status
    if (path.match(/^\/nodes\/[^/]+\/refresh$/) && req.method === "POST") {
      const nodeId = validateId(path.split("/")[2], "node ID");

      const supabase = getSupabase();
      const { data: node, error } = await supabase
        .from("storage_nodes")
        .select("*")
        .eq("id", nodeId)
        .maybeSingle();

      if (error || !node) return errorResponse(404, "Storage node not found", origin);

      const row = node as StorageNodeRow;

      try {
        let token = row.access_token;
        if (!token) throw new Error("No access token");

        if (row.token_expires_at) {
          const expiresAt = new Date(row.token_expires_at).getTime();
          if (Date.now() > expiresAt - 60000) {
            if (!row.refresh_token) throw new Error("No refresh token");
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: getClientId(),
                client_secret: getClientSecret(),
                refresh_token: row.refresh_token,
                grant_type: "refresh_token",
              }),
            });
            if (!refreshRes.ok) throw new Error("Token refresh failed");
            const tokens = await refreshRes.json();
            token = tokens.access_token;
            const newExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
            await supabase.from("storage_nodes").update({
              access_token: token,
              token_expires_at: newExpires,
            }).eq("id", nodeId);
          }
        }

        const quotaRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!quotaRes.ok) {
          await supabase.from("storage_nodes").update({
            status: "error",
            last_checked_at: new Date().toISOString(),
          }).eq("id", nodeId);
          return new Response(JSON.stringify({ success: true, status: "error" }), {
            headers: jsonHeaders(origin),
          });
        }

        const quotaData = await quotaRes.json();
        const sq = quotaData?.storageQuota;
        const cap = sq?.limit ? Number(sq.limit) / (1024 * 1024 * 1024) : row.cap;
        const used = sq?.usage ? Number(sq.usage) / (1024 * 1024 * 1024) : row.used;

        await supabase.from("storage_nodes").update({
          status: "connected",
          cap,
          used,
          last_checked_at: new Date().toISOString(),
        }).eq("id", nodeId);

        return new Response(JSON.stringify({ success: true, status: "connected" }), {
          headers: jsonHeaders(origin),
        });
      } catch {
        await supabase.from("storage_nodes").update({
          status: "disconnected",
          last_checked_at: new Date().toISOString(),
        }).eq("id", nodeId);
        return new Response(JSON.stringify({ success: true, status: "disconnected" }), {
          headers: jsonHeaders(origin),
        });
      }
    }

    // POST /google-drive-auth/nodes/:id/priority — set node priority
    if (path.match(/^\/nodes\/[^/]+\/priority$/) && req.method === "POST") {
      const nodeId = validateId(path.split("/")[2], "node ID");

      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse(400, "Invalid request body", origin); }

      const priority = validateNumber((body as Record<string, unknown>)?.priority, "priority", 0, 9999);

      const supabase = getSupabase();
      const { error } = await supabase
        .from("storage_nodes")
        .update({ priority })
        .eq("id", nodeId);

      if (error) return errorResponse(500, "Failed to update priority", origin);
      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders(origin),
      });
    }

    // POST /google-drive-auth/nodes/:id/toggle — enable/disable node
    if (path.match(/^\/nodes\/[^/]+\/toggle$/) && req.method === "POST") {
      const nodeId = validateId(path.split("/")[2], "node ID");

      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse(400, "Invalid request body", origin); }

      const enabled = validateBoolean((body as Record<string, unknown>)?.enabled, "enabled");

      const supabase = getSupabase();
      const { error } = await supabase
        .from("storage_nodes")
        .update({ enabled })
        .eq("id", nodeId);

      if (error) return errorResponse(500, "Failed to update enabled status", origin);
      return new Response(JSON.stringify({ success: true }), {
        headers: jsonHeaders(origin),
      });
    }

    return errorResponse(404, "Not found", origin);
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.status, err.message, origin);
    }
    return errorResponse(500, "Internal server error", origin);
  }
});

