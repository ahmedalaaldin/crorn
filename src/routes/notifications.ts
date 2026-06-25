import { Hono } from "hono";
import type { AppContext, AuthUser } from "../types";
import { all, run } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { accessibleProjectIds } from "../lib/access";

export const notifications = new Hono<AppContext>();
notifications.use("*", requireAuth);

// Joins that resolve a notification's project via whatever entity it points at,
// so role-targeted notifications can be scoped to the caller's projects.
const ENTITY_JOINS = `
  LEFT JOIN documents nd ON n.entity_type = 'document' AND nd.id = n.entity_id
  LEFT JOIN workflows nw ON n.entity_type = 'workflow' AND nw.id = n.entity_id
  LEFT JOIN documents nwd ON nwd.id = nw.document_id
  LEFT JOIN transmittals nt ON n.entity_type = 'transmittal' AND nt.id = n.entity_id
  LEFT JOIN mail nm ON n.entity_type = 'mail' AND nm.id = n.entity_id`;
const ENTITY_PROJECT = "COALESCE(nd.project_id, nwd.project_id, nt.project_id, nm.project_id)";

/**
 * WHERE fragment (+ params) selecting notifications visible to the user: their
 * own direct notifications always, plus role notifications whose project is
 * accessible (or which have no project). Admins (ids === null) see everything.
 */
function visibilityClause(user: AuthUser, ids: string[] | null): { sql: string; params: string[] } {
  if (ids === null) return { sql: "(n.user_id = ? OR n.role = ?)", params: [user.id, user.role] };
  const access = ids.length
    ? `(${ENTITY_PROJECT} IS NULL OR ${ENTITY_PROJECT} IN (${ids.map(() => "?").join(", ")}))`
    : `${ENTITY_PROJECT} IS NULL`;
  return {
    sql: `(n.user_id = ? OR (n.role = ? AND ${access}))`,
    params: [user.id, user.role, ...ids],
  };
}

// Notifications addressed to the user directly or to their (project-scoped) role.
notifications.get("/", async (c) => {
  const user = c.get("user");
  const unreadOnly = c.req.query("unread") === "1";
  const ids = await accessibleProjectIds(c.env, user);
  const vis = visibilityClause(user, ids);
  const rows = await all(
    c.env,
    `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id, n.read, n.created_at, n.role
     FROM notifications n ${ENTITY_JOINS}
     WHERE ${vis.sql} ${unreadOnly ? "AND n.read = 0" : ""}
     ORDER BY n.created_at DESC LIMIT 100`,
    ...vis.params,
  );
  return c.json({ notifications: rows });
});

notifications.get("/unread-count", async (c) => {
  const user = c.get("user");
  const ids = await accessibleProjectIds(c.env, user);
  const vis = visibilityClause(user, ids);
  const rows = await all<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM notifications n ${ENTITY_JOINS}
     WHERE ${vis.sql} AND n.read = 0`,
    ...vis.params,
  );
  return c.json({ count: rows[0]?.n ?? 0 });
});

notifications.post("/mark-read", async (c) => {
  const user = c.get("user");
  await run(
    c.env,
    `UPDATE notifications SET read = 1 WHERE (user_id = ? OR role = ?)`,
    user.id,
    user.role,
  );
  return c.json({ ok: true });
});

notifications.post("/:id/read", async (c) => {
  const user = c.get("user");
  await run(
    c.env,
    `UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR role = ?)`,
    c.req.param("id"),
    user.id,
    user.role,
  );
  return c.json({ ok: true });
});
