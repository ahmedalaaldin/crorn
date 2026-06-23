import { Hono } from "hono";
import type { AppContext } from "../types";
import { all } from "../lib/db";
import { requireAuth } from "../middleware/auth";

export const reports = new Hono<AppContext>();
reports.use("*", requireAuth);

/* ---------------------------- Overview ---------------------------- */
reports.get("/overview", async (c) => {
  const byStatus = await all<{ workflow_status: string; n: number }>(
    c.env,
    `SELECT workflow_status, COUNT(*) n FROM documents GROUP BY workflow_status`,
  );
  const byDiscipline = await all(
    c.env,
    `SELECT discipline_code, COUNT(*) n FROM documents GROUP BY discipline_code ORDER BY n DESC`,
  );
  const byType = await all(
    c.env,
    `SELECT doc_type_code, COUNT(*) n FROM documents GROUP BY doc_type_code ORDER BY n DESC`,
  );
  const totals = await all<{ documents: number; active_workflows: number; overdue: number; transmittals: number; mail: number }>(
    c.env,
    `SELECT
       (SELECT COUNT(*) FROM documents) AS documents,
       (SELECT COUNT(*) FROM workflows WHERE status = 'active') AS active_workflows,
       (SELECT COUNT(*) FROM workflow_steps ws JOIN workflows w ON w.id = ws.workflow_id
         WHERE ws.status = 'in_progress' AND w.status = 'active'
           AND ws.due_date IS NOT NULL AND julianday('now') > julianday(ws.due_date)) AS overdue,
       (SELECT COUNT(*) FROM transmittals) AS transmittals,
       (SELECT COUNT(*) FROM mail) AS mail`,
  );
  return c.json({
    totals: totals[0] ?? {},
    by_status: byStatus,
    by_discipline: byDiscipline,
    by_type: byType,
  });
});

/* ----------------------- SLA / overdue report --------------------- */
reports.get("/sla", async (c) => {
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
     WHERE ws.status = 'in_progress' AND w.status = 'active' AND ws.due_date IS NOT NULL
     ORDER BY days_overdue DESC`,
  );
  const overdue = rows.filter((r) => r.days_overdue > 0);
  const due_soon = rows.filter((r) => r.days_overdue <= 0);
  return c.json({ overdue, due_soon, total_open: rows.length });
});

/* --------------------------- Register ----------------------------- */
// Aconex-style document register. ?project_id=... filters; ?format=csv exports.
reports.get("/register", async (c) => {
  const projectId = c.req.query("project_id");
  const rows = await all<Record<string, string | number | null>>(
    c.env,
    `SELECT p.code AS project, d.document_no, d.title, d.discipline_code AS discipline,
            d.doc_type_code AS type, d.status_code AS status, d.current_revision AS revision,
            d.workflow_status, d.created_at, d.submitted_at
     FROM documents d JOIN projects p ON p.id = d.project_id
     ${projectId ? "WHERE d.project_id = ?" : ""}
     ORDER BY d.document_no`,
    ...(projectId ? [projectId] : []),
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
