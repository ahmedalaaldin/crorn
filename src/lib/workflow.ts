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
import { first, all, run } from "./db";
import { audit, notifyRole, notifyUser } from "./notify";
import { nextRevision } from "./naming";

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
  const doc = await first<DocumentRow & { doc_type_code: string | null }>(
    env,
    `SELECT id, document_no, current_revision, created_by, doc_type_code
     FROM documents WHERE id = ?`,
    documentId,
  );
  if (!doc) throw new Error("Document not found");

  // Resolve template: explicit id, else the active template for the doc type.
  const template = templateId
    ? await first<{ id: string }>(
        env,
        `SELECT id FROM workflow_templates WHERE id = ? AND active = 1`,
        templateId,
      )
    : await first<{ id: string }>(
        env,
        `SELECT id FROM workflow_templates
         WHERE doc_type_code = ? AND active = 1 ORDER BY created_at LIMIT 1`,
        doc.doc_type_code,
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
  const wf = await first<{ id: string; status: string; document_id: string }>(
    env,
    `SELECT id, status, document_id FROM workflows WHERE id = ?`,
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

  switch (outcome) {
    case "Approve":
    case "Approve with Comments":
      await advance(env, workflowId, step.step_order);
      return { status: "advanced" };

    case "Revise & Resubmit":
      await returnForRevision(env, wf.document_id, workflowId, comments, user.id);
      return { status: "returned" };

    case "Reject":
      await reject(env, wf.document_id, workflowId, comments, user.id);
      return { status: "rejected" };
  }
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
