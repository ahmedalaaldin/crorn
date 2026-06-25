/**
 * Per-project access control.
 *
 * Each project is private and separate: a non-admin user can only see and act
 * on projects they are a member of (see `project_members`). Admins bypass all
 * project scoping. These helpers are used by every project-scoped route to
 * filter list queries and to authorise access to a specific project's data.
 */
import type { Env, AuthUser } from "../types";
import { all, first } from "./db";
import { forbidden } from "./http";

export function isAdmin(user: AuthUser): boolean {
  return user.role === "Admin";
}

/**
 * The project ids a user may access. Admins get `null`, meaning "all projects"
 * (no filter). Every other user gets the explicit list of projects they belong
 * to — possibly an empty array, meaning they can see nothing.
 */
export async function accessibleProjectIds(
  env: Env,
  user: AuthUser,
): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  const rows = await all<{ project_id: string }>(
    env,
    `SELECT project_id FROM project_members WHERE user_id = ?`,
    user.id,
  );
  return rows.map((r) => r.project_id);
}

/** Throw 403 unless the user is an Admin or a member of the given project. */
export async function assertProjectAccess(
  env: Env,
  user: AuthUser,
  projectId: string,
): Promise<void> {
  if (isAdmin(user)) return;
  const row = await first(
    env,
    `SELECT 1 AS ok FROM project_members WHERE user_id = ? AND project_id = ? LIMIT 1`,
    user.id,
    projectId,
  );
  if (!row) throw forbidden("You do not have access to this project");
}

/**
 * Build a SQL fragment + bind params restricting `column` to the accessible
 * projects.
 *  - Admin (`ids === null`)  -> no restriction (empty fragment).
 *  - Empty list              -> `${prefix} 1 = 0` (matches nothing).
 *  - Otherwise               -> `${prefix} column IN (?, ?, ...)`.
 */
export function projectScope(
  ids: string[] | null,
  column: string,
  prefix: "AND" | "WHERE" = "AND",
): { sql: string; params: string[] } {
  if (ids === null) return { sql: "", params: [] };
  if (ids.length === 0) return { sql: ` ${prefix} 1 = 0`, params: [] };
  const placeholders = ids.map(() => "?").join(", ");
  return { sql: ` ${prefix} ${column} IN (${placeholders})`, params: ids };
}
