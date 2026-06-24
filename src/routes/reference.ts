import { Hono } from "hono";
import type { AppContext } from "../types";
import { ROLES, OUTCOMES } from "../types";
import { all } from "../lib/db";
import { requireAuth } from "../middleware/auth";

export const reference = new Hono<AppContext>();
reference.use("*", requireAuth);

reference.get("/disciplines", async (c) =>
  c.json({ disciplines: await all(c.env, `SELECT code, name FROM disciplines ORDER BY code`) }),
);

reference.get("/doc-types", async (c) =>
  c.json({
    doc_types: await all(c.env, `SELECT code, name, category FROM doc_types ORDER BY code`),
  }),
);

reference.get("/levels", async (c) =>
  c.json({ levels: await all(c.env, `SELECT code, name FROM levels ORDER BY sort`) }),
);

reference.get("/statuses", async (c) =>
  c.json({ statuses: await all(c.env, `SELECT code, name FROM status_codes ORDER BY code`) }),
);

reference.get("/escalation-rules", async (c) =>
  c.json({
    rules: await all(
      c.env,
      `SELECT days_overdue, action, notify_role FROM escalation_rules ORDER BY days_overdue`,
    ),
  }),
);

// Enumerations baked into the engine.
reference.get("/roles", (c) => c.json({ roles: ROLES }));
reference.get("/outcomes", (c) => c.json({ outcomes: OUTCOMES }));
