import type { Context } from "hono";

/** Thrown by handlers/services to short-circuit with a specific HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (m: string) => new ApiError(400, m);
export const unauthorized = (m = "Unauthorized") => new ApiError(401, m);
export const forbidden = (m = "Forbidden") => new ApiError(403, m);
export const notFound = (m = "Not found") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);

/** Parse and validate a JSON body, returning a typed record. */
export async function readJson<T = Record<string, unknown>>(
  c: Context,
): Promise<T> {
  try {
    const data = await c.req.json();
    if (typeof data !== "object" || data === null) {
      throw badRequest("Request body must be a JSON object");
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw badRequest("Invalid JSON body");
  }
}

/** Require a non-empty string field. */
export function requireString(
  body: Record<string, unknown>,
  field: string,
): string {
  const v = body[field];
  if (typeof v !== "string" || v.trim() === "") {
    throw badRequest(`Field "${field}" is required`);
  }
  return v.trim();
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const v = body[field];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw badRequest(`Field "${field}" must be a string`);
  return v.trim();
}
