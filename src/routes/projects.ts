import { Hono } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import { audit } from "../lib/notify";
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

projects.get("/", async (c) => {
  const rows = await all(
    c.env,
    `SELECT p.id, p.code, p.name, p.client, p.location, p.status, p.created_at,
            (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS document_count
     FROM projects p ORDER BY p.created_at DESC`,
  );
  return c.json({ projects: rows });
});

projects.post("/", requireRole("Document Controller", "Project Manager"), async (c) => {
  const body = await readJson(c);
  const code = requireString(body, "code").toUpperCase();
  const name = requireString(body, "name");
  const client = optionalString(body, "client") ?? null;
  const location = optionalString(body, "location") ?? null;

  const existing = await first(c.env, `SELECT id FROM projects WHERE code = ?`, code);
  if (existing) throw conflict("A project with that code already exists");

  const id = newId("prj");
  await run(
    c.env,
    `INSERT INTO projects (id, code, name, client, location, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    code,
    name,
    client,
    location,
    c.get("user").id,
  );
  await audit(c.env, {
    entityType: "project",
    entityId: id,
    action: "created",
    detail: `${code} — ${name}`,
    userId: c.get("user").id,
  });
  return c.json({ project: { id, code, name, client, location } }, 201);
});

projects.get("/:id", async (c) => {
  const row = await first(c.env, `SELECT * FROM projects WHERE id = ?`, c.req.param("id"));
  if (!row) throw notFound("Project not found");
  return c.json({ project: row });
});
