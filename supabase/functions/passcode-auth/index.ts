import {
  getSupabase,
  corsHeaders,
  securityHeaders,
  jsonHeaders,
  sha256Hex,
  generateSessionToken,
  sessionCookie,
  getCookie,
  validateSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkRateLimit,
  recordLoginAttempt,
  getClientIp,
  HttpError,
  errorResponse,
  validateString,
} from "../_shared/security.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const ch = corsHeaders(origin);
  const sh = securityHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...ch, ...sh } });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/passcode-auth/, "");
  const clientIp = getClientIp(req);
  const requestOrigin = req.headers.get("Origin");
  const supabaseHost = url.hostname;
  const isCrossOrigin = requestOrigin ? new URL(requestOrigin).hostname !== supabaseHost : false;

  try {
    // POST /passcode-auth/login
    if (path === "/login" && req.method === "POST") {
      // Rate limit check
      const rateLimit = await checkRateLimit(clientIp);
      if (!rateLimit.allowed) {
        const retryMin = Math.ceil(rateLimit.retryAfterMs / 60000);
        return new Response(JSON.stringify({ error: `Too many attempts. Try again in ${retryMin} minutes.` }), {
          status: 429,
          headers: { ...jsonHeaders(origin), "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) },
        });
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse(400, "Invalid request body", origin);
      }

      const passcode = (body as Record<string, unknown>)?.passcode;
      if (typeof passcode !== "string" || passcode.length === 0) {
        await recordLoginAttempt(clientIp, false);
        return errorResponse(400, "Passcode is required", origin);
      }

      // Validate format — passcode should be numeric, reasonable length
      if (!/^\d{4,10}$/.test(passcode)) {
        await recordLoginAttempt(clientIp, false);
        return errorResponse(401, "Invalid passcode", origin);
      }

      const supabase = getSupabase();
      const { data: settings, error } = await supabase
        .from("app_settings")
        .select("passcode_hash")
        .eq("id", 1)
        .maybeSingle();

      if (error || !settings) {
        return errorResponse(500, "Authentication unavailable", origin);
      }

      const inputHash = await sha256Hex(passcode);
      if (inputHash !== settings.passcode_hash) {
        await recordLoginAttempt(clientIp, false);
        return errorResponse(401, "Invalid passcode", origin);
      }

      // Success — create session
      await recordLoginAttempt(clientIp, true);

      const sessionToken = generateSessionToken();
      const tokenHash = await sha256Hex(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
      const userAgent = req.headers.get("User-Agent") || null;

      const { error: insertError } = await supabase
        .from("sessions")
        .insert({
          token_hash: tokenHash,
          expires_at: expiresAt,
          ip_address: clientIp,
          user_agent: userAgent,
        });

      if (insertError) {
        return errorResponse(500, "Failed to create session", origin);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          ...jsonHeaders(origin),
          "Set-Cookie": sessionCookie(sessionToken, SESSION_MAX_AGE, isCrossOrigin),
        },
      });
    }

    // GET /passcode-auth/check
    if (path === "/check" && req.method === "GET") {
      const session = await validateSession(req);
      return new Response(JSON.stringify({ authed: !!session }), {
        status: 200,
        headers: jsonHeaders(origin),
      });
    }

    // POST /passcode-auth/logout
    if (path === "/logout" && req.method === "POST") {
      const token = getCookie(req, SESSION_COOKIE);
      if (token) {
        const tokenHash = await sha256Hex(token);
        const supabase = getSupabase();
        await supabase
          .from("sessions")
          .update({ revoked: true })
          .eq("token_hash", tokenHash);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          ...jsonHeaders(origin),
          "Set-Cookie": sessionCookie("", 0, isCrossOrigin),
        },
      });
    }

    // GET /passcode-auth/sessions — list active sessions (for device management)
    if (path === "/sessions" && req.method === "GET") {
      const session = await validateSession(req);
      if (!session) return errorResponse(401, "Unauthorized", origin);

      const supabase = getSupabase();
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, ip_address, user_agent, device_id, created_at, expires_at, revoked")
        .order("created_at", { ascending: false })
        .limit(20);

      if (sessionsError) return errorResponse(500, "Failed to fetch sessions", origin);

      return new Response(JSON.stringify({ sessions: sessions || [] }), {
        status: 200,
        headers: jsonHeaders(origin),
      });
    }

    // POST /passcode-auth/revoke-session — revoke a specific session
    if (path === "/revoke-session" && req.method === "POST") {
      const currentSession = await validateSession(req);
      if (!currentSession) return errorResponse(401, "Unauthorized", origin);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse(400, "Invalid request body", origin);
      }

      const sessionId = (body as Record<string, unknown>)?.sessionId;
      if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(sessionId)) {
        return errorResponse(400, "Invalid session ID", origin);
      }

      // Don't allow revoking own session via this endpoint (use logout instead)
      if (sessionId === currentSession.id) {
        return errorResponse(400, "Use logout to end your own session", origin);
      }

      const supabase = getSupabase();
      await supabase
        .from("sessions")
        .update({ revoked: true })
        .eq("id", sessionId);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: jsonHeaders(origin),
      });
    }

    // POST /passcode-auth/change-passcode
    if (path === "/change-passcode" && req.method === "POST") {
      const session = await validateSession(req);
      if (!session) return errorResponse(401, "Unauthorized", origin);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse(400, "Invalid request body", origin);
      }

      const b = body as Record<string, unknown>;
      const birthDate = typeof b?.birthDate === "string" ? b.birthDate.trim() : "";
      const newPasscode = typeof b?.newPasscode === "string" ? b.newPasscode : "";

      if (!/^\d{4,10}$/.test(newPasscode)) {
        return errorResponse(400, "Passcode must be 4-10 digits", origin);
      }

      const supabase = getSupabase();
      const { data: settings, error: settingsError } = await supabase
        .from("app_settings")
        .select("birth_date")
        .eq("id", 1)
        .maybeSingle();

      if (settingsError || !settings) {
        return errorResponse(500, "Settings unavailable", origin);
      }

      if (!settings.birth_date || birthDate !== settings.birth_date) {
        return errorResponse(403, "Birth date does not match", origin);
      }

      const newHash = await sha256Hex(newPasscode);
      const { error: updateError } = await supabase
        .from("app_settings")
        .update({ passcode_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (updateError) {
        return errorResponse(500, "Failed to update passcode", origin);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
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




