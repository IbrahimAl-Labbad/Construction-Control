# CR-08 Implementation Task Brief: Visual Progress, Project Milestones & Evidence-Gated Completion

**Document Version:** `v1.2.1`
**Date:** `2026-10-31`
**Governance Status:** Implementation Task Brief (Authoritative Pre-Execution Baseline)
**Target Workstream:** CR-08 (Wave 1A Fast-Track / Vertical Slice 26)
**Repository Baseline:** Commit `1e30c3c` (`docs: add CR execution readiness roadmap`) on branch `wave-0`
**Dependencies:** Wave 0 Universal Attachment Infrastructure (`7615e91`), Slice 10 (`ProgressReport`), Slice 12 (`ProjectMilestone`)

---

## 1. Authoritative Governance & Scope Boundaries

### 1.1 Authoritative References
This task brief is governed strictly by the following authoritative repository documents:
1. [AGENTS.md](file:///d:/Construction%20Control/AGENTS.md) (v1.2.0):
   - §1: Primary consumer is Manager; primary data entry is Engineer.
   - §5: Four V1 roles (`MANAGER`, `ENGINEER`, `ACCOUNTANT`, `PURCHASING`).
   - §6–§8: Presentation / Application / Domain / Infrastructure strict layer separation.
   - §12: Server-side authorization, IDOR prevention, and security by default.
   - §14: No hard deletes for operational entities; soft-delete pattern via `deletedAt`.
   - §15: Database safety, referential constraints, composite unique keys, and relational invariants.
   - §18: Separation of duties (`creator \ne approver`).
   - §19: Arabic/RTL-first UI with logical CSS properties (`ms-*`, `me-*`, `ps-*`, `pe-*`).
   - §20: Automated testing requirements (>80% unit test coverage for `lib/`).
   - §21: Append-only audit logging inside the same database transaction.
2. [docs/CR01_CR10_EXECUTION_READINESS_ROADMAP.md](file:///d:/Construction%20Control/docs/CR01_CR10_EXECUTION_READINESS_ROADMAP.md) (Committed @ `1e30c3c`):
   - Section B (Row CR-08): Candidate for technical specification and implementation planning.
   - Section E.2 (Wave 1A): Decoupled fast-track workstream. Zero open Owner decisions.
   - Section F (CR-08 Checklist): Implementation checklist and acceptance criteria.
3. [docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md):
   - §4.8 (CR-08): Milestone completion evidence gate (`BD-17`), decoupled progress/billing (`OD-06D-1 / R-04`).
4. [docs/OWNER_DECISION_BRIEF_CR01_CR10.md](file:///d:/Construction%20Control/docs/OWNER_DECISION_BRIEF_CR01_CR10.md):
   - `OD-06D-1` (`OWNER-APPROVED`): Field milestones and progress operate independently of Owner billing with optional reference linking.
   - `BD-17` (`OWNER-APPROVED`): Progress reports provide photographic evidence to support project milestone completion; milestone completion requires at least one approved progress report with active visual attachments.

### 1.2 Strict Scope Exclusions (Non-Goals)
The following are **strictly out of scope** for this task brief:
- **No Financial Approvals:** Completing a milestone must not create, approve, or adjust any financial record, invoice, or budget line.
- **No Automatic Owner Billing:** Approving a progress report or completing a milestone must never automatically generate an Owner billing claim (`OD-06D-1`).
- **No Configurable Evidence Bypass:** Visual evidence is mandatory for all milestone completions. No bypass boolean, emergency override, or Manager exemption may be introduced.
- **No Labor Attendance / Timesheets:** Daily labor sheets and worker timesheets remain deferred under CR-04 (`AGENTS.md` §3–§4).
- **No Equipment Operating Hours:** Equipment logs and machine hours remain deferred under CR-06 (`AGENTS.md` §3–§4).
- **No New Storage Provider Implementation:** The existing verified local/memory storage adapters from Wave 0 (`7615e91`) must be used for local/test execution without introducing external cloud SDK dependencies.
- **No New Attachment Categories or Enums:** Only existing `AttachmentCategory` enum values (`PROGRESS_PHOTO`, `EXECUTION_EVIDENCE`) are utilized.

---

## 2. Existing Codebase Inspection & Reusable Primitives

A comprehensive inspection of the existing codebase confirms that CR-08 builds directly on mature foundational components rather than creating parallel infrastructure.

### 2.1 Slice 10 — Site Engineer Progress Reports (`lib/progress-reports/`)
- **Prisma Entity:** `ProgressReport` (table `progress_reports`, lines 914–1001 of `prisma/schema.prisma`).
  - Fields: `id`, `projectId`, `reportDate` (`@db.Date`), `title`, `workDescription`, `progressPercentage` (0–100), `status` (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`), `createdById`, `approvedById`, `rejectedById`, `cancelledById`, `deletedAt` (`DateTime? @db.Timestamptz`).
  - Soft-Delete Status: `deletedAt` exists in the schema. In Slice 10, no operational use case sets `deletedAt`, but all operational queries filter `deletedAt IS NULL`.
  - Natural Uniqueness: `@@unique([projectId, reportDate, createdById])`.
  - Separation of Duties: Engineer authors and submits; Manager reviews and approves/rejects (`lib/progress-reports/use-cases/approve-progress-report.ts`).
  - State Machine Immutability (`lib/progress-reports/state-machine.ts` line 43):
    - Status `APPROVED` is **strictly terminal** (`ALLOWED_PROGRESS_REPORT_TRANSITIONS[APPROVED] = []`).
    - An approved progress report can **never** be cancelled, reopened, edited, or deleted.
  - Concurrency Note on Slice 10 Mutations: `submitProgressReport` executes a CAS `updateMany` matching `status: DRAFT` directly on `progress_reports`. It does not touch `project.updatedAt`. Therefore, any linkage use case touching a progress report must explicitly lock the `progress_reports` row with `SELECT ... FOR UPDATE` before verifying its status.

### 2.2 Slice 12 — Project Planning & Milestones (`lib/milestones/`)
- **Prisma Entity:** `ProjectMilestone` (table `project_milestones`, lines 1051–1094 of `prisma/schema.prisma`).
  - Fields: `id`, `projectId`, `title`, `description`, `targetDate` (`@db.Date`), `achievedAt` (`@db.Timestamptz`), `status` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `orderIndex`, `createdById`, `updatedById`, `deletedAt` (`DateTime? @db.Timestamptz`).
  - Soft-Deletion Rule: Allowed only when status is `PLANNED` (`deleteMilestone`).
  - Management Authority: Created, updated, reordered, cancelled, and completed **exclusively by Role.MANAGER** (`lib/permissions` `requireManager()`).
  - Concurrency Lock: `lockProjectForMilestoneMutation` in `lib/milestones/use-cases/internal-lock.ts` touches parent `Project.updatedAt` under `status IN [PLANNED, ACTIVE]`, acquiring a PostgreSQL Level 5 row lock.
  - Current Completion Logic: `lib/milestones/use-cases/complete-milestone.ts` validates ID, checks state transition, locks parent project, updates status to `COMPLETED` via CAS (`updateMany`), and creates `MILESTONE_COMPLETED` audit log.
  - **Deficiency to Address:** `completeMilestone` currently performs no evidence verification. It transitions to `COMPLETED` even if zero field reports or photos exist.

### 2.3 Wave 0 — Universal Attachment Infrastructure (`lib/attachments/`, @ `7615e91`)
- **Prisma Entity:** `Attachment` (table `attachments`, lines 1239–1293 of `prisma/schema.prisma`).
  - Polymorphic Reference: `ownerType: AttachmentOwnerType`, `ownerId: String`.
  - Existing Enum Values: `AttachmentOwnerType.PROGRESS_REPORT` is defined in `schema.prisma` line 146.
  - Existing Categories: `AttachmentCategory.PROGRESS_PHOTO` and `AttachmentCategory.EXECUTION_EVIDENCE` are defined in `schema.prisma` lines 155–156.
  - Void Tracking Fields: Voiding is tracked via `voidedAt DateTime? @db.Timestamptz`, `voidedById String?`, and `voidReason String?`. There is no separate `status` enum column on `Attachment`. Active attachments are identified strictly by `voidedAt IS NULL`.
  - Magic-Byte MIME Validation: Strict magic-byte detection in `lib/attachments/file-validation.ts` supporting `image/jpeg`, `image/png`, `image/webp`, and `application/pdf` with 10 MB maximum size.
  - Lifecycle Derivation: `lib/attachments/owner-access.ts` derives attachment lifecycle directly from parent status:
    - While parent `ProgressReport` is `DRAFT`: Authoring Engineer can upload, replace, or void attachments (`EDITABLE_DRAFT`).
    - While `SUBMITTED`: Attachments are locked (`LOCKED_IN_REVIEW`).
    - When `APPROVED`: Attachments transition to permanent, immutable archive (`IMMUTABLE_ARCHIVE`), barring any voiding or replacement.
  - Mutex Locking in `owner-access.ts`: When mutating attachments (`MUTATE_DRAFT`), `owner-access.ts` line 258 acquires `SELECT id FROM progress_reports WHERE id = ${ownerId} FOR UPDATE`, preventing race conditions with concurrent status transitions.
  - Storage Drivers: In-memory and local filesystem adapters operational in `lib/attachments/storage/`.

---

## 3. Detailed Functional Requirements & Business Rules

### 3.1 Requirement 1: Progress Report Evidence vs. Milestone Completion Evidence
Authoritative project documentation (`DESIGN_ADDENDUM_CR01_CR10_FINAL.md` §4.8 and `BD-17`) establishes a precise distinction between progress report authoring and milestone completion:
1. **Milestone Completion Gate (Authoritatively Enforced Hard Gate):**
   - Completing a milestone strictly requires at least one linked `APPROVED` progress report possessing at least one active (non-voided) visual attachment (`image/jpeg`, `image/png`, `image/webp`) in categories `PROGRESS_PHOTO` or `EXECUTION_EVIDENCE`.
   - Any completion attempt lacking this evidence must be blocked with `MILESTONE_EVIDENCE_MISSING`.
2. **Standalone Progress Report Lifecycle (Status: `NOT-DOCUMENTED` for Standalone Blocking):**
   - Authoritative Owner decisions establish that Engineers author progress reports and attach visual evidence.
   - However, authoritative decisions do not specify whether an unlinked standalone progress report *itself* is blocked from `SUBMITTED` or `APPROVED` if zero attachments are uploaded. In existing Slice 10, text-only reports are permitted.
   - **Governance Policy:** Introducing a hard blocking validation on standalone `submitProgressReport` or `approveProgressReport` is classified as `NOT-DOCUMENTED` and must not be implemented by assumption. Standalone progress reports continue to operate under existing Slice 10 rules. Only progress reports that are intended to evidence milestone completion must contain qualifying visual attachments.

### 3.2 Requirement 2: Mandatory Visual Evidence for Milestone Completion
1. **Non-Negotiable Policy (`BD-17`):** Visual evidence is mandatory for **every** project milestone completion.
2. **No Configurable Bypass:** Zero bypass booleans, zero emergency exemptions, and zero Manager overrides.
3. **Centralized Domain Policy:** The evidence evaluation logic is encapsulated in a pure, testable domain policy function:
   $$\text{evaluateMilestoneVisualEvidence}(\text{linkedReportsWithAttachments}) \longrightarrow \text{MilestoneEvidenceEvaluationResult}$$
   - Asserts that at least one linked report is in `APPROVED` status (`deletedAt === null`).
   - Asserts that this specific report contains at least one active (`voidedAt === null`), non-voided visual attachment (`image/jpeg`, `image/png`, `image/webp`) in category `PROGRESS_PHOTO` or `EXECUTION_EVIDENCE`.
   - Evaluates evidence strictly per report-attachment parent relationship, preventing cross-report attribution.
   - Returns a structured outcome containing exact qualifying IDs:
     ```typescript
     export interface MilestoneEvidenceEvaluationResult {
       sufficient: boolean;
       verifiedReportIds: string[];      // Strictly approved reports that ACTUALLY contain >= 1 qualified visual attachment
       verifiedAttachmentIds: string[];  // The exact qualifying visual attachment IDs
       verifiedAttachmentCount: number;
     }
     ```

### 3.3 Requirement 3: Database-Level Same-Project Enclosure via Composite Keys
To strictly enforce `AGENTS.md` §15 (database safety and relational invariants) without relying solely on application-layer checks, the database schema must guarantee that a progress report and a milestone belong to the same project:

1. **Composite Unique Constraints on Parents:**
   - In `ProgressReport`: `@@unique([id, projectId])`
   - In `ProjectMilestone`: `@@unique([id, projectId])`
2. **Composite Foreign Keys on Join Model `ProgressReportMilestone`:**
   - `report ProgressReport @relation(fields: [reportId, projectId], references: [id, projectId], onDelete: Restrict)`
   - `milestone ProjectMilestone @relation(fields: [milestoneId, projectId], references: [id, projectId], onDelete: Restrict)`
3. **Relational Invariant:**
   Because `projectId` is a single column in `ProgressReportMilestone` shared across both composite foreign keys, PostgreSQL's relational engine enforces:
   $$\text{ProgressReport.projectId} \equiv \text{ProgressReportMilestone.projectId} \equiv \text{ProjectMilestone.projectId}$$
   It is physically and mathematically impossible in PostgreSQL to insert a cross-project linkage, even if application validation were bypassed.

### 3.4 Requirement 4: Concurrency Protection & Strict Lock Ordering (Lock-Serialized Ordering)
To eliminate race conditions between report submission and milestone linkage:
1. **Understanding of Concurrency Outcome (Lock-Serialized Ordering):**
   Locking the progress report row does not mean linkage will always fail during concurrent execution; rather, it guarantees strict **Lock-Serialized Ordering** (row-lock serialization without requiring database-level `SERIALIZABLE` transaction isolation) between `linkProgressReportToMilestone` and `submitProgressReport`:
   - **Outcome A (`submitProgressReport` acquires lock first):** The report status transitions to `SUBMITTED`. When the Engineer's linkage transaction subsequently acquires the row lock, it reads `status === 'SUBMITTED'`, correctly failing with `INVALID_STATE_TRANSITION` because the report is no longer a `DRAFT`.
   - **Outcome B (`linkProgressReportToMilestone` acquires lock first):** The linkage transaction acquires the row lock, validates that the report is in `DRAFT`, inserts the linkage, and commits. When `submitProgressReport` subsequently acquires the row lock, it successfully transitions the report to `SUBMITTED`, with the report now properly linked to the milestone.
   Both serializable outcomes are valid, safe, and preserve business rules.
2. **Uniform Canonical Lock Order across Operations:**
   All operations touching both reports and milestones must acquire locks in identical hierarchy order:
   $$\text{Project (Level 5)} \longrightarrow \text{ProgressReport (Level 6)} \longrightarrow \text{ProjectMilestone (Level 6, sorted by ID ASC)}$$
   - Step 1: Call `lockProjectForMilestoneMutation(tx, projectId)` (Level 5 project lock).
   - Step 2: Acquire explicit exclusive row lock on the progress report (Level 6):
     ```sql
     SELECT id, status, created_by_id, project_id, deleted_at FROM progress_reports WHERE id = ${reportId} FOR UPDATE
     ```
   - Step 3: Evaluate live report status while holding the row lock based on the specific operation:
     - **For New Linkage Creation:**
       - Both roles: Assert `deleted_at IS NULL`.
       - If actor is `ENGINEER`: Assert `status === 'DRAFT'` and `created_by_id === actor.id`.
       - If actor is `MANAGER`: Assert `status !== 'CANCELLED'` (Manager cannot create a new link for a cancelled report).
     - **For Retaining Existing Linkage (No-op):**
       - Permitted for existing linkages (even if the report was later approved or cancelled, the existing link remains historically intact).
     - **For Unlinking an Existing Linkage:**
       - If actor is `ENGINEER`: Assert `status === 'DRAFT'`, `created_by_id === actor.id`, and `deleted_at IS NULL`.
       - If actor is `MANAGER`: Permitted for ANY linked report regardless of report status (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`).
   - Step 4: Acquire explicit exclusive row lock on the milestone(s) in deterministic `id ASC` order (Level 6):
     ```sql
     SELECT id, status, project_id, deleted_at FROM project_milestones WHERE id = ${milestoneId} FOR UPDATE
     ```
   - Step 5: Assert milestone `status IN ['PLANNED', 'IN_PROGRESS']` and `deleted_at IS NULL`.
   - Step 6: Execute idempotent linkage insert/no-op or unlink.
3. **Attachment Race Protection:**
   - Because `owner-access.ts` (line 258) also acquires `SELECT id FROM progress_reports WHERE id = ${ownerId} FOR UPDATE` during draft uploads, attachment mutations and report status transitions cannot execute concurrently.

### 3.5 Requirement 5: Unified Internal Linkage Service across Direct & Report Authoring Paths
To eliminate discrepancies between standalone linkage use cases and report authoring forms, all linkage and synchronization logic is encapsulated in a single internal domain service (`syncReportMilestoneLinkages`):

1. **Service Contract:**
   - Both `createProgressReportDraft` and `updateProgressReportDraft` delegate their milestone associations to `syncReportMilestoneLinkages`.
   - The standalone use cases (`linkProgressReportToMilestone`, `unlinkProgressReportFromMilestone`) also share the underlying validation and audit logic.
2. **Behavioral Semantics in Report Update (`updateProgressReportDraft`):**
   | `milestoneIds` Input Value | Executed Behavior |
   |---|---|
   | `undefined` (omitted) | **No change:** Existing linkages are left untouched. |
   | `[]` (empty array) | **Unlink all:** Removes all existing linkages, provided none point to a `COMPLETED` milestone. |
   | `['id1', 'id2']` (array) | **Synchronize:** Adds new linkages; removes omitted linkages. |
3. **Input Validation:**
   - Schema rejects duplicates upfront: `.refine(items => !items || new Set(items).size === items.length, { message: 'لا يجوز تكرار معرفات المحطات المرتبطة' })`
4. **Completed Milestone Linkage Immutability:**
   - If a progress report is currently linked to a `COMPLETED` milestone, any update that would remove, omit, or replace that linkage **must fail immediately** with `AppError('MILESTONE_COMPLETED_IMMUTABLE', 'لا يمكن تعديل أو فك ارتباط تقرير بمحطة مكتملة')`.
   - Freezing of completed milestone linkages takes precedence over draft report editing.
5. **Audit Trail Synchronization:**
   - Every linkage created during report authoring generates `MILESTONE_REPORT_LINKED` in `AuditLog`.
   - Every linkage removed during report authoring generates `MILESTONE_REPORT_UNLINKED` in `AuditLog`.

### 3.6 Requirement 6: Preservation of Linkage History in AuditLog on Unlink
Because `unlinkProgressReportFromMilestone` removes the active join row from `progress_report_milestones`, the `AuditLog` table serves as the permanent, immutable ledger of the relationship lifecycle:
1. **`MILESTONE_REPORT_LINKED` Audit Event:**
   Must record full creation context in `metadata`:
   ```typescript
   metadata: {
     linkageId: joinRow.id,
     projectId: joinRow.projectId,
     milestoneId: joinRow.milestoneId,
     reportId: joinRow.reportId,
     linkedById: actor.id,
     linkedAt: joinRow.linkedAt.toISOString(),
   }
   ```
2. **`MILESTONE_REPORT_UNLINKED` Audit Event:**
   Must record full historical context in `metadata`:
   ```typescript
   metadata: {
     linkageId: existingJoinRow.id,
     projectId: existingJoinRow.projectId,
     milestoneId: existingJoinRow.milestoneId,
     reportId: existingJoinRow.reportId,
     linkedById: existingJoinRow.linkedById,
     linkedAt: existingJoinRow.linkedAt.toISOString(),
     unlinkedById: actor.id,
     unlinkedAt: new Date().toISOString(),
   }
   ```
3. **Idempotency Rule:**
   If `linkProgressReportToMilestone` is called for a relationship that already exists, it is treated as a **no-op**: it returns the existing join record without creating a duplicate row and without writing a duplicate `MILESTONE_REPORT_LINKED` audit event.

### 3.7 Requirement 7: Milestone Soft-Deletion Protection (`deleteMilestone`)
Under Slice 12, a Manager may soft-delete a milestone in `PLANNED` status (`deleteMilestone`). To prevent orphaned linkages and preserve operational clarity:
1. **Linkage Check Guard in `deleteMilestone`:**
   Before setting `deletedAt = new Date()` on a `PLANNED` milestone, the use case checks:
   ```typescript
   const linkedReportsCount = await tx.progressReportMilestone.count({
     where: { milestoneId },
   });
   if (linkedReportsCount > 0) {
     throw new AppError(
       'MILESTONE_HAS_LINKED_REPORTS',
       'لا يمكن حذف المحطة لأنها مرتبطة بتقارير تقدم. يجب فك ارتباط جميع التقارير أولاً.',
     );
   }
   ```
2. **Operational Rationale:**
   Requiring explicit unlinking forces the Manager to record a conscious decision and creates verifiable `MILESTONE_REPORT_UNLINKED` audit entries rather than silently leaving dangling relationships.

### 3.8 Requirement 8: Failed-Completion Audit Transaction Strategy (Committed-Outcome)
If `completeMilestone` throws an `AppError` inside a standard transaction, PostgreSQL rolls back the transaction and erases any `MILESTONE_COMPLETION_BLOCKED` audit log. To guarantee audit trail persistence while preserving transactional safety:

1. **Transactional Execution:** Inside `prisma.$transaction`:
   - Acquire Level 5 lock: `await lockProjectForMilestoneMutation(tx, projectId)`.
   - Acquire Level 6 lock on milestone: verify `status IN [PLANNED, IN_PROGRESS]` and `deletedAt IS NULL`.
   - Query all linked `ProgressReportMilestone` records for `milestoneId`.
   - Query linked `ProgressReport` rows with attachments where `status === ProgressReportStatus.APPROVED` and `deletedAt === null`.
   - Query active visual attachments from `attachments` table where:
     - `ownerType === AttachmentOwnerType.PROGRESS_REPORT`
     - `ownerId IN (approvedReportIds)`
     - `voidedAt IS NULL`
     - `category IN [AttachmentCategory.PROGRESS_PHOTO, AttachmentCategory.EXECUTION_EVIDENCE]`
     - `mimeType IN ['image/jpeg', 'image/png', 'image/webp']`
   - Evaluate evidence via `evaluateMilestoneVisualEvidence`:
     - If `result.sufficient === false`:
       - Write `AuditLog` entry with action `'MILESTONE_COMPLETION_BLOCKED'`, recording milestone ID, project ID, reason, and evaluated counts.
       - **Return failure outcome:** `{ success: false, code: 'MILESTONE_EVIDENCE_MISSING', message: 'لا يمكن اعتماد إنجاز المحطة بدون تقرير تقدم معتمد يحتوي على أدلة بصرية مؤهلة (صور)' }`.
     - If `result.sufficient === true`:
       - Update milestone using **CAS `updateMany`** (preserving CAS concurrency pattern):
         ```typescript
         const updateResult = await tx.projectMilestone.updateMany({
           where: { id: milestoneId, status: { in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS] }, deletedAt: null },
           data: { status: MilestoneStatus.COMPLETED, achievedAt: new Date(), updatedById: actor.id },
         });
         if (updateResult.count === 0) throw new AppError('INVALID_STATE_TRANSITION', 'تعذر اعتماد إنجاز المحطة لتغير حالتها متزامناً');
         ```
       - Write `AuditLog` entry with action `'MILESTONE_COMPLETED'`, recording the exact qualifying identifiers:
         ```typescript
         metadata: {
           projectId: existing.projectId,
           previousStatus: existing.status,
           newStatus: MilestoneStatus.COMPLETED,
           achievedAt: achievedAt.toISOString(),
           verifiedReportIds: result.verifiedReportIds,         // Strictly reports that supplied >= 1 qualifying photo
           verifiedAttachmentIds: result.verifiedAttachmentIds, // Exact visual attachment IDs
           verifiedAttachmentCount: result.verifiedAttachmentCount,
         }
         ```
       - **Return success outcome:** `{ success: true, milestoneId }`.
2. **Post-Commit Error Elevation:**
   - Once the transaction successfully commits to PostgreSQL:
   - If `result.success === false`: Throw `new AppError(result.code, result.message)`.
   - If `result.success === true`: Fetch and return the updated `ProjectMilestoneDTO`.
3. **Guarantees:**
   - On evidence failure: `MILESTONE_COMPLETION_BLOCKED` is permanently committed in PostgreSQL; milestone status remains unchanged; client receives HTTP 400 `AppError`.
   - On evidence success: Milestone completion and `MILESTONE_COMPLETED` audit log commit atomically.

### 3.9 Requirement 9: Precise Qualified Evidence Metric Definition
In DTOs and UI badges, evidence counts are defined with strict precision:
```typescript
approvedReportsCount: number;      // Count of linked reports with status === APPROVED and deletedAt === null
visualAttachmentsCount: number;    // Count of QUALIFIED visual attachments:
                                   // linked to this milestone via an APPROVED report,
                                   // voidedAt === null, category in [PROGRESS_PHOTO, EXECUTION_EVIDENCE],
                                   // mimeType in [image/jpeg, image/png, image/webp]
hasSufficientEvidence: boolean;    // approvedReportsCount >= 1 && visualAttachmentsCount >= 1
```
Photos attached to `DRAFT` or `SUBMITTED` reports are strictly excluded from `visualAttachmentsCount`.

---

## 4. Data Architecture & Prisma Schema Changes

### 4.1 Join Model: `ProgressReportMilestone`
In `prisma/schema.prisma`, add the join model establishing the composite-key many-to-many relationship:

```prisma
/// Join table linking Site Engineer Progress Reports to Project Milestones (CR-08 / BD-17).
/// Provides verifiable operational and visual evidence for milestone completion.
/// Enforces database-level project enclosure: report and milestone must share the same projectId.
/// Referential integrity: Restrict on all foreign keys to prevent cascade deletion of historical records.
model ProgressReportMilestone {
  id          String           @id @default(cuid())

  /// Project reference for coarse and database-level project boundary enforcement.
  projectId   String
  project     Project          @relation(fields: [projectId], references: [id], onDelete: Restrict)

  /// Composite FK to the progress report containing narrative and visual attachments.
  reportId    String
  report      ProgressReport   @relation(fields: [reportId, projectId], references: [id, projectId], onDelete: Restrict)

  /// Composite FK to the project milestone being evidenced.
  milestoneId String
  milestone   ProjectMilestone @relation(fields: [milestoneId, projectId], references: [id, projectId], onDelete: Restrict)

  /// User who established the linkage (Engineer when authoring, or Manager).
  linkedById  String
  linkedBy    User             @relation("MilestoneLinker", fields: [linkedById], references: [id], onDelete: Restrict)

  /// Timestamp when the linkage was created.
  linkedAt    DateTime         @default(now()) @db.Timestamptz

  /// Natural uniqueness: a report cannot be linked to the same milestone more than once.
  @@unique([reportId, milestoneId])

  /// Milestone index for evidence-gate queries (reportId covered by composite unique index).
  @@index([milestoneId])
  @@index([projectId])
  @@map("progress_report_milestones")
}
```

### 4.2 Modifications to Existing Models

#### In `model ProjectMilestone`:
```prisma
model ProjectMilestone {
  // ... existing fields ...

  /// Linked progress reports providing narrative and visual evidence (CR-08)
  progressReports ProgressReportMilestone[]

  // ... existing indexes ...

  /// Composite unique constraint supporting relational project enclosure in ProgressReportMilestone
  @@unique([id, projectId])
  @@map("project_milestones")
}
```

#### In `model ProgressReport`:
```prisma
model ProgressReport {
  // ... existing fields ...

  /// Linked project milestones that this report provides evidence for (CR-08)
  milestones ProgressReportMilestone[]

  // ... existing indexes ...

  /// Composite unique constraint supporting relational project enclosure in ProgressReportMilestone
  @@unique([id, projectId])
  @@map("progress_reports")
}
```

#### In `model Project`:
```prisma
model Project {
  // ... existing fields ...

  progressReportMilestones ProgressReportMilestone[]
}
```

#### In `model User`:
```prisma
model User {
  // ... existing fields ...

  milestoneLinkagesCreated ProgressReportMilestone[] @relation("MilestoneLinker")
}
```

---

## 5. Security, Authorization & Separation of Duties Matrix

| Operation / Use Case | Allowed Roles | Invariants & Preconditions | Enforced Boundary |
|---|---|---|---|
| **Author Progress Report** | `ENGINEER` | Must have active `ProjectAssignment` on target project (`BD-03`). | Domain + DB Guard |
| **Upload Visual Attachment** | `ENGINEER` | Author of draft report; report in `DRAFT`; image magic-bytes (`JPEG`, `PNG`, `WEBP`); $\le 10$ MB; category `PROGRESS_PHOTO` or `EXECUTION_EVIDENCE`. Acquires `SELECT FOR UPDATE` on report. | `owner-access.ts` |
| **Approve Progress Report** | `MANAGER` | Report in `SUBMITTED`; approver $\ne$ creator (`creator \ne approver`). Report transitions to strictly immutable `APPROVED`. | `approve-progress-report.ts` |
| **Create / Edit Milestone** | `MANAGER` | Milestone in `PLANNED` or `IN_PROGRESS`; target date valid calendar date. | `requireManager()` |
| **Delete Milestone** | `MANAGER` | Milestone in `PLANNED`; must have zero linked progress reports (`MILESTONE_HAS_LINKED_REPORTS`). | `delete-milestone.ts` |
| **Link Report to Milestone** | `ENGINEER`, `MANAGER` | **Engineer:** Active assignment on project; report authored by self (`createdById === actor.id`), in `DRAFT` status, `deletedAt IS NULL`.<br>**Manager:** Report belongs to project, status $\ne$ `CANCELLED`, `deletedAt IS NULL`.<br>**Both:** Same project (`report.projectId === milestone.projectId`); milestone not `COMPLETED`, not `CANCELLED`, `deletedAt IS NULL`. Locked under `Project → ProgressReport → ProjectMilestone`. | Transaction Guard |
| **Unlink Report from Milestone**| `ENGINEER`, `MANAGER` | **Engineer:** Active assignment on project; report authored by self, in `DRAFT` status, `deletedAt IS NULL`.<br>**Manager:** Permitted on any linked report regardless of report status (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`).<br>**Both:** Target milestone must be in `PLANNED` or `IN_PROGRESS` (`status NOT IN [COMPLETED, CANCELLED]`) and `deletedAt IS NULL`. Locked under `Project → ProgressReport → ProjectMilestone`. | Transaction Guard |
| **Complete Milestone** | `MANAGER` | Milestone in `[PLANNED, IN_PROGRESS]`; $\ge 1$ linked `APPROVED` report; $\ge 1$ active qualified visual attachment. Mandatory evidence gate. | `complete-milestone.ts` |
| **Reopen / Void Attachments on Completed Milestone** | **NOBODY** | Approved report attachments are in `IMMUTABLE_ARCHIVE`; completed milestones cannot be unlinked. | Domain Invariant |

---

## 6. Implementation Plan & Detailed Tasks

### 6.1 Task 1: Prisma Schema Migration & CLI Verification
1. Update `prisma/schema.prisma` with:
   - `@@unique([id, projectId])` on `ProgressReport`
   - `@@unique([id, projectId])` on `ProjectMilestone`
   - `ProgressReportMilestone` model with composite foreign keys and `onDelete: Restrict`
2. **Mandatory CLI Verification Step:**
   Execute Prisma validation and generate the migration draft:
   ```bash
   npx prisma validate
   npx prisma migrate dev --create-only --name cr08_visual_progress_milestone_linkage
   ```
3. Inspect the generated SQL migration file to confirm:
   - Composite foreign keys `[reportId, projectId]` and `[milestoneId, projectId]` are created.
   - `ON DELETE RESTRICT` is present on foreign keys.
   - No duplicate indexes or constraints are generated.
4. Apply migration: `npx prisma migrate dev`.
5. Run: `npm run db:validate`.

### 6.2 Task 2: Domain Layer & Application Services (`lib/milestones/`)
1. **Create Pure Domain Policy:**
   - `lib/milestones/evidence-policy.ts`:
     - Pure function `evaluateMilestoneVisualEvidence` evaluating linked reports and qualified attachments.
     - Returns `MilestoneEvidenceEvaluationResult` with exact `verifiedReportIds`, `verifiedAttachmentIds`, and `verifiedAttachmentCount`.
2. **Create Lock Coordinator & Unified Internal Linkage Service (`lib/milestones/use-cases/internal-linkage.ts`):**
   - **Lock Coordinator (`acquireMilestoneLinkageLocks`):**
     - Single internal helper responsible for acquiring locks once in canonical hierarchy order:
       1. Level 5: `await lockProjectForMilestoneMutation(tx, projectId)`.
       2. Level 6: If `reportId` exists, `SELECT id, status, created_by_id, project_id, deleted_at FROM progress_reports WHERE id = ${reportId} FOR UPDATE`.
       3. Level 6: Union of target and currently linked milestone IDs sorted in `id ASC` order:
          `SELECT id, status, project_id, deleted_at FROM project_milestones WHERE id IN (...) ORDER BY id ASC FOR UPDATE`.
   - **Synchronization Service (`syncReportMilestoneLinkages`):**
     - Function `syncReportMilestoneLinkages(tx, { actor, projectId, reportId, targetMilestoneIds })`.
     - Executes validation and synchronization **inside** the locked transaction without re-acquiring locks (eliminates duplicate locks or multiple `project.updatedAt` touches).
     - Differentiates status checks:
       - New links: requires Engineer draft or Manager active report (`status !== 'CANCELLED'`).
       - Retained links: allowed as idempotent no-ops.
       - Unlinks: Engineer draft only; Manager permitted for any status (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`).
     - Guards completed milestone immutability (`MILESTONE_COMPLETED_IMMUTABLE`).
     - Inserts new linkages and removes omitted linkages, emitting `MILESTONE_REPORT_LINKED` and `MILESTONE_REPORT_UNLINKED` audit events.
3. **Create Public Standalone Link/Unlink Use Cases:**
   - `lib/milestones/use-cases/link-progress-report.ts`:
     - Invokes `acquireMilestoneLinkageLocks`, then delegates to `syncReportMilestoneLinkages`.
   - `lib/milestones/use-cases/unlink-progress-report.ts`:
     - Invokes `acquireMilestoneLinkageLocks`, validates unlinking rules (§5), deletes join record, and writes `MILESTONE_REPORT_UNLINKED`.
4. **Upgrade `delete-milestone.ts`:**
   - Add check: If `progressReportMilestone.count > 0`, throw `MILESTONE_HAS_LINKED_REPORTS`.
5. **Upgrade `complete-milestone.ts` with Committed-Outcome Strategy:**
   - Implement §3.8:
     - On failure: writes `MILESTONE_COMPLETION_BLOCKED`, commits transaction, then throws `AppError('MILESTONE_EVIDENCE_MISSING', ...)`.
     - On success: CAS updates milestone to `COMPLETED`, writes `MILESTONE_COMPLETED` with verified identifiers from `evaluateMilestoneVisualEvidence`.
6. **Update Milestone Queries & Mappers:**
   - `lib/milestones/mappers.ts`: Update `MILESTONE_INCLUDE` to include linked reports and active attachment summaries.
   - `lib/milestones/types.ts`: Extend `ProjectMilestoneDTO` with:
     ```typescript
     linkedReportsCount: number;
     approvedReportsCount: number;
     visualAttachmentsCount: number;
     hasSufficientEvidence: boolean;
     ```
   - `lib/milestones/queries/get-project-milestones.ts`: Include evidence counts in milestone listings so UI displays real-time readiness.

### 6.3 Task 3: Progress Report Authoring Integration (`lib/progress-reports/`)
1. **Update Validation Schemas:**
   - `lib/validation/schemas/progress-report.ts`:
     - Add `milestoneIds: z.array(z.string().cuid()).optional()` with uniqueness refinement (`new Set(items).size === items.length`).
2. **Update Progress Report Use Cases & Execution Lock Order:**
   - **`updateProgressReportDraft` Execution Sequence:**
     - When `milestoneIds !== undefined`, the transaction execution sequence must strictly be:
       1. Acquire locks once via lock coordinator: `await acquireMilestoneLinkageLocks(tx, { projectId: existing.projectId, reportId, targetMilestoneIds: milestoneIds })`.
       2. Delegate to `syncReportMilestoneLinkages` to validate boundaries and synchronize linkages.
       3. Update report entity fields and write report update audit log in the same transaction.
     - *Performance Guard:* When `milestoneIds === undefined` (omitted), `acquireMilestoneLinkageLocks` is NOT called, preserving fast-path concurrency for text-only draft edits.
   - **`createProgressReportDraft` Execution Sequence:**
     - If `milestoneIds` is provided with $\ge 1$ elements:
       1. Acquire Level 5 project lock: `await lockProjectForMilestoneMutation(tx, projectId)`.
       2. Insert the new `ProgressReport` row.
       3. Lock target milestones in `id ASC` order: `SELECT ... FROM project_milestones WHERE id IN (...) ORDER BY id ASC FOR UPDATE`.
       4. Delegate to `syncReportMilestoneLinkages` to create linkages and audit events.
       5. Write report creation audit log in the same transaction.
3. **Query Expansion:**
   - `lib/progress-reports/queries/get-progress-report.ts`:
     - Include linked milestones in detailed view DTO.

### 6.4 Task 4: User Interface & Arabic/RTL Presentation
1. **Milestone Management Views (`app/(manager)/projects/[projectId]/milestones/`):**
   - **Milestone Table / Cards:**
     - Evidence status badge:
       - Green badge: `أدلة بصرية معتمدة (N صور مؤهلة)` when `hasSufficientEvidence === true`.
       - Amber badge: `بانتظار اعتماد تقارير التقدم` when reports are linked but not yet approved.
       - Red badge: `لا توجد أدلة بصرية معتمدة` when zero qualified photos exist.
     - "Mark Completed" (`إكمال المحطة`) action button:
       - Displays completion dialog showing linked reports and qualified photo previews.
       - Explanatory alert when evidence criteria are unmet.
2. **Progress Report Authoring Form (`components/progress-reports/progress-report-form.tsx`):**
   - Multi-select dropdown allowing Engineer to tag active project milestones (`المحطات المستهدفة بالتقرير`).
   - Callout note: `الصور المرفقة بالتقرير تؤهل المحطات المرتبطة للاعتماد فقط بعد مراجعة التقرير واعتماده من قبل المدير`.

---

## 7. Automated Testing Plan

Following `AGENTS.md` §20, CR-08 implementation must include tests across all testing tiers:

### 7.1 Unit Tests (Vitest — `tests/unit/lib/`)
1. `milestone-evidence-policy.test.ts`:
   - Pure function tests for `evaluateMilestoneVisualEvidence`:
     - 0 reports $\rightarrow$ `sufficient: false`.
     - 1 unapproved report $\rightarrow$ `sufficient: false`.
     - 1 approved report with 0 attachments $\rightarrow$ `sufficient: false`.
     - 1 approved report with 1 PDF document only $\rightarrow$ `sufficient: false` (requires visual image).
     - 1 approved report with 1 voided image (`voidedAt !== null`) $\rightarrow$ `sufficient: false`.
     - 1 approved report with 1 active JPEG/PNG/WebP image $\rightarrow$ `sufficient: true`, returning exact report ID and attachment ID.
     - 2 approved reports where only Report A has photos $\rightarrow$ returns only Report A in `verifiedReportIds`.
2. `milestone-validation.test.ts`:
   - Schema validation tests for duplicate `milestoneIds` rejection and link/unlink payloads.

### 7.2 Integration Tests (Vitest — `tests/integration/`)
1. `milestone-evidence-gate.test.ts`:
   - **Committed-Outcome Verification (Real Database Commit):**
     - Test executes `completeMilestone` without an outer rolling-back transaction.
     - Test 1: Milestone without linked reports $\rightarrow$ throws `MILESTONE_EVIDENCE_MISSING`; test then queries `prisma.auditLog` to assert that `MILESTONE_COMPLETION_BLOCKED` row actually committed and persisted in PostgreSQL.
     - Test 2: Milestone linked to `DRAFT` or `SUBMITTED` report $\rightarrow$ throws `MILESTONE_EVIDENCE_MISSING`; asserts blocked audit log committed.
     - Test 3: Milestone linked to `APPROVED` report with no attachments $\rightarrow$ throws `MILESTONE_EVIDENCE_MISSING`; asserts blocked audit log committed.
     - Test 4: Milestone linked to `APPROVED` report with 2 qualified photos $\rightarrow$ transitions to `COMPLETED`, sets `achievedAt`, commits `MILESTONE_COMPLETED` audit log with exact `verifiedReportIds`, `verifiedAttachmentIds`, and `verifiedAttachmentCount`.
     - Test 5: Attempting to link or unlink reports on a `COMPLETED` milestone $\rightarrow$ fails with `MILESTONE_COMPLETED_IMMUTABLE`.
     - Test Cleanup: Test cleanup deletes `progress_report_milestones` first (respecting `onDelete: Restrict`), then reports, milestones, projects, and users.
2. `milestone-report-linkage-authorization.test.ts`:
   - Test cross-project linking $\rightarrow$ blocked at database composite FK level and application guard.
   - Test unassigned Engineer linking $\rightarrow$ fails with `FORBIDDEN`.
   - Test Engineer linking another Engineer's report or submitted report $\rightarrow$ fails with `FORBIDDEN`.
   - Test Manager linking on any active project $\rightarrow$ succeeds.
   - Test Manager unlinking an approved report from an incomplete milestone $\rightarrow$ succeeds, generating `MILESTONE_REPORT_UNLINKED`.
3. `milestone-soft-delete-guard.test.ts`:
   - Test Manager attempting `deleteMilestone` on `PLANNED` milestone with linked report $\rightarrow$ fails with `MILESTONE_HAS_LINKED_REPORTS`.
   - Test unlinking the report, then re-calling `deleteMilestone` $\rightarrow$ succeeds.
4. `milestone-linkage-sync.test.ts` (Comprehensive 7-Case Linkage Matrix):
   - Case 1: Update report with `milestoneIds: undefined` $\rightarrow$ existing linkages remain unchanged; zero project lock contention.
   - Case 2: Update report with `milestoneIds: []` $\rightarrow$ unlinks all permitted milestones, emitting `MILESTONE_REPORT_UNLINKED` audit logs.
   - Case 3: Update report with new ID list $\rightarrow$ synchronizes linkages (adds new, removes omitted), emitting corresponding audit events.
   - Case 4: Update report attempting to omit or unlink a `COMPLETED` milestone $\rightarrow$ fails with `MILESTONE_COMPLETED_IMMUTABLE`.
   - Case 5: Retaining an existing link $\rightarrow$ executes as idempotent no-op without emitting duplicate `MILESTONE_REPORT_LINKED`.
   - Case 6: Create report with `milestoneIds` $\rightarrow$ creates linkages and audit logs inside the creation transaction under project lock.
   - Case 7: Manager unlinks a `CANCELLED` report from a `PLANNED` or `IN_PROGRESS` milestone $\rightarrow$ succeeds, emitting `MILESTONE_REPORT_UNLINKED`.
5. `milestone-http-error-propagation.test.ts`:
   - Verifies that `completeMilestone` throwing `AppError('MILESTONE_EVIDENCE_MISSING', ...)` propagates through the central Next.js API / Server Action error handler to return HTTP 400 with the exact machine-readable error code.

### 7.3 Concurrency & Idempotency Tests
1. Concurrent `completeMilestone` attempts under Level 5 project lock:
   - Proves CAS `updateMany` and project lock prevent duplicate completions or duplicate audit logs.
2. Concurrent `linkProgressReport` and `submitProgressReport` (Lock-Serialized Ordering Verification):
   - Tests both valid serializable outcomes:
     - Outcome A: submission executes first $\rightarrow$ linkage fails with state error.
     - Outcome B: linkage executes first $\rightarrow$ report linked while `DRAFT`, then successfully submitted.
3. Idempotent Linkage:
   - Proves re-submitting an existing linkage executes as a no-op without creating duplicate `MILESTONE_REPORT_LINKED` audit logs.

---

## 8. Definition of Done Checklist for CR-08

Before this feature can be approved for merge, it must fulfill all items from Roadmap Section J:

- [ ] **Architecture:** Clean layer separation maintained; no database logic in React components; no direct Prisma queries from UI.
- [ ] **Mandatory Evidence:** Visual evidence is mandatory for all milestone completions; zero bypass toggles or exemptions.
- [ ] **Database Project Enclosure:** Composite foreign keys `[reportId, projectId]` and `[milestoneId, projectId]` on `ProgressReportMilestone` verified via Prisma CLI.
- [ ] **Referential Safety:** `onDelete: Restrict` on all join table foreign keys; soft-delete protection in `deleteMilestone`.
- [ ] **Concurrency Locking:** Level 5 project lock + Level 6 progress report row lock (`FOR UPDATE`) + milestone row lock in strict canonical order (`Project → Report → Milestone`).
- [ ] **Unified Linkage Service:** `syncReportMilestoneLinkages` shares identical business rules and audit trails across direct and report-authoring paths.
- [ ] **Committed-Outcome Audit:** `MILESTONE_COMPLETION_BLOCKED` audit log is verified as committed in PostgreSQL upon failed completion.
- [ ] **Audit Trail Metadata:** `MILESTONE_COMPLETED` metadata contains exact `verifiedReportIds` (reports that actually provided qualified photos), `verifiedAttachmentIds`, and `verifiedAttachmentCount`. Full relationship history captured on link/unlink.
- [ ] **Typecheck:** `npm run typecheck` passes with zero errors and no unexplained `any`.
- [ ] **Lint & Format:** `npm run lint` and `npm run format:check` pass cleanly.
- [ ] **Unit Tests:** `npm test` passes; unit test coverage for `lib/milestones/` and `lib/progress-reports/` exceeds 80%.
- [ ] **Integration Tests:** Evidence gate lifecycle tests verify all rejection and approval branches with live database assertions.
- [ ] **Negative Security Tests:** IDOR prevention, cross-project rejection, and unassigned Engineer blocking verified.
- [ ] **Operational Decoupling:** Verified that milestone completion creates zero financial records and triggers zero Owner billing claims (`OD-06D-1`).
- [ ] **RTL Arabic UI:** Milestone evidence badges, photo previews, and completion dialog render cleanly with Arabic typography and logical CSS properties.
- [ ] **Git Integrity:** `git diff --check` passes with zero whitespace or conflict errors.
