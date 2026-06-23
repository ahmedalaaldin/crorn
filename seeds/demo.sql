-- crorn DMS — demo dataset (idempotent). Demo password: crorn-demo-2026
-- DEMO ONLY: remove or rotate these credentials before real production use.

INSERT OR IGNORE INTO companies (id, code, name, type) VALUES
  ('co_abc', 'ABC', 'ABC Contracting', 'Contractor'),
  ('co_xyz', 'XYZ', 'XYZ Consultants', 'Consultant'),
  ('co_clt', 'CLT', 'Client Authority', 'Client');

INSERT OR IGNORE INTO users (id, email, password_hash, name, company_id, role) VALUES
  ('usr_demo_ahmed', 'ahmed.alaaeldin@me.com', 'pbkdf2$100000$GTwTkmE34MVmW/IfZAMVwg==$Kc6zcIbnRPSpAKVKuUyfdujfeVO8zF5tx6i5uY9hU+o=', 'Ahmed (you)', 'co_abc', 'Admin'),
  ('usr_demo_dc', 'dc@crorn.dev', 'pbkdf2$100000$bReFm7JyWe3UjdWQeolGJg==$/LvZN0GH7cbxWX0jcxHNSXcTh1NyYNGpo85me+Am64Q=', 'Dana Controller', 'co_abc', 'Document Controller'),
  ('usr_demo_pm', 'pm@crorn.dev', 'pbkdf2$100000$EEd2YrVP4cilbMbpvgKynQ==$ebqyK6x4gEFgPu+IWCx53nJs/TAFAwx+qzt2gPhhD5g=', 'Pat Manager', 'co_abc', 'Project Manager'),
  ('usr_demo_qaqc', 'qaqc@crorn.dev', 'pbkdf2$100000$yghJxTwp0Bh6m7CUKYUoYw==$e7QhTaGlr0hhHPpqLo2yMR1X52G6ICsnMglOxysozmU=', 'Quinn QA', 'co_abc', 'Contractor QA/QC'),
  ('usr_demo_eng', 'eng@crorn.dev', 'pbkdf2$100000$JOA+89Kdayjge+4QHP++wg==$sVsn9PUXec1RH75kbrsqBGnQylOOsKNOIDcwv5mPUFs=', 'Eddie Engineer', 'co_xyz', 'Consultant Engineer'),
  ('usr_demo_lead', 'lead@crorn.dev', 'pbkdf2$100000$zHISigHH1yKLido3Qb9WQg==$Vlw1aNruMg/LkW1/RRpjA7MpLXtwQ2QQoCXg7I4/1EU=', 'Lena Lead', 'co_xyz', 'Consultant Lead'),
  ('usr_demo_client', 'client@crorn.dev', 'pbkdf2$100000$+6qCJVRvNK7FiST+PBFvTw==$uUQXkM5EH9dN6lcpHUR3QusCNN+nwYqaLX83GK+FWp0=', 'Cleo Client', 'co_clt', 'Client');

INSERT OR IGNORE INTO projects (id, code, name, client, location, created_by) VALUES
  ('prj_r03', 'R03', 'Tower A — Downtown', 'Client Authority', 'Dubai', 'usr_demo_ahmed');
INSERT OR IGNORE INTO counters (scope, value) VALUES ('doc:prj_r03', 4);

INSERT OR IGNORE INTO distribution_members (id, group_id, user_id) VALUES
  ('dm_d1', 'dg-sub-consultant', 'usr_demo_eng'),
  ('dm_d2', 'dg-sub-consultant', 'usr_demo_lead'),
  ('dm_d3', 'dg-sub-client', 'usr_demo_client'),
  ('dm_d4', 'dg-rfi-eng', 'usr_demo_eng'),
  ('dm_d5', 'dg-corr-stake', 'usr_demo_pm'),
  ('dm_d6', 'dg-corr-stake', 'usr_demo_client');

INSERT OR IGNORE INTO documents (id, project_id, document_no, title, discipline_code, doc_type_code, location_code, package_area, sequence, status_code, current_revision, originator_company, workflow_status, created_by, submitted_at) VALUES
  ('doc_d1', 'prj_r03', 'R03-ABC-STR-SUB-GF-FOUND-00001-IFA-R00', 'Foundation Rebar Submittal', 'STR', 'SUB', 'GF', 'FOUND', 1, 'IFA', 'R00', 'co_abc', 'Draft', 'usr_demo_qaqc', NULL),
  ('doc_d2', 'prj_r03', 'R03-ABC-ARCH-DRG-F01-CORE-00002-IFR-R00', 'Level 1 Core Layout', 'ARCH', 'DRG', 'F01', 'CORE', 2, 'IFR', 'R00', 'co_abc', 'Draft', 'usr_demo_qaqc', NULL),
  ('doc_ur', 'prj_r03', 'R03-ABC-STR-SUB-GF-FOUND-00003-IFA-R00', 'Concrete Mix Design', 'STR', 'SUB', 'GF', 'FOUND', 3, 'IFA', 'R00', 'co_abc', 'Under Review', 'usr_demo_qaqc', datetime('now')),
  ('doc_cl', 'prj_r03', 'R03-ABC-MEP-SUB-GF-MECH-00004-IFC-R00', 'Chiller Material Submittal', 'MEP', 'SUB', 'GF', 'MECH', 4, 'IFC', 'R00', 'co_abc', 'Closed', 'usr_demo_qaqc', datetime('now'));

INSERT OR IGNORE INTO revisions (id, document_id, revision_code, uploaded_by) VALUES
  ('rev_doc_d1', 'doc_d1', 'R00', 'usr_demo_qaqc'),
  ('rev_doc_d2', 'doc_d2', 'R00', 'usr_demo_qaqc'),
  ('rev_doc_ur', 'doc_ur', 'R00', 'usr_demo_qaqc'),
  ('rev_doc_cl', 'doc_cl', 'R00', 'usr_demo_qaqc');

INSERT OR IGNORE INTO workflows (id, document_id, template_id, revision_code, status, current_step, started_by, started_at) VALUES
  ('wf_ur', 'doc_ur', 'wt-sub', 'R00', 'active', 4, 'usr_demo_qaqc', datetime('now','-4 days')),
  ('wf_cl', 'doc_cl', 'wt-sub', 'R00', 'completed', NULL, 'usr_demo_qaqc', datetime('now','-12 days'));

INSERT OR IGNORE INTO workflow_steps (id, workflow_id, step_order, name, role, action_type, sla_days, status, outcome, due_date, started_at, completed_at) VALUES
  ('wfs_ur_1', 'wf_ur', 1, 'Internal QA/QC Review', 'Contractor QA/QC', 'Review', 2, 'completed', 'Approve', NULL, datetime('now','-4 days'), datetime('now','-3 days')),
  ('wfs_ur_2', 'wf_ur', 2, 'Project Manager Approval', 'Project Manager', 'Approve', 1, 'completed', 'Approve', NULL, datetime('now','-4 days'), datetime('now','-3 days')),
  ('wfs_ur_3', 'wf_ur', 3, 'Document Control Submission', 'Document Controller', 'Notify', 1, 'completed', 'Notified', NULL, datetime('now','-3 days'), datetime('now','-3 days')),
  ('wfs_ur_4', 'wf_ur', 4, 'Consultant Technical Review', 'Consultant Engineer', 'Review', 7, 'in_progress', NULL, datetime('now','+3 days'), datetime('now','-3 days'), NULL),
  ('wfs_ur_5', 'wf_ur', 5, 'Senior Consultant Approval', 'Consultant Lead', 'Approve', 2, 'pending', NULL, NULL, NULL, NULL),
  ('wfs_ur_6', 'wf_ur', 6, 'Client Review', 'Client', 'Approve', 3, 'pending', NULL, NULL, NULL, NULL),
  ('wfs_cl_1', 'wf_cl', 1, 'Internal QA/QC Review', 'Contractor QA/QC', 'Review', 2, 'completed', 'Approve', NULL, datetime('now','-12 days'), datetime('now','-6 days')),
  ('wfs_cl_2', 'wf_cl', 2, 'Project Manager Approval', 'Project Manager', 'Approve', 1, 'completed', 'Approve', NULL, datetime('now','-12 days'), datetime('now','-6 days')),
  ('wfs_cl_3', 'wf_cl', 3, 'Document Control Submission', 'Document Controller', 'Notify', 1, 'completed', 'Notified', NULL, datetime('now','-12 days'), datetime('now','-6 days')),
  ('wfs_cl_4', 'wf_cl', 4, 'Consultant Technical Review', 'Consultant Engineer', 'Review', 7, 'completed', 'Approve', NULL, datetime('now','-12 days'), datetime('now','-6 days')),
  ('wfs_cl_5', 'wf_cl', 5, 'Senior Consultant Approval', 'Consultant Lead', 'Approve', 2, 'completed', 'Approve', NULL, datetime('now','-12 days'), datetime('now','-6 days')),
  ('wfs_cl_6', 'wf_cl', 6, 'Client Review', 'Client', 'Approve', 3, 'completed', 'Approve', NULL, datetime('now','-12 days'), datetime('now','-6 days'));

INSERT OR IGNORE INTO notifications (id, user_id, role, type, title, body, entity_type, entity_id) VALUES
  ('ntf_demo1', NULL, 'Consultant Engineer', 'review_required', 'Action required: Consultant Technical Review', 'Concrete Mix Design (R00) awaits your review.', 'workflow', 'wf_ur'),
  ('ntf_demo2', 'usr_demo_ahmed', NULL, 'approved', 'Approved & closed: R03-ABC-MEP-SUB-GF-MECH-00004-IFC-R00', 'Chiller Material Submittal completed the workflow.', 'document', 'doc_cl');

