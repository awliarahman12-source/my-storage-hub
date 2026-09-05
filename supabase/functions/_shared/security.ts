// Shared security utilities for all edge functions
// Import via: import { ... } from "../_shared/security.ts";

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ============ Environment ============

export function getEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`${key} is not configured`);
  return v;
}

export function getSupabaseUrl(): string {
  return getEnv("SUPABASE_URL");
}

export function getServiceRoleKey(): string {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabase(): ReturnType<typeof createClient> {
  return createClient(getSupabaseUrl(), getServiceRoleKey());
}

// ============ CORS ============

export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-CSRF-Token",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-CSRF-Token",
  };
}

// ============ Security Headers ============

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

export function jsonHeaders(origin: string | null): Record<string, string> {
  return {
    ...corsHeaders(origin),
    ...securityHeaders(),
    "Content-Type": "application/json",
  };
}

// ============ Hashing ============

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============ Session Management ============

export const SESSION_COOKIE = "ms_session";
export const SESSION_MAX_AGE = 86400; // 24 hours

export function generateSessionToken(): string {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < arr.length; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

export function sessionCookie(value: string, maxAge: number, isCrossOrigin = false): string {
  const sameSite = isCrossOrigin ? "None" : "Lax";
  const secure = isCrossOrigin ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=${sameSite}; Max-Age=${maxAge}`;
}

export function getCookie(req: Request, name: string): string | null {
  const cookies = req.headers.get("Cookie") || "";
  for (const part of cookies.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export interface SessionInfo {
  id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  ip_address: string | null;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
}

export async function validateSession(req: Request): Promise<SessionInfo | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const supabase = getSupabase();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session) return null;
  if (session.revoked) return null;

  const now = new Date();
  const expires = new Date(session.expires_at);
  if (expires < now) return null;

  return session as SessionInfo;
}

export async function requireAuth(req: Request): Promise<SessionInfo> {
  const session = await validateSession(req);
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  return session;
}

// ============ Rate Limiting ============

const MAX_ATTEMPTS = 5;
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const { count } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("attempted_at", since);

  const attempts = count || 0;
  if (attempts >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: LOCKOUT_MS };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("login_attempts").insert({
    ip_address: ip,
    success,
  });

  // Cleanup old attempts (older than 1 hour)
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from("login_attempts").delete().lt("attempted_at", cutoff);
}

// ============ Client IP ============

export function getClientIp(req: Request): string {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf;
  const xff = req.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("X-Real-IP");
  if (xri) return xri;
  return "unknown";
}

// ============ HTTP Error ============

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ============ Input Validation ============

export function validateEmail(email: unknown): string {
  if (typeof email !== "string" || email.length > 254) throw new HttpError(400, "Invalid email");
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new HttpError(400, "Invalid email format");
  return trimmed;
}

export function validateString(value: unknown, field: string, maxLen = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen) {
    throw new HttpError(400, `${field} is required and must be ${maxLen} characters or fewer`);
  }
  return value;
}

export function validateOptionalString(value: unknown, field: string, maxLen = 500): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maxLen) {
    throw new HttpError(400, `${field} must be ${maxLen} characters or fewer`);
  }
  return value;
}

export function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) {
    throw new HttpError(400, `Invalid ${field}`);
  }
  return value;
}

export function validateRole(role: unknown): string {
  if (typeof role !== "string") throw new HttpError(400, "Invalid role");
  const allowed = ["reader", "commenter", "writer", "owner", "organizer"];
  if (!allowed.includes(role)) throw new HttpError(400, "Invalid role");
  return role;
}

export function validateRoutingMode(mode: unknown): string {
  if (typeof mode !== "string") throw new HttpError(400, "Invalid routing mode");
  const allowed = ["automatic", "balanced", "manual"];
  if (!allowed.includes(mode)) throw new HttpError(400, "Invalid routing mode");
  return mode;
}

export function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new HttpError(400, `${field} must be a boolean`);
  return value;
}

export function validateNumber(value: unknown, field: string, min = 0, max = Infinity): number {
  if (typeof value !== "number" || isNaN(value) || value < min || value > max) {
    throw new HttpError(400, `${field} must be a number between ${min} and ${max}`);
  }
  return value;
}

// ============ Error Response ============

export function errorResponse(status: number, _message: string, origin: string | null): Response {
  // Sanitize error messages — don't leak internal details
  const safeMessages: Record<number, string> = {
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    429: "Too many attempts. Please try again later.",
    500: "Internal server error",
  };
  const msg = status === 429 ? safeMessages[429] : (safeMessages[status] || _message);
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: jsonHeaders(origin),
  });
}



