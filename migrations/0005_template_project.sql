-- Per-project workflow templates.
-- A template with project_id = NULL is a shared "standard" template (the seeded
-- Submittals / Letters / RFIs library) that serves as a fallback. A template
-- with a project_id belongs to that project only and takes precedence for its
-- documents. New projects are seeded with their own copies of the standards by
-- the application, so each project owns and customises its workflows separately.
ALTER TABLE workflow_templates ADD COLUMN project_id TEXT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_templates_project ON workflow_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_templates_doctype ON workflow_templates(doc_type_code, active);
