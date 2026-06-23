import type { Env, AuthUser } from "../types";
import { newToken } from "./crypto";
import { first } from "./db";

export const SESSION_COOKIE = "crorn_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionData {
  userId: string;
  createdAt: number;
}

/** Create a session in KV and return its opaque token. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = newToken();
  const data: SessionData = { userId, createdAt: Date.now() };
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

/** Resolve a session token to the live user record, or null. */
export async function resolveSession(
  env: Env,
  token: string,
): Promise<AuthUser | null> {
  const raw = await env.SESSIONS.get(`session:${token}`);
  if (!raw) return null;
  let data: SessionData;
  try {
    data = JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
  const user = await first<AuthUser & { active: number }>(
    env,
    `SELECT id, email, name, role, company_id, active FROM users WHERE id = ?`,
    data.userId,
  );
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company_id: user.company_id,
  };
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`session:${token}`);
}

export function sessionCookie(token: string): string {
  return (
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; ` +
    `Path=/; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Extract a token from the session cookie or an Authorization: Bearer header. */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  const cookie = req.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k === SESSION_COOKIE) return rest.join("=");
    }
  }
  return null;
}
