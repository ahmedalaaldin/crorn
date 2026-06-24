import type { Env } from "../types";

/** First row or null. */
export async function first<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...params)
    .first<T>();
}

/** All rows. */
export async function all<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await env.DB.prepare(sql)
    .bind(...params)
    .all<T>();
  return res.results ?? [];
}

/** Execute a write statement. */
export async function run(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return env.DB.prepare(sql)
    .bind(...params)
    .run();
}

/**
 * Atomically increment and return the next value for a counter scope
 * (e.g. "doc:<projectId>"). Used for sequential document / transmittal /
 * mail numbers. Relies on D1's single-writer execution per request.
 */
export async function nextCounter(env: Env, scope: string): Promise<number> {
  await run(
    env,
    `INSERT INTO counters (scope, value) VALUES (?, 1)
     ON CONFLICT(scope) DO UPDATE SET value = value + 1`,
    scope,
  );
  const row = await first<{ value: number }>(
    env,
    `SELECT value FROM counters WHERE scope = ?`,
    scope,
  );
  return row?.value ?? 1;
}
