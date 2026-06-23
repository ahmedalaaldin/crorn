import { Hono } from "hono";
import type { AppContext } from "../types";

export const health = new Hono<AppContext>();

// Public liveness + binding connectivity probe (no auth).
health.get("/", async (c) => {
  const checks: Record<string, string> = {};

  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.d1 = "ok";
  } catch (e) {
    checks.d1 = `error: ${(e as Error).message}`;
  }

  try {
    await c.env.FILES.head("__healthcheck__");
    checks.r2 = "ok";
  } catch (e) {
    checks.r2 = `error: ${(e as Error).message}`;
  }

  try {
    await c.env.SESSIONS.get("__healthcheck__");
    checks.kv_sessions = "ok";
  } catch (e) {
    checks.kv_sessions = `error: ${(e as Error).message}`;
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  return c.json(
    {
      service: "crorn-dms",
      status: healthy ? "healthy" : "degraded",
      environment: c.env.ENVIRONMENT,
      time: new Date().toISOString(),
      checks,
    },
    healthy ? 200 : 503,
  );
});
