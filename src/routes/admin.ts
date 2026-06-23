import { Hono } from "hono";
import type { AppContext } from "../types";
import { ROLES } from "../types";
import { hashPassword, newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import { audit } from "../lib/notify";
import {
  readJson,
  requireString,
  optionalString,
  badRequest,
  conflict,
} from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";

/* ----------------------------- Users ----------------------------- */
export const users = new Hono<AppContext>();
users.use("*", requireAuth);

users.get("/", requireRole("Document Controller", "Project Manager"), async (c) => {
  const rows = await all(
    c.env,
    `SELECT u.id, u.email, u.name, u.role, u.active, u.created_at,
            c.code AS company_code, c.name AS company_name
     FROM users u LEFT JOIN companies c ON c.id = u.company_id
     ORDER BY u.created_at DESC`,
  );
  return c.json({ users: rows });
});

// Admin-invited user creation (self-signup is closed after bootstrap).
users.post("/", requireRole(), async (c) => {
  const body = await readJson(c);
  const email = requireString(body, "email").toLowerCase();
  const password = requireString(body, "password");
  const name = requireString(body, "name");
  const role = requireString(body, "role");
  const companyId = optionalString(body, "company_id") ?? null;
  if (password.length < 8) throw badRequest("Password must be at least 8 characters");
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    throw badRequest(`Invalid role. One of: ${ROLES.join(", ")}`);
  }

  const existing = await first(c.env, `SELECT id FROM users WHERE email = ?`, email);
  if (existing) throw conflict("A user with that email already exists");

  const id = newId("usr");
  await run(
    c.env,
    `INSERT INTO users (id, email, password_hash, name, role, company_id) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    email,
    await hashPassword(password),
    name,
    role,
    companyId,
  );
  await audit(c.env, {
    entityType: "auth",
    entityId: id,
    action: "user_created",
    detail: `${email} as ${role}`,
    userId: c.get("user").id,
  });
  return c.json({ user: { id, email, name, role, company_id: companyId } }, 201);
});

users.patch("/:id", requireRole(), async (c) => {
  const id = c.req.param("id");
  const body = await readJson(c);
  const role = optionalString(body, "role");
  const active = typeof body.active === "boolean" ? (body.active ? 1 : 0) : undefined;
  if (role && !ROLES.includes(role as (typeof ROLES)[number])) {
    throw badRequest("Invalid role");
  }
  await run(
    c.env,
    `UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?`,
    role ?? null,
    active ?? null,
    id,
  );
  return c.json({ ok: true });
});

/* --------------------------- Companies --------------------------- */
export const companies = new Hono<AppContext>();
companies.use("*", requireAuth);

companies.get("/", async (c) => {
  const rows = await all(c.env, `SELECT id, code, name, type, created_at FROM companies ORDER BY name`);
  return c.json({ companies: rows });
});

companies.post("/", requireRole("Document Controller"), async (c) => {
  const body = await readJson(c);
  const code = requireString(body, "code").toUpperCase();
  const name = requireString(body, "name");
  const type = optionalString(body, "type") ?? "Contractor";

  const existing = await first(c.env, `SELECT id FROM companies WHERE code = ?`, code);
  if (existing) throw conflict("A company with that code already exists");

  const id = newId("co");
  await run(
    c.env,
    `INSERT INTO companies (id, code, name, type) VALUES (?, ?, ?, ?)`,
    id,
    code,
    name,
    type,
  );
  return c.json({ company: { id, code, name, type } }, 201);
});
