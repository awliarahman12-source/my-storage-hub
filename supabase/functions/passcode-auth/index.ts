import {
  getSupabase,
  corsHeaders,
  securityHeaders,
  jsonHeaders,
  sha256Hex,
  generateSessionToken,
  validateSession,
  SESSION_MAX_AGE,
  checkRateLimit,
  recordLoginAttempt,
  getClientIp,
  HttpError,
  errorResponse,
} from "../_shared/security.ts";

async function createSession(req: Request, supabase: ReturnType<typeof getSupabase>, clientIp: string): Promise<Response | null> {
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

  if (insertError) return null;

  return new Response(JSON.stringify({ success: true, sessionToken }), {
    status: 200,
    headers: jsonHeaders(req.headers.get("Origin")),
  });
}

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

  try {
    // GET /passcode-auth/status — check if passcode is initialized + session valid
    if (path === "/status" && req.method === "GET") {
      const supabase = getSupabase();
      const { data: settings } = await supabase
        .from("app_settings")
        .select("passcode_hash")
        .eq("id", 1)
        .maybeSingle();

      const passcodeInitialized = !!(settings?.passcode_hash);
      const session = await validateSession(req);

      return new Response(JSON.stringify({
        passcodeInitialized,
        authed: !!session,
      }), {
        status: 200,
        headers: jsonHeaders(origin),
      });
    }

    // POST /passcode-auth/setup — first-time passcode setup (only works if passcode_hash IS NULL)
    if (path === "/setup" && req.method === "POST") {
      const rateLimit = await checkRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
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

      const b = body as Record<string, unknown>;
      const passcode = typeof b?.passcode === "string" ? b.passcode : "";
      const confirm = typeof b?.confirm === "string" ? b.confirm : "";

      if (passcode.length < 6) {
        return errorResponse(400, "Passcode must be at least 6 characters", origin);
      }
      if (passcode !== confirm) {
        return errorResponse(400, "Passcodes do not match", origin);
      }
      if (passcode.length > 128) {
        return errorResponse(400, "Passcode is too long", origin);
      }

      const supabase = getSupabase();
      const { data: settings } = await supabase
        .from("app_settings")
        .select("passcode_hash")
        .eq("id", 1)
        .maybeSingle();

      if (!settings) {
        return errorResponse(500, "Settings unavailable", origin);
      }

      // Reject if passcode already exists
      if (settings.passcode_hash) {
        return errorResponse(403, "Admin passcode is already configured", origin);
      }

      const newHash = await sha256Hex(passcode);
      const { error: updateError } = await supabase
        .from("app_settings")
        .update({ passcode_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (updateError) {
        return errorResponse(500, "Failed to save passcode", origin);
      }

      // Create session
      await recordLoginAttempt(clientIp, true);
      const sessionRes = await createSession(req, supabase, clientIp);
      if (!sessionRes) return errorResponse(500, "Failed to create session", origin);
      return sessionRes;
    }

    // POST /passcode-auth/login
    if (path === "/login" && req.method === "POST") {
      const rateLimit = await checkRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
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

      if (passcode.length < 6 || passcode.length > 128) {
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

      if (!settings.passcode_hash) {
        return errorResponse(403, "Admin passcode not configured", origin);
      }

      const inputHash = await sha256Hex(passcode);
      if (inputHash !== settings.passcode_hash) {
        await recordLoginAttempt(clientIp, false);
        return errorResponse(401, "Invalid passcode", origin);
      }

      // Success
      await recordLoginAttempt(clientIp, true);
      const sessionRes = await createSession(req, supabase, clientIp);
      if (!sessionRes) return errorResponse(500, "Failed to create session", origin);
      return sessionRes;
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
      const token = req.headers.get("X-Session-Token");
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
        headers: jsonHeaders(origin),
      });
    }

    // GET /passcode-auth/sessions
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

    // POST /passcode-auth/revoke-session
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

    // POST /passcode-auth/change-passcode — requires current passcode verification
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
      const currentPasscode = typeof b?.currentPasscode === "string" ? b.currentPasscode : "";
      const newPasscode = typeof b?.newPasscode === "string" ? b.newPasscode : "";
      const confirmPasscode = typeof b?.confirmPasscode === "string" ? b.confirmPasscode : "";
      const birthDate = typeof b?.birthDate === "string" ? b.birthDate : "";

      if (currentPasscode.length === 0) {
        return errorResponse(400, "Current passcode is required", origin);
      }
      if (newPasscode.length < 6) {
        return errorResponse(400, "New passcode must be at least 6 characters", origin);
      }
      if (newPasscode !== confirmPasscode) {
        return errorResponse(400, "New passcodes do not match", origin);
      }
      if (newPasscode.length > 128) {
        return errorResponse(400, "Passcode is too long", origin);
      }

      const supabase = getSupabase();
      const { data: settings, error: settingsError } = await supabase
        .from("app_settings")
        .select("passcode_hash,birth_date")
        .eq("id", 1)
        .maybeSingle();

      if (settingsError || !settings) {
        return errorResponse(500, "Settings unavailable", origin);
      }

      // Verify current passcode
      const currentHash = await sha256Hex(currentPasscode);
      if (currentHash !== settings.passcode_hash) {
        return errorResponse(403, "Current passcode is incorrect", origin);
      }

      // Verify birth date (hardcoded verification date — do not read from DB)
      const VERIFICATION_BIRTH_DATE = "2026-01-11";
      if (birthDate.length === 0) {
        return errorResponse(400, "Birth date is required", origin);
      }
      if (birthDate !== VERIFICATION_BIRTH_DATE) {
        return errorResponse(403, "Birth date verification failed", origin);
      }

      const newHash = await sha256Hex(newPasscode);
      const { error: updateError } = await supabase
        .from("app_settings")
        .update({ passcode_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (updateError) {
        return errorResponse(500, "Failed to update passcode", origin);
      }

      // Invalidate all other sessions (keep current)
      await supabase
        .from("sessions")
        .update({ revoked: true })
        .neq("id", session.id)
        .eq("revoked", false);

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
