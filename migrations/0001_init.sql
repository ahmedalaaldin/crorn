-- crorn DMS — initial schema
-- Aconex-style construction Document Management System with workflow automation.
-- All DDL is idempotent so it can be applied via `wrangler d1 migrations apply`
-- or directly against the D1 database.

-- ---------------------------------------------------------------------------
-- Organisations & people
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,          -- short originator code, e.g. "ABC"
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Contractor', -- Contractor | Consultant | Client | Subcontractor | Supplier
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  company_id    TEXT REFERENCES companies(id),
  role          TEXT NOT NULL DEFAULT 'Contributor', -- see roles reference below
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,        -- e.g. "R03"
  name          TEXT NOT NULL,
  client        TEXT,
  location      TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  notify_emails TEXT NOT NULL DEFAULT '[]',  -- JSON array, for future email dispatch
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-project document sequence counter (zero-padded 5-digit sequence in doc no.)
CREATE TABLE IF NOT EXISTS counters (
  scope       TEXT PRIMARY KEY,              -- e.g. "doc:<projectId>", "trn:<projectId>", "mail:<projectId>"
  value       INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Reference data (Aconex naming convention) — disciplines, doc types, levels, statuses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS disciplines (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_types (
  code      TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  category  TEXT                              -- Technical | Commercial | Correspondence | Inspection ...
);

CREATE TABLE IF NOT EXISTS levels (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS status_codes (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL                         -- IFA, IFC, IFR, IFI, AFC, AB ...
);

-- ---------------------------------------------------------------------------
-- Documents & revisions
-- ---------------------------------------------------------------------------
-- document_no follows:
-- [ProjectCode]-[Originator]-[Discipline]-[DocType]-[Location]-[Package/Area]-[Sequence]-[Status]-[Revision]
-- e.g. R03-ABC-STR-DRG-BLDG01-FOUND-00125-IFC-R02

CREATE TABLE IF NOT EXISTS documents (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  document_no         TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  discipline_code     TEXT REFERENCES disciplines(code),
  doc_type_code       TEXT REFERENCES doc_types(code),
  location_code       TEXT,
  package_area        TEXT,
  sequence            INTEGER NOT NULL,
  status_code         TEXT REFERENCES status_codes(code),
  current_revision    TEXT NOT NULL DEFAULT 'R00',
  originator_company  TEXT REFERENCES companies(id),
  -- workflow_status mirrors Aconex status automation:
  -- Draft | Under Review | Awaiting Response | Revise & Resubmit | Closed | Archived
  workflow_status     TEXT NOT NULL DEFAULT 'Draft',
  locked_by           TEXT REFERENCES users(id),
  locked_at           TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(workflow_status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type_code);

CREATE TABLE IF NOT EXISTS revisions (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id),
  revision_code TEXT NOT NULL,                -- R00, R01, R02 ...
  r2_key        TEXT,                         -- null until a file is uploaded
  filename      TEXT,
  content_type  TEXT,
  size_bytes    INTEGER,
  notes         TEXT,
  uploaded_by   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, revision_code)
);
CREATE INDEX IF NOT EXISTS idx_revisions_document ON revisions(document_id);

-- ---------------------------------------------------------------------------
-- Workflow templates (configurable automation engine)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,               -- "SUB - Material Submittal Approval"
  type          TEXT NOT NULL DEFAULT 'document', -- document | mail
  doc_type_code TEXT,                         -- auto-applies to this doc type when set
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_template_steps (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL REFERENCES workflow_templates(id),
  step_order    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,               -- role responsible (routing is by role, not person)
  action_type   TEXT NOT NULL DEFAULT 'Review', -- Review | Approve | Notify
  sla_days      REAL NOT NULL DEFAULT 1,
  UNIQUE(template_id, step_order)
);

-- ---------------------------------------------------------------------------
-- Workflow instances (runtime) — attached to a document revision
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflows (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  template_id     TEXT REFERENCES workflow_templates(id),
  revision_code   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | completed | returned | rejected | cancelled
  current_step    INTEGER,                    -- step_order of the active step
  started_by      TEXT REFERENCES users(id),
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_workflows_document ON workflows(document_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT NOT NULL REFERENCES workflows(id),
  step_order    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  action_type   TEXT NOT NULL DEFAULT 'Review',
  sla_days      REAL NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | skipped
  assigned_user TEXT REFERENCES users(id),
  due_date      TEXT,
  started_at    TEXT,
  completed_at  TEXT,
  outcome       TEXT,                         -- Approve | Approve with Comments | Revise & Resubmit | Reject
  comments      TEXT,
  acted_by      TEXT REFERENCES users(id),
  -- escalation bookkeeping so the cron does not re-notify the same threshold
  last_reminder TEXT,                         -- e.g. "due-soon-50", "due-soon-80", "overdue-2", ...
  UNIQUE(workflow_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_wsteps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wsteps_status ON workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_wsteps_due ON workflow_steps(due_date);

-- ---------------------------------------------------------------------------
-- Distribution groups (predefined recipients per document type)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS distribution_groups (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id),
  name          TEXT NOT NULL,               -- "SUB-Consultant-Team"
  doc_type_code TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS distribution_members (
  id        TEXT PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES distribution_groups(id),
  user_id   TEXT NOT NULL REFERENCES users(id),
  UNIQUE(group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Transmittals (document bundles with auto numbering)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transmittals (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  transmittal_no TEXT NOT NULL UNIQUE,
  subject       TEXT NOT NULL,
  from_user     TEXT REFERENCES users(id),
  group_id      TEXT REFERENCES distribution_groups(id),
  status        TEXT NOT NULL DEFAULT 'issued',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transmittal_documents (
  id             TEXT PRIMARY KEY,
  transmittal_id TEXT NOT NULL REFERENCES transmittals(id),
  document_id    TEXT NOT NULL REFERENCES documents(id),
  revision_code  TEXT
);

-- ---------------------------------------------------------------------------
-- Mail / correspondence (auto-routing, auto-CC, auto-numbering)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mail (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  mail_no     TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,                  -- Instruction | Technical Query | Notice | Letter
  subject     TEXT NOT NULL,
  body        TEXT,
  from_user   TEXT REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mail_recipients (
  id       TEXT PRIMARY KEY,
  mail_id  TEXT NOT NULL REFERENCES mail(id),
  user_id  TEXT REFERENCES users(id),
  role     TEXT,                              -- role-based recipient when no specific user
  kind     TEXT NOT NULL DEFAULT 'to'         -- to | cc
);

-- mail auto-routing rules (Mail Type -> roles to route / cc)
CREATE TABLE IF NOT EXISTS mail_routing_rules (
  id          TEXT PRIMARY KEY,
  mail_type   TEXT NOT NULL UNIQUE,
  route_roles TEXT NOT NULL,                  -- comma-separated roles
  cc_roles    TEXT                            -- comma-separated roles
);

-- ---------------------------------------------------------------------------
-- Escalation matrix (SLA enforcement)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS escalation_rules (
  id            TEXT PRIMARY KEY,
  days_overdue  INTEGER NOT NULL,
  action        TEXT NOT NULL,                -- "Reminder email", "Escalate to PM" ...
  notify_role   TEXT,                         -- role to notify (null = assigned role)
  UNIQUE(days_overdue)
);

-- ---------------------------------------------------------------------------
-- Notifications & audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  role        TEXT,                           -- role-targeted notification when user_id is null
  type        TEXT NOT NULL,                  -- received | review_required | overdue | approved | revision | escalation
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type TEXT,                           -- document | workflow | mail | transmittal
  entity_id   TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role, read);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,                  -- document | workflow | mail | transmittal | auth
  entity_id   TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  user_id     TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
