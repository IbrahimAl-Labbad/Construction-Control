# Construction Control — Project Completion Audit

**Audit Date:** 2026-09-30  
**Branch:** `slice-14` (Slice 15 delivered as untracked files)  
**Auditor:** AI Coding Agent  
**Slice audited through:** Slice 15 — Centralized Manager Approvals Hub

---

## 1. Executive Summary

The application is **PARTIALLY complete**. All fifteen vertical slices have been implemented and are in a high-quality state. TypeScript passes with zero errors, ESLint passes with zero warnings, all 1,269 unit and integration tests pass, and the production build succeeds cleanly.

However, several gaps prevent the system from being declared **functionally complete**:

1. **Root landing page** (`/`) is a static placeholder — authenticated users land there with no redirect.
2. **Project detail page** has no navigation buttons to three implemented sub-pages: `/payroll`, `/custodies`, and `/progress`. These routes are fully implemented but unreachable via normal navigation.
3. **Dashboard pending-approval panel** links to `/projects` instead of the new `/approvals` hub — stale after Slice 15.
4. **Accountant and Purchasing layouts** have no navigation bar — blank fragment with no UI chrome.
5. **Custody E2E spec** (`custodies.spec.ts`) is minimal (4.5 KB smoke level), unlike deep lifecycle coverage in other specs.
6. **Slice 15 files are not committed** — they exist as untracked files on `slice-14` branch.

None of these are architectural defects or data integrity issues. They are navigation/UX gaps and one delivery gap.

---

## 2. Repository State

### Git Status

```
Branch: slice-14 (up to date with origin/slice-14)

Modified (tracked, unstaged):
  components/shared/manager-top-bar.tsx   <- Slice 15 nav addition

Untracked (Slice 15 -- not yet committed):
  app/(manager)/approvals/
  lib/approvals/
  tests/e2e/manager-approvals.spec.ts
  tests/integration/approvals-actions.test.ts
  tests/integration/approvals-all-tab.test.ts
  tests/integration/approvals-auth.test.ts
  tests/integration/approvals-queries.test.ts
  tests/unit/lib/approvals/
```

### Confirmation

- PASS Slice 15 files are present in the working tree
- PASS Only `manager-top-bar.tsx` is modified among tracked files — diff is minimal and correct
- PASS No closed-slice files were modified
- PASS No Prisma migration was introduced by Slice 15 (schema unchanged)
- PASS 11 migrations applied; DB is up to date

---

## 3. Feature Inventory

### 3.1 Authentication

| Item | Status |
|------|--------|
| NextAuth.js v4 with CredentialsProvider | DONE |
| Argon2id password hashing | DONE |
| JWT session strategy with PostgreSQL Session sync | DONE |
| `requireAuth()` server-side session guard | DONE |
| Inactive user rejection at login and on every request | DONE |
| Audit logging: login, failure, logout | DONE |
| `/login` page with Arabic UI | DONE |
| Root page redirect for authenticated users | **MISSING** |

### 3.2 Authorization / Roles

| Item | Status |
|------|--------|
| 4-role enum (MANAGER, ENGINEER, ACCOUNTANT, PURCHASING) | DONE |
| `requireRole()`, `requireManager()`, `requireEngineer()` guards | DONE |
| Middleware: coarse-grained route protection | DONE |
| Layout-level guards for `(manager)`, `(engineer)` route groups | DONE |
| Layout-level guards for `(accountant)`, `(purchasing)` groups | PARTIAL — no UI chrome |
| Use-case level authorization (domain-layer guards) | DONE |
| Permission policies module (`lib/permissions/policies.ts`) | DONE |
| Object-level authorization | DONE |

### 3.3 Manager Workspace

| Item | Status |
|------|--------|
| Manager TopBar with navigation | DONE |
| Executive Dashboard (`/dashboard`) | DONE |
| Project management (`/projects`) | DONE |
| Progress Reports global view (`/progress-reports`) | DONE |
| Centralized Approvals Hub (`/approvals`) | DONE (Slice 15) |
| User Management (`/users`) | DONE |

### 3.4 Engineer Workspace

| Item | Status |
|------|--------|
| Engineer TopBar | DONE |
| My Projects (`/my-projects`) | DONE |
| My Reports (`/my-reports`) | DONE |
| Create/edit/submit/cancel progress reports | DONE |
| Links to `/expenses`, `/custodies` from top bar | **MISSING** |

### 3.5 Projects

| Item | Status |
|------|--------|
| CRUD: Create, read, update | DONE |
| Status lifecycle (PLANNED -> ACTIVE -> etc.) | DONE |
| Soft delete | DONE |
| Manager assignment | DONE |
| No delete UI (correct per AGENTS.md) | DONE |
| Project operational dashboard | DONE |
| Nav buttons to `/payroll`, `/custodies`, `/progress` sub-pages | **MISSING** |

### 3.6 Project Teams (Slice 11)

| Item | Status |
|------|--------|
| Assign/remove engineer to project | DONE |
| ACTIVE/INACTIVE assignment status | DONE |
| Reactivation (INACTIVE -> ACTIVE) | DONE |
| Engineer-side: view assigned projects | DONE |

### 3.7 Expenses (Slice 4)

| Item | Status |
|------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED | DONE |
| Per-project manager view | DONE |
| Cross-role list view (`/expenses`) | DONE |
| Budget ceiling enforcement + concurrency (FOR UPDATE) | DONE |
| Audit logging | DONE |
| Soft delete | DONE |

### 3.8 Commitments (Slice 5)

| Item | Status |
|------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED | DONE |
| Per-project manager view | DONE |
| Cross-role list view (`/commitments`) | DONE |
| Budget ceiling enforcement + concurrency | DONE |
| Audit logging | DONE |

### 3.9 Custodies (Slice 6)

| Item | Status |
|------|--------|
| Full lifecycle: DRAFT -> APPROVED -> ISSUED -> SETTLED -> CLOSED | DONE |
| Rejection and cancellation | DONE |
| Custody-linked expenses | DONE |
| Per-project manager view | DONE |
| Cross-role list view (`/custodies`) | DONE |
| Soft delete | DONE |
| E2E test coverage | **PARTIAL** — smoke level only (4.5 KB) |

### 3.10 Payroll (Slice 8)

| Item | Status |
|------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED / CANCELLED | DONE |
| Per-project manager view | DONE |
| Global list view (`/payroll`) | DONE |
| Financial exposure tracking | DONE |
| Audit logging + concurrency protection | DONE |

### 3.11 Subcontractor Billings (Slice 7)

| Item | Status |
|------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED / CANCELLED | DONE |
| Commitment ceiling enforcement | DONE |
| Global list view (`/subcontractor-billings`) | DONE |
| Audit logging + concurrency | DONE |

### 3.12 Progress Reports (Slice 10)

| Item | Status |
|------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED / CANCELLED | DONE |
| Engineer creates/edits/submits/cancels | DONE |
| Manager approves/rejects | DONE |
| Unique constraint: one per engineer per project per date | DONE |
| Global manager view + per-project view | DONE |
| Audit logging | DONE |

### 3.13 Milestones (Slice 12)

| Item | Status |
|------|--------|
| CRUD: Create, update, reorder | DONE |
| PLANNED -> IN_PROGRESS -> COMPLETED / CANCELLED lifecycle | DONE |
| Manager-only creation/edit | DONE |
| Read-only for other roles | DONE |
| Soft delete (PLANNED only) + audit logging | DONE |

### 3.14 Budget (Slice 3)

| Item | Status |
|------|--------|
| Budget header + line items | DONE |
| DRAFT -> SUBMITTED -> APPROVED / REJECTED / SUPERSEDED | DONE |
| Budget ceiling enforcement across all financial domains | DONE |
| Immutability after approval | DONE |

### 3.15 Dashboards

| Item | Status |
|------|--------|
| Executive Dashboard (company-wide, Slice 9) | DONE |
| Operational Project Dashboard (per-project, Slice 13) | DONE |
| Pending approvals panel links | **PARTIAL** — links to `/projects` (stale after Slice 15) |

### 3.16 User Management (Slice 2)

| Item | Status |
|------|--------|
| Create user (Manager only) | DONE |
| List / activate / deactivate users | DONE |
| Role assignment | DONE |
| No public registration | DONE |

### 3.17 Approvals Hub (Slice 15)

| Item | Status |
|------|--------|
| Centralized `/approvals` page | DONE |
| All-tab triage (bounded 100-item window) | DONE |
| Per-domain tabs with pagination | DONE |
| Approve/reject actions for all 5 domains | DONE |
| Detail link navigation from cards | DONE |
| Manager-only authorization on page and all actions | DONE |
| Nav link in ManagerTopBar | DONE |
| Revalidation on approve/reject | DONE |

---

## 4. Route Audit

All 37 routes produced by `npm run build`:

| Route | Purpose | Access | Status |
|-------|---------|--------|--------|
| `/` | Landing placeholder | Any | WARNING: No redirect |
| `/login` | Authentication | Public | OK |
| `/dashboard` | Executive Dashboard | MANAGER | OK |
| `/approvals` | Centralized Approvals Hub | MANAGER | OK |
| `/projects` | Project list | MANAGER | OK |
| `/projects/new` | Create project | MANAGER | OK |
| `/projects/[projectId]` | Project detail + operational dashboard | MANAGER | OK |
| `/projects/[projectId]/budget` | Budget management | MANAGER | OK |
| `/projects/[projectId]/expenses` | Project expenses | MANAGER | OK |
| `/projects/[projectId]/commitments` | Project commitments | MANAGER | OK |
| `/projects/[projectId]/custodies` | Project custodies | MANAGER | WARNING: No nav button |
| `/projects/[projectId]/payroll` | Project payroll | MANAGER | WARNING: No nav button |
| `/projects/[projectId]/progress` | Project progress reports | MANAGER | WARNING: No nav button |
| `/projects/[projectId]/milestones` | Milestone management | All roles | OK |
| `/projects/[projectId]/team` | Team management | MANAGER | OK |
| `/projects/[projectId]/edit` | Edit project metadata | MANAGER | OK |
| `/progress-reports` | Global manager progress | MANAGER | OK |
| `/progress-reports/[id]` | Report detail + approve/reject | MANAGER | OK |
| `/users` | User management | MANAGER | OK |
| `/expenses` | Cross-role expense list | ENG/ACC/MGR | OK |
| `/commitments` | Cross-role commitment list | All roles | OK |
| `/custodies` | Cross-role custody list | ENG/ACC/MGR | OK |
| `/payroll` | Payroll list | MGR/ACC | OK |
| `/payroll/new` | Create payroll entry | ACC | OK |
| `/payroll/[id]` | Payroll detail | MGR/ACC | OK |
| `/payroll/[id]/edit` | Edit payroll draft | ACC | OK |
| `/subcontractor-billings` | Billings list | MGR/ACC/ENG | OK |
| `/subcontractor-billings/new` | Create billing | ACC | OK |
| `/subcontractor-billings/[id]` | Billing detail | MGR/ACC/ENG | OK |
| `/subcontractor-billings/[id]/edit` | Edit billing draft | ACC | OK |
| `/my-projects` | Engineer assigned projects | ENG | OK |
| `/my-projects/[projectId]` | Engineer project detail | ENG | OK |
| `/my-reports` | Engineer report list | ENG | OK |
| `/my-reports/new` | Create progress report | ENG | OK |
| `/my-reports/[id]` | Report detail | ENG | OK |
| `/my-reports/[id]/edit` | Edit draft report | ENG | OK |
| `/api/auth/[...nextauth]` | NextAuth routes | Public | OK |

### Orphaned Routes

Three fully implemented routes have **no navigation button** on the project detail page:
- `/projects/[projectId]/custodies`
- `/projects/[projectId]/payroll`
- `/projects/[projectId]/progress`

---

## 5. Authorization Audit

### Server-Side Guard Layers (Verified)

| Layer | Implementation | Coverage |
|-------|---------------|----------|
| Middleware | `withAuth` → `/login` redirect | All routes |
| `(manager)` layout | `requireRole(all 4 roles)` | All manager-group routes |
| `(engineer)` layout | `requireRole(ENGINEER)` | All engineer-group routes |
| `(accountant)` layout | `requireRole(ACCOUNTANT)` | All accountant-group routes |
| `(purchasing)` layout | `requireRole(PURCHASING)` | All purchasing-group routes |
| Manager pages | Additional `requireManager()` in each page | All manager feature pages |
| Use cases | Role checked at domain layer | All major use cases verified |
| Server actions | `requireManager()` at action start | All approval actions |

### Authorization Gap

**`/progress-reports` page** does not call `requireManager()` at the page level. Authorization relies entirely on the `getAllProgressReports()` use case calling `requireManager()` internally. This is functionally correct (defense-in-depth) but deviates from the established pattern. Risk: MEDIUM — hygiene only.

---

## 6. Business Workflow Audit

### Expenses

| Check | Result |
|-------|--------|
| DRAFT -> SUBMITTED -> APPROVED / REJECTED | PASS |
| REJECTED -> DRAFT (reopen) | PASS |
| Budget ceiling enforcement (FOR UPDATE locking) | PASS |
| Audit logging in same transaction | PASS |
| Soft delete + CAS stale-state protection | PASS |

### Commitments

| Check | Result |
|-------|--------|
| Full lifecycle + reopen | PASS |
| Budget ceiling enforcement + concurrency | PASS |
| Audit logging + soft delete | PASS |

### Custodies

| Check | Result |
|-------|--------|
| Full lifecycle (DRAFT -> CLOSED) | PASS |
| Rejection + cancellation | PASS |
| Custody-expense linkage + settlement (decimal) | PASS |
| Audit logging + soft delete | PASS |

### Payroll

| Check | Result |
|-------|--------|
| DRAFT -> APPROVED / REJECTED / CANCELLED | PASS |
| Accountant-only creation, Manager-only approval | PASS |
| Financial exposure tracking + concurrency | PASS |
| Audit logging | PASS |

### Subcontractor Billings

| Check | Result |
|-------|--------|
| Full lifecycle | PASS |
| Commitment ceiling enforcement + concurrency | PASS |
| Accountant-only creation, Manager-only approval | PASS |
| Audit logging | PASS |

### Progress Reports

| Check | Result |
|-------|--------|
| DRAFT -> APPROVED / REJECTED, reopen | PASS |
| Business uniqueness (one per engineer/project/date) | PASS |
| Cancelled slot permanently blocked | PASS |
| Audit logging | PASS |

---

## 7. Navigation Audit

### ManagerTopBar Links

| Link | Target | Status |
|------|--------|--------|
| لوحة المتابعة | `/dashboard` | OK |
| المشاريع | `/projects` | OK |
| تقارير التقدم | `/progress-reports` | OK |
| الموافقات | `/approvals` | OK (added Slice 15) |
| المستخدمون | `/users` | OK |

### EngineerTopBar Links

| Link | Target | Status |
|------|--------|--------|
| مشاريعي | `/my-projects` | OK |
| تقارير التقدم الميداني | `/my-reports` | OK |
| Link to `/expenses` | — | MISSING |
| Link to `/custodies` | — | MISSING |

### Project Detail Navigation Buttons

| Button | Target | Status |
|--------|--------|--------|
| الموازنة التقديرية | `/projects/[id]/budget` | OK |
| الارتباطات والشراء | `/projects/[id]/commitments` | OK |
| المصروفات والرقابة | `/projects/[id]/expenses` | OK |
| فريق العمل | `/projects/[id]/team` | OK |
| المعالم التخطيطية | `/projects/[id]/milestones` | OK |
| تعديل البيانات | `/projects/[id]/edit` | OK |
| **Payroll button** | `/projects/[id]/payroll` | **MISSING** |
| **Custodies button** | `/projects/[id]/custodies` | **MISSING** |
| **Progress Reports button** | `/projects/[id]/progress` | **MISSING** |

### Dashboard Pending-Approvals Panel (Stale Links)

| Card | Current Link | Correct Link |
|------|-------------|--------------|
| مصروفات معلقة | `/projects` | `/approvals?tab=expenses` |
| ارتباطات معلقة | `/projects` | `/approvals?tab=commitments` |
| عهد معلقة | `/projects` | `/approvals?tab=custodies` |
| رواتب معلقة | `/projects` | `/approvals?tab=payroll` |
| مستخلصات معلقة | `/subcontractor-billings` | `/approvals?tab=billings` |

---

## 8. Database Audit

### Schema Health

| Check | Result |
|-------|--------|
| `prisma validate` | PASS — schema is valid |
| All money fields: `Decimal @db.Decimal(15, 2)` | PASS — no Float |
| All timestamps: `@db.Timestamptz` | PASS |
| `createdAt` + `updatedAt` on all models | PASS |
| Soft delete `deletedAt` on all financial entities | PASS |
| AuditLog append-only (no update/delete relations) | PASS |
| Foreign keys with `Restrict` on financial references | PASS |
| Unique constraints on Budget, ProgressReport, ProjectAssignment | PASS |

### Migrations (11 Applied)

| Migration | Content |
|-----------|---------|
| 20260913000000_init_foundation | Users, Auth, AuditLog |
| 20260915065530_add_project_model | Projects |
| 20260915115941_add_budget_foundation | Budgets, BudgetLines |
| 20260916064825_add_expense_domain | Expenses |
| 20260916074824_add_commitments_slice_5 | Commitments |
| 20260916090305_add_custody_domain_slice_6 | Custodies |
| 20260920140104_slice7_subcontractor_billing | SubcontractorBillings |
| 20260922093649_slice8_payroll_entry | PayrollEntries |
| 20260924084107_add_progress_reports | ProgressReports |
| 20260924095929_add_project_assignments | ProjectAssignments |
| 20260924125247_add_project_milestones | ProjectMilestones |

Slice 15 required **no schema changes** — it is a pure query/aggregation layer.

---

## 9. Test Coverage Audit

### Summary

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Unit (Vitest) | 64 | ~900+ | All pass |
| Integration (Vitest) | 48 | ~300+ | All pass |
| E2E (Playwright) | 18 spec files | — | Not run (requires live server) |
| **Total** | **116** | **1,269** | **All pass** |

### Coverage by Feature

| Feature | Unit | Integration | E2E | Notes |
|---------|------|-------------|-----|-------|
| Authentication | OK | OK | OK | auth.spec.ts |
| Authorization | OK | OK | OK | multiple specs |
| Projects | OK | OK | OK | projects-phase-a, b |
| Budget | OK | OK | OK | budget.spec.ts |
| Expenses | OK | OK | OK | expenses.spec.ts |
| Commitments | OK | OK | OK | commitments.spec.ts |
| Custodies | OK | OK | PARTIAL | custodies.spec.ts — smoke only |
| Payroll | OK | OK | OK | payroll.spec.ts (44 KB) |
| Subcontractor Billings | OK | OK | OK | subcontractor-billings.spec.ts (41 KB) |
| Progress Reports | OK | OK | OK | progress-reports.spec.ts |
| Project Team | OK | OK | OK | project-team.spec.ts |
| Milestones | OK | OK | OK | milestones.spec.ts |
| Executive Dashboard | OK | OK | OK | dashboard.spec.ts |
| Operational Dashboard | OK | OK | OK | operational-dashboard.spec.ts |
| Engineer Workspace | OK | OK | OK | engineer-workspace.spec.ts |
| User Management | OK | — | OK | user-management.spec.ts |
| Approvals Hub | OK | OK | OK | manager-approvals.spec.ts |

### Coverage Gaps

1. `custodies.spec.ts` is only 4.5 KB — no E2E flows for approval, issuance, or settlement
2. Root page (`/`) has no tests
3. Accountant/Purchasing workspace navigation not E2E tested

---

## 10. Technical Debt Audit

### HIGH Priority

| # | Item | File |
|---|------|------|
| H-1 | Orphaned project sub-routes (payroll, custodies, progress) | `app/(manager)/projects/[projectId]/page.tsx` |
| H-2 | Root `/` page is a static placeholder with no redirect | `app/page.tsx` |
| H-3 | Dashboard pending-approval links point to `/projects` (stale) | `dashboard/components/pending-approvals-panel.tsx` |

### MEDIUM Priority

| # | Item | File |
|---|------|------|
| M-1 | `/progress-reports` page missing page-level `requireManager()` | `app/(manager)/progress-reports/page.tsx` |
| M-2 | Progress-reports server actions delegate without explicit manager check | `app/(manager)/progress-reports/actions.ts` |
| M-3 | Engineer TopBar has no links to `/expenses`, `/custodies`, `/commitments` | `components/shared/engineer-top-bar.tsx` |
| M-4 | `Sidebar` and `Header` components are empty placeholders (unused) | `components/shared/sidebar.tsx`, `header.tsx` |
| M-5 | Accountant/Purchasing route-group layouts have no navigation UI | `app/(accountant)/layout.tsx`, `app/(purchasing)/layout.tsx` |
| M-6 | `middleware.ts` deprecation warning in Next.js 16.x | `middleware.ts` |
| M-7 | `package.json` missing `"type": "module"` — Node.js ES module warning | `package.json` |
| M-8 | Slice 15 files are not committed to git | Working tree |

### LOW Priority

| # | Item | Notes |
|---|------|-------|
| L-1 | `console.log` in `lib/logger/index.ts` | Intentional logger implementation. Not a concern. |
| L-2 | `console.log` in `prisma/verify-*.ts` | Diagnostic scripts. Not production code. |
| L-3 | `console.log` in `prisma/seed-test.ts` | Seeding output. Not production code. |
| L-4 | Prisma major version update available (6.4.1 -> 8.0.0-rc) | RC only — not urgent. |

---

## 11. Production Readiness

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS — 0 TypeScript errors |
| `npm run lint` | PASS — 0 ESLint warnings, 0 errors |
| `npm test` (Vitest) | PASS — 1,269 tests, 116 files |
| `npm run build` | PASS — 37 routes, 0 errors |
| `prisma validate` | PASS — schema is valid |
| `prisma migrate status` | PASS — database schema is up to date |
| `npm run test:e2e` | NOT RUN — requires live server + seeded DB |

### Build Warnings (Non-blocking)

1. `middleware` file convention deprecated (Next.js 16.x) — functional, not breaking
2. `[MODULE_TYPELESS_PACKAGE_JSON]` from `tailwind.config.ts` — not breaking

---

## 12. Documentation vs Implementation

| AGENTS.md Spec | Documented | Implemented |
|----------------|-----------|-------------|
| 4 roles only (§5) | YES | YES |
| Soft delete financial records (§14) | YES | YES |
| Decimal money (§13) | YES | YES |
| Audit logging (§21) | YES | YES |
| Arabic/RTL-first (§19) | YES | YES |
| No hard deletes (§14) | YES | YES |
| Server-side authorization (§18) | YES | YES |
| Transactions for financial ops (§15) | YES | YES |
| Self-approval protection | YES | YES |
| No ERP/GL/HR (§3 out-of-scope) | YES | NOT IMPLEMENTED (correct) |
| Root page redirect (implied) | PARTIAL | NO — placeholder comment says "next phase" |
| Accountant/Purchasing navigation | Not specified | NO — no workspace UI |
| Engineer navigation to expense/custody | Not specified | NO — no nav links |

---

## 13. Completion Matrix

| Area | Status | Remaining Work |
|------|--------|----------------|
| Authentication | Complete | Root page redirect |
| Authorization | Complete | Progress-reports page-level guard (hygiene) |
| Projects | Complete | 3 missing nav buttons on project detail |
| Expenses | Complete | — |
| Commitments | Complete | — |
| Custodies | Complete | E2E coverage thin |
| Payroll | Complete | No nav button on project detail |
| Subcontractor Billing | Complete | — |
| Progress Reports | Complete | Page-level auth guard missing |
| Milestones | Complete | — |
| Dashboards | Complete | Stale pending-approval links |
| User Management | Complete | — |
| Approvals Hub | Complete | Not yet committed to git |
| Navigation | **Partial** | 3 orphaned routes; stale links; no Accountant/Purchasing nav; Engineer missing links |
| Testing | **Partial** | Custody E2E thin; Accountant/Purchasing workspace untested |
| Database | Complete | — |
| Production Build | Passes | 2 minor warnings (non-blocking) |

---

## 14. Blocking Issues

### B-1: Root Page Has No Redirect

`app/page.tsx` renders a static placeholder. After login, NextAuth redirects to `/` — the useless placeholder. Every user who logs in must manually navigate to their workspace.

**File:** `app/page.tsx`

### B-2: Slice 15 Is Not Committed

All Slice 15 files are untracked on `slice-14`. Git history does not reflect the implemented Approvals Hub.

---

## 15. Non-Blocking Issues

### NB-1: Orphaned Project Sub-Routes (HIGH)

`/projects/[projectId]/payroll`, `/projects/[projectId]/custodies`, and `/projects/[projectId]/progress` have no navigation buttons on the project detail page. Fully implemented but unreachable via normal navigation.

**File:** `app/(manager)/projects/[projectId]/page.tsx`

### NB-2: Dashboard Pending-Approval Links Are Stale (HIGH)

4 of 5 pending-approval cards link to `/projects` instead of `/approvals?tab=*`.

**File:** `app/(manager)/dashboard/components/pending-approvals-panel.tsx`

### NB-3: Engineer Workspace Missing Expense/Custody Navigation (MEDIUM)

Engineers can submit expenses and create custody requests but cannot navigate there from the Engineer top bar.

**File:** `components/shared/engineer-top-bar.tsx`

### NB-4: Accountant and Purchasing Have No Navigation UI (MEDIUM)

`(accountant)` and `(purchasing)` layouts render a bare fragment — no top bar, no branding, no navigation.

**Files:** `app/(accountant)/layout.tsx`, `app/(purchasing)/layout.tsx`

### NB-5: Progress-Reports Page Missing Page-Level Auth Guard (MEDIUM)

`/progress-reports/page.tsx` relies entirely on the use-case layer for authorization. Correct but deviates from the established pattern.

### NB-6: Custody E2E Coverage Thin (MEDIUM)

`tests/e2e/custodies.spec.ts` is 4.5 KB vs 41-44 KB for comparable domain specs. No E2E coverage of custody approval, issuance, or settlement.

### NB-7: Middleware Deprecation Warning (LOW)

Next.js 16.x deprecates `middleware.ts`. Must migrate to `proxy.ts` before upgrading Next.js.

### NB-8: `package.json` Missing `"type": "module"` (LOW)

Triggers a Node.js ES module warning during build.

---

## 16. Recommended Next Step

### Slice 16 — Navigation Completion and Root Page Redirect

No schema changes, no new use cases, no new API routes. Purely navigation and UX.

**Scope:**

1. **Root page redirect** — Authenticated users at `/` redirect to their role workspace:
   - MANAGER -> `/dashboard`
   - ENGINEER -> `/my-projects`
   - ACCOUNTANT -> `/payroll`
   - PURCHASING -> `/commitments`

2. **Project detail buttons** — Add three missing buttons:
   - Payroll -> `/projects/[projectId]/payroll`
   - Custodies -> `/projects/[projectId]/custodies`
   - Progress Reports -> `/projects/[projectId]/progress`

3. **Dashboard pending-approvals links** — Update 5 card links to `/approvals?tab=*`

4. **Accountant navigation bar** — Implement `AccountantTopBar` with links to `/payroll`, `/subcontractor-billings`, `/commitments`, `/custodies`, `/expenses`

5. **Purchasing navigation bar** — Implement `PurchasingTopBar` with link to `/commitments`

6. **Engineer TopBar** — Add links to `/expenses` and `/custodies`

**Files to create/modify:**
- `app/page.tsx` — add role-based redirect
- `app/(manager)/projects/[projectId]/page.tsx` — add 3 nav buttons
- `app/(manager)/dashboard/components/pending-approvals-panel.tsx` — fix links
- `components/shared/accountant-top-bar.tsx` — new
- `components/shared/purchasing-top-bar.tsx` — new
- `app/(accountant)/layout.tsx` — use AccountantTopBar
- `app/(purchasing)/layout.tsx` — use PurchasingTopBar
- `components/shared/engineer-top-bar.tsx` — add expense/custody links

---

## 17. Protected / Closed Areas

The following slices are complete and **MUST NOT be modified**:

| Slice | Area | Protected Files |
|-------|------|----------------|
| Slice 1 | Authentication + Session | `lib/auth/`, `app/(auth)/`, `app/api/auth/` |
| Slice 2 | User Management | `lib/user-management/`, `app/(manager)/users/` |
| Slice 3 | Projects + Budget | `lib/projects/`, `lib/budget/`, `app/(manager)/projects/` |
| Slice 4 | Expenses | `lib/expenses/`, `app/expenses/` |
| Slice 5 | Commitments | `lib/commitments/`, `app/commitments/` |
| Slice 6 | Custodies | `lib/custodies/`, `app/custodies/` |
| Slice 7 | Subcontractor Billings | `lib/subcontractor-billings/`, `app/subcontractor-billings/` |
| Slice 8 | Payroll | `lib/payroll/`, `app/payroll/` |
| Slice 9 | Executive Dashboard | `lib/dashboard/`, `app/(manager)/dashboard/` |
| Slice 10 | Progress Reports | `lib/progress-reports/`, `app/(engineer)/my-reports/`, `app/(manager)/progress-reports/` |
| Slice 11 | Project Teams | `lib/project-team/`, `app/(manager)/projects/[projectId]/team/` |
| Slice 12 | Milestones | `lib/milestones/`, `app/(manager)/projects/[projectId]/milestones/` |
| Slice 13 | Operational Dashboard | `lib/operational-dashboard/`, `app/(manager)/projects/[projectId]/` |
| Slice 14 | Engineer Workspace | `lib/engineer-workspace/`, `app/(engineer)/my-projects/` |
| Slice 15 | Approvals Hub | `lib/approvals/`, `app/(manager)/approvals/` |
| All | Prisma Schema + Migrations | `prisma/schema.prisma`, `prisma/migrations/` |
| All | Core Infrastructure | `lib/db/`, `lib/errors/`, `lib/logger/`, `lib/validation/`, `lib/permissions/` |
| All | Tests | `tests/unit/`, `tests/integration/`, `tests/e2e/` |

---

## 18. Final Answers

**Q: Is the application functionally complete?**
PARTIALLY. All 15 slices are implemented with high code quality and passing all tests. Navigation is incomplete.

**Q: Any blocking issues?**
Two: (B-1) Root page has no post-login redirect. (B-2) Slice 15 not committed to git.

**Q: Any non-blocking issues?**
Eight — see Section 15. Most critical: 3 orphaned project sub-routes (H-1), stale dashboard links (H-2/H-3), no Accountant/Purchasing nav (M-5), thin custody E2E (M-6).

**Q: Next required implementation slice?**
Slice 16 — Navigation Completion and Root Page Redirect (no schema or use-case changes).

**Q: What must NOT be changed?**
All 15 completed feature slices, Prisma schema/migrations, core infrastructure (`lib/db`, `lib/permissions`, `lib/auth`, `lib/errors`, `lib/logger`, `lib/validation`), and all existing tests.
