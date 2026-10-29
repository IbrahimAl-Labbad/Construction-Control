# DESIGN CORRECTIONS & BUSINESS DECISION ADDENDUM — DESIGN PROPOSAL (OWNER DECISIONS PENDING EXCEPT `UC-1`)

> **Traceability correction (2026-10-29, Specification Closure Gate).** The only item with a verified, explicit Owner approval is **`UC-1`** (Owner instruction of 2026-10-11: `ROUND_HALF_UP` to 2 dp via `Decimal` before the cumulative cap). Every other item in this document that is labelled "APPROVED & LOCKED", "LOCKED" or "decision-locked" (`C-*`, `R-01`–`R-07`, `BD-03`, `BD-05`, `BD-09`–`BD-21`, `UC-2`, `UC-3`, CR-09 boundary rules) is an **unapproved proposal / agent recommendation**; no Owner approval record exists in the repository for it. See `docs/OWNER_DECISION_BRIEF_CR01_CR10.md` (finding `AUD-01`) and `docs/CR01_CR10_SPEC_CLOSURE_GATE_REPORT.md`. Unresolved Owner decisions block implementation. Remaining "LOCKED"/"locked" wording in the body that this notice has not individually rewritten must be read as "proposed, not Owner-approved" (except for `UC-1`).

**Project:** Construction Control — Management Control Layer (Business Logic Change Program v2.0: CR-01 → CR-10)  
**Baseline:** Slices 1–20 | Branch: `slice-20` | Commit: `c9f0e28` | Contract: `AGENTS.md v1.2.0`  
**Document Status:** `DESIGN PROPOSAL — NOT READY FOR IMPLEMENTATION APPROVAL (Owner decisions pending; see OWNER_DECISION_BRIEF_CR01_CR10.md)` (Zero Code/Schema Implementation Performed by this document)

**Decision Status Summary:** Only `UC-1` is verified as Owner-approved. Business Decisions (`BD-03`, `BD-05`, `BD-09`–`BD-21`), Retention open points `UC-2` and `UC-3`, Recommended Design Defaults (`R-01`–`R-07`), and CR-09 Revision Lineage boundary rules are **proposals awaiting explicit Owner decision**; they were previously mislabelled "APPROVED & LOCKED".

---

## 1. Document Status *(Only `UC-1` Owner-approved — Other Decisions Pending)*

| Item | Value |
|---|---|
| Baseline | Slices 1–20, branch `slice-20`, commit `c9f0e28` |
| Contract | `AGENTS.md v1.2.0` |
| Nature | Authoritative Design Specification. Every CR (`CR-01` → `CR-10`) is **specified as a design proposal**; unresolved Owner decisions and open audit findings remain (see the Owner Decision Brief). No code or schema changes have been executed yet. |
| Owner decisions on record | **`UC-1` only** (Owner instruction of 2026-10-11). `C-01`–`C-12` are labelled "confirmed" here but the upstream specification is not in the repository; `C-12` is an `AGENTS.md` constraint. `R-01`–`R-07`, `BD-03`, `BD-05`, `BD-09`–`BD-21`, `UC-2`, `UC-3`, and CR-09 boundary rules have **no Owner approval record** and are proposals. |
| BD-11 & UC-1..UC-3 | **`UC-1` OWNER-APPROVED**: `ROUND_HALF_UP` to 2 dp via `Decimal` before the cumulative cap. **`BD-11` (Owner-proposed), `UC-2` (post-approval commitment term immutability with statement-level audit reduction) and `UC-3` (fixed SAR `Decimal(15,2)` cap snapshot at commitment approval) are PROPOSED — pending explicit Owner decision** (§4 CR-02, §16; Owner Brief OD-01A/B/C). |
| Sources | `docs/CR_Impact_Architecture_Review.md`, the repository baseline at `c9f0e28`, `AGENTS.md v1.2.0`, and Owner decision locks. |
| Location of this document | `docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md` |

**Vocabulary used throughout:**
- **CONFIRMED**: stated by the CR requirements or forced by the repository.
- **ARCHITECTURAL CONSTRAINT**: forced by the existing codebase or `AGENTS.md`.
- **OWNER-APPROVED**: explicitly approved by the Owner in a verifiable record. Currently only `UC-1`.
- **PROPOSED (unapproved)**: recommended design default or business decision (previously labelled "APPROVED & LOCKED (Best Practice)") that still requires an explicit Owner decision before implementation.

**Repository findings that changed the design:**

| # | Finding | Consequence |
|---|---|---|
| F1 | `approveExpense` is the only point where spend becomes "actual". There is no payment or disbursement subsystem. The only real cash-release step is `issueCustody`. | The MRN gate belongs at expense approval (§4, CR-05). Actual outflow cannot be bank-based (BD-10). |
| F2 | `lib/variation-orders/calculations.ts` defines `calculateEffectiveCommitmentCeiling` and `calculateRevisedBudgetLineCeiling`, but nothing in `lib/` uses them. Billing approval checks `Commitment.amount` only. `approveVariationOrder` already locks `budget_lines → commitments → variation_orders`. | Slice 20 is **EXTEND**, not NO IMPACT (§11). |
| F3 | `Commitment` has a single `amount` and no lines. `Expense` has no `commitmentId`. | Quantity-level control needs a new `CommitmentItem`. MRN needs an Expense↔Commitment link, which changes the exposure formula (§4 CR-09, R-02). |
| F4 | The over-budget check runs at `approveCommitment`, `approveExpense` and `issueCustody`. In `issueCustody` the actor is the Accountant. | The soft-limit design must handle a non-Manager actor (BD-20). |
| F5 | Milestones are Manager-managed (Slice 12). Progress reports are approved by the Manager (Slice 10). | Milestone completion by the Manager is an **ARCHITECTURAL CONSTRAINT** (BD-17). |
| F6 | Prior text said approved equipment timesheets add budget exposure. That would double-count the commitment. | Corrected in §4 CR-06 and §6. |

---

## 2. Executive Summary *(Proposals — Only `UC-1` Owner-approved)*

1. **Decision status.** Only `UC-1` is Owner-approved. Core rules (`C-01`–`C-12`, confirmed per upstream specification not present in the repository), design defaults (`R-01`–`R-07`), and Business Decisions (`BD-03`, `BD-05`, `BD-09`–`BD-21`, `UC-2`, `UC-3`, and CR-09 boundary rules) are **proposals pending explicit Owner decision** (§3, §16). No CR in the Acceptance Matrix (§15) is ready for implementation approval.
2. **Contract identity.** `Nomination → NominationItem → Commitment → CommitmentItem → BillingLine` is a single immutable chain. Billing lines cannot choose their rate or their VO.
3. **Variation Orders (BD-12, PROPOSED).** A VO never changes the rate of an existing item. It adjusts quantity at the same rate (`QUANTITY_ADJUSTMENT`), or creates a new item with its own rate (`ADDITIONAL_ITEM`). The billing check is a pooled quantity check.
4. **Billing concurrency.** The database ledger under row locks is the source of truth. Stored cumulative values are informational.
5. **Advance recovery (BD-18, PROPOSED).** Recovery moves through an append-only ledger with `RESERVED`, `CONFIRMED` and `RELEASED` entries. Advances are verified by the Accountant. Engineers cannot edit recovered amounts.
6. **Retention (`UC-1` Owner-approved; BD-11, UC-2, UC-3 PROPOSED).** The proposed rule is that the rate and cumulative cap come from each subcontract (no universal default rate or cap). Calculated retention on statement Gross is rounded half-up (`ROUND_HALF_UP`) to 2 decimal places (halalas) using `Decimal` before applying the remaining cap (`UC-1`, Owner-approved). Proposed, pending Owner decision: commitment retention terms immutable after approval, with operational flexibility via statement-level Accountant reduction with a mandatory reason (`UC-2`, `BD-11`); cumulative caps stored and enforced as a fixed SAR `Decimal(15,2)` amount snapshot at commitment approval (`UC-3`; alternatives `1C-2`–`1C-4` are documented in the Owner Brief). Retention release is out of v1 scope.
7. **Material gate (BD-05 & BD-13, PROPOSED).** Engineer creates MRN, Manager approves (`creator ≠ approver`). The payment gate sits at `approveExpense` and is quantity-level across all `MATERIALS` expenses, which must link to a `CommitmentItem`.
8. **Cash flow (BD-10 & BD-21, PROPOSED).** Operational outflow is tracked as "Recognized Outflow (approved basis)". Owner billing is recognized upon Manager approval. Financing repayments are separate from project cost.
9. **Capital injection (BD-09, PROPOSED).** `PERMANENT_EQUITY` has no balance and no repayment. `TEMPORARY_FINANCING` has an append-only repayment ledger.
10. **Locking.** One strictly ascending lock hierarchy with **no pre-lock exceptions**. The nomination lock is an ordinary level-6 lock (§7).
11. **Exposure.** One definition of active exposure, pending projection and available balance. Pending is derived, never a reservation, and nothing is counted twice (§4 CR-09).
12. **Revisions.** Budget revision mapping is a reporting-only lineage. It never re-binds historical records; superseded lines are closed to new commitments/unlinked expenses while existing commitments/custodies settle normally (§4 CR-09).
13. **Wave 2 dependency.** CR-06 depends on CR-05, because both share one expense-matching gate (§12).

---

## 3. Final Business Decisions

### 3.1 CONFIRMED (traceable to the CR sources or forced by the repository)

| ID | Decision | Basis |
|---|---|---|
| C-01 | The Engineer proposes a subcontractor nomination. Manager approval turns it into an official Commitment. Rejection keeps its reason. | CR-01 |
| C-02 | Subcontractor billing runs Engineer (BOQ + evidence) → Accountant (audit, deductions, net) → Manager (final approval). | CR-02 |
| C-03 | Gross is Σ(executed quantity × contractual rate). Net is Gross minus advance recovery, retention, penalties and other approved deductions. Net must not be negative. | CR-02 |
| C-04 | A subcontractor advance is paid from custody, evidenced by a receipt, reduces the custodian's balance, and is later recovered through billing. Liability equals `disbursedAmount`. | CR-03 |
| C-05 | An approved VO raises the effective billing ceiling without mutating the commitment. | CR-07 |
| C-06 | Material payment requires an approved MRN with signed evidence. | CR-05 |
| C-07 | Over-budget is a soft limit. It needs a Manager exception, a reason and an audit event. | CR-09 |
| C-08 | Budget revisions create new versions. The original baseline is immutable. | CR-09 |
| C-09 | Owner billing, owner payment and capital injection are distinct concepts. Commitment is not outflow. Billing is not payment. Injection is not revenue. | CR-10 |
| C-10 | Milestone completion requires visual evidence. | CR-08 |
| C-11 | Expenses and advances require photo evidence. | CR-03, review §6.2 |
| C-12 | Money is Decimal-only, financial records are never hard-deleted, and every transition writes an audit entry in the same transaction. | `AGENTS.md` §13, §14, §21 |

### 3.2 PROPOSED DESIGN DEFAULTS (R-01 → R-07, PROPOSED - not Owner-approved)

| ID | Default |
|---|---|
| R-01 | **Commitment amount** = Σ nomination lines, each line rounded half-up to 2 dp. The Manager cannot override with a lump sum. A rate change means the Engineer amends the BOQ. |
| R-02 | **Commitment relief.** A commitment's contribution to exposure is `max(EffectiveAmount, ApprovedLinkedExpenses)`. The linked approved expenses are the actual-spend part, and the remainder is the open part. This applies only to commitments that receive expenses (materials, equipment). Subcontractor commitments keep their full amount, because billings certify and do not post expenses. The full formulas are in §4 CR-09. |
| R-03 | **Rounding.** Line amount = quantity × rate, rounded half-up (`ROUND_HALF_UP`) to 2 dp once per line using `Decimal`. Gross is the sum of the rounded lines. For retention: `Calculated Retention = round_half_up(Gross × Rate ÷ 100, 2)` via `Decimal` before applying the cumulative cap (`UC-1`, locked in §4 CR-02). |
| R-04 | **Reversal authority.** Reversing any approved financial record is Manager-only. It needs a mandatory reason, is flagged in the audit log, and uses a compensating entry. It is never a deletion. |
| R-05 | **Evidence is checked at SUBMIT.** The minimum evidence per record type is in §9. |
| R-06 | **Generic reason rule.** Every override, rejection and reversal needs a non-empty trimmed reason. Length thresholds are not specified, because they are unsourced. |
| R-07 | **Seven Billing statuses.** `DRAFT, SUBMITTED, AUDITED, APPROVED, REJECTED, CANCELLED, REVERSED`. The Accountant may reject at the audit stage and the Manager at the approval stage. The rejecting role is recorded. |

---

## 4. CR-01 → CR-10 Final Specifications

### CR-01 — Subcontractor Nomination → Commitment

- **Aggregate:** `SubcontractorNomination` with `SubcontractorNominationItem` lines.
- **Author:** Engineer assigned to an ACTIVE project.
- **Budget line:** category `SUBCONTRACTOR`, same project, approved budget. The nomination's `budgetLineId` is **immutable from SUBMITTED onward**. This lets approval resolve its lock target safely (§7).
- **Retention terms:** entered with the nomination from the subcontract agreement (see CR-02 and BD-11). They are fixed when the commitment is approved.
- **Total:** `estimatedAmount` is a server-computed Σ item lines. It is not a free input.
- **Approval:** Manager only, and the Manager cannot be the creator or the submitter.
- **Approval effect:** in a single transaction it creates the Commitment as `APPROVED`, creates the `CommitmentItem` rows, and links the nomination to the commitment.
- **Bypass guard:** after cutover, Purchasing cannot create commitments on `SUBCONTRACTOR` lines. Otherwise Purchasing could skip the BOQ path (BD-14).
- **Cardinality:**
  - One approved nomination produces exactly one commitment.
  - `Commitment.nominationId` is UNIQUE and nullable (nullable because Purchasing commitments have no nomination).
  - `Nomination.resultingCommitmentId` is UNIQUE and NULL until approval.
  - Both are set in the same transaction.
- **Retry safety and duplicate approval** (no lock exception):
  - Approval follows the canonical order: it locks the `budget_lines` row first, then the nomination row (a level-6 header lock), then revalidates.
  - Concurrent approvals of the same nomination, and of any nomination on the same line, serialize on the budget-line lock. They then queue on the nomination row.
  - The second caller finds the nomination already `APPROVED` with a commitment, and returns that commitment without creating anything. If the status is not `SUBMITTED` and there is no commitment, it fails.
  - The UNIQUE constraints on `resultingCommitmentId` and `nominationId` are the final backstop.
- **Duplicate nominations:** a second `SUBMITTED` nomination with the same project, normalized subcontractor name and budget line is rejected while the first is open. This is enforced by a **partial UNIQUE constraint on those columns where status is SUBMITTED**, so it needs no extra lock.

**`CommitmentItem.nominationItemId`:**
- It is **nullable by design**, because one generic `CommitmentItem` table serves three sources.
- A `sourceType` of `NOMINATION | PURCHASING | VARIATION` determines which source link must be present:
  - NOMINATION requires `sourceNominationItemId` (UNIQUE).
  - VARIATION requires `sourceVariationOrderLineId` (UNIQUE).
  - PURCHASING requires both to be null.
- A `CHECK` constraint enforces this.
- For every subcontractor commitment created by nomination, the nomination link is mandatory.
- Items are free-text lines per commitment. They are **not** a catalog or item master (`AGENTS.md` §4).

### CR-02 — Subcontractor Billing *(UC-1 Owner-approved; BD-11, UC-2, UC-3 PROPOSED)*

**Entities:** `SubcontractorBilling`, `SubcontractorBillingLine`, `BillingDeduction`, and the advance recovery ledger (CR-03).

**Billing line identity:**
- `commitmentItemId` is mandatory.
- The server sets `unitRate` as a snapshot of `CommitmentItem.contractRate`. The client cannot supply it.
- Unique per `(billingId, commitmentItemId)`.
- There is **no user-chosen VO field**. VO quantity is a pooled extension of the item (BD-12).

**Quantity rule:**
- `Effective Qty(item) = contractQuantity + Σ approved VO quantity adjustments on the item`.
- Cumulative approved billed quantity must be ≤ `Effective Qty(item)`.
- An ADDITIONAL_ITEM VO line becomes its own `CommitmentItem` with its own `contractRate`.

#### Retention — UC-1 OWNER-APPROVED; BD-11, UC-2, UC-3 PROPOSED

*Scope note:* retention here is a contractual holdback on a subcontractor statement. It is not tax withholding, which `AGENTS.md` §4 excludes.

1. **Terms come from each subcontract.**
   - The retention rate and the cumulative retention cap are defined separately in each subcontract agreement.
   - The system has **no universal default rate and no universal numerical cap**.
   - The rate is an explicit percentage entered for the subcontract. `0.00` is allowed only as an explicit entry for an agreement that withholds nothing. It is never a default. A percentage has the structural validity bound 0–100, which is not a policy range.
   - The cap has exactly one of two explicit forms:
     - **Cap amount** (`≥ 0.00`). A cap of `0.00` is a real cap: nothing may be retained.
     - **Explicitly no cumulative cap.**
   - The two forms are stored as separate fields (a cap mode and a cap amount that is empty when there is no cap). An absent cap and a cap of zero are therefore never confused.
   - A nomination with the rate or the cap form left unspecified cannot be submitted.
2. **Terms are fixed at commitment approval (UC-2 PROPOSED).**
   - The terms entered on the nomination become the commitment's retention terms when the commitment is approved. After that they are **strictly immutable** on the commitment record (preserving the append-only contract snapshot).
   - **Real-world operational rule (UC-2):** In-place mutation of an approved commitment's retention rate or cap is prohibited in v1. Operational flexibility for specific billing statements is handled exclusively through the audited statement-level Accountant reduction (Point 5 below) with mandatory reason and Manager visibility/approval.
3. **Calculation basis & Rounding (UC-1 OWNER-APPROVED).**
   - The initial amount is calculated on the **current statement's Gross Amount, before any other deduction**.
   - `Calculated Retention = round_half_up(Gross × Rate ÷ 100, 2)`.
   - **Rounding rule (UC-1):** Exactly `ROUND_HALF_UP` to two decimal places (halalas) using `Decimal` arithmetic only (no floating point): when the third decimal digit is `≥ 5`, round up; when `< 5`, round down. Applied to `Calculated Retention` *before* evaluating the cumulative retention cap.
4. **Cumulative cap.**
   - Where the contract has a cap amount: `Actual Retention = min(Calculated Retention, max(Cap − Previously Retained, 0))`.
   - **Previously Retained** = Σ retention deductions on the `APPROVED` statements of the same commitment. It excludes the current statement. A statement that is `REVERSED` no longer counts, because its deductions are voided. Statements that are still pending do not count.
   - Because the current statement is excluded and only approved history is summed, prior retention is never counted twice.
   - Where the contract states no cap: `Actual Retention = Calculated Retention`. No cap is invented.
5. **Accountant adjustment (statement level only).**
   - During audit, the Accountant may **reduce** the retention for the current statement only, to any amount from `0.00` up to `Actual Retention`.
   - A non-empty reason is mandatory. The statement stores the calculated, cap-limited and adjusted amounts, a flag that an adjustment was made, and the reason. An audit event records who changed it, from what and to what.
   - The adjustment never changes the commitment's rate or cap. It does not affect any other statement or any approved statement. The reduced amount is not carried forward, because later statements use their own Gross and the cap formula above.
6. **Final approval.**
   - The Manager keeps final approval authority over the statement, unchanged.
   - A statement with an adjustment is visibly flagged to the Manager. There is no separate approval step for the adjustment.
7. **Release of retention is outside BD-11.**
   - No release condition and no release workflow is specified in any authoritative source, and none is invented here.
   - The held amount is a derived figure, computed only as the input to the cap formula and to reporting.

**Safeguards:**
- All retention amounts use Decimal only. No floating-point.
- **Authoritative approval check.** At approval, under the existing locks (§7), the system recomputes Previously Retained from approved history. If the statement's retention would exceed the remaining cap, for example because two statements were audited concurrently, the approval is refused. Nothing is changed silently. The statement returns through the existing `REJECTED` path and is re-audited.
- After `AUDITED` the retention figures are immutable.
- The retention deduction cannot exceed the statement's Gross, and total deductions still cannot exceed Gross.
- *Representation clarification (no behaviour change):* deduction rows require an amount `> 0.00`. When the final retention is `0.00` (zero rate, exhausted cap, or a reduction to zero), no retention deduction row is created. The statement's retention snapshot fields still record the calculated, cap-limited and adjusted figures.
- Commitments that predate this design have no retention terms. How they are handled belongs to BD-14 and is unchanged.

**Resolved Retention Design Points (UC-1 Owner-approved; UC-2, UC-3 PROPOSED):**
- **UC-1 (Rounding — OWNER-APPROVED):** `Calculated Retention = round_half_up(Gross × Rate ÷ 100, 2)` using exact `Decimal` arithmetic (`ROUND_HALF_UP` to 2 decimal places / halalas: third decimal digit `≥ 5` rounds up, `< 5` rounds down) applied after multiplying Gross by the contract rate and *before* applying the cumulative retention cap.
- **UC-2 (Post-approval term immutability — PROPOSED):** Commitment retention terms (`retentionRate`, `retentionCapMode`, `retentionCapAmount`) are frozen upon Commitment approval. No post-approval mutation of commitment retention terms is permitted in v1; statement-by-statement exceptions use the audited Accountant reduction (Point 5).
- **UC-3 (Cap representation & percentage-form contracts — PROPOSED):** The cumulative cap is stored and enforced as an explicit SAR `Decimal(15,2)` amount (`retentionCapAmount`) when `retentionCapMode = CAP_AMOUNT`, or `null` when `retentionCapMode = NO_CAP`. In real-world operations where a paper subcontract expresses the cap as a percentage of the original contract price (e.g., 5% of subcontract value), it is converted at Nomination entry via `round_half_up(OriginalSubcontractAmount × CapPercent ÷ 100, 2)` into the fixed SAR `retentionCapAmount` and snapshotted immutably upon Commitment approval.

**Deductions:**
- Types are `ADVANCE_RECOVERY`, `RETENTION`, `PENALTY`, `OTHER`. Amounts are positive.
- Only the Accountant creates or edits them, and only while the billing is `SUBMITTED` and being audited.
- After `AUDITED` they are immutable.
- `Σ deductions ≤ Gross`.
- The deduction formula is unchanged: `Net = Gross − (Advance Recovery + Retention + Penalties + Other)`. Retention is calculated on Gross, so the order of the other deductions does not affect it.

**Lifecycle** (§10): `DRAFT → SUBMITTED → AUDITED → APPROVED`, with `REJECTED`, `CANCELLED` and `REVERSED` as exits.

**Checks by stage:**

| Stage | Check | Nature |
|---|---|---|
| Submit | Item belongs to the commitment. Quantity ≤ remaining (counting approved plus pending). Evidence present. | Advisory; may be stale |
| Audit | Re-check under locks. Create deductions and advance reservations. Calculate retention and apply the cap. | Advisory for quantity and cap |
| **Approve** | Full re-check under locks. Quantity, money and the retention cap use **approved** history only. | **Authoritative** |

### CR-03 — Custody and Subcontractor Advances

**Custody amounts:**
- `Custody.amount` is retained as the requested amount.
- `disbursedAmount` is set by the Accountant at issuance. It is mandatory and must satisfy `0 < disbursedAmount ≤ amount`.
- Liability, exposure and settlement use `disbursedAmount`.
- It is immutable after `ISSUED`. A correction uses an explicit Manager-approved adjustment record.
- The difference `amount − disbursedAmount` is not exposure.
- Every disbursement writes an audit event with the delta.

**Remaining balance** = `disbursedAmount − approved expenses − verified advances − cash returned`. It must be ≥ 0.

**Advance (`CustodySubcontractorAdvance`):**
- It belongs to one custody and one commitment.
- The commitment must be the subcontract of the same project and the same budget line as the custody (BD-18, PROPOSED).
- The Engineer who is the custodian creates it. The receipt attachment is mandatory at creation.
- Status flow: `RECORDED → VERIFIED | REJECTED`.
- Verification is by the Accountant (BD-18, PROPOSED).
- Only `VERIFIED` advances can be recovered. Only `VERIFIED` advances reduce custody remaining. A rejected advance leaves the liability with the custodian.
- The advance cannot be created on a custody that is not `ISSUED` or `PARTIALLY_SETTLED`, and cannot exceed the custody remaining.

**Recovery ledger (`AdvanceRecoveryEntry`, append-only):**
- Entry states are `RESERVED`, `CONFIRMED`, `RELEASED`.
- `RESERVED` is created at billing audit.
- It becomes `CONFIRMED` at billing approval.
- If the billing is rejected, cancelled or reversed, a compensating `RELEASED` entry is appended.
- **Remaining(advance)** = `original − Σ(RESERVED + CONFIRMED entries not released)`. The ledger is the source of truth. Any stored `recoveredAmount` or `remainingBalance` is a cache, recomputed and verified under lock.
- Each `ADVANCE_RECOVERY` deduction maps to exactly one ledger entry.
- The Engineer cannot edit any recovery value.
- Recovery is allowed only when the advance's commitment equals the billing's commitment.

**Locking and invariants:**
- The advance row is locked as part of audit and approval (§7).
- `Σ(RESERVED + CONFIRMED) ≤ advance amount`.
- Partial recovery is allowed. Full recovery makes the advance `FULLY_RECOVERED`.
- Over-recovery is rejected.
- A duplicate deduction is prevented by a unique `(billingId, advanceId)` among active deductions.
- A disputed billing is simply `REJECTED`, which releases its reservations.
- No recovery is allowed once an advance is `FULLY_RECOVERED`.

### CR-04 — Site Labor Sheet

- **Entities:** `SiteLaborSheet` and `SiteLaborSheetLine`.
- **Uniqueness (BD-19, PROPOSED):** one active sheet per `(projectId, laborBudgetLineId, periodYear, periodMonth)`. The creator is not part of the key.
  - A `CANCELLED` or soft-deleted sheet frees the slot.
  - A `REJECTED` sheet keeps the slot and is reopened.
  - If several engineers cover one project, the sheet's owner is its creator and no one else may edit it.
- **Line fields:** worker name (text only, no master table), trade, attendance days, daily wage, overtime hours, overtime rate, line total.
- **Calculation (BD-03, PROPOSED):**
  - `Regular = round_half_up(days × dailyWage, 2)`.
  - `overtimeRate = round_half_up((dailyWage ÷ projectStandardDayHours) × 1.50, 2)`, where `projectStandardDayHours` defaults to `8` hours/day (configurable per project).
  - `Overtime = round_half_up(overtimeHours × overtimeRate, 2)`.
  - `Line Total = Regular + Overtime`.
  - The 1.50× overtime multiplier and 8-hour divisor are proposed as an internal management control rule, not a legal payroll calculation.
- **Evidence:** at least one attendance or timesheet attachment before `SUBMITTED`.
- **Workflow:** Engineer → Accountant audit → Manager approval.
- **Relation to Payroll:** `PayrollEntry` (Slice 8) remains for Accountant-entered amounts. `SiteLaborSheet` is for field attendance-based labor. Both affect the `LABOR` line exposure when approved. To avoid double entry, a worker-period must not appear in both (BD-19, PROPOSED).

### CR-05 — Material Receiving Note and Payment Gate

**Which commitment is a material purchase** (ARCHITECTURAL CONSTRAINT, F3):
- A Purchasing-authored `Commitment` on a `MATERIALS` line is the PO.
- Purchasing must enter its lines as `CommitmentItem` rows with `sourceType = PURCHASING`. Without lines there is no item-level gate.
- No new "PO" entity is introduced.

**Chain:** Commitment → CommitmentItem (ordered qty, rate) → MRNItem (delivered, accepted, rejected) → Expense material line (invoiced qty).

**MRN rules:**
- `Delivered = Accepted + Rejected`.
- Cumulative accepted over approved MRNs ≤ ordered quantity per item.
- A rejected quantity can never become payable.
- Source of truth for payable quantity: `Σ accepted (APPROVED MRNs) − Σ invoiced (APPROVED expenses)`, recomputed under lock.

**Expense material lines:** a `MATERIALS` expense carries lines `(commitmentItemId, invoicedQuantity)`. The rate comes from the item. Totals are recomputed server-side.

**Gate (single, no split):**

| Step | Checks |
|---|---|
| `submitExpense` | Structural only: the commitment is `APPROVED`, same project and line, lines present, evidence attached. It also shows advisory quantity availability. It blocks nothing financial. |
| `approveExpense` | **Authoritative.** Under locks: the commitment's MRNs are `APPROVED`, invoiced quantity ≤ accepted − previously invoiced per item, then the budget check (soft limit, C-07). A failure writes `MATERIAL_PAYMENT_BLOCKED`. |

**Scope (BD-13, PROPOSED):** the gate applies to **every** `MATERIALS` expense. There is no petty-cash or amount threshold. A `MATERIALS` expense without a commitment line is rejected at submit, so even custody-paid material purchases require an approved Purchasing commitment and MRN.

**Authority (BD-05, PROPOSED):** Engineer creates, receives, inspects, and submits the MRN; **Manager approves** (`creator ≠ approver`).

### CR-06 — Equipment

**Scope (BD-16, PROPOSED):**
- The `Equipment` registry covers **rented or supplier-provided** equipment under an `EquipmentContract` tied to an EQUIPMENT-line commitment.
- Company-owned equipment is not payable and is out of CR-06.
- Purchasing manages the registry and contract rates.

**Timesheet:**
- Per equipment-contract per date. Fields: date, start and end time, meter start and end, operator name, work description, hours, contract rate, total.
- **Hours:**
  - If the equipment is registered with an hour-meter basis: `Hours = Meter End − Meter Start`.
  - Otherwise: `Hours = End time − Start time`.
  - The basis is set in the registry, so hours have exactly one source.
- **Invariants:** `Meter End ≥ Meter Start`, `Hours ≥ 0`, `Total = Hours × contract rate`. The rate is a server snapshot from the contract. The client cannot supply it.
- **Meter failure** (the only override, BD-16):
  - The Engineer records the timesheet on clock-time basis.
  - A reason and evidence are mandatory.
  - The record is flagged `METER_FAILURE` and writes an audit event.
  - The Manager approves the timesheet knowingly.
  - There are no other manual overrides.
  - Hours cannot change after approval.
- **Signatures:** the system has no signature capture. The driver's signature and the engineer's signature are evidenced on a **signed field-ticket attachment**, which is mandatory at submit. The Engineer's submit is the in-system engineer attestation.
- **Authority:** Engineer creates, Manager approves (the Accountant matches invoices).

**Exposure** (correction of F6): approved timesheets do **not** add exposure. They certify hours against the commitment, which already encumbers the line.

**Invoice matching:** an equipment-supplier invoice is an Expense linked to the commitment, and the same gate as materials applies at `approveExpense`: invoiced hours ≤ approved timesheet hours − previously invoiced.

### CR-07 — Variation Order Integration

- VO line types (**new, extending Slice 20**):
  - `QUANTITY_ADJUSTMENT`: references a `CommitmentItem`, same rate, quantity delta.
  - `ADDITIONAL_ITEM`: creates a new `CommitmentItem` (source `VARIATION`) at approval.
- A VO that changes the rate of an existing item is rejected at creation.
- The `impactAmount` is the server-computed sum of line deltas.
- Only `APPROVED` VOs count.
- A negative adjustment is rejected if it would drop effective quantity below the cumulative approved billed quantity.
- **Effective commitment ceiling** = `Σ(effective qty × item rate)`. This equals `Commitment.amount + approved VO impact`, and both must agree.
- VO approval is a budget-consuming operation. A positive impact raises the commitment's exposure (`Eff_C` in §4 CR-09) and passes through the soft-limit check (C-07). Slice 20 already holds the right locks.
- Billing is blocked when the VO is not approved or the quantity is above effective quantity.
- Several VOs on one item form a pool, so one VO's quantity cannot be reused. A per-VO allocation view is derived for reporting only.

### CR-08 — Visual Progress and Milestones

- **Chain:** ProgressReport ↔ Milestone (many-to-many) ↔ Attachment (on the report).
- **Roles (Slice 10 and 12, ARCHITECTURAL CONSTRAINT):**
  - The Engineer creates the report and attaches evidence.
  - The Manager approves the report.
  - The **Manager** marks the milestone `COMPLETED`.
- **Gate:** completion requires at least one linked report that is `APPROVED` and has at least one active (non-voided) attachment. Otherwise `MILESTONE_EVIDENCE_MISSING`, and a block event is audited.
- A rejected report unlocks its attachments, and the milestone stays open.
- After completion the evidence is immutable.
- **Milestone Completion Authority (BD-17, PROPOSED):** Only the Manager may mark a milestone `COMPLETED` (Engineers submit progress reports and visual evidence; they cannot complete milestones).
- Milestones already `COMPLETED` before cutover are grandfathered.

### CR-09 — Budget Governance

#### 4.9.1 Exposure model (single definition)

All terms below are computed per budget line `L`. They are **derived from ledger rows on read**. None is stored, and none is a lock or reservation.

| Term | Definition |
|---|---|
| **E(L)** Effective amount | `line.amount + Σ EXECUTED transfers in − Σ EXECUTED transfers out` |
| **Eff_C** Effective commitment amount | `commitment.amount + Σ APPROVED VO impact on C` |
| **AL_C** Approved linked expenses | `Σ APPROVED expenses with commitmentId = C`, whether or not they are custody-paid |
| **Commitment term(C)** | `max(Eff_C, AL_C)`. The actual-spend part is `AL_C`. The open part is `max(Eff_C − AL_C, 0)`. Subcontract commitments have `AL_C = 0`, so their term is `Eff_C`. |
| **X(L)** Active exposure | `Σ commitment terms on L` + `Σ APPROVED expenses on L with no commitmentId` + `OutstandingCustodies(L)` + `approved payroll` + `approved labor sheets` |
| **OutstandingCustodies(L)** | For each custody on L that is `ISSUED` or `PARTIALLY_SETTLED`: `disbursed − approved settled expenses (linked or not) − verified advances − cash returned` |
| **Available(L)** | `E(L) − X(L)` |
| **P(L)** Pending projection | `Σ SUBMITTED commitments (full amount)` + `Σ SUBMITTED expenses with no commitmentId` + `Σ SUBMITTED custodies` + `Σ SUBMITTED payroll` + `Σ SUBMITTED or AUDITED labor sheets` + the **linked-expense overflow** below |
| **Linked-expense overflow** | For each commitment C: `max(Eff_C, AL_C + PL_C) − max(Eff_C, AL_C)`, where `PL_C` is the sum of SUBMITTED expenses linked to C. A pending linked expense therefore adds to P only the part that exceeds C's open amount. |
| **Projected(L)** | `Available(L) − P(L)` |

**Why nothing is counted twice:**
- An approved linked expense is counted once, inside the commitment term, and never again as direct or custody spend. That is why direct spend is limited to expenses with no `commitmentId`.
- A custody-settled linked expense leaves `OutstandingCustodies` (it is settled) and is counted in the commitment term. A custody-settled unlinked expense leaves `OutstandingCustodies` and is counted as direct spend. Either way it is counted once.
- A verified advance reduces `OutstandingCustodies`. It is not added anywhere else, because the subcontract commitment already carries its full amount (same budget line, BD-18).
- Billings, MRNs and equipment timesheets contribute nothing to X or P. Retention is a deduction inside a billing, so it adds nothing either.
- Pending VOs and approved-but-not-yet-issued custodies are not projected in P. This matches the existing formula, which has no such term. Issuing a custody and approving a VO are each re-evaluated at their own approval time.
- The labor sheet pre-approval statuses mirror the existing payroll treatment.

**Pending is not a reservation.** It is a point-in-time projection computed from rows in their pre-approval statuses. No row holds funds. Nothing blocks a record from being submitted.

**Transition test.** When a record is being approved or posted, the check removes that record's own pending contribution from P, then adds its active contribution to X. It is over-budget when `X_after > E(L)`, and the overrun is `X_after − E(L)`. This is the same comparison as today's hard ceiling.

#### 4.9.2 Soft limit and the inventory of operations

One rule applies to every budget-consuming operation:
- It is evaluated **at approval or posting time, under the budget-line lock**.
- If `X_after > E(L)`, the Manager must supply a reason. The record then stores an immutable snapshot (`isOverBudget`, overrun amount, reason) and writes `OVER_BUDGET_APPROVED`.
- Only the Manager may authorize. No other role can.
- The Accountant audits only and cannot authorize.

| Operation | Today | Under CR-09 |
|---|---|---|
| Commitment approval | Hard stop | Soft, Manager exception |
| Nomination approval (creates commitment) | New | Same as commitment |
| Expense approval | Hard stop | Soft, Manager exception |
| Payroll approval | Hard stop | Soft, Manager exception |
| Site labor sheet approval | New | Soft, Manager exception |
| Custody **issuance** (Accountant) | Hard stop | Special, BD-20 |
| VO approval (positive impact) | Revised-ceiling guard | Soft, Manager exception |
| Subcontractor billing, equipment timesheet, MRN | No budget impact | None |

In Slice 20 the revised-ceiling function is currently unused, so it must not become a second ceiling. VO impact acts through `Eff_C`, not by changing line amounts.

**Custody issuance (BD-20, PROPOSED):**
- The Accountant's issue is blocked with `OVER_BUDGET_REQUIRES_MANAGER_EXCEPTION`.
- The Manager records an exception on the custody, with a reason and an authorized overrun cap.
- Issue is then re-validated under lock and succeeds only if the overrun ≤ the authorized cap.

#### 4.9.3 Budget transfer (BD-15)

- Same project only. Inter-project transfers are **forbidden** (`AGENTS.md` single-tenant scope, and no source authorizes them).
- **Availability rule:** amount > 0 and `amount ≤ Projected(L_source)`, where `Projected = E − X − P`. The check runs **under the source line lock**.
- What this protects:
  - Active exposure `X` is a ledger fact and is protected absolutely: after a transfer, `E_source ≥ X`.
  - Pending exposure `P` is protected as of execution time. A transfer cannot take funds that a record already in a pre-approval status needs.
  - Pending records hold no reservation, so a record submitted after the transfer sees the smaller `E`. At its approval it is evaluated under the soft limit and, if over, needs a Manager exception. Nothing fails silently.
- Both lines belong to the same approved budget. Source ≠ target.
- Statuses: `REQUESTED → APPROVED → EXECUTED`, with `REJECTED`, `CANCELLED` and `REVERSED`.
- Requester and approver are separate fields. The Manager may also initiate. In that case it is flagged `SELF_AUTHORIZED` with a mandatory reason, because only one top authority exists.
- Execution is atomic and locks both lines in id order.
- Reversal is Manager-only. It creates a compensating transfer, and the same availability rule applies with the roles swapped (the original target is now the source).

#### 4.9.4 Contingency (BD-15)

- One dedicated `CONTINGENCY` budget line holds the reserve. Its amount is fixed in the approved budget. No percentage is imposed.
- Direct spend on it is `0.00`. Expenses, commitments, custodies, labor and equipment cannot target it. The server rejects them. Its `X` and `P` therefore stay `0`.
- It can only be consumed by an approved `BudgetTransfer` out of it.
- Unused reserve stays visible as the line's remaining balance, so it is never counted as operating budget. Because it is excluded from operating availability, it cannot be counted twice.
- Reporting shows Original, Transferred in/out, Effective, Consumed and Remaining.

#### 4.9.5 Revisions and revision lineage

**Revision rules:**
- Version 1 is the immutable baseline.
- The new version is a DRAFT. The Manager approves it. On approval the previous version becomes `SUPERSEDED`. It stays readable and is never edited.
- Existing transactions and commitments keep their original line links. No retroactive re-linking or mutation occurs.

**Revision line lineage (reporting only):**
- A `BudgetLineLineage` record connects a line of the new revision to a line of the immediately preceding approved revision, for reporting and audit only.
- Lineage **never** changes `budgetLineId` on any transaction, commitment, custody or other record. It never feeds any exposure, available-balance, soft-limit or transfer calculation. The original baseline and the superseded revision stay immutable.
- Every line that is part of the mapping carries a shared `lineageGroupId`. A group is a connected set of old and new lines.
- Reports compare **group totals** (Σ old lines vs Σ new lines in the group). A per-line comparison is shown only for 1:1 groups. This needs no amount allocation between lines and invents no policy.

| Case | How it is recorded | Report behavior |
|---|---|---|
| One old → one new | One record, type `CONTINUED`, one group | Per-line comparison |
| One old → many new | One record per new line, type `SPLIT`, one group | Group total comparison |
| Many old → one new | One record per old line, type `MERGED`, one group | Group total comparison |
| Old line removed | A record with the old line and no new line, type `REMOVED` | Shown as removed |
| New line with no predecessor | A record with the new line and no old line, type `ADDED` | Shown as added |
| Old line superseded | Every old line is superseded by its revision's status. Only lines with a record appear in lineage. | n/a |

**Constraints:**
- Both lines belong to the same project. The new line belongs to a budget with a higher version than the old line's budget, and that old budget is the immediately preceding approved version.
- UNIQUE `(previousLineId, newLineId)` where both are present.
- Records are editable while the new revision is DRAFT. They become **immutable once the revision is approved**. The approval audit event (`BUDGET_REVISION_APPROVED`) carries a lineage summary (counts per type and group count).
- The author of the draft revision maintains the lineage. No new role or SOD row is created.
- Executed transfers belong to the revision in which they ran. They are neither carried into the new revision nor remapped. The new revision's line amounts are the amounts approved in it.

**Revision Boundary Rules (PROPOSED - not Owner-approved; see AUD-02 / OD-02):**
1. **Complete mapping required at approval:** Every active line of the immediately preceding approved budget revision must have an explicit `BudgetLineLineage` mapping (`CONTINUED`, `SPLIT`, `MERGED`, or `REMOVED`) before the new revision can be approved (`BUDGET_LINEAGE_INCOMPLETE` blocks approval).
2. **Post-approval lineage immutability:** Lineage rows are immutable once the revision is approved. Any subsequent reporting reclassification is captured in the next budget revision (or via a Manager-only audited lineage amendment record that appends a superseding reporting snapshot without touching financial records).
3. **Enforcement continuity across revisions:** Historical and in-flight commitments, custodies, and expenses remain strictly bound to their original `budgetLineId` (never re-linked). Once a new revision is `APPROVED`, lines belonging to `SUPERSEDED` revisions are closed to *new* commitments, custodies, and unlinked expenses; existing open commitments and issued custodies on superseded lines continue to settle within their established ceilings, while executive project-level control aggregates exposure across `lineageGroupId`.

### CR-10 — Cash Flow

**Entities and meaning:**

| Entity | Meaning |
|---|---|
| `OwnerBilling` | A claim on the owner. Not cash. |
| `OwnerPayment` | Cash received. |
| `OwnerPaymentAllocation` | Appends an allocation of a payment to a billing. |
| `CapitalInjection` | Funding into the project. Not revenue. |
| `CapitalInjectionRepayment` | Append-only ledger of repayment of temporary financing. |

**Owner billing (BD-21, PROPOSED):** the Accountant drafts, the Manager approves. The authoritative recognition point for Certified Billing Receivable and Contractual Margin is **Manager approval (`APPROVED`)**.

**Owner payment allocation:**
- A payment can be unallocated, partially allocated, fully allocated, or cover several billings.
- Allocation entries are append-only. A mistaken allocation is reversed by a compensating entry, never edited.
- Rules: `Σ allocations(payment) ≤ payment amount` and `Σ allocations(billing) ≤ billing certified amount`.
- Overpayment stays as `unallocated` and is shown as such.
- Payment reversal is Manager-only. It reverses its allocations, which reopens the billing balances and reduces liquidity.
- Billing reversal is allowed only when it has no live allocations.
- Both rows are locked in a fixed order (§7).

**Capital injection (BD-09, PROPOSED):**

| | `PERMANENT_EQUITY` | `TEMPORARY_FINANCING` |
|---|---|---|
| Outstanding balance | None | `amount − Σ repayments` |
| Repayment | Not allowed | Allowed, append-only |
| Status | Recorded, then Reversed only | Outstanding, Partially repaid, Repaid, Written off |
| Written off | **No** | Yes, Manager only, with a reason and an append-only write-off entry |
| Records | Manager | Manager records, Accountant records repayments |

- Status is derived from the ledger. It is not set by hand.
- Repayment ≤ outstanding, under a row lock on the injection.
- Duplicate repayment is stopped by a bank reference unique per injection.
- Reversal is a compensating entry.

**Liquidity** = `Owner payments received + Capital injections − Recognized outflow − Financing repayments`.
- Equity and financing both increase liquidity.
- Neither is revenue or project cost.
- A repayment reduces liquidity but is not project cost and does not affect margin.
- A write-off has no cash effect and no margin effect.

**Dashboard metrics** (these names replace "profit"):

| Metric | Formula |
|---|---|
| Certified Billing Receivable | Σ approved owner billings − Σ allocations |
| Collected | Σ owner payments |
| Liquidity | as above |
| Recognized Outflow | see BD-10 |
| Project Contractual Margin | Σ approved owner billings − Σ recognized project cost. Not accounting profit. |
| Estimated Contractual Margin | contract value − approved budget baseline |

**Recognized Outflow (BD-10, PROPOSED).** Because the system is a Management Control Layer without bank reconciliation (`AGENTS.md` §4), the authoritative v1 Recognized Outflow formula is:
- direct approved expenses (`custodyId` is null)
- plus custody disbursed amount less cash returned
- plus approved payroll
- plus approved labor sheets
- plus approved subcontractor net payable

Custody-settled expenses and advances are inside the custody disbursement, so they are not added again. Equipment is paid through linked expenses. A commitment is never an outflow.

---

## 5. Corrected Logical Model *(revised for BD-11)*

*Logical design only. Types: money is `Decimal(15,2)`, quantity is `Decimal(15,4)`, all times are `Timestamptz`. Every financial entity carries `createdAt`, `updatedAt` and `deletedAt` (the latter only for never-submitted drafts). Audit is mandatory for all of them.*

| Entity | Key fields | Constraints and indexes | Cardinality |
|---|---|---|---|
| `SubcontractorNomination` | project, budgetLine (immutable from SUBMITTED), subcontractor, scope, `estimatedAmount` (server Σ), **retention rate, retention cap mode (CAP_AMOUNT or NO_CAP), retention cap amount (empty when NO_CAP)**, status, creator/submitter/approver/rejecter, `resultingCommitmentId` | UNIQUE `resultingCommitmentId`; partial UNIQUE `(project, normalized subcontractor, budgetLine)` where status = SUBMITTED; **rate and cap mode required before SUBMITTED; cap amount required when mode is CAP_AMOUNT and `≥ 0`**; index `(projectId,status)` | 1→N items; 0..1→1 commitment |
| `SubcontractorNominationItem` | itemNo, description, unit, quantity, unitRate, lineAmount | UNIQUE `(nominationId,itemNo)`; qty > 0, rate ≥ 0 | |
| `Commitment` (extended) | `nominationId`, **retention rate, cap mode, cap amount (copied from the nomination and fixed at approval)** | UNIQUE `nominationId` (nullable); retention terms immutable after approval | 1→N items |
| `CommitmentItem` | `sourceType`, source links, itemNo, description, unit, `contractQuantity`, `contractRate`, `lineAmount` | UNIQUE `(commitmentId,itemNo)`; UNIQUE source links; CHECK source consistency; all immutable after approval | |
| `SubcontractorBilling` (redesigned) | commitment, gross, totalDeductions, net, **retention snapshot: rate applied, calculated amount, cap-limited amount, adjusted amount, adjustment flag, adjustment reason, previously retained amount at audit**, status, audited/approved/rejected by, rejecting role | `net ≥ 0`; **adjusted ≤ cap-limited ≤ calculated; reason required when the flag is set**; index `(commitmentId,status)` | 1→N lines, 1→N deductions |
| `SubcontractorBillingLine` | `commitmentItemId`, `currentQuantity`, `unitRate` (server), `lineAmount`, informational `cumulativeBeforeQuantity` | UNIQUE `(billingId,commitmentItemId)`; qty > 0 | |
| `BillingDeduction` | type, amount > 0, reason, `advanceId` (nullable), status ACTIVE or VOIDED | UNIQUE active `(billingId,advanceId)`; no row is created for a zero retention amount | |
| `CustodySubcontractorAdvance` | custody, commitment, subcontractor, amount, paidAt, receipt attachment (mandatory), status, verifiedBy | amount > 0; index `(commitmentId,status)` | N per custody |
| `AdvanceRecoveryEntry` | advance, deduction, amount, state, createdAt | append-only; UNIQUE per deduction and state | |
| `Custody` (extended) | `disbursedAmount`, over-budget exception fields | `0 < disbursed ≤ amount` | |
| `SiteLaborSheet` / `Line` | project, laborBudgetLine, year, month, total, status; line: worker, trade, days, wage, overtime hrs, overtime rate, total | partial UNIQUE `(project,line,year,month)` excluding CANCELLED/deleted | |
| `MaterialReceivingNote` / `MRNItem` | commitment, deliveryNoteRef, supplier, status; item: commitmentItemId, delivered, accepted, rejected | `delivered = accepted + rejected`; UNIQUE `(mrnId,commitmentItemId)` | |
| `Expense` (extended) | commitmentId, material or equipment lines, over-budget snapshot | lines UNIQUE `(expenseId,commitmentItemId)` | |
| `Equipment` / `EquipmentContract` | registry, ownership, measurement basis; contract: commitment, project, rate | UNIQUE `(equipment,commitment)` | |
| `EquipmentTimesheet` | contract, date, times, meters, hours, rate snapshot, total, `meterFailure` flag, status | `end ≥ start`; UNIQUE `(contract,date)` among non-cancelled | |
| `BudgetTransfer` | project, source/target line, amount, reason, requester, approver, status, `selfAuthorized` flag | source ≠ target; same project; amount > 0 | |
| `BudgetLineLineage` (reporting only) | `previousLineId` (nullable), `newLineId` (nullable), `relationType` (CONTINUED, SPLIT, MERGED, REMOVED, ADDED), `lineageGroupId`, revision budget ids | at least one of the two line ids present; UNIQUE `(previousLineId,newLineId)` when both present; same project; new version > previous version; immutable after the revision is approved; index `(lineageGroupId)` | N:M between lines of adjacent revisions |
| `OwnerBilling` | project, number, amount, status | UNIQUE `(project,number)` | |
| `OwnerPayment` / `OwnerPaymentAllocation` | payment, amount, bank ref; allocation: payment, billing, amount, state | UNIQUE bank ref per project; append-only allocations | |
| `CapitalInjection` / `Repayment` | type, amount, source; repayment: amount, bank ref, writeoff entry | UNIQUE `(injection,bankRef)` | |
| `Attachment` | owner type and id, project, category, file name, storage key, MIME, size, checksum, uploader, supersedes link, void fields | index `(ownerType,ownerId)`; size ≤ 10 MB | |
| `ProgressReportMilestone` | report, milestone | PK `(report,milestone)` | N:M |
| `VariationOrderLine` (extended) | line type, `commitmentItemId` | rate-equality validation | |

---

## 6. Financial Invariants *(UC-1 Owner-approved; BD-11, UC-2, UC-3 PROPOSED)*

1. **Money:** Decimal only, server-recomputed, no client totals. Rounding follows R-03 and UC-1 (`ROUND_HALF_UP` to 2 dp via `Decimal` for line amounts and for calculated retention before cumulative cap).
2. **Commitment:** amount = Σ item line amounts. Items are immutable after approval.
3. **Billing quantity:** cumulative approved quantity ≤ contract quantity + approved VO adjustments, per item.
4. **Billing rate:** line rate = item contract rate. The server writes it.
5. **Billing money:** cumulative approved gross ≤ effective ceiling, which equals Σ(effective qty × rate).
6. **Net:** `net = gross − Σ deductions ≥ 0`.
7. **Retention (BD-11 proposed; rounding rule `UC-1` Owner-approved):**
   - `Calculated = round_half_up(Gross × Rate ÷ 100, 2)` using `Decimal` with `ROUND_HALF_UP` to two decimal places, applied before the remaining cap is evaluated (`UC-1`, Owner-approved).
   - The rate and the cap come from the subcontract. There is no system default for either.
   - Basis: the current statement's Gross, before other deductions.
   - `Actual = min(Calculated, max(Cap − Previously Retained, 0))` when a cap amount exists. `Actual = Calculated` when the contract states no cap.
   - Previously Retained = Σ retention deductions on APPROVED, non-reversed statements of the same commitment, excluding the current statement.
   - Cumulative approved retention ≤ the cap amount, whenever one exists.
   - `Adjusted ≤ Actual` and `Adjusted ≥ 0`. An adjustment is statement-level only and never alters the commitment's rate or cap.
   - Retention ≤ current Gross.
   - Retention figures are immutable after `AUDITED`.
8. **Advance:** `Σ(RESERVED + CONFIRMED) ≤ advance amount`. Recovery needs the same commitment.
9. **Custody:** liability = `disbursedAmount`. Remaining = disbursed − approved expenses − verified advances − returned ≥ 0. No settlement on a `CLOSED` custody.
10. **MRN:** delivered = accepted + rejected. Cumulative accepted ≤ ordered. Invoiced ≤ accepted − previously invoiced.
11. **Equipment:** `meter end ≥ meter start`, hours ≥ 0, `total = hours × contract rate`. Invoiced hours ≤ approved hours.
12. **Exposure:**
    - `X(L) = Σ max(Eff_C, AL_C) + Σ approved unlinked expenses + OutstandingCustodies + approved payroll + approved labor sheets`.
    - `Available = E − X`.
    - `Projected = Available − P`, with P derived from pre-approval statuses (§4 CR-09).
    - Every approved expense is counted exactly once.
    - Billings (including retention), timesheets and MRNs add none.
    - P is derived and never stored.
13. **Budget:**
    - Transfers are zero-sum and stay within one project.
    - `amount ≤ Projected(source)` under the source line lock, so `E_source ≥ X` always holds after a transfer.
    - A transfer reversal obeys the same rule.
    - Direct contingency spend is 0.
    - Soft limit: over-budget iff `X_after > E(L)`, evaluated under the line lock at approval.
14. **Revision lineage:** lineage never alters any record's budget line link and never enters any exposure, availability or transfer calculation. The baseline is immutable.
15. **Cash:** commitment ≠ outflow, billing ≠ payment, injection ≠ revenue. Repayment is not project cost. Allocation totals never exceed their bounds.
16. **Corrections:** approved records are never edited or deleted. Corrections use reversals only.

---

## 7. Transaction & Lock Strategy *(billing rows revised for BD-11; hierarchy unchanged)*

**Canonical lock order** (one strictly ascending hierarchy, extending the existing `budget_lines → commitments → operational entity`):

| Level | Rows |
|---|---|
| 1 | `budget_lines`, ordered by id |
| 2 | `commitments`, ordered by id |
| 3 | `commitment_items`, ordered by id |
| 4 | `custodies` |
| 5 | `custody_subcontractor_advances`, ordered by id |
| 6 | The operational header (nomination, billing, expense, MRN, timesheet, VO) |
| 7 | Children, then the audit log |

Audit is written last, in the same transaction. If the audit write fails, everything rolls back.

**Rules:**
1. **No pre-lock exceptions.** Every transaction takes its locks in strictly ascending level. It may skip levels, but it never takes a lower level after a higher one.
2. **Pre-reads.** A plain non-locking read before the transaction is allowed only to find the lock targets (for example, a nomination's `budgetLineId`). Everything is revalidated after the locks are held. Existing use cases already work this way.
3. **Stable lock targets.** A key used to find a lock target must not change while it is needed. This is why `nomination.budgetLineId` is immutable from SUBMITTED.
4. **Same level, many rows:** always ordered by id.
5. **Disjoint domains.** The owner-cash and capital domains (owner billings, owner payments, capital injections) use their own small orders (below). No workflow takes a lock from both those domains and the budget hierarchy, so they cannot form a cycle with it.

**Why the nomination lock is not an exception.** The nomination row is an operational header, so it sits at level 6.
- The only workflow that holds a lower-level lock while taking it is nomination approval (budget line → nomination).
- Nomination submit, reject and cancel lock only the nomination row, and nothing locks a nomination and then asks for a budget line.
- A deadlock needs one transaction to hold level 6 and wait for a lower level. No such transaction exists.
- Idempotency does not need the nomination first. All approvals on one line queue on the level-1 lock, and the second one sees the committed result.

| Workflow | Locks (in order) | Key checks |
|---|---|---|
| Nomination submit | nomination only | The partial UNIQUE constraint blocks a duplicate open nomination. No budget-line lock is needed. Retention terms are present. |
| **Nomination approval** | **budget line (level 1) → nomination (level 6)** | Revalidate status is SUBMITTED. If already APPROVED with a commitment, return it. Soft-limit check. Create the commitment and its items, copying the retention terms. Set both links. |
| Billing submit | none for the write; advisory read | Advisory quantity check |
| Billing audit | commitment → advances → billing | Reserve recoveries. Calculate retention and apply the cap from approved history. Record any Accountant reduction with its reason. `Σ deductions ≤ gross`. |
| Billing approval | budget line (existing behaviour) → commitment → items → advances → billing | Authoritative quantity and money check on approved history. **Recompute Previously Retained and refuse approval if retention exceeds the remaining cap.** Confirm reservations. |
| Billing reject / cancel / reverse | commitment → advances → billing | Release reservations by compensating entries. Voided retention deductions stop counting as Previously Retained. |
| MRN approval | commitment → items → MRN | Cumulative accepted ≤ ordered |
| Expense approval (materials, equipment) | budget line → commitment → items → expense | Gate, relief rule, soft limit |
| VO approval | budget line → commitment → items → VO | Existing locks plus item locks. Quantity floor check. Soft limit. |
| Budget transfer (and reversal) | both lines in id order → transfer | Availability `E − X − P` under the source line lock. Same project. |
| Over-budget approval | the operation's normal locks | Evaluated after the lock, never before |
| Owner payment allocation | payment → billings in id order | Both bounds |
| Capital repayment | injection | Repayment ≤ outstanding |

The retention checks reuse the commitment lock that billing audit and approval already take. No lock was added and the order is unchanged.

Read consistency uses `READ COMMITTED` plus these row locks. Stored cumulative values are informational only. If one differs from the ledger, the ledger wins, a `LEDGER_MISMATCH` audit event is written, and the stored value is corrected.

---

## 8. SOD Matrix

E = Engineer, P = Purchasing, A = Accountant, M = Manager. A dash means not permitted. All cells are proposed (not Owner-approved).

| Record | Create | Submit | Audit | Approve | Reject | Modify | Cancel | Reverse |
|---|---|---|---|---|---|---|---|---|
| Nomination | E | E | – | M (≠ creator) | M | E (draft) | E (draft), M | – |
| Billing | E | E | A | M | A (at audit), M (at approval) | E (draft), A (deductions, retention reduction) | E, M | M |
| Custody advance | E (custodian) | E | A verifies | – | A | E (draft) | E (draft) | M |
| Labor sheet | E | E | A | M | A, M | E (draft) | E, M | M |
| MRN | E | E | – | **M (≠ creator, BD-05)** | M | E (draft) | E, M | M |
| Equipment registry and rate | P | – | – | – | – | P | P | – |
| Equipment timesheet | E | E | A (invoice match) | M | M | E (draft) | E, M | M |
| Expense | E, A | E, A | – | M (≠ submitter) | M | submitter (draft) | submitter, M | M |
| Variation Order | E | E | – | M (≠ creator) | M | E (draft) | E, M | M |
| Budget transfer | A, M | A, M | – | M | M | – | requester, M | M |
| Over-budget exception | – | – | A flags only | **M only** | – | – | – | – |
| Milestone completion | – | – | – | M (needs approved evidence) | – | – | – | M |
| Owner billing | A | A | – | M | M | A (draft) | A (draft), M | M |
| Owner payment | A | – | – | – | – | A (before allocation) | – | M |
| Capital injection | M | – | – | – | – | – | – | M |
| Capital repayment | A | – | – | – | – | – | – | M |
| Attachment upload | all, on their own records | | | | | uploader (draft only) | | – |

The only change from the previous revision is a clarification of the existing "Billing / Modify / A" cell: the Accountant's modification right covers deductions, including the retention reduction. No role gained or lost any permission.

**Standing rules:**
- Creator and submitter can never be the final approver of the same record.
- Where the Manager is the only top authority and self-authorizes (transfers, reversals), the action is flagged and a reason is mandatory.
- Purchasing has no approval authority and no payroll access.
- The Accountant never gives final approval.

---

## 9. Attachment Architecture and Lifecycle Rules

### Attachment architecture

- An `Attachment` is **evidence only** and never a financial source.
- It belongs to one business record (owner type and id) and carries the project for access control.
- Storage goes through a provider abstraction (`upload`, `get link`, `remove`). No cloud vendor is chosen, since the repository establishes none.
- MIME types allowed: JPEG, PNG, WebP, PDF. The server verifies file content (magic bytes), not the client's header. Maximum file size: 10 MB (PROPOSED; NEW-OD-04 pending Owner confirmation).
- Storage keys are server-generated with no user-controlled path parts.
- Access: the user must be authorized for the parent record (object-level), never just authenticated.
- Audit events: `ATTACHMENT_UPLOADED`, `ATTACHMENT_VOIDED`, `ATTACHMENT_REPLACED`.

### Attachment lifecycle

The state of an attachment is **derived from the status of its parent record**. It is not stored separately.

| Parent status | Attachment behavior |
|---|---|
| `DRAFT` | Uploader may upload and void. Replacement creates a new row linked to the old one. |
| `SUBMITTED`, `AUDITED` | **LOCKED.** No void, no replacement. The Accountant may add audit evidence. |
| `REJECTED` / reopened to `DRAFT` | Unlocked. Voiding keeps the old row visible as `VOIDED`. |
| `APPROVED` | **IMMUTABLE ARCHIVE.** Never voided or replaced. |
| `CANCELLED` | Retained, read-only. |
| `REVERSED` | Retained as history. |

- Replacement is always a new row with a link to the old row. The old one is retained and never overwritten.
- Only a never-submitted draft may have its file physically removed, with an audit event (`AGENTS.md` §14 allows this).
- Retention of evidence for submitted and approved records is indefinite in v1. A purge policy is not specified.

### Evidence required at submit

| Record | Minimum evidence |
|---|---|
| Billing | At least one execution evidence |
| Custody advance | Signed receipt, at creation |
| Labor sheet | Attendance or timesheet |
| MRN | Signed delivery note |
| Equipment timesheet | Signed field ticket (driver and engineer) |
| Expense (new submissions) | At least one photo or document (C-11) |
| Progress report | None to submit. At least one photo is needed for the milestone gate. |
| VO | Optional. No source requires it. |

---

## 10. Lifecycle & Reversal Rules

Only the states that are actually needed exist.

| Entity | States | Rules |
|---|---|---|
| Nomination | DRAFT → SUBMITTED → APPROVED / REJECTED; CANCELLED from DRAFT | APPROVED is terminal. A rejected nomination is not reopened, and the Engineer creates a new one. |
| Commitment | existing (DRAFT, SUBMITTED, APPROVED, REJECTED) | Created `APPROVED` by nomination. Never edited after approval. |
| Billing | DRAFT → SUBMITTED → AUDITED → APPROVED; REJECTED → DRAFT; CANCELLED; REVERSED | See R-07 and §4. |
| Billing deduction | ACTIVE / VOIDED | Voided only when the billing is rejected, cancelled or reversed. |
| Advance | RECORDED → VERIFIED / REJECTED; UNRECOVERED → PARTIALLY → FULLY_RECOVERED (derived from the ledger) | Reversal compensates the ledger. |
| Custody | existing 9 states | Adds `disbursedAmount` at ISSUED. |
| Labor sheet | DRAFT → SUBMITTED → AUDITED → APPROVED; REJECTED → DRAFT; CANCELLED; REVERSED | |
| MRN | DRAFT → SUBMITTED → APPROVED / REJECTED; REJECTED → DRAFT; CANCELLED; REVERSED | Reversal is allowed only if no approved expense consumed its quantity. |
| Equipment timesheet | DRAFT → SUBMITTED → APPROVED / REJECTED; CANCELLED; REVERSED | |
| Budget transfer | REQUESTED → APPROVED → EXECUTED; REJECTED; CANCELLED; REVERSED | |
| Budget revision | existing Budget statuses (DRAFT, SUBMITTED, APPROVED, REJECTED, SUPERSEDED) | Lineage records follow §4 CR-09. |
| Owner billing | DRAFT → SUBMITTED → APPROVED; CANCELLED; REVERSED | Reversal only with no live allocations. |
| Owner payment | RECORDED → (allocation derived); REVERSED | |
| Capital injection | per BD-09 | |

**Correction rules (all financial records):**
- Before approval: amend (DRAFT or REJECTED only) or cancel.
- After approval: **reversal only**, using a compensating entry and R-04. Never delete and never edit.
- A reversal reverses its dependent effects (ledger releases, allocations) in the same transaction.
- Every transition writes an audit event with the actor, the previous status and the reason.

---

## 11. Slice Impact

| Slice | Impact | Breaking? | Reopen? | Reason |
|---|---|---|---|---|
| 3 Budget | REOPEN | No | Yes | Soft limit, transfers, revisions (activates SUPERSEDED) with reporting lineage, contingency rules, new exposure definition (§4 CR-09). |
| 4 Expenses | EXTEND (behavioural) | No | No | Commitment link, material and equipment lines, gate, soft limit, evidence required. |
| 5 Commitments | EXTEND | No | No | `CommitmentItem`, `nominationId`, retention terms (rate, cap mode, cap amount), relief rule, block on SUBCONTRACTOR lines for Purchasing. |
| 6 Custody | REOPEN | Yes (logic) | Yes | Liability and exposure use `disbursedAmount`. Advances. Issuance exception (BD-20). |
| 7 Billing | REOPEN (redesign) | **Yes** | Yes | Authorship moves to the Engineer, BOQ lines, AUDITED, deductions (including retention), REVERSED. Minimum reopening: new aggregate and state machine. Legacy flat billings stay as read-only history (BD-14). |
| 8 Payroll | EXTEND | No | No | Soft-limit exception on approval. Coexists with the labor sheet. |
| 10 Progress Reports | EXTEND | No | No | Attachments and milestone links. |
| 12 Milestones | EXTEND (behavioural) | No | No | Evidence gate on completion. |
| 20 Variation Orders | **EXTEND** | No | No | Line types, item links, rate-equality rule, soft limit. *This differs from the earlier "NO IMPACT" because F2 shows the ceiling functions are unused and VO lines have no item link.* |
| 9, 13, 15 (dashboards, approvals hub) | EXTEND | No | No | New metrics and queues. |

---

## 12. Dependency Graph

```
Slice 21  Attachment infrastructure
   │
   ├─► Slice 22  CR-01  Nomination + CommitmentItem
   │      ├─► Slice 23  CR-03  Custody + advances
   │      │        │
   │      └────────┴─► Slice 24  CR-02  Billing + retention + recovery
   │                         (also needs Slice 20 extension, in scope of Slice 24)
   │
   ├─► Slice 26  CR-05  Purchasing item lines + MRN + expense gate (needs Slice 22 for CommitmentItem)
   │      └─► Slice 27  CR-06  Equipment (reuses the expense gate)
   │
   ├─► Slice 25  CR-04  Labor
   └─► Slice 28  CR-08  Visual progress

Slice 29  CR-09  Budget governance   (after 22, 23, 25, 26, 27 and the Slice 20 extension)
Slice 30  CR-10  Cash flow           (after 24, 25, 26, 27; needs BD-10; does not depend on 29)
```

Slice numbers are unique, 21 to 30. The order of 21–30 is unchanged from the previous plan. Real dependencies changed in three places:
- 27 now depends on 26.
- 30 no longer depends on 29. Soft limits do not affect cash.
- The Slice 20 extension is explicitly part of Slice 24.

---

## 13. Implementation Waves

| Wave | Slice | Scope | Prerequisites | Acceptance gate |
|---|---|---|---|---|
| 0 | 21 | Attachment entity, storage abstraction, validation, lifecycle | none | Upload, MIME and size rejection, lock by parent status, access control |
| 1 | 22 | CR-01 | 21, BD-11, BD-14 | Idempotent single-commitment approval under the canonical lock order, items match the nomination, retention terms copied and fixed, soft-limit hook |
| 1 | 23 | CR-03 | 21, 22, BD-18 | Disbursed split, advance verified, balances correct |
| 1 | 24 | CR-02 and Slice 20 extension | 20, 21, 22, 23, BD-11, BD-12, BD-14 | Concurrent approvals cannot exceed quantity, advance or retention cap, reversal restores ledger |
| 2 | 25 | CR-04 | 21, BD-03, BD-19 | Duplicate sheet blocked, overtime exact |
| 2 | 26 | CR-05 | 21, 22, BD-05, BD-13 | No material expense without MRN, quantity gate holds under concurrency |
| 2 | 27 | CR-06 | 21, 26, BD-16 | Hours and rate exact, invoice matching gate |
| 2 | 28 | CR-08 | 21, BD-17 | Milestone cannot complete without evidence |
| 3 | 29 | CR-09 | 22, 25, 26, 27, BD-15, BD-20 | Soft limit identical in every operation, exposure counts each record once, transfer atomic and respects pending, revision lineage reporting-only |
| 3 | 30 | CR-10 | 24, 25, 26, 27, BD-09, BD-10, BD-21 | Liquidity and margin reconcile, allocation bounds hold |

Each wave also needs: its schema work, the domain rules, use cases, policies, audit events, unit and integration tests, and a regression run of the closed slices it touches.

---

## 14. Test Strategy (design only) *(BD-11 & UC-1..UC-3 cases specified; only UC-1 Owner-approved)*

- **Unit:** rounding, quantity and rate checks, retention cap, deduction totals, recovery ledger arithmetic, overtime, hours, margin and liquidity formulas, every state transition, and rejection of invalid ones. Exposure formulas with linked, unlinked and custody-paid expenses, and the linked-expense overflow in P. Lineage grouping for the five cases in §4 CR-09. Retention cases:
  - Retention rounding (UC-1): `ROUND_HALF_UP` to 2 decimal places using `Decimal` (third decimal digit ≥ 5 rounds up, < 5 rounds down; exact Decimal precision; zero floating-point usage), applied to `Gross × Rate ÷ 100` before cap evaluation.
  - Gross as the basis, with other deductions present and absent.
  - The cap formula: remaining cap above, equal to and below the calculated amount, and cap already exhausted.
  - A cap of `0.00` versus an explicit no-cap contract.
  - A zero rate, and no deduction row for a zero amount.
  - Accountant reduction: within range, to zero, above the cap-limited amount (rejected), and without a reason (rejected).
  - Previously Retained excludes the current statement, pending statements and reversed statements.
- **Integration:** nomination approval retry, concurrent billing approvals on one item, concurrent recoveries on one advance, MRN and expense gate, VO quantity floor, transfer atomicity, audit written in the same transaction. Lock-order conformance for every workflow in §7. Revision approval leaves every transaction's `budgetLineId` unchanged. Retention:
  - Two statements audited concurrently against the same remaining cap: the second approval is refused.
  - A reversed statement frees cap.
  - The commitment's retention terms cannot change after approval.
  - A reduction does not change any other statement.
- **Concurrency:**
  - two billings fighting for the last quantity
  - two billings fighting for one advance
  - two billings fighting for the last of the retention cap
  - two transfers draining one line
  - a transfer racing an approval on the same line
  - two repayments on one injection
  - two approvals of the same nomination, and approvals of two nominations on one line
  - a mixed set of workflows on the same line and commitment, run to confirm there is no deadlock
- **Authorization:** each role-by-action denial in §8, inactive users, wrong project, self-approval, Purchasing blocked from SUBCONTRACTOR commitments. Retention: the Engineer and the Manager cannot enter a statement-level reduction, and only the Accountant can.
- **Financial invariants:** every item in §6 as a named test, with negative cases. In particular: an approved linked expense is counted once, a transfer cannot take funds needed by a SUBMITTED record at execution time, lineage never changes any exposure figure, and cumulative approved retention never exceeds the cap.
- **Evidence:** mandatory evidence at submit, lock on submit, unlock on reject, immutability on approval, no void after approval.
- **E2E:**
  - nomination to commitment
  - billing with retention and advance recovery
  - material PO to MRN to expense
  - VO then billing
  - transfer
  - over-budget exception
  - budget revision with lineage in each of the five cases
  - owner billing then payment and allocation
  - capital injection and repayment
  - liquidity view
- **Regression of closed slices:** budget exposure for existing data, commitment approval, expense approval, custody flow, payroll, progress reports, milestones, and VO flows. Existing figures must not change for records created before cutover.

---

## 15. Acceptance Matrix *(Owner Decisions Pending)*

Only `UC-1` is Owner-approved. All other business decisions (`BD-03`, `BD-05`, `BD-09`–`BD-21`), retention rules `UC-2`/`UC-3`, and CR-09 lineage boundary points are proposals. No CR is ready for implementation wave execution; see the Owner Decision Brief and the Specification Closure Gate Report for open blockers.

| CR | Business design | Data model | Authorization | Financial rules | Tests | Status | Proposed Decisions Applied (only UC-1 is Owner-approved) |
|---|---|---|---|---|---|---|---|
| CR-01 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-11, BD-14, UC-2, UC-3 |
| CR-02 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-11, BD-12, BD-14, UC-1, UC-2, UC-3 |
| CR-03 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-18 |
| CR-04 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-03, BD-19 |
| CR-05 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-05, BD-13 |
| CR-06 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-16 |
| CR-07 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-12 |
| CR-08 | Complete | Complete | Complete | n/a | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-17 |
| CR-09 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-15, BD-20, Lineage Rules 1–3 |
| CR-10 | Complete | Complete | Complete | Complete | Specified | **NOT READY — OWNER DECISIONS PENDING** | BD-09, BD-10, BD-21 |

Open Owner decisions and unresolved audit findings (e.g. `AUD-02`, `AUD-04`, `AUD-07`) block implementation of the affected CRs; see the Owner Decision Brief.

---

## 16. Business Decisions Register *(Only `UC-1` Owner-approved; all others PROPOSED)*

| Decision | Status | Proposed Rule (v1 specification draft) | Target Slice(s) |
|---|---|---|---|
| **BD-03** Overtime rate rule | **PROPOSED — NOT OWNER-APPROVED** | `1.50×` of `(dailyWage ÷ standardWorkingHours)`, where `standardWorkingHours` defaults to `8` hours/day (project-configurable), rounded half-up to 2 dp via `Decimal`. Internal control metric only. | Slice 25 |
| **BD-05** MRN approval authority | **PROPOSED — NOT OWNER-APPROVED** | Engineer creates and submits MRN; Manager approves (`creator ≠ approver`). | Slice 26 |
| **BD-09** Capital classification | **PROPOSED — NOT OWNER-APPROVED** | `PERMANENT_EQUITY` (no balance, no repayment) vs `TEMPORARY_FINANCING` (outstanding balance tracked via append-only repayment ledger; Manager write-off with reason). | Slice 30 |
| **BD-10** Recognized Outflow basis | **PROPOSED — NOT OWNER-APPROVED** | Approved-basis proxy (§4 CR-10): direct approved expenses + custody disbursed (net of returned cash) + approved payroll + approved site labor sheets + approved subcontractor net payable. | Slice 30 |
| **BD-11** Retention policy (`UC-1..UC-3`) | **`UC-1` OWNER-APPROVED; `BD-11`, `UC-2`, `UC-3` PROPOSED — NOT OWNER-APPROVED** | Contract-defined rate and cap mode (`CAP_AMOUNT` in SAR or `NO_CAP`) with no universal default; proposed snapshot immutable at Commitment approval (`UC-2`, `UC-3`); `Calculated = round_half_up(Gross × Rate ÷ 100, 2)` via `Decimal` (`UC-1`, Owner-approved); `Actual = min(Calculated, max(Cap − Previously Retained, 0))`; Accountant may reduce statement retention (`0.00..Actual`) at audit with mandatory reason; Manager final approval unchanged; release out of v1 scope. | Slices 22, 24 |
| **BD-12** VO rate and item model | **PROPOSED — NOT OWNER-APPROVED** | Never mutate an existing item's rate. VOs either adjust quantity at the existing contract rate (`QUANTITY_ADJUSTMENT`) or add a new `CommitmentItem` with its own rate (`ADDITIONAL_ITEM`). | Slice 24 |
| **BD-13** Material gate scope & relief | **PROPOSED — NOT OWNER-APPROVED** | Applies to every `MATERIALS` expense (no petty-cash bypass). Requires `CommitmentItem` link and approved `MRN`. Commitment exposure relieved via `max(Eff_C, AL_C)` (R-02). | Slice 26 |
| **BD-14** Legacy data policy | **PROPOSED — NOT OWNER-APPROVED** | Pre-cutover flat commitments, billings, and VOs remain immutable read-only history. Post-cutover subcontractor commitments must originate from Nominations with items; Purchasing is blocked from `SUBCONTRACTOR` commitments. | Slices 22, 24 |
| **BD-15** Transfer & contingency actors | **PROPOSED — NOT OWNER-APPROVED** | Accountant or Manager requests transfer; Manager approves (Manager self-authorization is flagged with mandatory reason). One dedicated `CONTINGENCY` line per budget, consumed only via transfer. | Slice 29 |
| **BD-16** Equipment scope & meter failure | **PROPOSED — NOT OWNER-APPROVED** | Rented/supplier equipment under an `EquipmentContract` commitment only. Meter failure permits clock-time entry only with `meterFailure = true`, mandatory reason, and incident attachment. | Slice 27 |
| **BD-17** Milestone completion authority | **PROPOSED — NOT OWNER-APPROVED** | Manager-only completion, gated server-side by at least one linked `APPROVED` `ProgressReport` with active visual evidence attachment(s). | Slice 28 |
| **BD-18** Advance verification | **PROPOSED — NOT OWNER-APPROVED** | Engineer records advance with signed receipt attachment; Accountant verifies (`VERIFIED`). Custody and subcontract commitment must share the same `budgetLineId`. | Slice 23 |
| **BD-19** Labor sheet key & payroll | **PROPOSED — NOT OWNER-APPROVED** | One active sheet per `(projectId, laborBudgetLineId, periodYear, periodMonth)`. Strictly segregated from salaried `PayrollEntry` for any worker-period. | Slice 25 |
| **BD-20** Custody over-budget mechanics | **PROPOSED — NOT OWNER-APPROVED** | Accountant issuance over budget is blocked unless Manager records an explicit over-budget exception and `authorizedOverrunCap` on the custody, verified under lock at issuance. | Slice 29 |
| **BD-21** Owner billing recognition | **PROPOSED — NOT OWNER-APPROVED** | Recognized in Certified Billing Receivable and Contractual Margin upon Manager `APPROVED` status. | Slice 30 |

---

## 17. Preconditions for Implementation Execution

1. **Business Decisions:** Only `UC-1` is Owner-approved. All other Business Decisions (`BD-03`, `BD-05`, `BD-09`–`BD-21`), Retention rules (`UC-2`, `UC-3`), Design Defaults (`R-01`–`R-07`), and CR-09 lineage boundary rules require explicit Owner decisions before implementation (see Owner Decision Brief).
2. **Baseline verification:** Before any implementation, re-establish the repository baseline (the design was written against commit `c9f0e28`; HEAD has since advanced to later commits, including the `slice-21` concurrency-hardening commit) and confirm its unit and integration test suites pass. Slice numbering must also be reconciled (this document numbers Attachment Infrastructure "Slice 21"; `CR_Impact_Architecture_Review.md` numbers it "Slice 18"; the repository already has commits named `slice-18` to `slice-21` for other work). **Proposed canonical work identity (pending Owner confirmation): `Attachment Infrastructure — Wave 0`.** Numbers such as "Slice 18" or "Slice 21" are logical roadmap labels that differ between documents; Git branch names and commit subjects (`slice-NN`) are historical labels of already-delivered work and are not renumbered by this document.
3. **Cutover handling (BD-14):** Any in-flight `DRAFT` or `SUBMITTED` flat billings from Slice 7 at deployment cutover must be settled or cancelled before switching to BOQ-line billing.
4. **Wave discipline:** Execute Slices 21 → 30 strictly in wave and dependency order (§12, §13). No slice starts before its prerequisite slices pass all unit, integration, concurrency, and authorization tests.
5. **Engineering contract compliance:** Full adherence to `AGENTS.md v1.2.0` (Decimal-only arithmetic, append-only financial records, no hard deletes, transactional audit logs, server-side RBAC + object-level authorization, Arabic/RTL-first UI with logical CSS properties).

---

## 18. Final Consistency Audit *(BD-11 checks added)*

| Area | Check | Result |
|---|---|---|
| **1. Lock hierarchy** | One ascending hierarchy (levels 1–7), with five rules and no pre-lock exceptions. Nomination approval is `budget line → nomination`, which is ascending. Nomination submit, reject and cancel take only the nomination lock. The duplicate-nomination rule uses a partial UNIQUE constraint, so it adds no lock. The retention checks reuse locks the billing workflows already take. | Consistent |
| **2. Exposure, pending, availability** | One definition set (§4 CR-09). An approved expense is counted once. P is derived and never stored or reserved. Transfers use `Projected = E − X − P` under the source line lock. Retention is a deduction inside a billing and adds no exposure. | No contradiction, no double count |
| **3. Revision lineage** | `BudgetLineLineage` covers the five cases, is reporting-only, requires complete mapping of prior lines at approval, is immutable after approval, and never re-binds any record. Superseded lines are closed to new commitments/unlinked expenses while existing commitments/custodies settle within their ceilings. Reporting-only lineage leaves exposure continuity across revisions unresolved (`AUD-02`, `OD-02`, open). | Proposed; open finding |
| **4. BD-11 & UC-1..UC-3** | CR-02 (§4), the logical model (§5), the invariant (§6.7), the lock table (§7), the SOD cell (§8), the tests (§14), the acceptance matrix (§15) and the decision register (§16) use identical BD-11 and UC-1..UC-3 wording. Textual consistency only; `UC-2`/`UC-3` remain unapproved, and "immutable after `AUDITED`" (A:180, 193, 575) conflicts with re-audit (`AUD-04`, open). | Consistent wording; decisions pending |
| **5. Contract terms vs adjustment** | The contract-defined rate and SAR cap are stored on the immutable commitment (`UC-2`, `UC-3`). The Accountant's reduction is stored on the statement only and never touches the commitment. | Distinct |
| **6. Cap without double counting** | Previously Retained = approved, non-reversed retention deductions of the same commitment, excluding the current statement. Pending statements do not count. The approval check recomputes it under lock, so concurrent audits cannot exceed the cap. | Consistent |
| **7. Gross basis & UC-1 rounding** | Retention is calculated on the current statement's Gross via `round_half_up(Gross × Rate ÷ 100, 2)` using `Decimal` before other deductions and before the cumulative cap (`UC-1`, Owner-approved). | Consistent & Owner-approved (`UC-1`) |
| **8. Manager approval** | The Manager's final approval authority over the statement is unchanged. The adjustment is flagged, not separately approved. | Unchanged |
| **9. Retention release** | Out of v1 scope. The held amount is a derived figure only. | Explicitly out of v1 scope |
| **10. Decision Lock Status** | Only `UC-1` is Owner-approved. All other Business Decisions (`BD-03`, `BD-05`, `BD-09`–`BD-21`), `UC-2`, `UC-3`, and `R-01`–`R-07` are proposals pending Owner decision. | Pending |
| **11. Other scope** | CR-01 to CR-10, the waves, the lock hierarchy and the SOD matrix are aligned with no contradictions. | Consistent |
| Terminology | One name per concept. "Recognized Outflow", not "actual outflow". "Margin", not "profit". | Consistent |
| MRN authority | Engineer creates/submits → Manager approves (`creator ≠ approver`, BD-05 proposed). | Consistent; decision pending |
| Rate source | Billing rate is a server snapshot of the item rate. A VO never changes an existing rate. | Consistent |
| Over-budget | One rule for every operation, evaluated at approval under the line lock. Manager only. | Consistent |
| Roles | Four roles only, none added. | Consistent |
| Waves | Unique numbers 21–30. Dependencies unchanged. | Consistent |
| Wording | "Specifies", "requires", "defines". No CR is described as done. | Consistent |

**Explicitly deferred out of v1 scope (not needed forSlices 21–30):**
- Retention release workflow (held retention is tracked as a derived balance in v1)
- Post-approval in-place mutation of commitment retention terms (handled via statement-level Accountant reduction under UC-2)
- Physical purge policy for archived attachments (indefinite retention in v1)

DESIGN PROPOSAL — NOT READY FOR IMPLEMENTATION APPROVAL (Owner decisions pending; only `UC-1` Owner-approved)
