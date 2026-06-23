# crorn DMS

An **Aconex-style construction Document Management System** with a built-in
**workflow automation engine**, running entirely on **Cloudflare Workers**.

It implements the core of the Aconex review/approval model: role-based,
multi-step document workflows (Contractor QA/QC → PM → DC → Consultant →
Client), conditional decision outcomes, automatic revision loops, SLA tracking
with escalation, transmittals, auto-routed correspondence, distribution groups,
notifications, and a full audit trail — plus the standardized document numbering
convention.

## Architecture

| Concern | Technology |
| --- | --- |
| Runtime | Cloudflare Workers (module worker) |
| HTTP framework | [Hono](https://hono.dev) |
| Relational data | Cloudflare **D1** (`crorn-dms-db`) |
| File storage | Cloudflare **R2** (`crorn-dms-files`) |
| Sessions / cache | Cloudflare **KV** (`crorn-dms-sessions`, `crorn-dms-cache`) |
| Scheduled SLA sweep | Cloudflare **Cron Triggers** (daily 06:00 UTC) |
| Auth | Password (PBKDF2 via Web Crypto) + KV-backed sessions |
| UI | Embedded single-page console served at `/` |

```
src/
  index.ts            Worker entry — routing, error handling, cron, UI
  scheduled.ts        Daily SLA / escalation sweep
  ui.ts               Embedded single-page console
  types.ts            Bindings, roles, statuses, outcomes
  lib/
    workflow.ts       The workflow automation engine (core)
    auth.ts           Sessions (KV) + cookie/bearer handling
    crypto.ts         PBKDF2 password hashing, ids, tokens
    naming.ts         Aconex document numbering + revision codes
    db.ts             D1 helpers + atomic sequence counters
    notify.ts         Notifications + audit trail
    http.ts           JSON parsing, validation, error types
  middleware/auth.ts  requireAuth / requireRole
  routes/             auth, admin, projects, reference, documents, workflows,
                      correspondence, distribution, reports, notifications, health
migrations/           D1 schema (0001), reference/standard-workflow seed (0002),
                      configurable outcomes + distribution seed (0003)
```

## The workflow engine

The engine lives in [`src/lib/workflow.ts`](src/lib/workflow.ts).

- **Templates → instances.** Starting a workflow instantiates a template's
  steps onto a document revision. Routing is **by role, not person**.
- **Auto-pass Notify steps.** Steps with action type `Notify` (e.g. "Document
  Control Submission") complete automatically and announce to the role.
- **Decision outcomes** at each Review/Approve step:
  - `Approve` / `Approve with Comments` → advance to the next step (close on the last)
  - `Revise & Resubmit` → bump the revision (R00 → R01 …), return to the
    originator, keep the full history
  - `Reject` → archive the document, close the workflow
- **Configurable routing** (Aconex "Define Outcomes"): each step+outcome can be
  configured to `advance`, `goto` a specific step (conditional branching),
  `close`, `return_to_originator`, or `reject_archive` — defaults apply when
  unconfigured (`POST /api/templates/:id/outcomes`).
- **Submit → auto-route.** `POST /api/documents/:id/submit` starts the
  document-type workflow, **auto-generates a transmittal**, and
  **auto-distributes** it to the matching distribution group — no manual
  forwarding.
- **Status automation** mirrors Aconex: `Draft → Under Review → Closed`
  (or `Revise & Resubmit` / `Archived`).
- **SLA + escalation.** Each actionable step gets a due date from its SLA days.
  The daily cron sends 50%/80% reminders and applies the escalation matrix
  (+2 reminder, +5 PM, +7 Project Director, +10 formal NCR).

Standard seeded templates: **Submittals**, **Letters/Correspondence**, **RFIs**
— see [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

## Document numbering

```
[ProjectCode]-[Originator]-[Discipline]-[DocType]-[Location]-[Package/Area]-[Sequence]-[Status]-[Revision]
Example: R03-ABC-STR-DRG-BLDG01-FOUND-00125-IFC-R02
```

Discipline / document-type / level / status codes are seeded and exposed under
`/api/reference/*`.

## API overview

All routes are under `/api`. Auth is a session cookie (`crorn_session`) or
`Authorization: Bearer <token>`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup` (first-run admin), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/status` |
| Users / Companies | `GET/POST /users`, `PATCH /users/:id`, `GET/POST /companies` |
| Projects | `GET/POST /projects`, `GET /projects/:id` |
| Reference | `GET /reference/{disciplines,doc-types,levels,statuses,roles,outcomes,escalation-rules}` |
| Documents | `GET/POST /documents`, `GET /documents/:id`, `POST /documents/:id/upload`, **`POST /documents/:id/submit`**, `GET /documents/:id/revisions/:rev/{view,download}`, `POST /documents/:id/{lock,unlock}` |
| Templates | `GET/POST /templates`, `GET/PATCH /templates/:id`, `POST /templates/:id/outcomes` |
| Workflows | `POST /workflows/start`, `POST /workflows/:id/act`, `GET /workflows/tasks`, `GET /workflows`, `GET /workflows/:id` |
| Reports | `GET /reports/overview`, `GET /reports/sla`, `GET /reports/register` (`?format=csv`, `?project_id=`) |
| Transmittals | `GET/POST /transmittals`, `GET /transmittals/:id` |
| Mail | `GET/POST /mail`, `GET /mail/:id` |
| Distribution | `GET/POST /distribution-groups`, `GET /distribution-groups/:id`, `POST /distribution-groups/:id/members` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/mark-read` |
| Health | `GET /health` (public; checks D1/R2/KV) |

The first account created via `POST /auth/signup` becomes the **Admin**; after
that, self-signup is closed and users are invited via `POST /api/users`.

## Local development

```bash
npm install
npm run db:migrate:local        # apply schema + seed to a local D1
npm run dev                     # wrangler dev (http://localhost:8787)
```

Open <http://localhost:8787> and create the first admin account.

## Demo data

A ready-to-demo dataset is seeded into the production D1 (and reproducible via
`npm run seed:demo` / `npm run seed:demo:local`, defined in
[`seeds/demo.sql`](seeds/demo.sql)). It contains three companies, a sample
project (`R03 — Tower A`), four documents (two drafts, one **in review** with an
open task, one **closed** with full history), distribution-group memberships,
and notifications.

Because users are seeded, the app skips first-run setup and goes straight to
login. **Demo password for every account: `crorn-demo-2026`.**

| Email | Role | Sees in the demo |
| --- | --- | --- |
| `ahmed.alaaeldin@me.com` | Admin | everything; the approved-doc notification |
| `qaqc@crorn.dev` | Contractor QA/QC | originates/submits documents |
| `pm@crorn.dev` | Project Manager | approval tasks, correspondence |
| `dc@crorn.dev` | Document Controller | logging/notify steps, admin |
| `eng@crorn.dev` | Consultant Engineer | an **open review task** (Concrete Mix Design) |
| `lead@crorn.dev` | Consultant Lead | senior approval tasks |
| `client@crorn.dev` | Client | client review tasks |

> ⚠️ Demo accounts use a shared, public password — rotate or remove them
> (`DELETE FROM users WHERE email LIKE '%@crorn.dev'`) before real production use.

## Deployment (Cloudflare, via GitHub Actions)

Deploys run automatically on push to `main` (see
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

**One-time setup — add a repository secret:**

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
   Grant: *Workers Scripts: Edit*, *D1: Edit*, *Workers KV Storage: Edit*,
   *Workers R2 Storage: Edit* (Account-scoped).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository
   secret**: name `CLOUDFLARE_API_TOKEN`, value = the token.

That's it — the next push to `main` typechecks, applies D1 migrations
(idempotent), and deploys the Worker. The account id and binding ids are already
in [`wrangler.jsonc`](wrangler.jsonc).

To deploy manually instead:

```bash
npx wrangler deploy
```

## Provisioned Cloudflare resources

| Resource | Name / id |
| --- | --- |
| Worker | `crorn-dms` |
| D1 database | `crorn-dms-db` (`cece9381-0a1b-4fa4-ac7b-92bf28fb8c48`) |
| R2 bucket | `crorn-dms-files` |
| KV (sessions) | `crorn-dms-sessions` (`2c34450104cc4e81b54aa7c307a57ff3`) |
| KV (cache) | `crorn-dms-cache` (`6163c9fccad041a3973ef67b5ab92d47`) |

The production D1 schema and seed data are already applied.
