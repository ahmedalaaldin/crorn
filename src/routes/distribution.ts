import { Hono } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import { readJson, requireString, optionalString, notFound } from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access";

export const distribution = new Hono<AppContext>();
distribution.use("*", requireAuth);

distribution.get("/", async (c) => {
  // Global groups (no project) are visible to everyone; project-scoped groups
  // only to members of that project (Admins see all).
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  let where = "";
  const params: string[] = [];
  if (ids !== null) {
    if (ids.length === 0) {
      where = "WHERE g.project_id IS NULL";
    } else {
      where = `WHERE (g.project_id IS NULL OR g.project_id IN (${ids.map(() => "?").join(", ")}))`;
      params.push(...ids);
    }
  }
  const rows = await all(
    c.env,
    `SELECT g.id, g.name, g.doc_type_code, g.project_id, g.created_at,
            (SELECT COUNT(*) FROM distribution_members m WHERE m.group_id = g.id) AS member_count
     FROM distribution_groups g ${where} ORDER BY g.name`,
    ...params,
  );
  return c.json({ groups: rows });
});

distribution.post("/", requireRole("Document Controller", "Project Manager"), async (c) => {
  const body = await readJson(c);
  const name = requireString(body, "name");
  const projectId = optionalString(body, "project_id") ?? null;
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  const docType = optionalString(body, "doc_type_code")?.toUpperCase() ?? null;
  const id = newId("dg");
  await run(
    c.env,
    `INSERT INTO distribution_groups (id, project_id, name, doc_type_code) VALUES (?, ?, ?, ?)`,
    id,
    projectId,
    name,
    docType,
  );
  return c.json({ group: { id, name, doc_type_code: docType } }, 201);
});

distribution.get("/:id", async (c) => {
  const id = c.req.param("id");
  const g = await first(c.env, `SELECT * FROM distribution_groups WHERE id = ?`, id);
  if (!g) throw notFound("Group not found");
  const gProject = (g as { project_id: string | null }).project_id;
  if (gProject) await assertProjectAccess(c.env, c.get("user"), gProject);
  const members = await all(
    c.env,
    `SELECT m.user_id, u.name, u.email, u.role
     FROM distribution_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?`,
    id,
  );
  return c.json({ group: g, members });
});

distribution.post("/:id/members", requireRole("Document Controller", "Project Manager"), async (c) => {
  const id = c.req.param("id");
  const g = await first<{ project_id: string | null }>(
    c.env,
    `SELECT project_id FROM distribution_groups WHERE id = ?`,
    id,
  );
  if (!g) throw notFound("Group not found");
  if (g.project_id) await assertProjectAccess(c.env, c.get("user"), g.project_id);
  const body = await readJson(c);
  const userId = requireString(body, "user_id");
  await run(
    c.env,
    `INSERT OR IGNORE INTO distribution_members (id, group_id, user_id) VALUES (?, ?, ?)`,
    newId("dm"),
    id,
    userId,
  );
  return c.json({ ok: true });
});
