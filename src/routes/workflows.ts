import { Hono } from "hono";
import type { AppContext, Outcome } from "../types";
import { OUTCOMES } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run } from "../lib/db";
import {
  readJson,
  requireString,
  optionalString,
  badRequest,
  notFound,
} from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { startWorkflow, actOnStep } from "../lib/workflow";
import { accessibleProjectIds, assertProjectAccess, projectScope } from "../lib/access";

/** Resolve the project a workflow belongs to (via its document). */
async function workflowProjectId(env: AppContext["Bindings"], workflowId: string): Promise<string | null> {
  const row = await first<{ project_id: string }>(
    env,
    `SELECT d.project_id FROM workflows w JOIN documents d ON d.id = w.document_id WHERE w.id = ?`,
    workflowId,
  );
  return row?.project_id ?? null;
}

/* --------------------------- Templates --------------------------- */
export const templates = new Hono<AppContext>();
templates.use("*", requireAuth);

templates.get("/", async (c) => {
  const projectId = c.req.query("project_id");
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  // Shared standards (project_id IS NULL) are always shown; project templates
  // are shown for the requested project or all the caller's accessible projects.
  let where = "WHERE (t.project_id IS NULL";
  const params: string[] = [];
  if (projectId) {
    where += " OR t.project_id = ?)";
    params.push(projectId);
  } else if (ids === null) {
    where += " OR t.project_id IS NOT NULL)";
  } else if (ids.length) {
    where += ` OR t.project_id IN (${ids.map(() => "?").join(", ")}))`;
    params.push(...ids);
  } else {
    where += ")";
  }
  const tpls = await all<{ id: string }>(
    c.env,
    `SELECT t.id, t.name, t.type, t.doc_type_code, t.active, t.created_at,
            t.project_id, p.code AS project_code
     FROM workflow_templates t LEFT JOIN projects p ON p.id = t.project_id
     ${where} ORDER BY (t.project_id IS NULL) DESC, t.name`,
    ...params,
  );
  const withSteps = await Promise.all(
    tpls.map(async (t) => ({
      ...t,
      steps: await all(
        c.env,
        `SELECT step_order, name, role, action_type, sla_days
         FROM workflow_template_steps WHERE template_id = ? ORDER BY step_order`,
        t.id,
      ),
    })),
  );
  return c.json({ templates: withSteps });
});

templates.post("/", requireRole("Document Controller", "Project Manager"), async (c) => {
  const body = await readJson(c);
  const name = requireString(body, "name");
  const type = optionalString(body, "type") ?? "document";
  const docType = optionalString(body, "doc_type_code")?.toUpperCase() ?? null;
  const projectId = optionalString(body, "project_id") ?? null;
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  const steps = Array.isArray(body.steps) ? (body.steps as Record<string, unknown>[]) : [];
  if (steps.length === 0) throw badRequest("At least one step is required");

  const id = newId("wt");
  await run(
    c.env,
    `INSERT INTO workflow_templates (id, name, type, doc_type_code, active, project_id) VALUES (?, ?, ?, ?, 1, ?)`,
    id,
    name,
    type,
    docType,
    projectId,
  );
  let order = 1;
  for (const s of steps) {
    await run(
      c.env,
      `INSERT INTO workflow_template_steps
         (id, template_id, step_order, name, role, action_type, sla_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId("wts"),
      id,
      order++,
      requireString(s, "name"),
      requireString(s, "role"),
      optionalString(s, "action_type") ?? "Review",
      typeof s.sla_days === "number" ? s.sla_days : 1,
    );
  }
  return c.json({ template: { id, name, type, doc_type_code: docType } }, 201);
});

templates.get("/:id", async (c) => {
  const id = c.req.param("id");
  const t = await first(c.env, `SELECT * FROM workflow_templates WHERE id = ?`, id);
  if (!t) throw notFound("Template not found");
  const tProject = (t as { project_id: string | null }).project_id;
  if (tProject) await assertProjectAccess(c.env, c.get("user"), tProject);
  const steps = await all(
    c.env,
    `SELECT id, step_order, name, role, action_type, sla_days
     FROM workflow_template_steps WHERE template_id = ? ORDER BY step_order`,
    id,
  );
  const outcomes = await all(
    c.env,
    `SELECT s.step_order, o.outcome, o.action, o.next_step_order
     FROM workflow_template_outcomes o
     JOIN workflow_template_steps s ON s.id = o.step_id
     WHERE s.template_id = ? ORDER BY s.step_order`,
    id,
  );
  return c.json({ template: t, steps, outcomes });
});

templates.patch("/:id", requireRole("Document Controller", "Project Manager"), async (c) => {
  const id = c.req.param("id");
  const tpl = await first<{ project_id: string | null }>(
    c.env,
    `SELECT project_id FROM workflow_templates WHERE id = ?`,
    id,
  );
  if (!tpl) throw notFound("Template not found");
  if (tpl.project_id) await assertProjectAccess(c.env, c.get("user"), tpl.project_id);
  const body = await readJson(c);
  const name = optionalString(body, "name");
  const docType = optionalString(body, "doc_type_code")?.toUpperCase();
  const active = typeof body.active === "boolean" ? (body.active ? 1 : 0) : undefined;
  await run(
    c.env,
    `UPDATE workflow_templates
       SET name = COALESCE(?, name), doc_type_code = COALESCE(?, doc_type_code),
           active = COALESCE(?, active)
     WHERE id = ?`,
    name ?? null,
    docType ?? null,
    active ?? null,
    id,
  );
  return c.json({ ok: true });
});

// Configure decision routing for a step (Aconex "Define Outcomes").
templates.post("/:id/outcomes", requireRole("Document Controller", "Project Manager"), async (c) => {
  const id = c.req.param("id");
  const tplO = await first<{ project_id: string | null }>(
    c.env,
    `SELECT project_id FROM workflow_templates WHERE id = ?`,
    id,
  );
  if (!tplO) throw notFound("Template not found");
  if (tplO.project_id) await assertProjectAccess(c.env, c.get("user"), tplO.project_id);
  const body = await readJson(c);
  const stepOrder = typeof body.step_order === "number" ? body.step_order : NaN;
  const outcome = requireString(body, "outcome");
  const action = requireString(body, "action");
  const nextStep = typeof body.next_step_order === "number" ? body.next_step_order : null;
  if (!OUTCOMES.includes(outcome as Outcome)) {
    throw badRequest(`outcome must be one of: ${OUTCOMES.join(", ")}`);
  }
  const valid = ["advance", "goto", "close", "return_to_originator", "reject_archive"];
  if (!valid.includes(action)) throw badRequest(`action must be one of: ${valid.join(", ")}`);

  const step = await first<{ id: string }>(
    c.env,
    `SELECT id FROM workflow_template_steps WHERE template_id = ? AND step_order = ?`,
    id,
    stepOrder,
  );
  if (!step) throw notFound("Template step not found");
  await run(
    c.env,
    `INSERT INTO workflow_template_outcomes (id, step_id, outcome, action, next_step_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(step_id, outcome) DO UPDATE SET action = excluded.action, next_step_order = excluded.next_step_order`,
    newId("wto"),
    step.id,
    outcome,
    action,
    nextStep,
  );
  return c.json({ ok: true });
});

/* ----------------------- Workflow instances ---------------------- */
export const workflows = new Hono<AppContext>();
workflows.use("*", requireAuth);

// Start a workflow on a document (uses the doc-type template if none given).
workflows.post("/start", async (c) => {
  const body = await readJson(c);
  const documentId = requireString(body, "document_id");
  const templateId = optionalString(body, "template_id") ?? null;
  const doc = await first<{ project_id: string }>(
    c.env,
    `SELECT project_id FROM documents WHERE id = ?`,
    documentId,
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, c.get("user"), doc.project_id);
  try {
    const id = await startWorkflow(c.env, documentId, templateId, c.get("user").id);
    return c.json({ workflow_id: id }, 201);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
});

// Act on the current step (Approve / Approve with Comments / Revise & Resubmit / Reject).
workflows.post("/:id/act", async (c) => {
  const id = c.req.param("id");
  const body = await readJson(c);
  const outcome = requireString(body, "outcome") as Outcome;
  const comments = optionalString(body, "comments");
  if (!OUTCOMES.includes(outcome)) {
    throw badRequest(`outcome must be one of: ${OUTCOMES.join(", ")}`);
  }
  const projectId = await workflowProjectId(c.env, id);
  if (!projectId) throw notFound("Workflow not found");
  await assertProjectAccess(c.env, c.get("user"), projectId);
  try {
    const result = await actOnStep(c.env, id, c.get("user"), outcome, comments);
    return c.json({ ok: true, ...result });
  } catch (err) {
    throw badRequest((err as Error).message);
  }
});

// "My tasks": steps currently awaiting the caller's role.
workflows.get("/tasks", async (c) => {
  const user = c.get("user");
  const ids = await accessibleProjectIds(c.env, user);
  if (ids !== null && ids.length === 0) return c.json({ tasks: [] });
  const scope = projectScope(ids, "d.project_id");
  const rows = await all(
    c.env,
    `SELECT ws.id AS step_id, ws.workflow_id, ws.name AS step_name, ws.role,
            ws.action_type, ws.due_date, w.document_id, d.document_no, d.title,
            d.current_revision
     FROM workflow_steps ws
     JOIN workflows w ON w.id = ws.workflow_id
     JOIN documents d ON d.id = w.document_id
     WHERE ws.status = 'in_progress' AND w.status = 'active'
       AND (ws.role = ? OR ? = 'Admin')${scope.sql}
     ORDER BY ws.due_date`,
    user.role,
    user.role,
    ...scope.params,
  );
  return c.json({ tasks: rows });
});

workflows.get("/", async (c) => {
  const documentId = c.req.query("document_id");
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  if (ids !== null && ids.length === 0) return c.json({ workflows: [] });
  const conds: string[] = [];
  const params: unknown[] = [];
  if (documentId) {
    conds.push("w.document_id = ?");
    params.push(documentId);
  }
  if (ids !== null) {
    conds.push(`d.project_id IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await all(
    c.env,
    `SELECT w.id, w.document_id, w.status, w.current_step, w.revision_code,
            w.started_at, w.completed_at, d.document_no
     FROM workflows w JOIN documents d ON d.id = w.document_id
     ${where}
     ORDER BY w.started_at DESC LIMIT 100`,
    ...params,
  );
  return c.json({ workflows: rows });
});

workflows.get("/:id", async (c) => {
  const id = c.req.param("id");
  const wf = await first(c.env, `SELECT * FROM workflows WHERE id = ?`, id);
  if (!wf) throw notFound("Workflow not found");
  const projectId = await workflowProjectId(c.env, id);
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  const steps = await all(
    c.env,
    `SELECT step_order, name, role, action_type, sla_days, status, due_date,
            outcome, comments, started_at, completed_at
     FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order`,
    id,
  );
  return c.json({ workflow: wf, steps });
});
