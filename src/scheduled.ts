/**
 * Daily SLA enforcement sweep (Cloudflare Cron Trigger).
 *
 * For every actionable, in-progress workflow step it:
 *  - sends "due soon" reminders at 50% and 80% of the SLA window
 *  - applies the escalation matrix once each overdue threshold is crossed
 *    (+2 reminder, +5 escalate to PM, +7 to Project Director, +10 formal NCR)
 *
 * `last_reminder` on the step records the highest marker already sent so the
 * sweep is idempotent and never double-notifies the same threshold.
 */
import type { Env } from "./types";
import { all, run } from "./lib/db";
import { audit, notifyRole } from "./lib/notify";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseSqlTime(s: string): number {
  // SQLite datetime('now') -> "YYYY-MM-DD HH:MM:SS" (UTC); due_date is ISO.
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

interface DueStep {
  id: string;
  workflow_id: string;
  name: string;
  role: string;
  started_at: string | null;
  due_date: string | null;
  last_reminder: string | null;
  document_no: string;
}

export async function runSlaSweep(env: Env): Promise<{ processed: number; actions: number }> {
  const steps = await all<DueStep>(
    env,
    `SELECT ws.id, ws.workflow_id, ws.name, ws.role, ws.started_at, ws.due_date,
            ws.last_reminder, d.document_no
     FROM workflow_steps ws
     JOIN workflows w ON w.id = ws.workflow_id
     JOIN documents d ON d.id = w.document_id
     WHERE ws.status = 'in_progress' AND w.status = 'active'
       AND ws.due_date IS NOT NULL AND ws.started_at IS NOT NULL`,
  );

  const escalations = await all<{ days_overdue: number; action: string; notify_role: string | null }>(
    env,
    `SELECT days_overdue, action, notify_role FROM escalation_rules ORDER BY days_overdue DESC`,
  );

  const now = Date.now();
  let actions = 0;

  for (const step of steps) {
    const start = parseSqlTime(step.started_at!);
    const due = parseSqlTime(step.due_date!);
    if (!Number.isFinite(start) || !Number.isFinite(due)) continue;

    const overdueDays = Math.floor((now - due) / DAY_MS);
    const window = Math.max(due - start, 1);
    const elapsed = (now - start) / window;

    let marker: string | null = null;
    let action: { title: string; role: string; type: string } | null = null;

    if (overdueDays >= 2) {
      // Highest escalation threshold reached.
      const rule = escalations.find((r) => overdueDays >= r.days_overdue);
      if (rule) {
        marker = `overdue-${rule.days_overdue}`;
        action = {
          title: `${rule.action}: ${step.document_no} — ${step.name} (${overdueDays}d overdue)`,
          role: rule.notify_role ?? step.role,
          type: "escalation",
        };
      }
    } else if (overdueDays >= 1) {
      marker = "overdue-0";
      action = {
        title: `Overdue: ${step.document_no} — ${step.name}`,
        role: step.role,
        type: "overdue",
      };
    } else if (elapsed >= 0.8) {
      marker = "due-80";
      action = {
        title: `Due very soon (80%): ${step.document_no} — ${step.name}`,
        role: step.role,
        type: "review_required",
      };
    } else if (elapsed >= 0.5) {
      marker = "due-50";
      action = {
        title: `Due soon (50%): ${step.document_no} — ${step.name}`,
        role: step.role,
        type: "review_required",
      };
    }

    if (marker && action && step.last_reminder !== marker) {
      await notifyRole(env, action.role, {
        type: action.type,
        title: action.title,
        entityType: "workflow",
        entityId: step.workflow_id,
      });
      await run(env, `UPDATE workflow_steps SET last_reminder = ? WHERE id = ?`, marker, step.id);
      await audit(env, {
        entityType: "workflow",
        entityId: step.workflow_id,
        action: `sla:${marker}`,
        detail: action.title,
      });
      actions++;
    }
  }

  return { processed: steps.length, actions };
}
