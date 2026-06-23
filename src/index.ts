import { Hono } from "hono";
import type { AppContext } from "./types";
import { ApiError } from "./lib/http";
import { INDEX_HTML } from "./ui";

import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { users, companies } from "./routes/admin";
import { projects } from "./routes/projects";
import { reference } from "./routes/reference";
import { documents } from "./routes/documents";
import { templates, workflows } from "./routes/workflows";
import { transmittals, mail } from "./routes/correspondence";
import { distribution } from "./routes/distribution";
import { notifications } from "./routes/notifications";
import { runSlaSweep } from "./scheduled";

const app = new Hono<AppContext>();

// Single-page admin/console UI.
app.get("/", (c) => c.html(INDEX_HTML));

// API surface.
app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/users", users);
app.route("/api/companies", companies);
app.route("/api/projects", projects);
app.route("/api/reference", reference);
app.route("/api/documents", documents);
app.route("/api/templates", templates);
app.route("/api/workflows", workflows);
app.route("/api/transmittals", transmittals);
app.route("/api/mail", mail);
app.route("/api/distribution-groups", distribution);
app.route("/api/notifications", notifications);

// Manual trigger for the SLA sweep (Admin/DC) — same logic as the cron.
app.post("/api/sla/run", async (c) => {
  const { extractToken, resolveSession } = await import("./lib/auth");
  const token = extractToken(c.req.raw);
  const user = token ? await resolveSession(c.env, token) : null;
  if (!user || (user.role !== "Admin" && user.role !== "Document Controller")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const result = await runSlaSweep(c.env);
  return c.json({ ok: true, ...result });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.status as 400);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: app.fetch,
  // Cron Trigger (see wrangler.jsonc -> triggers.crons): daily SLA sweep.
  async scheduled(_event: ScheduledController, env: AppContext["Bindings"]): Promise<void> {
    const result = await runSlaSweep(env);
    console.info("SLA sweep:", JSON.stringify(result));
  },
};
