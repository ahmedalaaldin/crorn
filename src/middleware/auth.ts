import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../types";
import { extractToken, resolveSession } from "../lib/auth";
import { ApiError } from "../lib/http";

/** Require a valid session; attaches the user to the context. */
export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = extractToken(c.req.raw);
  if (!token) throw new ApiError(401, "Authentication required");
  const user = await resolveSession(c.env, token);
  if (!user) throw new ApiError(401, "Invalid or expired session");
  c.set("user", user);
  await next();
};

/** Require the user to hold one of the given roles (Admin always allowed). */
export function requireRole(...roles: string[]): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw new ApiError(401, "Authentication required");
    if (user.role !== "Admin" && !roles.includes(user.role)) {
      throw new ApiError(403, `Requires role: ${roles.join(" or ")}`);
    }
    await next();
  };
}
