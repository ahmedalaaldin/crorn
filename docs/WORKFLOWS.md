# Workflow & naming reference

This captures the domain model from the project scope (Aconex workflow
automation / review process) as implemented by crorn DMS.

## Review design cycle (15–21 days)

| Step | Stage | SLA |
| --- | --- | --- |
| 1 | Type of documents / Assign | 1 day |
| 2 | Review / multi-reviewers | 7–10 days |
| 3 | Final review | 2–3 days |
| 4 | Optionals | 1–2 days |
| 5 | Response / issue | 1 day |

## Standard workflows (seeded templates)

### A. Submittals — `SUB - Material Submittal Approval`
Contractor QA/QC → PM → Document Controller → Consultant Engineer →
Consultant Lead → Client

| # | Step | Role | Action | SLA |
| --- | --- | --- | --- | --- |
| 1 | Internal QA/QC Review | Contractor QA/QC | Review | 2 |
| 2 | Project Manager Approval | Project Manager | Approve | 1 |
| 3 | Document Control Submission | Document Controller | Notify (auto) | 1 |
| 4 | Consultant Technical Review | Consultant Engineer | Review | 7 |
| 5 | Senior Consultant Approval | Consultant Lead | Approve | 2 |
| 6 | Client Review | Client | Approve | 3 |

### B. Letters / Correspondence — `CORR - Letter Workflow`
Draft → Internal Review → Issue → Consultant Review → Response

| # | Step | Role | Action | SLA |
| --- | --- | --- | --- | --- |
| 1 | Draft Preparation | Discipline Engineer | Review | 2 |
| 2 | Internal Review | Project Manager | Approve | 1 |
| 3 | Document Control Issue | Document Controller | Notify (auto) | 1 |
| 4 | Consultant Review | Consultant Lead | Review | 5 |
| 5 | Response Preparation | Consultant Lead | Approve | 3 |

### C. RFI / Technical Query — `RFI - Technical Query Workflow`
Raise → Log → Consultant Review → Response → Closure

| # | Step | Role | Action | SLA |
| --- | --- | --- | --- | --- |
| 1 | Raise RFI | Discipline Engineer | Review | 1 |
| 2 | Logging in DMS | Document Controller | Notify (auto) | 1 |
| 3 | Consultant Review | Consultant Engineer | Review | 7 |
| 4 | Response Issued | Consultant Lead | Approve | 3 |
| 5 | Closure | Document Controller | Notify (auto) | 1 |

## Decision outcomes

| Outcome | Default effect |
| --- | --- |
| Approve | Advance to next step; close workflow on the last step |
| Approve with Comments | Advance + log the comment |
| Revise & Resubmit | Bump revision (R0n → R0n+1), return to originator |
| Reject | Archive document, close workflow |

Each step+outcome is **configurable** (`POST /api/templates/:id/outcomes`) to one
of: `advance`, `goto` a specific step (conditional branching / skip),
`close`, `return_to_originator`, or `reject_archive`. Unconfigured outcomes use
the defaults above.

## Submission flow (auto-routing)

`POST /api/documents/:id/submit` (after a file is uploaded to the current
revision):

1. Auto-starts the workflow template assigned to the document's type.
2. Auto-generates a transmittal (`<PROJECT>-TRN-NNNNN`) bundling the current revision.
3. Auto-distributes that transmittal to every distribution group matching the
   document type — no manual recipient selection.

Seeded distribution groups: `SUB-Consultant-Team`, `SUB-Client-Review` (SUB),
`RFI-Engineering-Team` (RFI), `CORR-Project-Stakeholders` (CORR).

## Status automation

| Action | Document status |
| --- | --- |
| Workflow started | Under Review |
| Approved (final) | Closed |
| Returned | Revise & Resubmit |
| Rejected | Archived |

## SLA reminders & escalation matrix

Reminders fire at **50%** and **80%** of each step's SLA window. Once overdue:

| Overdue | Action | Notifies |
| --- | --- | --- |
| +2 days | Reminder | Assigned role |
| +5 days | Escalate | Project Manager |
| +7 days | Escalate | Project Director |
| +10 days | Formal NCR / notice | Project Director |

## Mail auto-routing rules

| Mail type | Routed to | CC |
| --- | --- | --- |
| Instruction | Project Manager, QAQC | Document Controller |
| Technical Query | Consultant Engineer, Discipline Engineer | Project Manager |
| Notice | Client, Consultant Lead | Project Manager |
| Letter | Consultant Lead | Project Manager |

## Document numbering

```
[ProjectCode]-[Originator]-[Discipline]-[DocType]-[Location]-[Package/Area]-[Sequence]-[Status]-[Revision]
R03-ABC-STR-DRG-BLDG01-FOUND-00125-IFC-R02
```

**Disciplines:** ARCH, STR, CIV, ELEC, MECH, PLB, MEP, HSE, QAQC, SURV
**Doc types:** DRG, SUB, MS, RA, RFI, RPT, TST, WIR, MIR, CORR, CALC, SPE
**Status codes:** IFA, IFC, IFR, IFI, IFT, AFC, AB
**Levels:** B03–B01, GF, F01–F29, RF
