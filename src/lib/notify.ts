import type { Env } from "../types";
import { newId } from "./crypto";
import { run } from "./db";

interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

/** Notify a specific user. */
export async function notifyUser(
  env: Env,
  userId: string,
  n: NotifyInput,
): Promise<void> {
  await run(
    env,
    `INSERT INTO notifications (id, user_id, role, type, title, body, entity_type, entity_id)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
    newId("ntf"),
    userId,
    n.type,
    n.title,
    n.body ?? null,
    n.entityType ?? null,
    n.entityId ?? null,
  );
}

/**
 * Notify a role group. Creates one role-targeted notification (visible to all
 * users holding the role) — routing is by role, not person, per the scope.
 */
export async function notifyRole(
  env: Env,
  role: string,
  n: NotifyInput,
): Promise<void> {
  await run(
    env,
    `INSERT INTO notifications (id, user_id, role, type, title, body, entity_type, entity_id)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    newId("ntf"),
    role,
    n.type,
    n.title,
    n.body ?? null,
    n.entityType ?? null,
    n.entityId ?? null,
  );
}

/** Append an entry to the audit trail. */
export async function audit(
  env: Env,
  input: {
    entityType: string;
    entityId?: string;
    action: string;
    detail?: string;
    userId?: string | null;
  },
): Promise<void> {
  await run(
    env,
    `INSERT INTO audit_log (id, entity_type, entity_id, action, detail, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId("aud"),
    input.entityType,
    input.entityId ?? null,
    input.action,
    input.detail ?? null,
    input.userId ?? null,
  );
}
