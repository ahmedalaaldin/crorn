import { Hono } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import { audit } from "../lib/notify";
import {
  accessibleProjectIds,
  assertProjectAccess,
  projectScope,
} from "../lib/access";
import { seedProjectTemplates } from "../lib/workflow";
import {
  readJson,
  requireString,
  optionalString,
  conflict,
  notFound,
} from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";

export const projects = new Hono<AppContext>();
projects.use("*", requireAuth);

// List only the projects the caller can access (Admins see all).
projects.get("/", async (c) => {
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  const scope = projectScope(ids, "p.id", "WHERE");
  const rows = await all(
    c.env,
    `SELECT p.id, p.code, p.name, p.client, p.location, p.status, p.created_at,
            (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS document_count,
            (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) AS member_count
     FROM projects p${scope.sql} ORDER BY p.created_at DESC`,
    ...scope.params,
  );
  return c.json({ projects: rows });
});

// Only Admins create projects; the project starts private to its members.
projects.post("/", requireRole(), async (c) => {
  const body = await readJson(c);
  const code = requireString(body, "code").toUpperCase();
  const name = requireString(body, "name");
  const client = optionalString(body, "client") ?? null;
  const location = optionalString(body, "location") ?? null;

  const existing = await first(c.env, `SELECT id FROM projects WHERE code = ?`, code);
  if (existing) throw conflict("A project with that code already exists");

  const id = newId("prj");
  const user = c.get("user");
  await run(
    c.env,
    `INSERT INTO projects (id, code, name, client, location, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    code,
    name,
    client,
    location,
    user.id,
  );
  // The creating Admin is added as a member so the project also appears for
  // them in any non-admin context and as an explicit owner of record.
  await run(
    c.env,
    `INSERT OR IGNORE INTO project_members (id, project_id, user_id) VALUES (?, ?, ?)`,
    newId("pmemb"),
    id,
    user.id,
  );
  // Give the new project its own copies of the standard workflow templates.
  await seedProjectTemplates(c.env, id);
  await audit(c.env, {
    entityType: "project",
    entityId: id,
    action: "created",
    detail: `${code} — ${name}`,
    userId: user.id,
  });
  return c.json({ project: { id, code, name, client, location } }, 201);
});

projects.get("/:id", async (c) => {
  const id = c.req.param("id");
  await assertProjectAccess(c.env, c.get("user"), id);
  const row = await first(c.env, `SELECT * FROM projects WHERE id = ?`, id);
  if (!row) throw notFound("Project not found");
  return c.json({ project: row });
});

/* --------------------------- Members ----------------------------- */
// Members of a project (visible to Admins and the project's own members).
projects.get("/:id/members", async (c) => {
  const id = c.req.param("id");
  await assertProjectAccess(c.env, c.get("user"), id);
  const members = await all(
    c.env,
    `SELECT m.user_id, u.name, u.email, u.role, c.code AS company_code
     FROM project_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE m.project_id = ?
     ORDER BY u.name`,
    id,
  );
  return c.json({ members });
});

// Admin-only: add a user to a project.
projects.post("/:id/members", requireRole(), async (c) => {
  const id = c.req.param("id");
  const project = await first(c.env, `SELECT id FROM projects WHERE id = ?`, id);
  if (!project) throw notFound("Project not found");
  const body = await readJson(c);
  const userId = requireString(body, "user_id");
  const u = await first(c.env, `SELECT id FROM users WHERE id = ?`, userId);
  if (!u) throw notFound("User not found");
  await run(
    c.env,
    `INSERT OR IGNORE INTO project_members (id, project_id, user_id) VALUES (?, ?, ?)`,
    newId("pmemb"),
    id,
    userId,
  );
  await audit(c.env, {
    entityType: "project",
    entityId: id,
    action: "member_added",
    detail: userId,
    userId: c.get("user").id,
  });
  return c.json({ ok: true });
});

// Admin-only: remove a user from a project.
projects.delete("/:id/members/:userId", requireRole(), async (c) => {
  const id = c.req.param("id");
  const userId = c.req.param("userId");
  await run(
    c.env,
    `DELETE FROM project_members WHERE project_id = ? AND user_id = ?`,
    id,
    userId,
  );
  await audit(c.env, {
    entityType: "project",
    entityId: id,
    action: "member_removed",
    detail: userId,
    userId: c.get("user").id,
  });
  return c.json({ ok: true });
});
