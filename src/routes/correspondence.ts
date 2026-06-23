import { Hono } from "hono";
import type { AppContext } from "../types";
import { newId } from "../lib/crypto";
import { padSequence } from "../lib/naming";
import { first, all, run, nextCounter } from "../lib/db";
import { audit, notifyRole, notifyUser } from "../lib/notify";
import {
  readJson,
  requireString,
  optionalString,
  badRequest,
  notFound,
} from "../lib/http";
import { requireAuth } from "../middleware/auth";

/* --------------------------- Transmittals ------------------------ */
export const transmittals = new Hono<AppContext>();
transmittals.use("*", requireAuth);

transmittals.get("/", async (c) => {
  const rows = await all(
    c.env,
    `SELECT t.id, t.transmittal_no, t.subject, t.status, t.created_at, p.code AS project_code,
            (SELECT COUNT(*) FROM transmittal_documents td WHERE td.transmittal_id = t.id) AS document_count
     FROM transmittals t JOIN projects p ON p.id = t.project_id
     ORDER BY t.created_at DESC LIMIT 100`,
  );
  return c.json({ transmittals: rows });
});

transmittals.post("/", async (c) => {
  const body = await readJson(c);
  const projectId = requireString(body, "project_id");
  const subject = requireString(body, "subject");
  const groupId = optionalString(body, "group_id") ?? null;
  const documentIds = Array.isArray(body.document_ids) ? (body.document_ids as string[]) : [];
  if (documentIds.length === 0) throw badRequest("document_ids must list at least one document");

  const project = await first<{ code: string }>(
    c.env,
    `SELECT code FROM projects WHERE id = ?`,
    projectId,
  );
  if (!project) throw badRequest("Unknown project_id");

  const seq = await nextCounter(c.env, `trn:${projectId}`);
  const transmittalNo = `${project.code}-TRN-${padSequence(seq)}`;
  const id = newId("trn");
  await run(
    c.env,
    `INSERT INTO transmittals (id, project_id, transmittal_no, subject, from_user, group_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    transmittalNo,
    subject,
    c.get("user").id,
    groupId,
  );

  // Bundle the documents at their current revision.
  for (const docId of documentIds) {
    const doc = await first<{ current_revision: string }>(
      c.env,
      `SELECT current_revision FROM documents WHERE id = ?`,
      docId,
    );
    if (!doc) continue;
    await run(
      c.env,
      `INSERT INTO transmittal_documents (id, transmittal_id, document_id, revision_code)
       VALUES (?, ?, ?, ?)`,
      newId("td"),
      id,
      docId,
      doc.current_revision,
    );
  }

  // Auto-distribute to the group members.
  if (groupId) {
    const members = await all<{ user_id: string }>(
      c.env,
      `SELECT user_id FROM distribution_members WHERE group_id = ?`,
      groupId,
    );
    for (const m of members) {
      await notifyUser(c.env, m.user_id, {
        type: "received",
        title: `Transmittal ${transmittalNo}`,
        body: subject,
        entityType: "transmittal",
        entityId: id,
      });
    }
  }
  await audit(c.env, {
    entityType: "transmittal",
    entityId: id,
    action: "issued",
    detail: `${transmittalNo} (${documentIds.length} docs)`,
    userId: c.get("user").id,
  });
  return c.json({ transmittal: { id, transmittal_no: transmittalNo } }, 201);
});

transmittals.get("/:id", async (c) => {
  const id = c.req.param("id");
  const t = await first(c.env, `SELECT * FROM transmittals WHERE id = ?`, id);
  if (!t) throw notFound("Transmittal not found");
  const docs = await all(
    c.env,
    `SELECT td.document_id, td.revision_code, d.document_no, d.title
     FROM transmittal_documents td JOIN documents d ON d.id = td.document_id
     WHERE td.transmittal_id = ?`,
    id,
  );
  return c.json({ transmittal: t, documents: docs });
});

/* ------------------------------- Mail ---------------------------- */
export const mail = new Hono<AppContext>();
mail.use("*", requireAuth);

mail.get("/", async (c) => {
  const rows = await all(
    c.env,
    `SELECT m.id, m.mail_no, m.type, m.subject, m.status, m.created_at, p.code AS project_code
     FROM mail m JOIN projects p ON p.id = m.project_id
     ORDER BY m.created_at DESC LIMIT 100`,
  );
  return c.json({ mail: rows });
});

// Create correspondence with automatic routing, auto-CC and auto-numbering.
mail.post("/", async (c) => {
  const body = await readJson(c);
  const projectId = requireString(body, "project_id");
  const type = requireString(body, "type");
  const subject = requireString(body, "subject");
  const text = optionalString(body, "body") ?? null;
  const toUserIds = Array.isArray(body.to_user_ids) ? (body.to_user_ids as string[]) : [];
  const ccUserIds = Array.isArray(body.cc_user_ids) ? (body.cc_user_ids as string[]) : [];

  const project = await first<{ code: string }>(
    c.env,
    `SELECT code FROM projects WHERE id = ?`,
    projectId,
  );
  if (!project) throw badRequest("Unknown project_id");

  const seq = await nextCounter(c.env, `mail:${projectId}`);
  const mailNo = `${project.code}-COR-${padSequence(seq)}`;
  const id = newId("mail");
  await run(
    c.env,
    `INSERT INTO mail (id, project_id, mail_no, type, subject, body, from_user)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    mailNo,
    type,
    subject,
    text,
    c.get("user").id,
  );

  // Apply the auto-routing rule for this mail type (role-based to/cc).
  const rule = await first<{ route_roles: string; cc_roles: string | null }>(
    c.env,
    `SELECT route_roles, cc_roles FROM mail_routing_rules WHERE mail_type = ?`,
    type,
  );
  const routedRoles = rule ? rule.route_roles.split(",").map((r) => r.trim()).filter(Boolean) : [];
  const ccRoles = rule?.cc_roles ? rule.cc_roles.split(",").map((r) => r.trim()).filter(Boolean) : [];

  for (const role of routedRoles) {
    await run(
      c.env,
      `INSERT INTO mail_recipients (id, mail_id, role, kind) VALUES (?, ?, ?, 'to')`,
      newId("mr"),
      id,
      role,
    );
    await notifyRole(c.env, role, {
      type: "received",
      title: `${type}: ${mailNo}`,
      body: subject,
      entityType: "mail",
      entityId: id,
    });
  }
  for (const role of ccRoles) {
    await run(
      c.env,
      `INSERT INTO mail_recipients (id, mail_id, role, kind) VALUES (?, ?, ?, 'cc')`,
      newId("mr"),
      id,
      role,
    );
  }
  // Explicit recipients in addition to the rule-based routing.
  for (const uid of toUserIds) {
    await run(
      c.env,
      `INSERT INTO mail_recipients (id, mail_id, user_id, kind) VALUES (?, ?, ?, 'to')`,
      newId("mr"),
      id,
      uid,
    );
    await notifyUser(c.env, uid, {
      type: "received",
      title: `${type}: ${mailNo}`,
      body: subject,
      entityType: "mail",
      entityId: id,
    });
  }
  for (const uid of ccUserIds) {
    await run(
      c.env,
      `INSERT INTO mail_recipients (id, mail_id, user_id, kind) VALUES (?, ?, ?, 'cc')`,
      newId("mr"),
      id,
      uid,
    );
  }

  await audit(c.env, {
    entityType: "mail",
    entityId: id,
    action: "sent",
    detail: `${mailNo} (${type}) routed to: ${routedRoles.join(", ") || "—"}`,
    userId: c.get("user").id,
  });
  return c.json(
    { mail: { id, mail_no: mailNo, routed_to: routedRoles, cc: ccRoles } },
    201,
  );
});

mail.get("/:id", async (c) => {
  const id = c.req.param("id");
  const m = await first(c.env, `SELECT * FROM mail WHERE id = ?`, id);
  if (!m) throw notFound("Mail not found");
  const recipients = await all(
    c.env,
    `SELECT user_id, role, kind FROM mail_recipients WHERE mail_id = ?`,
    id,
  );
  return c.json({ mail: m, recipients });
});
