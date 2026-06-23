/** Cloudflare bindings available to the worker (see wrangler.jsonc). */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
}

/** Authenticated user attached to the request context by the auth middleware. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string | null;
}

/** Hono context typing: { Bindings, Variables }. */
export interface AppContext {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
}

/** Roles recognised by the workflow engine (routing is by role, not person). */
export const ROLES = [
  "Admin",
  "Document Controller",
  "Project Manager",
  "Project Director",
  "Contractor QA/QC",
  "Discipline Engineer",
  "Consultant Engineer",
  "Consultant Lead",
  "Client",
  "Contributor",
] as const;
export type Role = (typeof ROLES)[number];

/** Document lifecycle states (mirrors Aconex status automation). */
export const DOC_STATUS = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Under Review",
  AWAITING_RESPONSE: "Awaiting Response",
  REVISE: "Revise & Resubmit",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
} as const;

/** Workflow review outcomes (decision points). */
export const OUTCOMES = [
  "Approve",
  "Approve with Comments",
  "Revise & Resubmit",
  "Reject",
] as const;
export type Outcome = (typeof OUTCOMES)[number];
