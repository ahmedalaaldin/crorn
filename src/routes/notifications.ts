import { Hono } from "hono";
import type { AppContext } from "../types";
import { all, run } from "../lib/db";
import { requireAuth } from "../middleware/auth";

export const notifications = new Hono<AppContext>();
notifications.use("*", requireAuth);

// Notifications addressed to the user directly or to their role.
notifications.get("/", async (c) => {
  const user = c.get("user");
  const unreadOnly = c.req.query("unread") === "1";
  const rows = await all(
    c.env,
    `SELECT id, type, title, body, entity_type, entity_id, read, created_at, role
     FROM notifications
     WHERE (user_id = ? OR role = ?) ${unreadOnly ? "AND read = 0" : ""}
     ORDER BY created_at DESC LIMIT 100`,
    user.id,
    user.role,
  );
  return c.json({ notifications: rows });
});

notifications.get("/unread-count", async (c) => {
  const user = c.get("user");
  const rows = await all<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM notifications WHERE (user_id = ? OR role = ?) AND read = 0`,
    user.id,
    user.role,
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
