import { Hono } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import { readJson, requireString, optionalString, notFound } from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";

export const distribution = new Hono<AppContext>();
distribution.use("*", requireAuth);

distribution.get("/", async (c) => {
  const rows = await all(
    c.env,
    `SELECT g.id, g.name, g.doc_type_code, g.project_id, g.created_at,
            (SELECT COUNT(*) FROM distribution_members m WHERE m.group_id = g.id) AS member_count
     FROM distribution_groups g ORDER BY g.name`,
  );
  return c.json({ groups: rows });
});

distribution.post("/", requireRole("Document Controller", "Project Manager"), async (c) => {
  const body = await readJson(c);
  const name = requireString(body, "name");
  const projectId = optionalString(body, "project_id") ?? null;
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
