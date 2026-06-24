-- crorn DMS — reference data & standard configuration seed
-- Idempotent: uses INSERT OR IGNORE so re-running is safe.

-- Disciplines -----------------------------------------------------------------
INSERT OR IGNORE INTO disciplines (code, name) VALUES
  ('ARCH','Architectural'),
  ('STR','Structural'),
  ('CIV','Civil'),
  ('ELEC','Electrical'),
  ('MECH','Mechanical'),
  ('PLB','Plumbing'),
  ('MEP','MEP Combined'),
  ('HSE','HSE'),
  ('QAQC','QA/QC'),
  ('SURV','Survey');

-- Document types --------------------------------------------------------------
INSERT OR IGNORE INTO doc_types (code, name, category) VALUES
  ('DRG','Drawing','Technical'),
  ('SUB','Material Submittal','Technical'),
  ('MS','Method Statement','Technical'),
  ('RA','Risk Assessment','HSE'),
  ('RFI','Request For Information','Technical'),
  ('RPT','Technical Report','Technical'),
  ('TST','Test Report','Inspection'),
  ('WIR','Work Inspection Request','Inspection'),
  ('MIR','Material Inspection Request','Inspection'),
  ('CORR','Correspondence','Correspondence'),
  ('CALC','Calculation','Technical'),
  ('SPE','Specification','Technical');

-- Level codes -----------------------------------------------------------------
INSERT OR IGNORE INTO levels (code, name, sort) VALUES
  ('B03','Basement 3',-3),
  ('B02','Basement 2',-2),
  ('B01','Basement 1',-1),
  ('GF','Ground Floor',0),
  ('F01','Floor 1',1),('F02','Floor 2',2),('F03','Floor 3',3),('F04','Floor 4',4),
  ('F05','Floor 5',5),('F06','Floor 6',6),('F07','Floor 7',7),('F08','Floor 8',8),
  ('F09','Floor 9',9),('F10','Floor 10',10),('F11','Floor 11',11),('F12','Floor 12',12),
  ('F13','Floor 13',13),('F14','Floor 14',14),('F15','Floor 15',15),('F16','Floor 16',16),
  ('F17','Floor 17',17),('F18','Floor 18',18),('F19','Floor 19',19),('F20','Floor 20',20),
  ('F21','Floor 21',21),('F22','Floor 22',22),('F23','Floor 23',23),('F24','Floor 24',24),
  ('F25','Floor 25',25),('F26','Floor 26',26),('F27','Floor 27',27),('F28','Floor 28',28),
  ('F29','Floor 29',29),
  ('RF','Roof',99);

-- Status codes (document issue status used in the document number) -------------
INSERT OR IGNORE INTO status_codes (code, name) VALUES
  ('IFA','Issued For Approval'),
  ('IFC','Issued For Construction'),
  ('IFR','Issued For Review'),
  ('IFI','Issued For Information'),
  ('IFT','Issued For Tender'),
  ('AFC','Approved For Construction'),
  ('AB','As-Built');

-- Escalation matrix (SLA enforcement) -----------------------------------------
INSERT OR IGNORE INTO escalation_rules (id, days_overdue, action, notify_role) VALUES
  ('esc-2','2','Reminder email',NULL),
  ('esc-5','5','Escalate to PM','Project Manager'),
  ('esc-7','7','Escalate to Project Director','Project Director'),
  ('esc-10','10','Formal NCR / notice','Project Director');

-- Mail auto-routing rules -----------------------------------------------------
INSERT OR IGNORE INTO mail_routing_rules (id, mail_type, route_roles, cc_roles) VALUES
  ('mr-instruction','Instruction','Project Manager,QAQC','Document Controller'),
  ('mr-tq','Technical Query','Consultant Engineer,Discipline Engineer','Project Manager'),
  ('mr-notice','Notice','Client,Consultant Lead','Project Manager'),
  ('mr-letter','Letter','Consultant Lead','Project Manager');

-- Standard workflow templates -------------------------------------------------
-- A. Submittals: Contractor QA/QC -> PM -> DC -> Consultant Engineer -> Consultant Lead -> Client
INSERT OR IGNORE INTO workflow_templates (id, name, type, doc_type_code, active) VALUES
  ('wt-sub','SUB - Material Submittal Approval','document','SUB',1);
INSERT OR IGNORE INTO workflow_template_steps (id, template_id, step_order, name, role, action_type, sla_days) VALUES
  ('wts-sub-1','wt-sub',1,'Internal QA/QC Review','Contractor QA/QC','Review',2),
  ('wts-sub-2','wt-sub',2,'Project Manager Approval','Project Manager','Approve',1),
  ('wts-sub-3','wt-sub',3,'Document Control Submission','Document Controller','Notify',1),
  ('wts-sub-4','wt-sub',4,'Consultant Technical Review','Consultant Engineer','Review',7),
  ('wts-sub-5','wt-sub',5,'Senior Consultant Approval','Consultant Lead','Approve',2),
  ('wts-sub-6','wt-sub',6,'Client Review','Client','Approve',3);

-- B. Letters / Correspondence: Draft -> Internal Review -> Issue -> Consultant Review -> Response
INSERT OR IGNORE INTO workflow_templates (id, name, type, doc_type_code, active) VALUES
  ('wt-corr','CORR - Letter Workflow','document','CORR',1);
INSERT OR IGNORE INTO workflow_template_steps (id, template_id, step_order, name, role, action_type, sla_days) VALUES
  ('wts-corr-1','wt-corr',1,'Draft Preparation','Discipline Engineer','Review',2),
  ('wts-corr-2','wt-corr',2,'Internal Review','Project Manager','Approve',1),
  ('wts-corr-3','wt-corr',3,'Document Control Issue','Document Controller','Notify',1),
  ('wts-corr-4','wt-corr',4,'Consultant Review','Consultant Lead','Review',5),
  ('wts-corr-5','wt-corr',5,'Response Preparation','Consultant Lead','Approve',3);

-- C. RFI / Technical Query: Raise -> Log -> Consultant Review -> Response -> Closure
INSERT OR IGNORE INTO workflow_templates (id, name, type, doc_type_code, active) VALUES
  ('wt-rfi','RFI - Technical Query Workflow','document','RFI',1);
INSERT OR IGNORE INTO workflow_template_steps (id, template_id, step_order, name, role, action_type, sla_days) VALUES
  ('wts-rfi-1','wt-rfi',1,'Raise RFI','Discipline Engineer','Review',1),
  ('wts-rfi-2','wt-rfi',2,'Logging in DMS','Document Controller','Notify',1),
  ('wts-rfi-3','wt-rfi',3,'Consultant Review','Consultant Engineer','Review',7),
  ('wts-rfi-4','wt-rfi',4,'Response Issued','Consultant Lead','Approve',3),
  ('wts-rfi-5','wt-rfi',5,'Closure','Document Controller','Notify',1);
