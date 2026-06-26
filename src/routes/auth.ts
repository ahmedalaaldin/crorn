import { Hono } from "hono";
import type { AppContext } from "../types";
import { hashPassword, verifyPassword, newId } from "../lib/crypto";
import {
  createSession,
  destroySession,
  resolveSession,
  sessionCookie,
  clearCookie,
  extractToken,
} from "../lib/auth";
import { first, run } from "../lib/db";
import { audit } from "../lib/notify";
import { readJson, requireString, badRequest, unauthorized } from "../lib/http";

export const auth = new Hono<AppContext>();

/** Public: indicates whether first-run admin bootstrap is still available. */
auth.get("/status", async (c) => {
  const count = await first<{ n: number }>(c.env, `SELECT COUNT(*) n FROM users`);
  return c.json({ needs_setup: (count?.n ?? 0) === 0 });
});

/**
 * Bootstrap signup. The very first account becomes the Admin. Once any user
 * exists, self-signup is closed — further users are invited by an Admin
 * (POST /api/users). This keeps the project tenant private by default.
 */
auth.post("/signup", async (c) => {
  const body = await readJson(c);
  const email = requireString(body, "email").toLowerCase();
  const password = requireString(body, "password");
  const name = requireString(body, "name");
  if (password.length < 8) throw badRequest("Password must be at least 8 characters");

  const count = await first<{ n: number }>(c.env, `SELECT COUNT(*) n FROM users`);
  if ((count?.n ?? 0) > 0) {
    throw badRequest("Signup is closed. Ask an administrator to invite you.");
  }

  const id = newId("usr");
  await run(
    c.env,
    `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'Admin')`,
    id,
    email,
    await hashPassword(password),
    name,
  );
  await audit(c.env, { entityType: "auth", entityId: id, action: "bootstrap_admin", userId: id });

  const token = await createSession(c.env, id);
  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ token, user: { id, email, name, role: "Admin" } }, 201);
});

auth.post("/login", async (c) => {
  const body = await readJson(c);
  const email = requireString(body, "email").toLowerCase();
  const password = requireString(body, "password");

  const user = await first<{
    id: string;
    email: string;
    name: string;
    role: string;
    password_hash: string;
    active: number;
  }>(c.env, `SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?`, email);

  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized("Invalid email or password");
  }

  const token = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookie(token));
  await audit(c.env, { entityType: "auth", entityId: user.id, action: "login", userId: user.id });
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

auth.post("/logout", async (c) => {
  const token = extractToken(c.req.raw);
  if (token) await destroySession(c.env, token);
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const token = extractToken(c.req.raw);
  const user = token ? await resolveSession(c.env, token) : null;
  if (!user) throw unauthorized();
  return c.json({ user });
});

// Self-service password change for the signed-in user.
auth.post("/change-password", async (c) => {
  const token = extractToken(c.req.raw);
  const user = token ? await resolveSession(c.env, token) : null;
  if (!user) throw unauthorized();
  const body = await readJson(c);
  const current = requireString(body, "current_password");
  const next = requireString(body, "new_password");
  if (next.length < 8) throw badRequest("New password must be at least 8 characters");
  const row = await first<{ password_hash: string }>(
    c.env,
    `SELECT password_hash FROM users WHERE id = ?`,
    user.id,
  );
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw unauthorized("Current password is incorrect");
  }
  await run(c.env, `UPDATE users SET password_hash = ? WHERE id = ?`, await hashPassword(next), user.id);
  await audit(c.env, { entityType: "auth", entityId: user.id, action: "password_changed", userId: user.id });
  return c.json({ ok: true });
});
