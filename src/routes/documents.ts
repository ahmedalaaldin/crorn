import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { first, all, run, nextCounter } from "../lib/db";
import { audit } from "../lib/notify";
import { formatDocumentNo, firstRevision } from "../lib/naming";
import { submitDocument } from "../lib/workflow";
import { accessibleProjectIds, assertProjectAccess } from "../lib/access";
import {
  readJson,
  requireString,
  optionalString,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../lib/http";
import { requireAuth } from "../middleware/auth";

/** Minimal shape of an uploaded multipart file (Workers File/Blob). */
interface UploadedFile {
  name: string;
  type: string;
  size: number;
  stream(): ReadableStream;
}

export const documents = new Hono<AppContext>();
documents.use("*", requireAuth);

/* ------------------------------ List ------------------------------ */
documents.get("/", async (c) => {
  const projectId = c.req.query("project_id");
  const status = c.req.query("status");
  const docType = c.req.query("doc_type");
  const conditions: string[] = [];
  const params: unknown[] = [];
  // Restrict to the caller's accessible projects (Admins: all).
  const ids = await accessibleProjectIds(c.env, c.get("user"));
  if (projectId) await assertProjectAccess(c.env, c.get("user"), projectId);
  if (ids !== null) {
    if (ids.length === 0) return c.json({ documents: [] });
    conditions.push(`d.project_id IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }
  if (projectId) {
    conditions.push("d.project_id = ?");
    params.push(projectId);
  }
  if (status) {
    conditions.push("d.workflow_status = ?");
    params.push(status);
  }
  if (docType) {
    conditions.push("d.doc_type_code = ?");
    params.push(docType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await all(
    c.env,
    `SELECT d.id, d.document_no, d.title, d.discipline_code, d.doc_type_code,
            d.status_code, d.current_revision, d.workflow_status, d.locked_by,
            d.created_at, d.updated_at, p.code AS project_code
     FROM documents d JOIN projects p ON p.id = d.project_id
     ${where}
     ORDER BY d.created_at DESC LIMIT 200`,
    ...params,
  );
  return c.json({ documents: rows });
});

/* ----------------------------- Create ----------------------------- */
documents.post("/", async (c) => {
  const body = await readJson(c);
  const projectId = requireString(body, "project_id");
  const title = requireString(body, "title");
  const discipline = requireString(body, "discipline_code").toUpperCase();
  const docType = requireString(body, "doc_type_code").toUpperCase();
  const status = requireString(body, "status_code").toUpperCase();
  const location = optionalString(body, "location_code")?.toUpperCase() ?? null;
  const packageArea = optionalString(body, "package_area")?.toUpperCase() ?? null;
  let originator = optionalString(body, "originator")?.toUpperCase();

  const project = await first<{ id: string; code: string }>(
    c.env,
    `SELECT id, code FROM projects WHERE id = ?`,
    projectId,
  );
  if (!project) throw badRequest("Unknown project_id");
  await assertProjectAccess(c.env, c.get("user"), projectId);

  // Validate reference codes so the document number is well-formed.
  if (!(await first(c.env, `SELECT code FROM disciplines WHERE code = ?`, discipline)))
    throw badRequest(`Unknown discipline_code: ${discipline}`);
  if (!(await first(c.env, `SELECT code FROM doc_types WHERE code = ?`, docType)))
    throw badRequest(`Unknown doc_type_code: ${docType}`);
  if (!(await first(c.env, `SELECT code FROM status_codes WHERE code = ?`, status)))
    throw badRequest(`Unknown status_code: ${status}`);

  // Derive originator from the user's company when not supplied.
  const user = c.get("user");
  let companyId: string | null = user.company_id;
  if (!originator && user.company_id) {
    const co = await first<{ code: string }>(
      c.env,
      `SELECT code FROM companies WHERE id = ?`,
      user.company_id,
    );
    originator = co?.code;
  }
  if (originator) {
    const co = await first<{ id: string }>(
      c.env,
      `SELECT id FROM companies WHERE code = ?`,
      originator,
    );
    if (co) companyId = co.id;
  }

  const sequence = await nextCounter(c.env, `doc:${projectId}`);
  const revision = firstRevision();
  const documentNo = formatDocumentNo({
    projectCode: project.code,
    originator: originator ?? "NA",
    discipline,
    docType,
    location,
    packageArea,
    sequence,
    status,
    revision,
  });

  const dupe = await first(c.env, `SELECT id FROM documents WHERE document_no = ?`, documentNo);
  if (dupe) throw conflict(`Document number already exists: ${documentNo}`);

  const id = newId("doc");
  await run(
    c.env,
    `INSERT INTO documents
       (id, project_id, document_no, title, discipline_code, doc_type_code,
        location_code, package_area, sequence, status_code, current_revision,
        originator_company, workflow_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
    id,
    projectId,
    documentNo,
    title,
    discipline,
    docType,
    location,
    packageArea,
    sequence,
    status,
    revision,
    companyId,
    user.id,
  );
  // Initial (placeholder) revision; the file is uploaded separately.
  await run(
    c.env,
    `INSERT INTO revisions (id, document_id, revision_code, uploaded_by) VALUES (?, ?, ?, ?)`,
    newId("rev"),
    id,
    revision,
    user.id,
  );
  await audit(c.env, {
    entityType: "document",
    entityId: id,
    action: "created",
    detail: documentNo,
    userId: user.id,
  });
  return c.json({ document: { id, document_no: documentNo, current_revision: revision } }, 201);
});

/* ---------------------------- Retrieve ---------------------------- */
documents.get("/:id", async (c) => {
  const id = c.req.param("id");
  const doc = await first(
    c.env,
    `SELECT d.*, p.code AS project_code FROM documents d
     JOIN projects p ON p.id = d.project_id WHERE d.id = ?`,
    id,
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, c.get("user"), (doc as { project_id: string }).project_id);

  const revisions = await all(
    c.env,
    `SELECT id, revision_code, filename, content_type, size_bytes, notes, created_at
     FROM revisions WHERE document_id = ? ORDER BY created_at`,
    id,
  );
  const workflow = await first(
    c.env,
    `SELECT id, status, current_step, revision_code, started_at
     FROM workflows WHERE document_id = ? ORDER BY started_at DESC LIMIT 1`,
    id,
  );
  let steps: unknown[] = [];
  if (workflow) {
    steps = await all(
      c.env,
      `SELECT step_order, name, role, action_type, status, due_date, outcome, comments
       FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order`,
      (workflow as { id: string }).id,
    );
  }
  return c.json({ document: doc, revisions, workflow, steps });
});

/* ------------------------- File upload (R2) ----------------------- */
// Attaches/replaces the file on the document's CURRENT revision.
documents.post("/:id/upload", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const doc = await first<{ id: string; current_revision: string; locked_by: string | null; project_id: string }>(
    c.env,
    `SELECT id, current_revision, locked_by, project_id FROM documents WHERE id = ?`,
    id,
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, user, doc.project_id);
  if (doc.locked_by && doc.locked_by !== user.id && user.role !== "Admin") {
    throw forbidden("Document is locked by another user");
  }

  const form = await c.req.formData();
  // Workers' FormData returns File objects for uploads; cast to a minimal shape.
  const file = form.get("file") as unknown as UploadedFile | string | null;
  if (!file || typeof file === "string") {
    throw badRequest("Multipart field 'file' is required");
  }
  const notes = (form.get("notes") as string | null) ?? null;

  const key = `documents/${id}/${doc.current_revision}/${file.name}`;
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await run(
    c.env,
    `UPDATE revisions
       SET r2_key = ?, filename = ?, content_type = ?, size_bytes = ?, notes = COALESCE(?, notes),
           uploaded_by = ?
     WHERE document_id = ? AND revision_code = ?`,
    key,
    file.name,
    file.type || "application/octet-stream",
    file.size,
    notes,
    user.id,
    id,
    doc.current_revision,
  );
  await audit(c.env, {
    entityType: "document",
    entityId: id,
    action: "file_uploaded",
    detail: `${doc.current_revision}: ${file.name} (${file.size} bytes)`,
    userId: user.id,
  });
  return c.json({ ok: true, revision: doc.current_revision, filename: file.name, key });
});

/* ------------------------------ Submit ---------------------------- */
// Auto-starts the document-type workflow, auto-generates a transmittal and
// auto-distributes it to the matching distribution group.
documents.post("/:id/submit", async (c) => {
  const doc = await first<{ project_id: string }>(
    c.env,
    `SELECT project_id FROM documents WHERE id = ?`,
    c.req.param("id"),
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, c.get("user"), doc.project_id);
  try {
    const result = await submitDocument(c.env, c.req.param("id"), c.get("user").id);
    return c.json({ ok: true, ...result }, 201);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
});

/* ----------------------- Download / view file --------------------- */
async function streamRevision(
  c: Context<AppContext>,
  disposition: "attachment" | "inline",
) {
  const id = c.req.param("id");
  const rev = c.req.param("rev");
  const docRow = await first<{ project_id: string }>(
    c.env,
    `SELECT project_id FROM documents WHERE id = ?`,
    id,
  );
  if (!docRow) throw notFound("Document not found");
  await assertProjectAccess(c.env, c.get("user"), docRow.project_id);
  const row = await first<{ r2_key: string | null; filename: string | null; content_type: string | null }>(
    c.env,
    `SELECT r2_key, filename, content_type FROM revisions WHERE document_id = ? AND revision_code = ?`,
    id,
    rev,
  );
  if (!row || !row.r2_key) throw notFound("No file for this revision");
  const obj = await c.env.FILES.get(row.r2_key);
  if (!obj) throw notFound("File missing from storage");
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${row.filename ?? "file"}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}

documents.get("/:id/revisions/:rev/download", (c) => streamRevision(c, "attachment"));
documents.get("/:id/revisions/:rev/view", (c) => streamRevision(c, "inline"));

/* ------------------------------ Locks ----------------------------- */
documents.post("/:id/lock", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const doc = await first<{ locked_by: string | null; project_id: string }>(
    c.env,
    `SELECT locked_by, project_id FROM documents WHERE id = ?`,
    id,
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, user, doc.project_id);
  if (doc.locked_by && doc.locked_by !== user.id) throw conflict("Already locked by another user");
  await run(
    c.env,
    `UPDATE documents SET locked_by = ?, locked_at = datetime('now') WHERE id = ?`,
    user.id,
    id,
  );
  return c.json({ ok: true, locked_by: user.id });
});

documents.post("/:id/unlock", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const doc = await first<{ locked_by: string | null; project_id: string }>(
    c.env,
    `SELECT locked_by, project_id FROM documents WHERE id = ?`,
    id,
  );
  if (!doc) throw notFound("Document not found");
  await assertProjectAccess(c.env, user, doc.project_id);
  if (doc.locked_by && doc.locked_by !== user.id && user.role !== "Admin") {
    throw forbidden("Only the lock owner or an Admin can unlock");
  }
  await run(c.env, `UPDATE documents SET locked_by = NULL, locked_at = NULL WHERE id = ?`, id);
  return c.json({ ok: true });
});
