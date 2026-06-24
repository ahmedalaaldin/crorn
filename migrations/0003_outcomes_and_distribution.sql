-- crorn DMS — configurable outcomes, submission tracking, distribution seed
-- Idempotent and additive (safe to re-run / apply over the existing schema).

-- Configurable decision routing (Aconex "STEP 5 — Define Outcomes"):
-- each step+outcome can define where the workflow goes next. When no row
-- exists for a step+outcome, the engine falls back to its default behaviour.
CREATE TABLE IF NOT EXISTS workflow_template_outcomes (
  id              TEXT PRIMARY KEY,
  step_id         TEXT NOT NULL REFERENCES workflow_template_steps(id),
  outcome         TEXT NOT NULL,            -- Approve | Approve with Comments | Revise & Resubmit | Reject
  action          TEXT NOT NULL,            -- advance | goto | close | return_to_originator | reject_archive
  next_step_order INTEGER,                  -- target step for action = 'goto'
  notify          INTEGER NOT NULL DEFAULT 1,
  UNIQUE(step_id, outcome)
);

-- Track when a document was formally submitted into its workflow.
ALTER TABLE documents ADD COLUMN submitted_at TEXT;

-- Example distribution groups (global templates, matched by document type).
-- Members are added per project by an administrator.
INSERT OR IGNORE INTO distribution_groups (id, project_id, name, doc_type_code) VALUES
  ('dg-sub-consultant', NULL, 'SUB-Consultant-Team', 'SUB'),
  ('dg-sub-client',     NULL, 'SUB-Client-Review',   'SUB'),
  ('dg-rfi-eng',        NULL, 'RFI-Engineering-Team','RFI'),
  ('dg-corr-stake',     NULL, 'CORR-Project-Stakeholders','CORR');
