# BUSINESS LOGIC CHANGE — IMPACT & ARCHITECTURE REVIEW
## Construction Control System — Change Requests CR-01 through CR-10
### Phase A (Repository Inspection) + Phase B (CR Impact Analysis)

> **Document Status:** WAITING FOR DESIGN APPROVAL  
> **Date:** 2026-10-01  
> **Authoritative Specification:** System Operational Specification v2.0 & Change Requests Log v2.0  
> **Engineering Contract:** AGENTS.md v1.2.0  
> **Current Baseline:** Slices 1–17 (Production-Ready)  
> **Rule Applied:** NO CODE CHANGES MADE. NO MIGRATIONS CREATED. NO TESTS MODIFIED.

---

## 1. EXECUTIVE SUMMARY

The Construction Control platform has completed Vertical Slices 1 through 17. The current system provides a robust Management Control Layer characterized by strict role-based authorization (Manager, Engineer, Accountant, Purchasing), append-only financial audit trails, exact Decimal financial arithmetic (SAR), pessimistic concurrency locking, and deterministic lifecycle state machines.

The business-logic change program (CR-01 through CR-10) represents a significant evolutionary step based on the Operational Specification v2.0:
1. **Three New Financial/Operational Domains**: Subcontractor Nominations (CR-01), Material Receiving Notes (CR-05), and Equipment Timesheets (CR-06).
2. **Two New Governance Domains**: Variation Orders (CR-07) and Project Cash Flow / Owner Inflows (CR-10).
3. **Three Core Domain Redesigns**:
   - Subcontractor Billing (CR-02) evolves from an Accountant-only lump sum into a 3-party workflow (Engineer BOQ $\rightarrow$ Accountant Audit $\rightarrow$ Manager Approval).
   - Temporary Custody (CR-03) splits into requested vs. disbursed semantics and links cash advances to subcontractor billing deductions.
   - Project Budgets (CR-09) transition from rigid hard stops to soft ceilings with Manager exception overrides, inter-line transfers, and budget revisions.
4. **Two Field Capture Expansions**: Attendance-based Site Labor Sheets (CR-04) and Mandatory Visual Progress / Milestone Linkage (CR-08).

### Architectural Principle
**CR-01 through CR-10 cannot and must not be implemented in a single monolithic patch.** Doing so would create cross-domain instability and destroy existing test contracts. We propose a verified 4-wave rollout across Slices 18 through 28, beginning with unified Attachment Infrastructure (Slice 18), followed by Subcontractor Core Workflows (Slices 19–22), Field Operational Capture (Slices 23–26), and Financial Governance (Slices 27–28).

---

## 2. CURRENT ARCHITECTURE BASELINE

### 2.1 Domain Layer Inventory

| Domain Module | File Path | Lifecycle States | Key Use Cases | Current Invariants |
|---|---|---|---|---|
| **Budget** | `lib/budget/` | 5 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `SUPERSEDED`) | 7 use cases | Manager-managed; lines strictly immutable once approved; `SUPERSEDED` state unused. |
| **Expense** | `lib/expenses/` | 4 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`) | 6 use cases | Engineers/Accountants submit; Manager approves; hard stop on budget overrun. |
| **Commitment** | `lib/commitments/` | 4 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`) | 8 use cases | Purchasing-authored only; encumbers budget line; strictly immutable once approved. |
| **Custody** | `lib/custodies/` | 9 states (from `DRAFT` to `CLOSED`) | 12 use cases | Engineer custodian; single `amount` field; settled via linked expenses or cash return. |
| **Subcontractor Billing** | `lib/subcontractor-billings/` | 5 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`) | 9 use cases | Accountant-authored only; flat `grossAmount`; certified against commitment ceiling only. |
| **Payroll** | `lib/payroll/` | 5 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`) | 9 use cases | Accountant-authored only; flat lump-sum monthly worker cost; no attendance breakdown. |
| **Progress Report** | `lib/progress-reports/` | 5 states (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`) | 8 use cases | Engineer-authored; narrative text and percentage only; no attachments. |
| **Project Assignment** | `lib/project-team/` | 2 states (`ACTIVE`, `INACTIVE`) | 6 use cases | Scopes Engineer access to designated projects. |
| **Project Milestone** | `lib/milestones/` | 4 states (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) | 9 use cases | Manager-managed milestones; completion has no visual evidence prerequisite. |

### 2.2 Canonical Budget Exposure Formula (`lib/custodies/calculations.ts`)

```
TotalActiveExposure =
    ApprovedCommitments
  + DirectActualSpend (APPROVED expenses without custodyId)
  + CustodyActualSpend (APPROVED expenses with custodyId)
  + OutstandingCustodies (ISSUED/PARTIALLY_SETTLED: amount - settled - returned)
  + ApprovedPayroll

AvailableBalance = AuthorizedAmount - TotalActiveExposure

TotalPendingExposure =
    PendingCommitments (SUBMITTED)
  + PendingDirectExpenses (SUBMITTED)
  + PendingCustodies (SUBMITTED)
  + PendingPayroll (SUBMITTED)

ProjectedBalance = AvailableBalance - TotalPendingExposure
```

> **Core Financial Invariant:** Subcontractor billings certify progress against a Commitment. They encumber the Commitment ceiling, NOT the BudgetLine exposure directly (avoiding double-counting).

### 2.3 Authorization & Security Matrix
- Coarse protection: Next.js middleware and route group layouts (`(manager)`, `(engineer)`, `(accountant)`, `(purchasing)`).
- Fine-grained protection: `lib/permissions/guards.ts` (`requireAuth`, `requireRole`, `requireManager`) and `lib/permissions/policies.ts` (40+ pure policy functions).
- Separation of duties: Creator/submitter cannot approve their own financial records.

### 2.4 Audit Logging
Every state mutation and approval writes to `audit_logs` inside the exact same `prisma.$transaction`. Audit logs are strictly append-only and never deleted.

---

## 3. REQUIRED CHANGE MATRIX (CR-01 TO CR-10)

| CR | Domain | Existing Logic | Required Logic | Schema Change | Existing Slice Affected | Risk | Proposed Implementation Slice |
|---|---|---|---|---|---|---|---|
| **CR-01** | Subcontractor Nomination | Purchasing officer creates commitment directly; Engineer has no nomination role | Engineer creates nomination; Manager approves; converts to Subcontractor Commitment | New `SubcontractorNomination` model, `NominationStatus` enum, `commitments.nominationId` | Slice 5 (Commitments) | Low-Medium (additive, separates duties) | Slice 19 |
| **CR-02** | Field Subcontractor Billing (BOQ) | Accountant creates flat lump-sum billing; no lines, no deductions, no audit phase | Engineer creates BOQ billing; Accountant audits deductions; Manager approves Net Payable | New `SubcontractorBillingLine`, `BillingDeduction`, `AUDITED` enum status, fields on billing | Slice 7 (Subcontractor Billings) | High (state machine rewrite, role migration) | Slice 22 |
| **CR-03** | Temporary Custody Redesign | Single `amount` field for request & disbursement; no subcontractor advance linkage | `requestedAmount` vs `disbursedAmount`; custody advances create subcontractor debt | Add `disbursedAmount` to `Custody`; new `CustodySubcontractorAdvance` model | Slice 6 (Custody) | Medium-High (exposure formula update, backfill) | Slice 21 |
| **CR-04** | Site Labor Sheets | Accountant enters monthly lump-sum payroll; Engineer has zero labor access | Engineer creates attendance labor sheets; Accountant audits; Manager approves | New `LaborSheet`, `LaborSheetLine` models, `LaborSheetStatus` enum | Slice 8 (Payroll) | Medium (new aggregate, preserves existing payroll) | Slice 23 |
| **CR-05** | Material Receiving Note (MRN) | Materials purchased & paid with no field receiving verification gate | Engineer submits MRN with signed delivery note; material payments blocked without approved MRN | New `MaterialReceivingNote` model, `MRNStatus` enum, optional `expenses.commitmentId` | Slice 4 (Expenses), Slice 5 (Commitments) | Medium-High (hard gate blocks expense approval) | Slice 24 |
| **CR-06** | Equipment Timesheets | Equipment recorded as generic lump-sum expenses; no hours or meter tracking | Daily equipment timesheets by Engineer; payable = approved hours $\times$ hourly rate | New `Equipment`, `EquipmentContract`, `EquipmentTimesheet`, `EquipmentTimesheetEntry` | Slice 4 (Expenses) | Low-Medium (additive domain) | Slice 25 |
| **CR-07** | Variation Orders | Commitment amount strictly fixed; billing cannot exceed original contract value | Engineer requests VO; Manager approves; expands effective billing ceiling without mutating contract | New `VariationOrder` model, `VariationOrderStatus` enum, `billingLine.variationOrderId` | Slice 5 (Commitments), Slice 7 (Billings) | Medium (ceiling calculation extension) | Slice 20 |
| **CR-08** | Visual Progress & Milestones | Progress reports are text-only; milestone completion requires no evidence | Reports require photo evidence; milestone completion blocked without approved visual report | New `Attachment` model, `ProgressReportMilestone` join table, `AttachmentEntityType` | Slice 10 (Progress Reports), Slice 12 (Milestones) | Low (infrastructure in Slice 18; gate in Slice 26) | Slice 18 (Infra), Slice 26 (Milestones) |
| **CR-09** | Flexible Budgets & Transfers | Hard stop on budget overruns; lines strictly immutable; no inter-line transfers | Soft limit flags over-budget for Manager reason; inter-line transfers; budget revisions (Rev 1, 2) | New `BudgetTransfer` model, `isContingencyReserve`, `isOverBudget` & reason on financial records | Slice 3 (Budget), Slices 4, 5, 6, 7, 8 (all approval use cases) | Very High (global behavior change across all domains) | Slice 27 |
| **CR-10** | Project Cash Flow & Inflows | System tracks outflows only; zero revenue, owner payment, or capital tracking | Tracks Owner Billings, Owner Payments, Capital Injections, Liquidity, and Profitability | New `OwnerBilling`, `OwnerPayment`, `CapitalInjection` models, status enums | Slice 9 (Dashboard), Slice 13 (Op Dashboard) | Low-Medium (isolated new financial domain) | Slice 28 |

---

## 4. CR-01 — SUBCONTRACTOR NOMINATION IMPACT ANALYSIS

### 4.1 Current Implementation
In Slice 5, purchasing commitments are authored exclusively by `Role.PURCHASING` (`create-commitment-draft.ts` line 34: `requireRole(Role.PURCHASING)`). The policy `canCreateCommitment` explicitly denies all other roles. No concept of nomination, pre-qualification, or field contractor proposal exists in the schema.

### 4.2 Required Target Implementation
`Role.ENGINEER` creates a `SubcontractorNomination` proposal for an assigned active project.
- Data captured: Subcontractor trade name, phone/contact, specialty, proposed scope, proposed BOQ category rates (JSON), and estimated contract amount.
- Lifecycle: `DRAFT -> SUBMITTED -> APPROVED / REJECTED`.
- Upon `Role.MANAGER` approval: The system converts the nomination into an official `Commitment` with `BudgetCategory.SUBCONTRACTOR` against the project's approved budget line.
- Rejection preserves `rejectionReason`.
- Invariant: Engineer must never self-approve.

### 4.3 Existing Architecture Conflicts
- Assigning `canCreateCommitment` to Engineers would violate separation of duties, as commitments are legal purchasing encumbrances.
- Solution: Create `SubcontractorNomination` as an independent proposal aggregate. When approved, an internal service `ConvertNominationToCommitment` instantiates the official `Commitment`.

### 4.4 Schema Impact
- **New Table**: `subcontractor_nominations`
  - `id` (cuid), `projectId` (FK Project), `budgetLineId` (FK BudgetLine, nullable), `subcontractorName` (VarChar 150), `contactPhone` (VarChar 50), `specialty` (VarChar 200), `proposedScope` (Text), `proposedRates` (Json), `estimatedAmount` (Decimal 15,2), `status` (NominationStatus), `rejectionReason` (Text?), `createdById`, `submittedById`, `approvedById`, `rejectedById`, `resultingCommitmentId` (String?), `deletedAt`, `createdAt`, `updatedAt`.
- **New Enum**: `NominationStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`.
- **Additive Table Change**: Add `nominationId String?` (FK SubcontractorNomination) to `commitments`.

### 4.5 State-Machine Impact
- New state machine:
  - `DRAFT -> SUBMITTED` (Engineer)
  - `SUBMITTED -> APPROVED` (Manager $\rightarrow$ converts to Commitment)
  - `SUBMITTED -> REJECTED` (Manager $\rightarrow$ terminal)
- Existing `CommitmentStatus` state machine remains untouched.

### 4.6 Authorization Impact
- New policies: `canCreateNomination` (ENGINEER assigned to project), `canSubmitNomination` (ENGINEER creator), `canApproveNomination` (MANAGER only, with separation of duties: `manager.id !== createdById`), `canRejectNomination` (MANAGER).
- `canCreateCommitment` remains strictly `PURCHASING` for standard procurement.

### 4.7 Financial-Integrity Impact
At nomination approval, `ConvertNominationToCommitment` executes inside `prisma.$transaction`:
1. Row-lock on target `BudgetLine` (`SELECT ... FOR UPDATE`).
2. Verify category is `SUBCONTRACTOR`.
3. Check exposure ceiling: `TotalActiveExposure + approvedNominationAmount <= line.amount`.
4. Create `Commitment` in `APPROVED` status atomically.

### 4.8 UI Impact
- Engineer workspace: `/engineer/nominations` and `/engineer/nominations/new`.
- Manager approvals hub: Add "Subcontractor Nominations" triage queue.
- Project details: Show nominated vs contracted subcontractors.

### 4.9 Audit Impact
New audit events: `NOMINATION_CREATED`, `NOMINATION_SUBMITTED`, `NOMINATION_APPROVED`, `NOMINATION_REJECTED`, `COMMITMENT_CREATED_FROM_NOMINATION`.

### 4.10 Test Impact
- Unit tests: Schema validation, rate array parsing, nomination state machine.
- Integration tests: Complete nomination lifecycle, self-approval prevention, budget lock verification during conversion.

### 4.11 Migration / Data-Backfill Impact
Purely additive. New table created; existing commitments have `nominationId = NULL`. Zero risk to existing data.

---

## 5. CR-02 — FIELD SUBCONTRACTOR BILLING (BOQ) IMPACT ANALYSIS

### 5.1 Current Implementation
In Slice 7, `SubcontractorBilling` is authored exclusively by `Role.ACCOUNTANT`. It is a flat record containing a single `grossAmount` Decimal field. Lifecycle: `DRAFT -> SUBMITTED -> APPROVED / REJECTED`. No line items, deductions, or audit states exist.

### 5.2 Required Target Implementation
3-Party collaborative workflow:
1. **ENGINEER**: Originates billing against an approved commitment; enters detailed BOQ lines (`description`, `unit`, `quantity`, `contractualRate`, `lineTotal`); attaches execution photo evidence.
   $$\text{Gross Amount} = \sum (\text{quantity} \times \text{contractualRate})$$
2. **ACCOUNTANT**: Audits engineering quantities; applies deductions (`ADVANCE_RECOVERY`, `RETENTION`, `PENALTY`, `OTHER`) with mandatory reasons; calculates Net Payable. Status transitions to `AUDITED`.
   $$\text{Net Payable} = \text{Gross Amount} - \sum (\text{Deductions})$$
3. **MANAGER**: Final review of engineering execution and accountant audit; approves final net disbursement.

### 5.3 Existing Architecture Conflicts
- Breaking role change: Authorship moves from `ACCOUNTANT` to `ENGINEER`.
- State machine lacks `AUDITED` status.
- Flat model cannot store line items or itemized deductions.

### 5.4 Schema Impact
- **SubcontractorBilling Additions**: `netPayable Decimal(15,2)?`, `auditedById String?`, `auditedAt DateTime?`, `auditNotes Text?`.
- **New Table**: `subcontractor_billing_lines`
  - `id`, `billingId` (FK SubcontractorBilling), `description` (Text), `unit` (VarChar 20), `quantity` (Decimal 15,4), `contractualRate` (Decimal 15,2), `lineTotal` (Decimal 15,2), `notes` (Text?), `variationOrderId` (FK VariationOrder, nullable), timestamps.
- **New Table**: `billing_deductions`
  - `id`, `billingId` (FK SubcontractorBilling), `type` (BillingDeductionType), `amount` (Decimal 15,2), `reason` (Text), `custodyAdvanceId` (FK CustodySubcontractorAdvance, nullable), `createdById` (Accountant), timestamps.
- **New Enums**: `BillingDeductionType { ADVANCE_RECOVERY, RETENTION, PENALTY, OTHER }` and new status `SubcontractorBillingStatus.AUDITED`.

### 5.5 State-Machine Impact
Rewrite `lib/subcontractor-billings/state-machine.ts`:
- `DRAFT -> SUBMITTED` (Engineer)
- `DRAFT -> CANCELLED` (Engineer or Manager)
- `SUBMITTED -> AUDITED` (Accountant)
- `SUBMITTED -> CANCELLED` (Manager)
- `AUDITED -> APPROVED` (Manager)
- `AUDITED -> REJECTED` (Manager)
- `AUDITED -> CANCELLED` (Manager)
- `REJECTED -> DRAFT` (Engineer reopens)

### 5.6 Authorization Impact
- `canCreateBilling`: `ACCOUNTANT` $\rightarrow$ `ENGINEER` (breaking change for new records).
- `canAuditBilling`: New policy for `ACCOUNTANT`.
- `canApproveBilling`: `MANAGER` (unchanged).

### 5.7 Financial-Integrity Impact
- Server-authoritative calculations: Gross amount and net payable recalculated server-side; client totals never trusted.
- Commitment ceiling check: Cumulative gross amount must not exceed `Commitment.amount + approvedVariationOrdersTotal` (OBD-02).
- Net payable must be non-negative ($\ge 0$).

### 5.8 UI Impact
- Engineer UI: BOQ line editor with dynamic add/remove rows and photo upload.
- Accountant UI: Dedicated audit view `/accountant/billings/[id]/audit` with deduction inputs and advance detection alerts.
- Manager UI: Dual-panel review showing field BOQ vs accounting deductions.

### 5.9 Audit Impact
New audit events: `BILLING_SUBMITTED`, `BILLING_AUDITED`, `BILLING_DEDUCTION_ADDED`, `BILLING_APPROVED`, `BILLING_REJECTED`.

### 5.10 Test Impact
- Unit tests: BOQ line math, deduction aggregation, state machine transition matrix.
- Integration tests: End-to-end 3-party workflow, ceiling enforcement, rejection and reopen by Engineer.

### 5.11 Migration / Data-Backfill Impact
Existing APPROVED billing records:
- Keep `createdById` as Accountant (historical integrity preserved).
- Backfill `net_payable = gross_amount` (OBD-03).
- Existing records have `audited_by_id = NULL` and zero line items.

---

## 6. CR-03 — TEMPORARY CUSTODY REDESIGN IMPACT ANALYSIS

### 6.1 Current Implementation
In Slice 6, `Custody.amount` represents both requested and disbursed funds. Engineer liability equals `amount`. Balance calculation: `remainingBalance = amount - settledExpenses - cashReturned`. No subcontractor advance concept exists.

### 6.2 Required Target Implementation
1. Split amount semantics into `requestedAmount` and `disbursedAmount`.
2. Manager/Accountant may disburse an amount lower than requested (e.g. requested 10k, disbursed 7k). Engineer liability equals `disbursedAmount` only.
3. Subcontractor Cash Advance from Custody: Engineer pays subcontractor cash on site, captures receipt image, and records it in system.
   - Reduces Engineer's outstanding custody balance.
   - Creates a pending receivable against the subcontractor.
   - Generates an automated deduction alert for Accountant during subcontractor billing audit (`ADVANCE_RECOVERY`).
4. Mandatory photo evidence for all expenses and advances.

### 6.3 Existing Architecture Conflicts
- Single `amount` column in `Custody`.
- Canonical exposure formula in `lib/custodies/calculations.ts` uses `amount`.
- No entity linking custody cash to subcontractor billing deductions.

### 6.4 Schema Impact
- **Custody Additions**: `disbursedAmount Decimal(15,2)?` (populated at `ISSUED` state; `amount` retained as requested amount per OBD-04).
- **New Table**: `custody_subcontractor_advances`
  - `id`, `custodyId` (FK Custody), `subcontractorName` (VarChar 150), `amount` (Decimal 15,2), `purpose` (Text), `paidAt` (Timestamptz), `billingDeductionId` (FK BillingDeduction, nullable), `attachmentId` (FK Attachment), `createdById` (Engineer), `deletedAt`, timestamps.

### 6.5 State-Machine Impact
`CustodyStatus` 9-state machine remains intact, but `ISSUED` transition requires Accountant input of `disbursedAmount`.

### 6.6 Authorization Impact
- `canRecordCustodyAdvance`: `ENGINEER` (custodian only).
- `canIssueCustody`: `ACCOUNTANT` (provides disbursed amount).
- `canCloseCustody`: `MANAGER`.

### 6.7 Financial-Integrity Impact
- Custody balance formula update:
  $$\text{RemainingBalance} = \text{disbursedAmount} - \text{settledExpenses} - \text{subcontractorAdvances} - \text{cashReturned}$$
- Canonical exposure formula update: `OutstandingCustodies` must sum `disbursedAmount` instead of `amount`.
- Difference release: If `disbursedAmount < requestedAmount`, the difference releases back to `BudgetLine.availableBalance` immediately upon issuance (OBD-05).

### 6.8 UI Impact
- Accountant issuance dialog: Input `disbursedAmount` with liquidity notes.
- Engineer settlement screen: "Record Subcontractor Advance" action with mandatory receipt upload.
- Accountant billing audit screen: Warning banner showing unrecovered custody advances for that subcontractor.

### 6.9 Audit Impact
New audit events: `CUSTODY_DISBURSEMENT_RECORDED` (logs difference), `CUSTODY_ADVANCE_TO_SUBCONTRACTOR`, `CUSTODY_ADVANCE_RECOVERED`.

### 6.10 Test Impact
- Unit tests: Update `tests/unit/lib/custodies/calculations.test.ts` for new liability and balance formulas.
- Integration tests: Custody lifecycle with partial disbursement, advance recording, and billing deduction link.

### 6.11 Migration / Data-Backfill Impact
- Add `disbursed_amount` column.
- Migration backfill:
  ```sql
  UPDATE custodies SET disbursed_amount = amount
  WHERE status IN ('ISSUED', 'PARTIALLY_SETTLED', 'SETTLED', 'CLOSED');
  ```

---

## 7. CR-04 — SITE LABOR SHEETS IMPACT ANALYSIS

### 7.1 Current Implementation
In Slice 8, `PayrollEntry` is authored exclusively by `Role.ACCOUNTANT`. It represents a lump-sum monthly amount for a single worker. Engineers have no access. No attendance tracking exists.

### 7.2 Required Target Implementation
`Role.ENGINEER` creates `LaborSheet` (site attendance sheet) for an assigned active project:
- Header: Project, period (year/month), `BudgetCategory.LABOR`.
- Lines (`LaborSheetLine`): Worker name, trade/title, attendance days (e.g. 6.5), daily rate (SAR), line total.
  $$\text{Line Total} = \text{attendanceDays} \times \text{dailyRate}$$
- Evidence: Mandatory attendance/fingerprint sheet image attached.
- Review flow: Accountant audits calculations $\rightarrow$ Manager approves disbursement.
- AGENTS.md Invariant: No `Worker` master table (plain text names only).

### 7.3 Existing Architecture Conflicts
Modifying `PayrollEntry` to be authored by Engineers would destroy existing Accountant monthly payroll workflows. `LaborSheet` must be created as a distinct aggregate that coexists with `PayrollEntry` (OBD-06).

### 7.4 Schema Impact
- **New Table**: `labor_sheets`
  - `id`, `projectId` (FK Project), `budgetLineId` (FK BudgetLine, category LABOR), `periodYear` (Int), `periodMonth` (Int), `totalAmount` (Decimal 15,2), `status` (LaborSheetStatus), `createdById` (Engineer), `submittedById`, `auditedById` (Accountant), `approvedById` (Manager), `rejectedById`, `rejectionReason`, `deletedAt`, timestamps.
- **New Table**: `labor_sheet_lines`
  - `id`, `laborSheetId` (FK LaborSheet), `workerName` (VarChar 100), `tradeOrTitle` (VarChar 50?), `attendanceDays` (Decimal 5,2), `dailyRate` (Decimal 15,2), `lineTotal` (Decimal 15,2), `notes` (Text?), timestamps.
- **New Enum**: `LaborSheetStatus { DRAFT, SUBMITTED, AUDITED, APPROVED, REJECTED, CANCELLED }`.

### 7.5 State-Machine Impact
New state machine: `DRAFT -> SUBMITTED -> AUDITED -> APPROVED / REJECTED / CANCELLED`.

### 7.6 Authorization Impact
- `canCreateLaborSheet`: `ENGINEER` assigned to project.
- `canAuditLaborSheet`: `ACCOUNTANT`.
- `canApproveLaborSheet`: `MANAGER`.
- Privacy boundary: Engineers view only their own submitted sheets.

### 7.7 Financial-Integrity Impact
- Total amount calculated server-side: $\sum (\text{attendanceDays} \times \text{dailyRate})$.
- Canonical budget exposure formula extended:
  $$\text{ApprovedLaborSheets} = \sum (\text{approved LaborSheet.totalAmount})$$
  Included in `TotalActiveExposure` under `LABOR` budget lines.

### 7.8 UI Impact
- Engineer workspace: `/engineer/labor-sheets/new` with attendance grid and image upload.
- Accountant audit view: `/accountant/labor-sheets/[id]/audit`.
- Manager approvals hub: Labor Sheets review tab.

### 7.9 Audit Impact
New audit events: `LABOR_SHEET_CREATED`, `LABOR_SHEET_SUBMITTED`, `LABOR_SHEET_AUDITED`, `LABOR_SHEET_APPROVED`, `LABOR_SHEET_REJECTED`.

### 7.10 Test Impact
- Unit tests: Attendance rate calculations, decimal validation.
- Integration tests: 3-stage lifecycle, labor budget line lock, privacy boundary enforcement.

### 7.11 Migration / Data-Backfill Impact
Purely additive. Existing `payroll_entries` table remains unchanged.

---

## 8. CR-05 — MATERIAL RECEIVING NOTE (MRN) IMPACT ANALYSIS

### 8.1 Current Implementation
Material purchases are made via Commitments (Purchasing) and paid via Expenses (Accountant). There is zero field delivery verification in the system.

### 8.2 Required Target Implementation
`Role.ENGINEER` creates `MaterialReceivingNote` (MRN) upon site delivery:
- Links to an approved `Commitment` (category `MATERIALS`).
- Captures: `quantityOrdered`, `quantityReceived`, `quantityAccepted`, `quantityRejected`, `inspectionResult`, `deliveryNoteRef`, signed delivery bill image (mandatory).
- **HARD CONTROL GATE**: No material invoice (`Expense` under `MATERIALS`) can be approved by Manager unless supported by an approved MRN with verified quantity coverage.

### 8.3 Existing Architecture Conflicts
Currently, `Expense` has no foreign key to `Commitment`. For the MRN hard control gate to function cleanly, `Expense` requires an optional `commitmentId` FK for `MATERIALS` spend (OBD-08, OBD-09).

### 8.4 Schema Impact
- **New Table**: `material_receiving_notes`
  - `id`, `projectId` (FK Project), `commitmentId` (FK Commitment), `materialDescription` (Text), `quantityOrdered` (Decimal 15,4), `quantityReceived` (Decimal 15,4), `quantityAccepted` (Decimal 15,4), `quantityRejected` (Decimal 15,4), `inspectionResult` (InspectionResult), `deliveryNoteRef` (VarChar 100?), `notes` (Text?), `status` (MRNStatus), `createdById` (Engineer), `approvedById` (Manager), `deletedAt`, timestamps.
- **New Enums**: `MRNStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }` and `InspectionResult { ACCEPTED, PARTIALLY_ACCEPTED, REJECTED }`.
- **Expense Addition**: Add nullable `commitmentId String?` (FK Commitment) to `expenses`.

### 8.5 State-Machine Impact
New state machine: `DRAFT -> SUBMITTED -> APPROVED / REJECTED`.
Behavioral change: `approveExpense` checks for approved MRN if category is `MATERIALS`.

### 8.6 Authorization Impact
- `canCreateMRN`: `ENGINEER` assigned to project.
- `canApproveMRN`: `MANAGER`.

### 8.7 Financial-Integrity Impact
In `approveExpense` use case:
```typescript
if (budgetLine.category === BudgetCategory.MATERIALS) {
  const approvedMrn = await tx.materialReceivingNote.findFirst({
    where: { commitmentId: expense.commitmentId, status: MRNStatus.APPROVED }
  });
  if (!approvedMrn) throw new AppError('MRN_REQUIRED', 'لا يمكن اعتماد صرف فاتورة توريد مواد بدون محضر استلام معتمد');
}
```

### 8.8 UI Impact
- Engineer workspace: `/engineer/mrns/new` with shipment receiving form and delivery bill photo upload.
- Expense approval UI: Displays linked MRN badge and inspection summary.

### 8.9 Audit Impact
New audit events: `MRN_CREATED`, `MRN_SUBMITTED`, `MRN_APPROVED`, `MATERIAL_PAYMENT_BLOCKED`, `MATERIAL_PAYMENT_AUTHORIZED`.

### 8.10 Test Impact
- Unit tests: Quantity math (`quantityReceived = quantityAccepted + quantityRejected`).
- Integration tests: `approveExpense` blocked when MRN missing; succeeds when approved MRN present.

### 8.11 Migration / Data-Backfill Impact
- Add `material_receiving_notes` table.
- Add nullable `commitment_id` to `expenses`.
- Existing expenses have `commitment_id = NULL` (grandfathered).

---

## 9. CR-06 — EQUIPMENT TIMESHEETS IMPACT ANALYSIS

### 9.1 Current Implementation
Equipment costs (`BudgetCategory.EQUIPMENT`) are entered as generic lump-sum expenses. No hours, meter readings, or daily machine logs exist.

### 9.2 Required Target Implementation
`Role.ENGINEER` records daily equipment timesheets:
- Header: Equipment, Project, EquipmentContract (contractual hourly rate).
- Entries: Date, start time, stop time, actual hours, meter reading start/stop, work performed, operator name, signed field ticket photo.
- Financial calculation:
  $$\text{Equipment Payable} = \text{Approved Hours} \times \text{Contractual Hourly Rate}$$
- Accountant reconciles billing; Manager approves payment.

### 9.3 Existing Architecture Conflicts
No equipment registry, contract rate, or timesheet models exist.

### 9.4 Schema Impact
- **New Tables**:
  - `equipment`: `id`, `name`, `type`, `identifierOrPlate?`, `isActive`, `managedById` (Purchasing), timestamps.
  - `equipment_contracts`: `id`, `equipmentId` (FK Equipment), `commitmentId` (FK Commitment), `projectId` (FK Project), `hourlyRate` (Decimal 15,2), timestamps.
  - `equipment_timesheets`: `id`, `equipmentId`, `projectId`, `budgetLineId`, `equipmentContractId`, `periodStart`, `periodEnd`, `totalApprovedHours` (Decimal 8,2), `totalPayable` (Decimal 15,2), `status` (EquipmentTimesheetStatus), `driverOperator?`, `notes?`, `createdById` (Engineer), `approvedById` (Manager), `deletedAt`, timestamps.
  - `equipment_timesheet_entries`: `id`, `timesheetId`, `workDate` (Date), `startTime` (VarChar 5), `stopTime` (VarChar 5), `actualHours` (Decimal 5,2), `meterReadingStart?`, `meterReadingEnd?`, `workPerformed` (Text), `evidenceAttachmentId?`, timestamps.
- **New Enum**: `EquipmentTimesheetStatus { DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED }`.

### 9.5 State-Machine Impact
New state machine: `DRAFT -> SUBMITTED -> APPROVED / REJECTED / CANCELLED`.

### 9.6 Authorization Impact
- `canManageEquipment`: `PURCHASING`.
- `canCreateEquipmentTimesheet`: `ENGINEER`.
- `canApproveEquipmentTimesheet`: `MANAGER`.

### 9.7 Financial-Integrity Impact
- Server-authoritative calculation: $\text{totalPayable} = \text{hours} \times \text{hourlyRate}$.
- Canonical budget exposure extended:
  $$\text{ApprovedEquipmentTimesheets} = \sum (\text{approved EquipmentTimesheet.totalPayable})$$
  Included in `TotalActiveExposure` under `EQUIPMENT` budget lines.

### 9.8 UI Impact
- Purchasing workspace: Equipment registry and contract rate management.
- Engineer workspace: Daily timesheet entry form with meter readings and driver slip photo.
- Accountant workspace: Equipment reconciliation matching supplier invoice to approved hours.

### 9.9 Audit Impact
New audit events: `EQUIPMENT_REGISTERED`, `EQUIPMENT_TIMESHEET_SUBMITTED`, `EQUIPMENT_TIMESHEET_APPROVED`.

### 9.10 Test Impact
- Unit tests: Hour calculations, meter validations.
- Integration tests: Equipment timesheet lifecycle, rate calculation, budget exposure integration.

### 9.11 Migration / Data-Backfill Impact
Purely additive. Four new tables; existing data untouched.

---

## 10. CR-07 — VARIATION ORDERS IMPACT ANALYSIS

### 10.1 Current Implementation
`Commitment.amount` is strictly immutable after `APPROVED`. In `lib/subcontractor-billings/calculations.ts`, `checkBillingCeiling` checks: `newCumulativeCertified <= commitmentAmount`. There is no mechanism to authorize scope changes or increase the billing ceiling.

### 10.2 Required Target Implementation
`Role.ENGINEER` creates `VariationOrder` request against an approved Subcontractor Commitment:
- Captures: Technical reason, extra BOQ quantities, estimated cost.
- Requires mandatory prior approval by `Role.MANAGER`.
- After approval:
  $$\text{Effective Billing Ceiling} = \text{Commitment.amount} + \sum (\text{Approved Variation Orders})$$
- Invariant: `Commitment.amount` remains historically preserved (NEVER mutated directly).
- Hard rule: Subcontractor billing containing extra quantities is invalid unless covered by an approved Variation Order (OBD-12).

### 10.3 Existing Architecture Conflicts
Modifying `Commitment.amount` directly would violate AGENTS.md §13 (no mutating approved financial records). Variation orders must be tracked as independent approved delta records.

### 10.4 Schema Impact
- **New Table**: `variation_orders`
  - `id`, `projectId` (FK Project), `commitmentId` (FK Commitment), `title` (VarChar 200), `technicalReason` (Text), `estimatedCost` (Decimal 15,2), `approvedAmount` (Decimal 15,2?), `status` (VariationOrderStatus), `createdById` (Engineer), `approvedById` (Manager), `deletedAt`, timestamps.
- **New Enum**: `VariationOrderStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`.
- **Billing Line Linkage**: Add nullable `variationOrderId String?` (FK VariationOrder) to `subcontractor_billing_lines`.

### 10.5 State-Machine Impact
New state machine: `DRAFT -> SUBMITTED -> APPROVED / REJECTED`.

### 10.6 Authorization Impact
- `canCreateVariationOrder`: `ENGINEER` assigned to project.
- `canApproveVariationOrder`: `MANAGER` (separation of duties: `manager.id !== createdById`).

### 10.7 Financial-Integrity Impact
`checkBillingCeiling` signature updated:
```typescript
export function checkBillingCeiling(
  commitmentAmount: Prisma.Decimal,
  approvedVariationOrdersTotal: Prisma.Decimal, // NEW
  previousCumulativeCertified: Prisma.Decimal,
  currentGrossAmount: Prisma.Decimal,
): BillingCeilingCheckResult {
  const effectiveCeiling = commitmentAmount.add(approvedVariationOrdersTotal);
  const newCumulativeCertified = previousCumulativeCertified.add(currentGrossAmount);
  return {
    withinCeiling: newCumulativeCertified.lte(effectiveCeiling),
    // ...
  };
}
```

### 10.8 UI Impact
- Commitment detail page: "Variation Orders" tab showing VO history, original contract value, approved variations, and revised ceiling.
- Engineer UI: "Request Variation Order" modal.
- Billing creation UI: Flags lines linked to VO.

### 10.9 Audit Impact
New audit events: `VARIATION_ORDER_CREATED`, `VARIATION_ORDER_SUBMITTED`, `VARIATION_ORDER_APPROVED`, `COMMITMENT_CEILING_REVISED`.

### 10.10 Test Impact
- Unit tests: Revised ceiling calculations with single and multiple VOs.
- Integration tests: VO approval workflow, ceiling validation during billing submission.

### 10.11 Migration / Data-Backfill Impact
Purely additive. New table created; zero existing data modified.

---

## 11. CR-08 — VISUAL PROGRESS & MILESTONE LINKAGE IMPACT ANALYSIS

### 11.1 Current Implementation
`ProgressReport` (Slice 10) contains narrative text and `progressPercentage` only. `ProjectMilestone` (Slice 12) has no evidence prerequisite for `COMPLETED` status. No attachment model exists in the database.

### 11.2 Required Target Implementation
1. Unified `Attachment` model supporting photos/documents across all modules (Progress, Billing, Custody, Labor, MRN, Equipment).
2. Many-to-many linkage between `ProgressReport` and `ProjectMilestone`.
3. Milestone completion evidence gate: Milestone cannot transition to `COMPLETED` without at least one approved progress report containing photo evidence (OBD-13).

### 11.3 Existing Architecture Conflicts
`complete-milestone.ts` currently transitions milestone status without any external validation. An evidence verification gate must be added.

### 11.4 Schema Impact
- **New Table**: `attachments`
  - `id`, `entityType` (AttachmentEntityType), `entityId` (String), `fileName` (VarChar 255), `fileUrl` (Text), `mimeType` (VarChar 100), `sizeBytes` (Int), `uploadedById` (FK User), `createdAt` (Timestamptz).
  - Index: `@@index([entityType, entityId])`.
- **New Table**: `progress_report_milestones`
  - `reportId` (FK ProgressReport), `milestoneId` (FK ProjectMilestone), `@@id([reportId, milestoneId])`.
- **New Enum**: `AttachmentEntityType { PROGRESS_REPORT, BILLING, LABOR_SHEET, CUSTODY_ADVANCE, MRN, EQUIPMENT_TIMESHEET, VARIATION_ORDER }`.

### 11.5 State-Machine Impact
`completeMilestone` use case enforces prerequisite check: verifies linked approved report with attachments exists before permitting `COMPLETED` transition.

### 11.6 Authorization Impact
- `canUploadAttachment`: Authenticated active users for entities they have permission to edit.
- `canCompleteMilestone`: `MANAGER` only (gate enforced server-side).

### 11.7 Financial-Integrity Impact
Enforces operational truth: prevents premature milestone sign-off and executive misreporting.

### 11.8 UI Impact
- Progress report editor: Photo upload dropzone with previews and captions.
- Milestone management UI: Displays linked site photos and evidence status before enabling "Mark Completed" button.

### 11.9 Audit Impact
New audit events: `ATTACHMENT_UPLOADED`, `MILESTONE_EVIDENCE_VERIFIED`, `MILESTONE_COMPLETION_BLOCKED`.

### 11.10 Test Impact
- Unit tests: MIME type validation, file size bounds.
- Integration tests: `completeMilestone` blocked without evidence; succeeds with linked approved photo report.

### 11.11 Migration / Data-Backfill Impact
Existing completed milestones remain `COMPLETED` (grandfathered). Gate applies strictly to future transitions.

---

## 12. CR-09 — FLEXIBLE BUDGETS, TRANSFERS, REVISIONS IMPACT ANALYSIS

### 12.1 Current Implementation
All financial approval use cases (`approveCommitment`, `approveExpense`, `approvePayroll`, `approveBilling`) enforce a rigid hard stop: `if (newExposure > line.amount) throw BUDGET_LINE_EXCEEDED`. Budget lines cannot be modified once approved. `BudgetStatus.SUPERSEDED` exists but has no active use case.

### 12.2 Required Target Implementation
1. **Soft Limits**: Transactions exceeding budget line amount are NOT rejected. Instead, they are flagged as `OVER_BUDGET`, requiring explicit Manager approval with an explanatory reason (`overBudgetReason`).
2. **Budget Transfers**: Manager can atomically transfer funds between lines in the same project (`BudgetTransfer`).
3. **Contingency Reserve**: Dedicated reserve line (`BudgetCategory.CONTINGENCY`) to fund overruns.
4. **Budget Revisions**: Create Rev 1, Rev 2 drafts. When approved, old budget becomes `SUPERSEDED` (preserved historically).

### 12.3 Existing Architecture Conflicts — MOST CRITICAL CR
Modifies core ceiling checks across Slices 3, 4, 5, 7, and 8 simultaneously. Must be carefully isolated into Wave 3.

### 12.4 Schema Impact
- **BudgetLine Additions**: `isContingencyReserve Boolean @default(false)`.
- **New Table**: `budget_transfers`
  - `id`, `projectId` (FK Project), `budgetId` (FK Budget), `sourceBudgetLineId` (FK BudgetLine), `targetBudgetLineId` (FK BudgetLine), `transferAmount` (Decimal 15,2), `reason` (Text), `transferredAt`, `transferredById` (Manager), timestamps.
- **Financial Record Additions**: Add `isOverBudget Boolean @default(false)` and `overBudgetReason Text?` to `commitments`, `expenses`, and `payroll_entries`.

### 12.5 State-Machine Impact
Approval use cases transition from binary pass/fail to:
- Within budget $\rightarrow$ standard approval.
- Over budget $\rightarrow$ requires `overBudgetReason`, sets `isOverBudget = true`, proceeds to `APPROVED`.
Budget revision: Prior `APPROVED` budget transitions to `SUPERSEDED`.

### 12.6 Authorization Impact
- `canTransferBudget`: `MANAGER` only.
- `canApproveOverBudget`: `MANAGER` only.
- `canReviseBudget`: `MANAGER` only.

### 12.7 Financial-Integrity Impact
Effective budget line ceiling calculation:
$$\text{EffectiveAmount} = \text{BudgetLine.amount} + \sum \text{InboundTransfers} - \sum \text{OutboundTransfers}$$
Exposure calculations never clamped to zero; negative available balance is accurately reported.

### 12.8 UI Impact
- Manager approvals hub: Highlights over-budget transactions with red badge; requires justification text in approval modal.
- Budget management dashboard: Shows original amount, transfer adjustments, effective budget, and overrun warnings.
- Budget transfer dialog: Source line $\rightarrow$ target line transfer modal.

### 12.9 Audit Impact
New audit events: `OVER_BUDGET_APPROVED`, `BUDGET_TRANSFER_EXECUTED`, `BUDGET_REVISION_APPROVED`.

### 12.10 Test Impact
- Unit tests: Effective amount calculation, transfer atomicity.
- Integration tests: Over-budget approval with reason, transfer row locking, budget superseding.

### 12.11 Migration / Data-Backfill Impact
Additive columns default to `false`/`null`. Zero financial history corrupted.

---

## 13. CR-10 — PROJECT CASH FLOW & OWNER INFLOWS IMPACT ANALYSIS

### 13.1 Current Implementation
The system tracks outflows only. Zero revenue, owner billing, or capital tracking exists. The Manager has no visibility into project liquidity or contractual profitability.

### 13.2 Required Target Implementation
Introduce three new financial concepts:
1. `OwnerBilling`: Periodic claim submitted to project owner.
2. `OwnerPayment`: Actual cash received in company bank account from owner.
3. `CapitalInjection`: Temporary company capital injected into project cash flow, with reason and recovery tracking.
Key real-time formulas:
$$\text{Project Liquidity} = (\text{Owner Payments} + \text{Capital Injections}) - \text{Total Actual Outflows}$$
$$\text{Estimated Contractual Profit} = \text{Approved Owner Billings} - \text{Total Project Costs}$$

### 13.3 Existing Architecture Conflicts
No revenue or inflow models exist. Requires a dedicated new domain `lib/project-cash-flow/`.

### 13.4 Schema Impact
- **New Tables**:
  - `owner_billings`: `id`, `projectId` (FK Project), `title` (VarChar 200), `amount` (Decimal 15,2), `billingDate` (Timestamptz), `status` (OwnerBillingStatus), `referenceNo?`, `createdById` (Accountant), `approvedById` (Manager), `deletedAt`, timestamps.
  - `owner_payments`: `id`, `projectId` (FK Project), `ownerBillingId` (FK OwnerBilling, nullable), `amount` (Decimal 15,2), `receivedAt` (Timestamptz), `referenceNo?`, `notes?`, `recordedById` (Accountant), timestamps.
  - `capital_injections`: `id`, `projectId` (FK Project), `amount` (Decimal 15,2), `injectedAt` (Timestamptz), `sourceAccount?`, `reason` (Text), `recoveryStatus` (CapitalRecoveryStatus), `recordedById` (Manager), timestamps.
- **New Enums**: `OwnerBillingStatus { DRAFT, SUBMITTED, APPROVED, CANCELLED }` and `CapitalRecoveryStatus { UNRECOVERED, PARTIALLY_RECOVERED, RECOVERED }`.

### 13.5 State-Machine Impact
- `OwnerBillingStatus`: `DRAFT -> SUBMITTED -> APPROVED / CANCELLED`.
- `CapitalRecoveryStatus`: `UNRECOVERED -> PARTIALLY_RECOVERED -> RECOVERED`.

### 13.6 Authorization Impact
- `canCreateOwnerBilling`: `ACCOUNTANT` (prepares draft per OBD-14).
- `canApproveOwnerBilling`: `MANAGER`.
- `canRecordOwnerPayment`: `ACCOUNTANT`.
- `canRecordCapitalInjection`: `MANAGER`.
- `canViewProjectProfit`: `MANAGER` only (confidential financial data).

### 13.7 Financial-Integrity Impact
Exact Decimal arithmetic for liquidity and profit metrics. Strict distinction: Billed $\ne$ Collected $\ne$ Committed $\ne$ Spent.

### 13.8 UI Impact
- Manager workspace: New executive screen `/manager/cash-flow/[projectId]` showing liquidity gauge, cash flow waterfall, and capital recovery table.
- Accountant workspace: `/accountant/owner-payments/record`.
- Executive dashboard: Add Net Liquidity and Profitability KPI cards.

### 13.9 Audit Impact
New audit events: `OWNER_BILLING_APPROVED`, `OWNER_PAYMENT_RECORDED`, `CAPITAL_INJECTION_RECORDED`, `CAPITAL_INJECTION_RECOVERED`.

### 13.10 Test Impact
- Unit tests: Liquidity and profit calculations.
- Integration tests: Owner billing approval, payment recording, capital injection recovery tracking.

### 13.11 Migration / Data-Backfill Impact
Purely additive. Three new tables; existing outflow data unaffected.

---

## 14. CROSS-CR DEPENDENCY GRAPH

```
[Wave 0: Slice 18]
Attachment Infrastructure (CR-08 base)
  │
  ├──► [Wave 1: Slice 19] CR-01 Subcontractor Nomination
  │      │
  │      ▼
  │    [Wave 1: Slice 20] CR-07 Variation Orders
  │      │
  │      ▼
  │    [Wave 1: Slice 21] CR-03 Custody Redesign & Subcontractor Advances
  │      │
  │      ▼
  │    [Wave 1: Slice 22] CR-02 BOQ Billing (depends on 18, 19, 20, 21)
  │
  ├──► [Wave 2: Slice 23] CR-04 Site Labor Sheets (depends on 18)
  ├──► [Wave 2: Slice 24] CR-05 Material Receiving Notes (depends on 18)
  ├──► [Wave 2: Slice 25] CR-06 Equipment Timesheets (depends on 18)
  └──► [Wave 2: Slice 26] CR-08 Visual Progress & Milestone Gate (depends on 18)
         │
         ▼
[Wave 3: Slice 27] CR-09 Flexible Budgets & Soft Limits (touches all domains)
[Wave 3: Slice 28] CR-10 Project Cash Flow & Owner Inflows (isolated)
```

### Critical Path Justification
1. **Slice 18 (Attachment Infrastructure) must be Wave 0**: CR-02, CR-03, CR-04, CR-05, CR-06, and CR-08 all require file/photo attachments. Implementing Attachment first eliminates duplicated file-handling logic.
2. **CR-01 before CR-02**: Field billing requires an approved Subcontractor Commitment.
3. **CR-07 before CR-02**: Billing line validation requires knowing the revised commitment ceiling.
4. **CR-03 before CR-02**: Accountant audit in billing needs advance records to execute `ADVANCE_RECOVERY`.
5. **CR-09 in Wave 3**: CR-09 changes the behavior of every approval use case in the system. Placing it earlier would destabilize Slices 19–26 during development.

---

## 15. AFFECTED EXISTING SLICES

| Slice | Module | CR | Impact Nature | Required Care |
|---|---|---|---|---|
| **Slice 3 — Budgets** | `lib/budget/` | CR-09 | EXTENSION | Add `BudgetTransfer`, revision workflow, activate `SUPERSEDED` state. |
| **Slice 4 — Expenses** | `lib/expenses/` | CR-05, CR-09 | BEHAVIORAL CHANGE | Add MRN gate for `MATERIALS`; convert hard budget ceiling to soft limit with reason. |
| **Slice 5 — Commitments** | `lib/commitments/` | CR-01, CR-07, CR-09 | EXTENSION & CHANGE | Link `nominationId`; extend ceiling with VOs; convert hard ceiling to soft limit. |
| **Slice 6 — Custody** | `lib/custodies/` | CR-03, CR-09 | BREAKING LOGIC | Add `disbursedAmount`; update exposure calculation formula; link advances. |
| **Slice 7 — Billing** | `lib/subcontractor-billings/` | CR-02, CR-07 | FULL REDESIGN | Shift authorship to Engineer; rewrite state machine to add `AUDITED`; add BOQ lines. |
| **Slice 8 — Payroll** | `lib/payroll/` | CR-04, CR-09 | ADDITIVE & CHANGE | Add `LaborSheet` aggregate; convert hard ceiling to soft limit in `approvePayroll`. |
| **Slice 9 — Dashboard** | `lib/dashboard/` | CR-10 | EXTENSION | Add liquidity, contractual profit, and owner inflow metrics. |
| **Slice 10 — Progress Reports** | `lib/progress-reports/` | CR-08 | EXTENSION | Add photo attachment support and milestone linkage. |
| **Slice 12 — Milestones** | `lib/milestones/` | CR-08 | BEHAVIORAL CHANGE | Enforce visual evidence gate in `completeMilestone`. |
| **Slice 13 — Op Dashboard** | `lib/operational-dashboard/` | CR-10 | EXTENSION | Project financial position section. |
| **Slice 15 — Approvals Hub** | `lib/approvals/` | All | EXTENSION | Add triage queues for Nominations, Labor Sheets, MRNs, Timesheets, VOs, Over-budget. |

---

## 16. REQUIRED SCHEMA CHANGES SUMMARY

### 11 New Tables
1. `subcontractor_nominations` (CR-01)
2. `subcontractor_billing_lines` (CR-02)
3. `billing_deductions` (CR-02)
4. `custody_subcontractor_advances` (CR-03)
5. `labor_sheets` (CR-04)
6. `labor_sheet_lines` (CR-04)
7. `material_receiving_notes` (CR-05)
8. `equipment` (CR-06)
9. `equipment_contracts` (CR-06)
10. `equipment_timesheets` (CR-06)
11. `equipment_timesheet_entries` (CR-06)
12. `variation_orders` (CR-07)
13. `attachments` (CR-08)
14. `progress_report_milestones` (CR-08)
15. `budget_transfers` (CR-09)
16. `owner_billings` (CR-10)
17. `owner_payments` (CR-10)
18. `capital_injections` (CR-10)

### 10 Additive Column Changes on Existing Tables
- `commitments`: `nominationId String?`, `isOverBudget Boolean @default(false)`, `overBudgetReason Text?`
- `subcontractor_billings`: `netPayable Decimal?`, `auditedById String?`, `auditedAt Timestamptz?`, `auditNotes Text?`
- `custodies`: `disbursedAmount Decimal?`
- `expenses`: `commitmentId String?`, `isOverBudget Boolean @default(false)`, `overBudgetReason Text?`
- `payroll_entries`: `isOverBudget Boolean @default(false)`, `overBudgetReason Text?`
- `budget_lines`: `isContingencyReserve Boolean @default(false)`

### 13 New Enums / Enum Additions
- `NominationStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`
- `SubcontractorBillingStatus.AUDITED` (added to existing enum)
- `BillingDeductionType { ADVANCE_RECOVERY, RETENTION, PENALTY, OTHER }`
- `LaborSheetStatus { DRAFT, SUBMITTED, AUDITED, APPROVED, REJECTED, CANCELLED }`
- `MRNStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`
- `InspectionResult { ACCEPTED, PARTIALLY_ACCEPTED, REJECTED }`
- `EquipmentTimesheetStatus { DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED }`
- `VariationOrderStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`
- `AttachmentEntityType { PROGRESS_REPORT, BILLING, LABOR_SHEET, CUSTODY_ADVANCE, MRN, EQUIPMENT_TIMESHEET, VARIATION_ORDER }`
- `OwnerBillingStatus { DRAFT, SUBMITTED, APPROVED, CANCELLED }`
- `CapitalRecoveryStatus { UNRECOVERED, PARTIALLY_RECOVERED, RECOVERED }`

---

## 17. REQUIRED STATE-MACHINE CHANGES

| State Machine | Nature of Change | Allowed Transitions |
|---|---|---|
| **SubcontractorBillingStatus** | **Full Rewrite** (CR-02) | `DRAFT -> SUBMITTED, CANCELLED`<br>`SUBMITTED -> AUDITED, CANCELLED`<br>`AUDITED -> APPROVED, REJECTED, CANCELLED`<br>`REJECTED -> DRAFT`<br>`APPROVED -> (terminal)`<br>`CANCELLED -> (terminal)` |
| **NominationStatus** | New Machine (CR-01) | `DRAFT -> SUBMITTED`<br>`SUBMITTED -> APPROVED, REJECTED`<br>`APPROVED -> (terminal)`<br>`REJECTED -> (terminal)` |
| **LaborSheetStatus** | New Machine (CR-04) | `DRAFT -> SUBMITTED, CANCELLED`<br>`SUBMITTED -> AUDITED, CANCELLED`<br>`AUDITED -> APPROVED, REJECTED, CANCELLED`<br>`REJECTED -> DRAFT` |
| **MRNStatus** | New Machine (CR-05) | `DRAFT -> SUBMITTED`<br>`SUBMITTED -> APPROVED, REJECTED` |
| **EquipmentTimesheetStatus** | New Machine (CR-06) | `DRAFT -> SUBMITTED, CANCELLED`<br>`SUBMITTED -> APPROVED, REJECTED, CANCELLED` |
| **VariationOrderStatus** | New Machine (CR-07) | `DRAFT -> SUBMITTED`<br>`SUBMITTED -> APPROVED, REJECTED` |
| **OwnerBillingStatus** | New Machine (CR-10) | `DRAFT -> SUBMITTED, CANCELLED`<br>`SUBMITTED -> APPROVED, CANCELLED` |
| **ProjectMilestoneStatus** | Behavioral Gate (CR-08) | Existing enum preserved; `completeMilestone` requires linked approved photo report. |
| **Approval Lifecycle** | Behavioral Shift (CR-09) | All approval use cases accept over-budget state when accompanied by explicit Manager reason. |

---

## 18. AUTHORIZATION CHANGES

| Action / Capability | Current Policy | Required Target Policy | Change Type |
|---|---|---|---|
| Create Subcontractor Nomination | N/A | `Role.ENGINEER` (assigned to project) | New |
| Approve Subcontractor Nomination | N/A | `Role.MANAGER` (not creator/submitter) | New |
| Create Subcontractor Billing | `Role.ACCOUNTANT` | `Role.ENGINEER` (assigned to project) | **BREAKING** |
| Audit Subcontractor Billing | N/A | `Role.ACCOUNTANT` | New |
| Record Custody Subcontractor Advance | N/A | `Role.ENGINEER` (custodian only) | New |
| Create Site Labor Sheet | N/A | `Role.ENGINEER` (assigned to project) | New |
| Audit Site Labor Sheet | N/A | `Role.ACCOUNTANT` | New |
| Create Material Receiving Note (MRN) | N/A | `Role.ENGINEER` (assigned to project) | New |
| Approve Material Receiving Note (MRN) | N/A | `Role.MANAGER` | New |
| Manage Equipment Registry | N/A | `Role.PURCHASING` | New |
| Create Equipment Timesheet | N/A | `Role.ENGINEER` (assigned to project) | New |
| Approve Equipment Timesheet | N/A | `Role.MANAGER` | New |
| Create Variation Order Request | N/A | `Role.ENGINEER` (assigned to project) | New |
| Approve Variation Order | N/A | `Role.MANAGER` (not creator) | New |
| Execute Inter-Line Budget Transfer | N/A | `Role.MANAGER` only | New |
| Approve Over-Budget Transaction | Blocked | `Role.MANAGER` with reason | Behavioral |
| Create Owner Billing Draft | N/A | `Role.ACCOUNTANT` (OBD-14) | New |
| Approve Owner Billing | N/A | `Role.MANAGER` | New |
| Record Owner Payment | N/A | `Role.ACCOUNTANT` | New |
| Record Capital Injection | N/A | `Role.MANAGER` | New |
| View Project Profitability | N/A | `Role.MANAGER` only | New |

---

## 19. FINANCIAL-CONTROL CHANGES

1. **Budget Line Ceiling Enforcement (CR-09)**:
   - Changes from strict rejection (`BUDGET_LINE_EXCEEDED`) to soft limit: flags `OVER_BUDGET`, requires `overBudgetReason`, permits Manager exception approval.
2. **Effective Budget Line Ceiling Calculation (CR-09)**:
   $$\text{EffectiveAmount} = \text{BudgetLine.amount} + \sum \text{InboundTransfers} - \sum \text{OutboundTransfers}$$
3. **Subcontractor Billing Ceiling (CR-07)**:
   $$\text{EffectiveCommitmentCeiling} = \text{Commitment.amount} + \sum (\text{Approved Variation Orders})$$
4. **Canonical Exposure Formula Extension (`lib/custodies/calculations.ts`)**:
   ```
   TotalActiveExposure =
       ApprovedCommitments
     + DirectActualSpend
     + CustodyActualSpend
     + OutstandingCustodies (using disbursedAmount)
     + ApprovedPayroll
     + ApprovedLaborSheets (NEW — CR-04)
     + ApprovedEquipmentTimesheets (NEW — CR-06)
   ```
5. **Material Payment Gate (CR-05)**:
   No `MATERIALS` expense can be approved without an `APPROVED` MRN covering the items.
6. **Subcontractor Advance Encumbrance (CR-03)**:
   Cash advance paid to subcontractor reduces custody balance and registers as an open deduction receivable.

---

## 20. AUDIT CHANGES — NEW AUDIT EVENTS REQUIRED

| Audit Event Action | Triggering Use Case | Metadata Captured |
|---|---|---|
| `NOMINATION_CREATED` | `createSubcontractorNomination` | `projectId, subcontractorName, estimatedAmount` |
| `NOMINATION_SUBMITTED` | `submitSubcontractorNomination` | `nominationId` |
| `NOMINATION_APPROVED` | `approveSubcontractorNomination` | `nominationId, commitmentId, authorizedAmount` |
| `NOMINATION_REJECTED` | `rejectSubcontractorNomination` | `nominationId, rejectionReason` |
| `BILLING_AUDITED` | `auditSubcontractorBilling` | `billingId, grossAmount, deductionsTotal, netPayable` |
| `BILLING_DEDUCTION_ADDED` | `addBillingDeduction` | `billingId, type, amount, reason` |
| `CUSTODY_DISBURSEMENT_RECORDED` | `issueCustody` | `custodyId, requestedAmount, disbursedAmount, delta` |
| `CUSTODY_ADVANCE_TO_SUBCONTRACTOR` | `recordCustodySubcontractorAdvance` | `custodyId, subcontractorName, amount, attachmentId` |
| `LABOR_SHEET_AUDITED` | `auditLaborSheet` | `laborSheetId, lineCount, totalAmount` |
| `LABOR_SHEET_APPROVED` | `approveLaborSheet` | `laborSheetId, totalAmount, budgetLineId` |
| `MRN_CREATED` | `createMaterialReceivingNote` | `commitmentId, quantityReceived, deliveryNoteRef` |
| `MRN_APPROVED` | `approveMaterialReceivingNote` | `mrnId, quantityAccepted, quantityRejected` |
| `MATERIAL_PAYMENT_BLOCKED` | `approveExpense` | `expenseId, commitmentId, reason: 'MRN_MISSING'` |
| `EQUIPMENT_TIMESHEET_APPROVED` | `approveEquipmentTimesheet` | `timesheetId, totalHours, totalPayable` |
| `VARIATION_ORDER_APPROVED` | `approveVariationOrder` | `commitmentId, originalCeiling, approvedDelta, newCeiling` |
| `ATTACHMENT_UPLOADED` | `createAttachment` | `entityType, entityId, fileName, sizeBytes` |
| `MILESTONE_EVIDENCE_VERIFIED` | `completeMilestone` | `milestoneId, reportId, attachmentCount` |
| `BUDGET_TRANSFER_EXECUTED` | `executeBudgetTransfer` | `sourceLineId, targetLineId, amount, reason` |
| `BUDGET_REVISION_APPROVED` | `approveBudgetRevision` | `projectId, previousBudgetId, newBudgetId, revisionNumber` |
| `OVER_BUDGET_APPROVED` | Any financial approval | `entityType, entityId, amount, overrunAmount, reason` |
| `OWNER_BILLING_APPROVED` | `approveOwnerBilling` | `ownerBillingId, amount, projectId` |
| `OWNER_PAYMENT_RECORDED` | `recordOwnerPayment` | `ownerPaymentId, amount, referenceNo` |
| `CAPITAL_INJECTION_RECORDED` | `recordCapitalInjection` | `injectionId, amount, reason, sourceAccount` |

---

## 21. UI & ROUTE CHANGES

### New Routes
- **Engineer Workspace**:
  - `/engineer/nominations/new` (CR-01)
  - `/engineer/billings/new` & `/engineer/billings/[id]` (CR-02)
  - `/engineer/labor-sheets/new` & `/engineer/labor-sheets/[id]` (CR-04)
  - `/engineer/mrns/new` & `/engineer/mrns/[id]` (CR-05)
  - `/engineer/equipment-timesheets/new` (CR-06)
  - `/engineer/variation-orders/new` (CR-07)
- **Accountant Workspace**:
  - `/accountant/billings/[id]/audit` (CR-02)
  - `/accountant/labor-sheets/[id]/audit` (CR-04)
  - `/accountant/owner-billings/new` (CR-10)
  - `/accountant/owner-payments/record` (CR-10)
- **Purchasing Workspace**:
  - `/purchasing/equipment` (CR-06)
- **Manager Workspace**:
  - `/manager/cash-flow/[projectId]` (CR-10)
  - `/manager/budgets/[id]/transfers` (CR-09)

### Existing Screen Modifications
- `components/shared/manager-top-bar.tsx` & approvals hub (`/approvals`): Add triage tabs for Nominations, Labor Sheets, MRNs, Equipment Timesheets, Variation Orders, and Over-budget exceptions.
- Progress Report detail (`/engineer/my-reports/[id]`): Add photo uploader and milestone selector.
- Project Milestones (`/manager/milestones/[id]`): Show visual evidence badge before enabling completion.
- Executive Dashboard (`/dashboard`): Add Net Liquidity, Profitability, and Capital Injection KPI widgets.

---

## 22. MIGRATION & DATA-BACKFILL RISKS

| Table | Column / Change | Risk Level | Backfill / Mitigation Strategy |
|---|---|---|---|
| `custodies` | `disbursed_amount` (Decimal) | Medium | Run backfill: `UPDATE custodies SET disbursed_amount = amount WHERE status IN ('ISSUED','PARTIALLY_SETTLED','SETTLED','CLOSED')`. For unissued drafts, leave `NULL`. |
| `subcontractor_billings` | `net_payable` (Decimal) | Low-Medium | Backfill: `UPDATE subcontractor_billings SET net_payable = gross_amount WHERE status = 'APPROVED'`. Prevents null reference in financial reports (OBD-03). |
| `subcontractor_billings` | `audited_by_id`, `audited_at` | Low | Added as nullable; existing historical records remain null without issue. |
| `subcontractor_billings` | `status` gains `AUDITED` | Low | Purely additive PostgreSQL enum value. No existing row has this status. |
| `commitments` | `nomination_id` | Low | Nullable FK; existing commitments have `NULL`. |
| `expenses` | `commitment_id` | Low | Nullable FK; existing expenses grandfathered as `NULL`. |
| Financial Tables | `is_over_budget` | Zero | Defaults to `false` in schema; existing records automatically valid. |
| `budget_lines` | `is_contingency_reserve` | Zero | Defaults to `false` in schema; existing records valid. |
| `project_milestones` | Visual Evidence Gate | Medium | Existing `COMPLETED` milestones remain completed. Gate applies strictly to future transitions to avoid historical locking. |

---

## 23. RECOMMENDED PHASING (DEPENDENCY-VERIFIED)

### Wave 0 — Infrastructure Foundation (Prerequisite)
- **Slice 18: Attachment Infrastructure (CR-08 base)**
  - `Attachment` Prisma model, enum, upload service abstraction, MIME/size validation.
  - Zero behavioral impact on existing slices; immediately unblocks photo evidence for all subsequent slices.

### Wave 1 — Core Subcontractor Workflow
- **Slice 19: CR-01 Subcontractor Nomination** (Field proposal $\rightarrow$ converted commitment).
- **Slice 20: CR-07 Variation Orders** (Expands commitment billing ceiling).
- **Slice 21: CR-03 Custody Redesign** (Disbursed amounts & subcontractor advance recording).
- **Slice 22: CR-02 BOQ Subcontractor Billing** (3-party BOQ workflow; relies on Slices 18, 19, 20, 21).

### Wave 2 — Field Operational Capture
- **Slice 23: CR-04 Site Labor Sheets** (Attendance grid, evidence upload, labor exposure).
- **Slice 24: CR-05 Material Receiving Notes** (Field inspection, signed delivery bill, expense gate).
- **Slice 25: CR-06 Equipment Timesheets** (Machine registry, contractual rates, daily hours).
- **Slice 26: CR-08 Visual Progress & Milestone Evidence Gate** (Report attachments, milestone completion gate).

### Wave 3 — Financial Governance
- **Slice 27: CR-09 Flexible Budgets & Soft Limits** (Inter-line transfers, revisions, soft limit exceptions across all approval use cases).
- **Slice 28: CR-10 Project Cash Flow & Owner Inflows** (Owner billing, collections, capital injections, liquidity & profit dashboard).

---

## 24. OPEN BUSINESS DECISIONS (OBD-01 TO OBD-14)

| ID | CR | Question | Recommended Architectural Default |
|---|---|---|---|
| **OBD-01** | CR-01 | Can Manager adjust commitment amount during nomination approval? | **Yes**: Manager inputs the finalized authorized contract amount at approval. |
| **OBD-02** | CR-02 | Does commitment ceiling apply to `grossAmount` or `netPayable`? | **grossAmount**: Work performed encumbers the contract; deductions are payment recovery mechanics. |
| **OBD-03** | CR-02 | Should existing APPROVED billings have `netPayable` backfilled? | **Yes**: Backfill `netPayable = grossAmount` to ensure reporting consistency. |
| **OBD-04** | CR-03 | Add `disbursedAmount` alongside `amount` or rename column? | **Add new column**: Keep `amount` as requested amount to avoid risky PostgreSQL column renames. |
| **OBD-05** | CR-03 | Does undisbursed custody cash release to budget immediately upon issuance? | **Yes**: At `ISSUED` state, the unissued portion releases back to available balance. |
| **OBD-06** | CR-04 | Should `PayrollEntry` and `LaborSheet` coexist permanently? | **Yes**: `PayrollEntry` for central site salary entries; `LaborSheet` for daily attendance labor. |
| **OBD-07** | CR-05 | Does MRN gate allow partial shipments with proportional payment? | **Yes**: Partial shipments permitted; payment capped at `quantityAccepted * contractualUnitPrice`. |
| **OBD-08** | CR-05 | MRN-to-expense linkage: direct FK on `Expense` or query-based gate? | **Direct FK**: Add optional `commitmentId` FK on `Expense` for `MATERIALS` spend. |
| **OBD-09** | CR-05 | Are small petty cash material purchases under custody exempt from MRN? | **Yes**: Custody expenses under 2,000 SAR for petty supplies are exempt; PO commitments require MRN. |
| **OBD-10** | CR-06 | Equipment master: system entity or free text? Who manages? | **System Entity**: Managed by `Role.PURCHASING` to ensure standardized hourly rates. |
| **OBD-11** | CR-06 | Does `EquipmentContract` link to an approved Commitment? | **Yes**: Links to approved Commitment under `BudgetCategory.EQUIPMENT`. |
| **OBD-12** | CR-07 | Is VO-to-billing-line linkage enforced at submission? | **Yes**: Billing lines exceeding base contract quantities must specify an approved `variationOrderId`. |
| **OBD-13** | CR-08 | What exact evidence is required to complete a milestone? | **Approved Report**: At least one approved `ProgressReport` with $\ge 1$ attachment linked to milestone. |
| **OBD-14** | CR-10 | Who originates `OwnerBilling`? Accountant or Manager? | **Accountant**: Prepares draft invoice; `Role.MANAGER` reviews and approves. |

---

## 25. EXPLICIT NON-GOALS (PER AGENTS.MD §3 & §4)

The following capabilities are strictly **OUT OF SCOPE** and must never be introduced:
- Full General Ledger, Chart of Accounts, or journal entries.
- Automated bank feeds or automated bank reconciliation.
- HR contract processing, GOSI, payroll tax calculations, or employee leave management.
- Worker/Employee master table (plain text worker names only per AGENTS.md §3).
- Warehouse stock tracking, bin management, or inventory valuation.
- Project Gantt charts or critical path scheduling algorithms.
- CRM or client relationship portal.
- Multi-currency support (SAR only).
- Multi-tenancy / multi-company partitioning.
- Native mobile applications (responsive web / PWA only).
- Real-time WebSockets or external message queues.

---

## 26. RECOMMENDED FIRST IMPLEMENTATION SLICE

### **SLICE 18: ATTACHMENT INFRASTRUCTURE (Wave 0)**

#### Rationale
- **Zero Regression Risk**: Additive foundation that touches no existing business logic or approval workflows.
- **Universal Prerequisite**: Required by CR-02 (billing execution photos), CR-03 (custody receipt images), CR-04 (attendance sheet images), CR-05 (signed delivery bills), CR-06 (driver slips), and CR-08 (progress photos).
- **Clean Architecture**: Implements a unified polymorphic storage abstraction once, rather than ad-hoc file handling across multiple slices.

#### Scope of Slice 18
1. **Prisma Model**: `Attachment` table + `AttachmentEntityType` enum + PostgreSQL migration.
2. **Storage Abstraction**: URL-based storage provider interface (`IStorageService`) with server-side local/cloud driver.
3. **Security & Validation**: Server-side MIME allowlist (JPEG, PNG, WebP, PDF), maximum size limit (10MB), and path sanitization.
4. **Use Cases & Queries**: `createAttachment`, `getAttachmentsForEntity`, `softDeleteAttachment`.
5. **Testing**: 100% test coverage across validation, authorization, and storage abstractions.
6. **No Production UI Routes**: Slices 19–26 will consume the component directly.

---

## BUSINESS LOGIC CHANGE REVIEW — WAITING FOR DESIGN APPROVAL