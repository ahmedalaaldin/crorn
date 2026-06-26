-- Per-project isolation: project membership.
-- A user only sees a project (and all of its documents, workflows, transmittals,
-- correspondence, distribution groups, reports and notifications) when they are
-- a member of it. Admins always see everything. Projects are created by Admins,
-- who then add members — each project is private and separate.

CREATE TABLE IF NOT EXISTS project_members (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);

-- Backfill so nothing that already exists disappears: make every current user a
-- member of every current project (this preserves the previously-shared access
-- for the seeded demo data). Projects created from now on start private to the
-- members an Admin assigns.
INSERT OR IGNORE INTO project_members (id, project_id, user_id)
SELECT 'pmemb_' || p.id || '_' || u.id, p.id, u.id
FROM projects p CROSS JOIN users u;
