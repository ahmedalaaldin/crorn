import { Hono } from "hono";
import type { AppContext } from "../types";
import { all, first } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { accessibleProjectIds, assertProjectAccess, projectScope } from "../lib/access";

export const reports = new Hono<AppContext>();
reports.use("*", requireAuth);

/* ---------------------------- Overview ---------------------------- */
// All figures are restricted to the caller's accessible projects (Admins: all).
reports.get("/overview", async (c) => {
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  if (ids !== null && ids.length === 0) {
    return c.json({
      totals: { documents: 0, active_workflows: 0, overdue: 0, transmittals: 0, mail: 0 },
      by_status: [],
      by_discipline: [],
      by_type: [],
    });
  }
  const docW = projectScope(ids, "project_id", "WHERE"); // documents table directly
  const joinW = projectScope(ids, "d.project_id", "AND"); // queries joining documents d

  const byStatus = await all<{ workflow_status: string; n: number }>(
    c.env,
    `SELECT workflow_status, COUNT(*) n FROM documents${docW.sql} GROUP BY workflow_status`,
    ...docW.params,
  );
  const byDiscipline = await all(
    c.env,
    `SELECT discipline_code, COUNT(*) n FROM documents${docW.sql} GROUP BY discipline_code ORDER BY n DESC`,
    ...docW.params,
  );
  const byType = await all(
    c.env,
    `SELECT doc_type_code, COUNT(*) n FROM documents${docW.sql} GROUP BY doc_type_code ORDER BY n DESC`,
    ...docW.params,
  );

  const documents = (await first<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM documents${docW.sql}`,
    ...docW.params,
  ))?.n ?? 0;
  const activeWorkflows = (await first<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM workflows w JOIN documents d ON d.id = w.document_id
     WHERE w.status = 'active'${joinW.sql}`,
    ...joinW.params,
  ))?.n ?? 0;
  const overdue = (await first<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM workflow_steps ws
       JOIN workflows w ON w.id = ws.workflow_id
       JOIN documents d ON d.id = w.document_id
     WHERE ws.status = 'in_progress' AND w.status = 'active'
       AND ws.due_date IS NOT NULL AND julianday('now') > julianday(ws.due_date)${joinW.sql}`,
    ...joinW.params,
  ))?.n ?? 0;
  const transmittals = (await first<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM transmittals${docW.sql}`,
    ...docW.params,
  ))?.n ?? 0;
  const mailCount = (await first<{ n: number }>(
    c.env,
    `SELECT COUNT(*) n FROM mail${docW.sql}`,
    ...docW.params,
  ))?.n ?? 0;

  return c.json({
    totals: { documents, active_workflows: activeWorkflows, overdue, transmittals, mail: mailCount },
    by_status: byStatus,
    by_discipline: byDiscipline,
    by_type: byType,
  });
});

/* ----------------------- SLA / overdue report --------------------- */
reports.get("/sla", async (c) => {
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  if (ids !== null && ids.length === 0) return c.json({ overdue: [], due_soon: [], total_open: 0 });
  const scope = projectScope(ids, "d.project_id", "AND");
  const rows = await all<{
    document_no: string;
    step_name: string;
    role: string;
    due_date: string;
    days_overdue: number;
  }>(
    c.env,
    `SELECT d.document_no, ws.name AS step_name, ws.role, ws.due_date,
            ROUND(julianday('now') - julianday(ws.due_date), 2) AS days_overdue
     FROM workflow_steps ws
     JOIN workflows w ON w.id = ws.workflow_id
     JOIN documents d ON d.id = w.document_id
     WHERE ws.status = 'in_progress' AND w.status = 'active' AND ws.due_date IS NOT NULL${scope.sql}
     ORDER BY days_overdue DESC`,
    ...scope.params,
  );
  const overdue = rows.filter((r) => r.days_overdue > 0);
  const due_soon = rows.filter((r) => r.days_overdue <= 0);
  return c.json({ overdue, due_soon, total_open: rows.length });
});

/* --------------------------- Register ----------------------------- */
// Aconex-style document register. ?project_id=... filters; ?format=csv exports.
reports.get("/register", async (c) => {
  const projectId = c.req.query("project_id");
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  const conds: string[] = [];
  const params: string[] = [];
  if (projectId) {
    conds.push("d.project_id = ?");
    params.push(projectId);
  }
  if (ids !== null) {
    if (ids.length === 0) return c.json({ register: [], count: 0 });
    conds.push(`d.project_id IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await all<Record<string, string | number | null>>(
    c.env,
    `SELECT p.code AS project, d.document_no, d.title, d.discipline_code AS discipline,
            d.doc_type_code AS type, d.status_code AS status, d.current_revision AS revision,
            d.workflow_status, d.created_at, d.submitted_at
     FROM documents d JOIN projects p ON p.id = d.project_id
     ${where}
     ORDER BY d.document_no`,
    ...params,
  );

  if (c.req.query("format") === "csv") {
    const headers = [
      "project", "document_no", "title", "discipline", "type", "status",
      "revision", "workflow_status", "created_at", "submitted_at",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="document-register.csv"',
      },
    });
  }
  return c.json({ register: rows, count: rows.length });
});
