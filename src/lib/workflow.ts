/**
 * The workflow automation engine — the core of the DMS.
 *
 * Responsibilities:
 *  - Instantiate a workflow on a document revision from a template
 *  - Route step-by-step by ROLE (not person)
 *  - Auto-pass "Notify" steps (no human action required)
 *  - Apply decision outcomes (Approve / Approve with Comments / Revise & Resubmit / Reject)
 *  - Drive the document status automation
 *  - Maintain the revision loop (R00 -> R01 -> R02 ...) and full audit trail
 *  - Stamp SLA due dates on actionable steps
 */
import type { Env, Outcome } from "../types";
import { DOC_STATUS } from "../types";
import { newId } from "./crypto";
import { first, all, run, nextCounter } from "./db";
import { audit, notifyRole, notifyUser } from "./notify";
import { nextRevision, padSequence } from "./naming";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  role: string;
  action_type: string;
  sla_days: number;
  status: string;
  due_date: string | null;
  outcome: string | null;
}

interface DocumentRow {
  id: string;
  document_no: string;
  current_revision: string;
  created_by: string | null;
}

function dueDate(slaDays: number): string {
  return new Date(Date.now() + slaDays * DAY_MS).toISOString();
}

/**
 * Start a workflow for a document using the given template (or the template
 * auto-assigned to the document's type). Returns the new workflow id.
 */
export async function startWorkflow(
  env: Env,
  documentId: string,
  templateId: string | null,
  userId: string,
): Promise<string> {
  const doc = await first<DocumentRow & { doc_type_code: string | null; project_id: string }>(
    env,
    `SELECT id, document_no, current_revision, created_by, doc_type_code, project_id
     FROM documents WHERE id = ?`,
    documentId,
  );
  if (!doc) throw new Error("Document not found");

  // Resolve template: explicit id, else the active template for the doc type —
  // preferring one that belongs to the document's project over a shared standard.
  const template = templateId
    ? await first<{ id: string }>(
        env,
        `SELECT id FROM workflow_templates WHERE id = ? AND active = 1`,
        templateId,
      )
    : await first<{ id: string }>(
        env,
        `SELECT id FROM workflow_templates
         WHERE doc_type_code = ? AND active = 1
           AND (project_id = ? OR project_id IS NULL)
         ORDER BY (project_id IS NULL), created_at LIMIT 1`,
        doc.doc_type_code,
        doc.project_id,
      );
  if (!template) throw new Error("No active workflow template for this document");

  const steps = await all<{
    step_order: number;
    name: string;
    role: string;
    action_type: string;
    sla_days: number;
  }>(
    env,
    `SELECT step_order, name, role, action_type, sla_days
     FROM workflow_template_steps WHERE template_id = ? ORDER BY step_order`,
    template.id,
  );
  if (steps.length === 0) throw new Error("Workflow template has no steps");

  const workflowId = newId("wf");
  await run(
    env,
    `INSERT INTO workflows (id, document_id, template_id, revision_code, status, started_by)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    workflowId,
    documentId,
    template.id,
    doc.current_revision,
    userId,
  );

  for (const s of steps) {
    await run(
      env,
      `INSERT INTO workflow_steps
         (id, workflow_id, step_order, name, role, action_type, sla_days, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      newId("wfs"),
      workflowId,
      s.step_order,
      s.name,
      s.role,
      s.action_type,
      s.sla_days,
    );
  }

  await run(
    env,
    `UPDATE documents SET workflow_status = ?, updated_at = datetime('now') WHERE id = ?`,
    DOC_STATUS.UNDER_REVIEW,
    documentId,
  );
  await audit(env, {
    entityType: "workflow",
    entityId: workflowId,
    action: "started",
    detail: `Workflow started for ${doc.document_no} (${doc.current_revision})`,
    userId,
  });

  // Activate the first actionable step (auto-passing any leading Notify steps).
  await advance(env, workflowId, 0);
  return workflowId;
}

/**
 * Give a newly-created project its own copies of the shared "standard"
 * templates (Submittals / Letters / RFIs), including their steps and any
 * configured decision outcomes. Each project then owns and customises its
 * workflows independently of every other project.
 */
export async function seedProjectTemplates(env: Env, projectId: string): Promise<void> {
  const standards = await all<{
    id: string;
    name: string;
    type: string;
    doc_type_code: string | null;
  }>(
    env,
    `SELECT id, name, type, doc_type_code FROM workflow_templates
     WHERE project_id IS NULL AND active = 1`,
  );
  for (const tpl of standards) {
    const newTplId = newId("wt");
    await run(
      env,
      `INSERT INTO workflow_templates (id, name, type, doc_type_code, active, project_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
      newTplId,
      tpl.name,
      tpl.type,
      tpl.doc_type_code,
      projectId,
    );
    const steps = await all<{
      id: string;
      step_order: number;
      name: string;
      role: string;
      action_type: string;
      sla_days: number;
    }>(
      env,
      `SELECT id, step_order, name, role, action_type, sla_days
       FROM workflow_template_steps WHERE template_id = ? ORDER BY step_order`,
      tpl.id,
    );
    for (const s of steps) {
      const newStepId = newId("wts");
      await run(
        env,
        `INSERT INTO workflow_template_steps
           (id, template_id, step_order, name, role, action_type, sla_days)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newStepId,
        newTplId,
        s.step_order,
        s.name,
        s.role,
        s.action_type,
        s.sla_days,
      );
      const outcomes = await all<{ outcome: string; action: string; next_step_order: number | null }>(
        env,
        `SELECT outcome, action, next_step_order FROM workflow_template_outcomes WHERE step_id = ?`,
        s.id,
      );
      for (const o of outcomes) {
        await run(
          env,
          `INSERT INTO workflow_template_outcomes (id, step_id, outcome, action, next_step_order)
           VALUES (?, ?, ?, ?, ?)`,
          newId("wto"),
          newStepId,
          o.outcome,
          o.action,
          o.next_step_order,
        );
      }
    }
  }
}

/**
 * Move the workflow to the next actionable step after `afterOrder`.
 * Notify steps are auto-completed and announced. When no actionable step
 * remains, the workflow completes and the document closes.
 */
async function advance(
  env: Env,
  workflowId: string,
  afterOrder: number,
): Promise<void> {
  const steps = await all<WorkflowStep>(
    env,
    `SELECT * FROM workflow_steps WHERE workflow_id = ? AND step_order > ?
     ORDER BY step_order`,
    workflowId,
    afterOrder,
  );

  for (const step of steps) {
    if (step.action_type === "Notify") {
      // Auto-pass: announce to the role and continue.
      await run(
        env,
        `UPDATE workflow_steps
           SET status = 'completed', outcome = 'Notified',
               started_at = datetime('now'), completed_at = datetime('now')
         WHERE id = ?`,
        step.id,
      );
      await notifyRole(env, step.role, {
        type: "received",
        title: `${step.name}`,
        body: `Auto-notified ${step.role}.`,
        entityType: "workflow",
        entityId: workflowId,
      });
      continue;
    }

    // Actionable (Review / Approve) step — make it current.
    await run(
      env,
      `UPDATE workflow_steps
         SET status = 'in_progress', started_at = datetime('now'), due_date = ?
       WHERE id = ?`,
      dueDate(step.sla_days),
      step.id,
    );
    await run(
      env,
      `UPDATE workflows SET current_step = ? WHERE id = ?`,
      step.step_order,
      workflowId,
    );
    await notifyRole(env, step.role, {
      type: "review_required",
      title: `Action required: ${step.name}`,
      body: `${step.action_type} due within ${step.sla_days} day(s).`,
      entityType: "workflow",
      entityId: workflowId,
    });
    return;
  }

  // Nothing left — complete and close.
  await complete(env, workflowId);
}

async function complete(env: Env, workflowId: string): Promise<void> {
  const wf = await first<{ document_id: string }>(
    env,
    `SELECT document_id FROM workflows WHERE id = ?`,
    workflowId,
  );
  await run(
    env,
    `UPDATE workflows SET status = 'completed', current_step = NULL,
       completed_at = datetime('now') WHERE id = ?`,
    workflowId,
  );
  if (wf) {
    await run(
      env,
      `UPDATE documents SET workflow_status = ?, updated_at = datetime('now') WHERE id = ?`,
      DOC_STATUS.CLOSED,
      wf.document_id,
    );
    const doc = await first<DocumentRow>(
      env,
      `SELECT id, document_no, current_revision, created_by FROM documents WHERE id = ?`,
      wf.document_id,
    );
    if (doc?.created_by) {
      await notifyUser(env, doc.created_by, {
        type: "approved",
        title: `Approved & closed: ${doc.document_no}`,
        body: `Revision ${doc.current_revision} completed the workflow.`,
        entityType: "document",
        entityId: doc.id,
      });
    }
    await audit(env, {
      entityType: "workflow",
      entityId: workflowId,
      action: "completed",
      detail: "All steps approved",
    });
  }
}

/** Find the current actionable step of an active workflow. */
export async function currentStep(
  env: Env,
  workflowId: string,
): Promise<WorkflowStep | null> {
  return first<WorkflowStep>(
    env,
    `SELECT * FROM workflow_steps
     WHERE workflow_id = ? AND status = 'in_progress'
     ORDER BY step_order LIMIT 1`,
    workflowId,
  );
}

/**
 * Apply a reviewer's decision to the current step and route accordingly.
 * Enforces role-based authorisation (user role must match step role, or Admin).
 */
export async function actOnStep(
  env: Env,
  workflowId: string,
  user: { id: string; role: string },
  outcome: Outcome,
  comments: string | undefined,
): Promise<{ status: string }> {
  const wf = await first<{
    id: string;
    status: string;
    document_id: string;
    template_id: string | null;
  }>(
    env,
    `SELECT id, status, document_id, template_id FROM workflows WHERE id = ?`,
    workflowId,
  );
  if (!wf) throw new Error("Workflow not found");
  if (wf.status !== "active") throw new Error("Workflow is not active");

  const step = await currentStep(env, workflowId);
  if (!step) throw new Error("No actionable step is pending");

  const authorised =
    user.role === "Admin" ||
    user.role === step.role ||
    (user.role === "Document Controller" && step.action_type === "Notify");
  if (!authorised) {
    throw new Error(
      `This step is assigned to "${step.role}"; your role is "${user.role}"`,
    );
  }

  // Record the decision on the step.
  await run(
    env,
    `UPDATE workflow_steps
       SET status = 'completed', outcome = ?, comments = ?, acted_by = ?,
           completed_at = datetime('now')
     WHERE id = ?`,
    outcome,
    comments ?? null,
    user.id,
    step.id,
  );
  await audit(env, {
    entityType: "workflow",
    entityId: workflowId,
    action: `step:${outcome}`,
    detail: `${step.name} — ${outcome}${comments ? `: ${comments}` : ""}`,
    userId: user.id,
  });

  // Resolve configured routing for this step+outcome (else default behaviour).
  const route = await resolveOutcome(env, wf.template_id, step.step_order, outcome);
  switch (route.action) {
    case "advance":
      await advance(env, workflowId, step.step_order);
      return { status: "advanced" };
    case "goto":
      await gotoStep(env, workflowId, route.next_step_order ?? step.step_order + 1, step.step_order);
      return { status: "routed" };
    case "close":
      await complete(env, workflowId);
      return { status: "closed" };
    case "return_to_originator":
      await returnForRevision(env, wf.document_id, workflowId, comments, user.id);
      return { status: "returned" };
    case "reject_archive":
      await reject(env, wf.document_id, workflowId, comments, user.id);
      return { status: "rejected" };
    default:
      await advance(env, workflowId, step.step_order);
      return { status: "advanced" };
  }
}

interface OutcomeRoute {
  action: "advance" | "goto" | "close" | "return_to_originator" | "reject_archive";
  next_step_order: number | null;
}

/** Look up configured outcome routing; fall back to sensible defaults. */
async function resolveOutcome(
  env: Env,
  templateId: string | null,
  stepOrder: number,
  outcome: Outcome,
): Promise<OutcomeRoute> {
  if (templateId) {
    const tplStep = await first<{ id: string }>(
      env,
      `SELECT id FROM workflow_template_steps WHERE template_id = ? AND step_order = ?`,
      templateId,
      stepOrder,
    );
    if (tplStep) {
      const cfg = await first<{ action: OutcomeRoute["action"]; next_step_order: number | null }>(
        env,
        `SELECT action, next_step_order FROM workflow_template_outcomes WHERE step_id = ? AND outcome = ?`,
        tplStep.id,
        outcome,
      );
      if (cfg) return { action: cfg.action, next_step_order: cfg.next_step_order };
    }
  }
  // Defaults mirror the standard Aconex decision points.
  if (outcome === "Revise & Resubmit") return { action: "return_to_originator", next_step_order: null };
  if (outcome === "Reject") return { action: "reject_archive", next_step_order: null };
  return { action: "advance", next_step_order: null };
}

/** Jump the workflow to a specific step (configurable branching). */
async function gotoStep(
  env: Env,
  workflowId: string,
  targetOrder: number,
  fromOrder: number,
): Promise<void> {
  if (targetOrder <= fromOrder) {
    // Backward routing: reopen the target and everything after it.
    await run(
      env,
      `UPDATE workflow_steps
         SET status = 'pending', outcome = NULL, due_date = NULL,
             started_at = NULL, completed_at = NULL, last_reminder = NULL
       WHERE workflow_id = ? AND step_order >= ?`,
      workflowId,
      targetOrder,
    );
  } else if (targetOrder > fromOrder + 1) {
    // Forward skip: mark the bypassed steps as skipped.
    await run(
      env,
      `UPDATE workflow_steps SET status = 'skipped'
       WHERE workflow_id = ? AND step_order > ? AND step_order < ? AND status = 'pending'`,
      workflowId,
      fromOrder,
      targetOrder,
    );
  }
  await advance(env, workflowId, targetOrder - 1);
}

/** Revise & Resubmit: bump revision, return to originator, keep audit trail. */
async function returnForRevision(
  env: Env,
  documentId: string,
  workflowId: string,
  comments: string | undefined,
  userId: string,
): Promise<void> {
  const doc = await first<DocumentRow>(
    env,
    `SELECT id, document_no, current_revision, created_by FROM documents WHERE id = ?`,
    documentId,
  );
  if (!doc) return;

  const newRev = nextRevision(doc.current_revision);
  await run(
    env,
    `INSERT INTO revisions (id, document_id, revision_code, notes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    newId("rev"),
    documentId,
    newRev,
    comments ? `Revise & Resubmit: ${comments}` : "Revise & Resubmit",
    userId,
  );
  await run(
    env,
    `UPDATE documents
       SET current_revision = ?, workflow_status = ?, updated_at = datetime('now')
     WHERE id = ?`,
    newRev,
    DOC_STATUS.REVISE,
    documentId,
  );
  await run(
    env,
    `UPDATE workflows SET status = 'returned', current_step = NULL,
       completed_at = datetime('now') WHERE id = ?`,
    workflowId,
  );
  if (doc.created_by) {
    await notifyUser(env, doc.created_by, {
      type: "revision",
      title: `Revise & Resubmit: ${doc.document_no}`,
      body: `New revision ${newRev} created. ${comments ?? ""}`.trim(),
      entityType: "document",
      entityId: documentId,
    });
  }
  await audit(env, {
    entityType: "document",
    entityId: documentId,
    action: "revise_resubmit",
    detail: `Returned to originator; new revision ${newRev}`,
    userId,
  });
}

/** Reject: archive the document and close the workflow. */
async function reject(
  env: Env,
  documentId: string,
  workflowId: string,
  comments: string | undefined,
  userId: string,
): Promise<void> {
  await run(
    env,
    `UPDATE workflows SET status = 'rejected', current_step = NULL,
       completed_at = datetime('now') WHERE id = ?`,
    workflowId,
  );
  await run(
    env,
    `UPDATE documents SET workflow_status = ?, updated_at = datetime('now') WHERE id = ?`,
    DOC_STATUS.ARCHIVED,
    documentId,
  );
  const doc = await first<DocumentRow>(
    env,
    `SELECT id, document_no, current_revision, created_by FROM documents WHERE id = ?`,
    documentId,
  );
  if (doc?.created_by) {
    await notifyUser(env, doc.created_by, {
      type: "rejected",
      title: `Rejected: ${doc.document_no}`,
      body: comments ?? "Document rejected and archived.",
      entityType: "document",
      entityId: documentId,
    });
  }
  await audit(env, {
    entityType: "document",
    entityId: documentId,
    action: "rejected",
    detail: comments ? `Rejected: ${comments}` : "Rejected and archived",
    userId,
  });
}

interface SubmitDoc {
  id: string;
  project_id: string;
  project_code: string;
  document_no: string;
  current_revision: string;
  doc_type_code: string | null;
}

/**
 * Submit a document: validates a file is attached, auto-starts the workflow
 * for its document type, auto-generates a transmittal and auto-distributes it
 * to the matching distribution group — "no manual forwarding" (per scope §1/§2).
 */
export async function submitDocument(
  env: Env,
  documentId: string,
  userId: string,
): Promise<{ workflowId: string; transmittalId: string | null }> {
  const doc = await first<SubmitDoc & { created_by: string | null }>(
    env,
    `SELECT d.id, d.project_id, d.document_no, d.current_revision, d.doc_type_code,
            d.created_by, p.code AS project_code
     FROM documents d JOIN projects p ON p.id = d.project_id WHERE d.id = ?`,
    documentId,
  );
  if (!doc) throw new Error("Document not found");

  const rev = await first<{ r2_key: string | null }>(
    env,
    `SELECT r2_key FROM revisions WHERE document_id = ? AND revision_code = ?`,
    documentId,
    doc.current_revision,
  );
  if (!rev || !rev.r2_key) {
    throw new Error("Upload a file to the current revision before submitting");
  }
  const active = await first(
    env,
    `SELECT id FROM workflows WHERE document_id = ? AND status = 'active'`,
    documentId,
  );
  if (active) throw new Error("Document already has an active workflow");

  const workflowId = await startWorkflow(env, documentId, null, userId);
  await run(env, `UPDATE documents SET submitted_at = datetime('now') WHERE id = ?`, documentId);
  const transmittalId = await autoTransmittal(env, doc, userId);

  await audit(env, {
    entityType: "document",
    entityId: documentId,
    action: "submitted",
    detail: `Submitted ${doc.document_no} (${doc.current_revision})`,
    userId,
  });
  return { workflowId, transmittalId };
}

/** Auto-generate a transmittal for a submitted document and distribute it. */
async function autoTransmittal(env: Env, doc: SubmitDoc, userId: string): Promise<string | null> {
  // All distribution groups matching the document type (project-specific first).
  const groups = await all<{ id: string }>(
    env,
    `SELECT id FROM distribution_groups
     WHERE doc_type_code = ? AND (project_id = ? OR project_id IS NULL)
     ORDER BY (project_id IS NULL)`,
    doc.doc_type_code,
    doc.project_id,
  );

  const seq = await nextCounter(env, `trn:${doc.project_id}`);
  const transmittalNo = `${doc.project_code}-TRN-${padSequence(seq)}`;
  const id = newId("trn");
  await run(
    env,
    `INSERT INTO transmittals (id, project_id, transmittal_no, subject, from_user, group_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    doc.project_id,
    transmittalNo,
    `Submittal: ${doc.document_no}`,
    userId,
    groups[0]?.id ?? null,
  );
  await run(
    env,
    `INSERT INTO transmittal_documents (id, transmittal_id, document_id, revision_code)
     VALUES (?, ?, ?, ?)`,
    newId("td"),
    id,
    doc.id,
    doc.current_revision,
  );
  for (const g of groups) {
    await autoDistribute(env, g.id, {
      type: "received",
      title: `Transmittal ${transmittalNo}`,
      body: `Auto-generated for ${doc.document_no} (${doc.current_revision})`,
      entityType: "transmittal",
      entityId: id,
    });
  }
  await audit(env, {
    entityType: "transmittal",
    entityId: id,
    action: "auto_issued",
    detail: `${transmittalNo} for ${doc.document_no}`,
    userId,
  });
  return id;
}

/** Notify every member of a distribution group. */
async function autoDistribute(
  env: Env,
  groupId: string | null,
  n: { type: string; title: string; body?: string; entityType: string; entityId: string },
): Promise<void> {
  if (!groupId) return;
  const members = await all<{ user_id: string }>(
    env,
    `SELECT user_id FROM distribution_members WHERE group_id = ?`,
    groupId,
  );
  for (const m of members) await notifyUser(env, m.user_id, n);
}
