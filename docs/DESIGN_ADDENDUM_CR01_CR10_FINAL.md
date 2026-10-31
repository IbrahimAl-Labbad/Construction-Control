# DESIGN CORRECTIONS & BUSINESS DECISION ADDENDUM — SYNCHRONIZED WITH OWNER DECISIONS (2026-10-31)

> **Owner Decision Synchronization Notice (v2.0 — 2026-10-31).** This specification is synchronized with the authoritative `OWNER_DECISION_REGISTER_2026-10-31.md` and `REQUIREMENTS_AMENDMENT_2026-10-31.md`.
> - **Owner-Approved Decisions Recorded:** `UC-1`, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3`, `OD-02A`, `OD-02B`, `OD-02C`, `OD-03`, `OD-04 / BD-13`, `OD-05A`, `OD-05B`, `OD-05C / BD-21`, `OD-06A-1`, `OD-06A-3`, `OD-06A-5`, `OD-06B-1`, `OD-06B-3`, `OD-06C-4`, `OD-06D-1`, `OD-06D-3`, `OD-06E-1`, `OD-07A` (`7A-1` & `7A-2`), `OD-07B` (`7B-1`), `OD-07C` (four technical/documentation corrections, subject to scope boundary), and `NEW-REQ-01` (Subcontractor Master Identity & Cash Payment Sub-Ledger).
> - **Items Remaining `OPEN` (Must Not Be Assumed):** (1) `OD-02A/02C` exact `SPLIT` exposure allocation sub-rule (`allocationSharePercent` summing to 100% vs restricting `SPLIT` to unencumbered lines); (2) `OD-06A-3` exact priority order of deduction categories when total deductions exceed a bill's gross amount; (3) `OD-06A` initial commitment value derivation if BOQ sum differs from an explicit contract/override value; (4) Production cloud object-storage provider selection for attachments.
> - **Technical Clarifications Required Before Implementation:** (1) `OD-06D-3` normalization and de-duplication of `AL_C` components/statuses in `Exposure_C = max(Eff_C, AL_C)`; (2) `OD-05C` schema/model-name reconciliation between existing `CapitalInjection` terminology and the approved temporary internal company-to-project liquidity funding semantics (no Prisma/schema changes in this documentation task).
> - **Scope Exclusions (`OUT OF SCOPE / DEFERRED`):** `CR-04` worker attendance, timesheets, overtime, and site labor sheet workflows, and `CR-06` equipment operating-hour / timesheet workflows remain **out of scope** under `AGENTS.md` §3–§4 until a separate written scope override is issued.

**Project:** Construction Control — Management Control Layer (Business Logic Change Program v2.0: CR-01 → CR-10)
**Baseline:** Branch `wave-0` | Commit: `7615e91` (Design originally baselined at `c9f0e28`, updated through `e236aa7` and `7615e91`) | Contract: `AGENTS.md v1.2.0`
**Document Version & Date:** `v2.0 — 2026-10-31`
**Document Status:** `OWNER DECISIONS SYNCHRONIZED — OPEN SUB-RULES, TECHNICAL CLARIFICATIONS & SCOPE EXCLUSIONS EXPLICITLY GATED` (Documentation-only update; zero code/schema changes performed by this synchronization)

**Decision Status Summary:** All core Owner decisions in `OWNER_DECISION_REGISTER_2026-10-31.md` are integrated in place below. Open sub-rules (`OD-02A/02C` `SPLIT`, `OD-06A-3` deduction priority, `OD-06A` BOQ vs override, production storage provider), technical clarifications (`OD-06D-3` `AL_C`, `OD-05C` `CapitalInjection` naming), and `AGENTS.md` scope exclusions (`CR-04`, `CR-06`) remain explicitly gated.

---

## 1. Document Status *(Synchronized 2026-10-31)*

| Item | Value |
|---|---|
| Baseline | Branch `wave-0`, commit `7615e91` (`Attachment Infrastructure — Wave 0` merged; earlier slices 1–21 at `c9f0e28` / `e236aa7`) |
| Contract | `AGENTS.md v1.2.0` |
| Nature | Authoritative Design Specification synchronized with `OWNER_DECISION_REGISTER_2026-10-31.md` and `REQUIREMENTS_AMENDMENT_2026-10-31.md`. Decisions approved by the Owner do not by themselves authorize code implementation or scope expansion without slice execution authorization. |
| Owner decisions on record | **`UC-1`** (2026-10-11), **`OD-01A / BD-11`** & **`OD-01B / UC-2`** (2026-10-29), and **`OD-01C / UC-3`, `OD-02A..C`, `OD-03`, `OD-04 / BD-13`, `OD-05A..C`, `OD-06A-1`, `OD-06A-3`, `OD-06A-5`, `OD-06B-1`, `OD-06B-3`, `OD-06C-4`, `OD-06D-1`, `OD-06D-3`, `OD-06E-1`, `OD-07A`, `OD-07B`, `OD-07C`, `NEW-REQ-01`** (2026-10-31). |
| Open Sub-Rules & Technical Alignments | **`OPEN`:** `OD-02A/02C` `SPLIT` allocation rule; `OD-06A-3` deduction priority order when exceeding gross; `OD-06A` initial commitment value if BOQ sum differs from contract/override; production attachment storage provider. **`TECH CLARIFICATION`:** `OD-06D-3` `AL_C` component/status normalization; `OD-05C` `CapitalInjection` naming alignment. **`OUT OF SCOPE`:** `CR-04` attendance/labor sheets and `CR-06` equipment timesheets. |
| Sources | `OWNER_DECISION_REGISTER_2026-10-31.md`, `REQUIREMENTS_AMENDMENT_2026-10-31.md`, `docs/OWNER_DECISION_BRIEF_CR01_CR10.md`, `docs/CR01_CR10_SPEC_CLOSURE_GATE_REPORT.md`, `docs/CR_Impact_Architecture_Review.md`, and `AGENTS.md v1.2.0`. |
| Location of this document | `docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md` |

**Vocabulary used throughout:**
- **CONFIRMED**: stated by the CR requirements or forced by the repository.
- **ARCHITECTURAL CONSTRAINT**: forced by the existing codebase or `AGENTS.md`.
- **OWNER-APPROVED**: explicitly approved by the Owner in `OWNER_DECISION_REGISTER_2026-10-31.md`.
- **OWNER-APPROVED WITH OPEN SUB-RULE / TECH CLARIFICATION**: core rule approved by the Owner, with a specific sub-rule or technical normalization explicitly marked `OPEN` or `TECH CLARIFICATION REQUIRED`.
- **OUT OF SCOPE / DEFERRED**: excluded from implementation unless a separate written scope override is granted.

**Repository findings that shaped the design:**

| # | Finding | Consequence |
|---|---|---|
| F1 | `approveExpense` is the only point where spend becomes "actual". There is no payment or disbursement subsystem. The only real cash-release step is `issueCustody`. | Standard material PO gate belongs at expense approval (§4 CR-05); urgent small site material purchases funded from custody are exempt from MRN (`OD-04 / BD-13`). Cash coverage separates evidenced custody cash out from approved direct payables (`OD-05A`). |
| F2 | `lib/variation-orders/calculations.ts` defines `calculateEffectiveCommitmentCeiling` and `calculateRevisedBudgetLineCeiling`, but nothing in `lib/` uses them. Billing approval checks `Commitment.amount` only. `approveVariationOrder` already locks `budget_lines → commitments → variation_orders`. | Slice 20 is **EXTEND**, not NO IMPACT (§11). Approved VOs adjust the commitment ceiling (`OD-06C-4`). |
| F3 | `Commitment` has a single `amount` and no lines. `Expense` has no `commitmentId`. | Quantity-level control needs `CommitmentItem`. Subcontractor master identity and per-contract sub-ledgers are required (`NEW-REQ-01`). |
| F4 | The over-budget check runs at `approveCommitment`, `approveExpense`, `approvePayroll`, `approveCustody` and `issueCustody`. In `issueCustody` the actor is the Accountant. | Soft-limit design uses a two-stage custody check (`OD-07B / BD-20`): Manager approves overrun cap at custody approval or via an independent `authorizeCustodyOverrun` action; Accountant re-checks at disbursement and cannot approve overruns. |
| F5 | Milestones are Manager-managed (Slice 12). Progress reports are approved by the Manager (Slice 10). | Field milestones and progress completion operate independently of Owner billings with optional reference linking (`OD-06D-1`, `BD-17`). |
| F6 | Prior text said approved equipment timesheets add budget exposure. That would double-count the commitment. | Corrected in §4 CR-06 and §6; moreover, CR-06 equipment operating-hour timesheets are **OUT OF SCOPE / DEFERRED** until a separate written scope override. |

---

## 2. Executive Summary *(Synchronized with 2026-10-31 Owner Decisions)*

1. **Decision status.** All Owner decisions recorded in `OWNER_DECISION_REGISTER_2026-10-31.md` are now integrated into this specification. Open sub-rules (`OD-02A/02C` `SPLIT`, `OD-06A-3` deduction priority, `OD-06A` BOQ vs override, production storage provider), technical clarifications (`OD-06D-3` `AL_C`, `OD-05C` model naming), and `CR-04`/`CR-06` scope exclusions remain explicitly flagged (§3, §15, §16, §17).
2. **Subcontractor master identity & cash payment sub-ledger (`NEW-REQ-01`, OWNER-APPROVED).** Each subcontractor has a single company-wide master identity with isolated per-project, per-contract sub-ledgers. Every cash payment records actual payment date, amount, movement type (advance, on-account, or billing payment), cash source, method, receipt proof, and actors. Payments made from an Engineer's custody use a single shared transaction ID linked to both the subcontractor sub-ledger and the custody settlement so they are never double-counted.
3. **Nomination & commitments (`OD-06A-1`, `OD-06A-5`, OWNER-APPROVED).** Manager approval of a subcontractor nomination atomically and idempotently creates the financial `Commitment` and reserves budget line capacity. Multiple independent subcontractor commitments may bind to one budget line with isolated contract accounts and aggregated exposure checks. *(Initial commitment value derivation if BOQ sum differs from an explicit contract/override value remains `OPEN`.)*
4. **Variation Orders (`OD-06C-4`, `BD-12`, OWNER-APPROVED).** VOs have no financial effect before approval. After approval, additions/reductions adjust the same contract commitment after budget and contract ceiling checks; negative VOs release only unused capacity and never invalidate executed work, approved billings, or paid advances. Contract ceiling overruns require an approved VO/addendum (`OD-06D-3`).
5. **Billing re-audit & deductions (`OD-03`, `OD-06A-3`, OWNER-APPROVED; deduction priority `OPEN`).** When only deductions/caps change and BOQ quantities are unchanged, the billing returns directly to `SUBMITTED` (`AUDITED → SUBMITTED`) for Accountant re-audit, preserving append-only audit snapshots and marking prior cycle deductions superseded (never deleted). Net billing payable is never negative (`>= 0.00`), and unapplied deduction balances carry forward by type/source without expiring or repeating; **exact priority order among deduction categories when total deductions exceed gross remains `OPEN`**.
6. **Subcontractor advances & custody exposure (`OD-06B-1`, `OD-06B-3`, `OD-07A`, OWNER-APPROVED).** Advances require an approved commitment, stay within `Eff_C - ApprovedBills - OpenAdvances`, and become recoverable from billings only after payout verification (`VERIFIED`). Partial cash return of an advance is supported (to an open Engineer custody or company treasury, keeping status `PARTIALLY_SETTLED` until zero). Both dedicated commitment-linked custodies (`7A-1`, absorbed inside `max(Eff_C, AL_C + OutstandingCustodiesOn(C))`) and general `SITE_OPERATIONS` custodies (`7A-2`, transferring exposure upon verification) are supported without double-counting exposure.
7. **Retention (`UC-1`, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3`, ALL OWNER-APPROVED).** Rate and cap come from each approved subcontract (`OD-01A`). `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` via `Decimal` before applying `min(scheduledRetentionThisBill, remainingRetentionCap)` (`UC-1`). Zero-retention contracts (`retentionApplicable = false`, `retentionRatePercent = 0.00`, `retentionCapMode = NO_CAP`, no deduction row) and post-approval term immutability are enforced (`OD-01B`). Percentage retention caps are dynamic on effective contract value (`Eff_C`) after approved VOs; negative VOs never rewrite historical retention or trigger automatic cash refunds—the new cap applies prospectively and pauses new retention if historical retention ≥ new cap (`OD-01C`).
8. **Material gate & custody urgent purchases (`OD-04 / BD-13`, `BD-05`, OWNER-APPROVED).** Urgent small site material purchases funded from an Engineer's custody are exempt from creating a separate MRN with **no independent fixed SAR cap per transaction or per custody** (natural limit = actual remaining disbursed custody cash), subject to mandatory receipt/invoice, material photo, description, purpose, and custody settlement approval. Standard PO/vendor purchases follow the normal PO/MRN gate (`BD-05`).
9. **Cash coverage, contractual margin & temporary company funding (`OD-05A`, `OD-05B`, `OD-05C / BD-21`, ALL OWNER-APPROVED).** Cash coverage separates `EvidencedCustodyCashOut` (`disbursedAmount - cashReturnedAmount`) from `ApprovedDirectPayables` and is labeled **Net Cash Coverage Position After Approved Payables** (`صافي تغطية السيولة بعد المستحقات المعتمدة`), never as reconciled bank cash (`OD-05A`). Contractual margin is `ApprovedOwnerBilling.netAmount - RecognizedProjectCost`, where subcontractor cost is `grossAmount - active penalties` (`OD-05B`). Project liquidity inflows come from Owner billing collections (partial supported) and temporary company-to-project funding; company funding repayment is a separate Manager-approved transaction (**never automatic** upon Owner billing collection), eliminated at company-level aggregation, and excluded from margin (`OD-05C`).
10. **Budget revisions, exposure & custody overrun (`OD-02A..C`, `OD-06D-3`, `OD-07B`, OWNER-APPROVED; `SPLIT` sub-rule `OPEN`, `AL_C` normalization `TECH-CLAR`).** Active and pending exposure carries forward across budget revisions via `lineage group` (`OD-02A`), `BudgetLineLineage` is strictly immutable post-approval (`OD-02B`), and every old line requires an explicit fate before revision approval (`OD-02C`, with `SPLIT` exposure allocation remaining `OPEN`). Contractual exposure is `Exposure_C = max(Eff_C, AL_C)` with strict separation between budget overruns and contract-ceiling overruns (`OD-06D-3`). Custody budget overruns use a two-stage check at Manager approval and Accountant disbursement with an independent Manager overrun-cap action (`OD-07B`).
11. **Non-destructive financial corrections & technical controls (`OD-06E-1`, `OD-07C`, OWNER-APPROVED).** Approved financial transactions are never mutated or deleted; errors use partial corrective entries, full reversal + re-entry, or recoverable overpayment balances (`OD-06E-1`). Monetary precision is standardized to `Decimal(15,2)`, canonical lock ordering is completed, worker names are normalized for in-scope data, and `UC-1` wording is unified (`OD-07C`).
12. **Scope exclusions (`CR-04`, `CR-06`, OUT OF SCOPE).** Worker attendance/timesheet/overtime labor sheets (`CR-04`) and equipment operating-hour timesheets (`CR-06`) remain **out of scope** until a separate written scope override.

---

## 3. Final Business Decisions

### 3.1 CONFIRMED & OWNER-APPROVED CORE RULES

| ID | Decision | Basis / Status |
|---|---|---|
| C-01 | The Engineer proposes a subcontractor nomination. Manager approval atomically and idempotently turns it into an official Commitment (`OD-06A-1`). Rejection keeps its reason. | CR-01 / **OWNER-APPROVED (`OD-06A-1`)** |
| C-02 | Subcontractor billing runs Engineer (BOQ + evidence) → Accountant (audit, deductions, net) → Manager (final approval). Unchanged-BOQ re-audit returns directly to `SUBMITTED` (`OD-03`). | CR-02 / **OWNER-APPROVED (`OD-03`)** |
| C-03 | Gross is Σ(executed quantity × contractual rate). Net is Gross minus advance recovery, retention, penalties and other approved deductions. Net must not be negative (`>= 0.00`), and unapplied deductions carry forward by type/source (`OD-06A-3`; priority order `OPEN`). | CR-02 / **OWNER-APPROVED WITH OPEN SUB-RULE (`OD-06A-3`)** |
| C-04 | A subcontractor advance is paid from custody (dedicated commitment custody `7A-1` or general `SITE_OPERATIONS` custody `7A-2`), evidenced by a receipt, verified by Accountant (`VERIFIED`), and recovered through billing or partial cash return (`OD-06B-1`, `OD-06B-3`, `OD-07A`). Liability equals `disbursedAmount`. | CR-03 / **OWNER-APPROVED (`OD-06B-1`, `OD-06B-3`, `OD-07A`)** |
| C-05 | An approved VO adjusts the effective commitment ceiling (`Eff_C`) on the same commitment without mutating original contract history; negative VOs release unused capacity only (`OD-06C-4`). | CR-07 / **OWNER-APPROVED (`OD-06C-4`)** |
| C-06 | Standard PO material payment requires an approved MRN with signed evidence (`BD-05`). Urgent small site material purchases funded from Engineer custody are exempt from a separate MRN with no independent fixed SAR cap, bounded by actual remaining disbursed custody cash (`OD-04 / BD-13`). | CR-05 / **OWNER-APPROVED (`OD-04 / BD-13`)** |
| C-07 | Project budget-line overrun halts new financial approval until a reasoned Manager exception within authority (and never raises contract value); contract-ceiling overrun halts approval until an approved VO/contract amendment raises `Eff_C` (`OD-06D-3`). | CR-09 / **OWNER-APPROVED (`OD-06D-3`)** |
| C-08 | Budget revisions create new versions; baseline is immutable; `BudgetLineLineage` is strictly immutable post-approval (`OD-02B`); exposure carries forward across `lineage group` (`OD-02A`, `OD-02C`; `SPLIT` sub-rule `OPEN`). | CR-09 / **OWNER-APPROVED (`OD-02A..C`, `SPLIT` `OPEN`)** |
| C-09 | Owner billing collections and temporary company-to-project liquidity funding are the two project inflow paths (`OD-05C`). Company funding is not revenue/profit/Owner collection; repayment requires separate Manager approval (never automatic on Owner collection). | CR-10 / **OWNER-APPROVED (`OD-05A..C`)** |
| C-10 | Field milestones and progress completion operate independently of Owner billings, with optional reference linking (`OD-06D-1`). Milestone completion requires visual evidence (`BD-17`). | CR-08 / **OWNER-APPROVED (`OD-06D-1`)** |
| C-11 | Expenses, urgent custody material purchases, and subcontractor advances require receipt/photo evidence. | CR-03, CR-05 / **OWNER-APPROVED (`OD-04`, `NEW-REQ-01`)** |
| C-12 | Money is `Decimal(15,2)` only (`OD-07C`), financial records are never hard-deleted, and every transition writes an audit entry in the same transaction. | `AGENTS.md` §13, §14, §21 / **OWNER-APPROVED (`OD-07C`)** |
| NEW-REQ-01 | Unified company-wide Subcontractor Master Identity with isolated per-project, per-contract sub-ledgers, mandatory cash payment fields, and single-transaction dual-view linking for Engineer custody payments. | CR-01..03 / **OWNER-APPROVED (`NEW-REQ-01`)** |

### 3.2 CROSS-CUTTING RULES (`R-01` → `R-07`, Synchronized with `OWNER_DECISION_REGISTER_2026-10-31.md`)

> *Note on ID mapping:* In `OWNER_DECISION_REGISTER_2026-10-31.md`, `R-01`..`R-07` also denote specific Owner-approved rules (`OD-06A-5 / R-01`, `OD-06B-3 / R-02`, `OD-06D-1 / R-04`, `OD-06C-4 / R-05`, `OD-06E-1 / R-06, R-07`). Both meanings are preserved below for full traceability.

| ID | Rule Summary & Status |
|---|---|
| R-01 (`OD-06A-5` / `OD-06A-1`) | **Multiple Commitments per Budget Line (`OD-06A-5`, OWNER-APPROVED):** Multiple independent subcontractor commitments/contracts may bind to a single budget line, keeping each contract and subcontractor account isolated while aggregating exposure against the shared budget line capacity. **Initial Commitment Value (`OD-06A-1`):** `estimatedAmount` is Σ rounded nomination lines; how initial commitment value is derived if BOQ sum differs from an explicit contract/override value remains **`OPEN`**. |
| R-02 (`OD-06D-3`, `OD-07A`, `OD-06B-3`) | **Commitment Exposure & Relief (`OD-06D-3`, `OD-07A`, OWNER-APPROVED WITH `AL_C` TECH CLARIFICATION):** Contractual exposure is `Exposure_C = max(Eff_C, AL_C)` (and `max(Eff_C, AL_C + OutstandingCustodiesOn(C))` when dedicated subcontractor custodies exist under `7A-1`). Also in Register as `OD-06B-3 / R-02` (**Partial Cash Return of Subcontractor Advance — OWNER-APPROVED**). |
| R-03 (`UC-1`, `OD-07C`) | **Monetary Precision & Rounding (OWNER-APPROVED):** All monetary fields use `Decimal(15,2)` (`OD-07C`). Line amount = quantity × rate rounded half-up (`ROUND_HALF_UP`) to 2 dp via `Decimal`. Retention: `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` via `Decimal` before applying `min(scheduledRetentionThisBill, remainingRetentionCap)` (`UC-1`, `OD-07C`). |
| R-04 (`OD-06E-1`, `OD-06D-1`) | **Non-Destructive Financial Correction (`OD-06E-1`, OWNER-APPROVED):** Approved financial records are never edited in place or deleted; corrections use a linked partial corrective entry, full reversal + re-entry, or recoverable cash overpayment balance. Also in Register as `OD-06D-1 / R-04` (**Milestone Independence from Owner Billing — OWNER-APPROVED**). |
| R-05 (`OD-06C-4`) | **Evidence at Submit & VO Commitment Rules (OWNER-APPROVED):** Minimum evidence per record type is checked at submit (§9). Also in Register as `OD-06C-4 / R-05` (**Variation Orders on Subcontractor Commitments — OWNER-APPROVED**). |
| R-06 (`OD-06E-1`) | **Mandatory Reason & Audit Traceability (OWNER-APPROVED):** Every override, overrun authorization, retention reduction, rejection, reversal, and corrective entry requires a non-empty trimmed reason, actor, timestamp, and audit log entry. |
| R-07 (`OD-03`, `OD-06E-1`) | **Seven Billing Statuses & Direct Re-Audit (`OD-03`, OWNER-APPROVED):** `DRAFT, SUBMITTED, AUDITED, APPROVED, REJECTED, CANCELLED, REVERSED`. When only deductions/caps change and BOQ quantities are unchanged, the billing returns directly to `SUBMITTED` (`AUDITED → SUBMITTED`) for Accountant re-audit with append-only audit snapshots and superseded prior deductions. |

---

## 4. CR-01 → CR-10 Final Specifications

### 4.0 Subcontractor Master Identity & Cash Payment Sub-Ledger (`NEW-REQ-01` — OWNER-APPROVED)

1. **Subcontractor Master Identity Across Projects:**
   - The system must never create duplicate independent subcontractor entities simply because the same subcontractor works across multiple projects.
   - A single company-wide master subcontractor record holds the subcontractor's core identity, linked to independent contractual relationships and sub-accounts/sub-ledgers for each `(project, contract/commitment)`.
   - Contract balances (advances, billings, payments, deductions) remain strictly isolated per contract. Cross-project summary views may be displayed for management oversight, but never commingle contract balances or auto-offset one contract's balance against another without an explicit approved transaction.
2. **Subcontractor Cash Payment Sub-Ledger (`دفتر حركة المقاول` — `NEW-REQ-01`):**
   - Every cash payment received by a subcontractor must appear in the sub-ledger of its linked contract and record the following **exact mandatory fields**:
     - `paymentDate` (`paidAt`): Actual date when cash was paid to the subcontractor.
     - `amount`: Monetary payment amount in SAR, stored as exact `Decimal(15,2)` (> 0.00).
     - `paymentType` (`movementType`): Approved movement type — `ADVANCE` (`سلفة`), `ON_ACCOUNT` (`دفعة تحت الحساب`), or `BILLING_PAYMENT` (`دفعة مستخلص`).
     - `cashSource`: Actual source of physical cash (e.g. `ENGINEER_CUSTODY`, `COMPANY_TREASURY`).
     - `paymentMethod`: Payment instrument / transfer method (e.g. `CASH_PHYSICAL`, `BANK_TRANSFER`, `CHECK`, `DIGITAL_PAYMENT`). Distinct from `cashSource`.
     - `transactionReference` (`مرجع السند النقدي / مرجع العملية`): Mandatory reference identifier across all payment methods (never omitted or left blank). For direct physical cash payments (`CASH_PHYSICAL`), recording the cash disbursement voucher number, cash receipt voucher number, or custody payment voucher reference (`رقم سند الصرف النقدي / إيصال القبض / سند صرف العهدة`) is strictly mandatory. For bank-mediated methods (`BANK_TRANSFER`, `CHECK`, `DIGITAL_PAYMENT`), recording the bank transfer reference number, check number, or digital transaction reference is strictly mandatory.
     - `projectId`: ID of the project where work is performed.
     - `commitmentId`: ID of the approved subcontractor contract / commitment (`Commitment`).
     - `subcontractorId`: ID of the company-wide Subcontractor Master Identity (`Subcontractor`).
     - `receiptEvidence` (`receiptAttachmentId`): Mandatory uploaded receipt voucher, signed acknowledgment, or photo evidence of receipt.
     - When paid from an Engineer's custody:
       - `engineerId` / `engineerName`: Full identity of the paying Engineer.
       - `custodyId`: Identification of the specific open custody (`Custody`) from which cash was disbursed.
       - `sharedCustodyPaymentTxId` (`canonicalTransactionId`): Single shared transaction identifier linking the subcontractor payment entry directly to the custody settlement record.
     - Governance actors: `paidById` (payer), `recordedById` (recorder), and `approvedById` (reviewer/approver per permission matrix).
3. **Classification of Payment Effect:**
   - **Advance (`سلفة`):** Upfront payment that remains a recoverable balance governed by the contract's recovery terms.
   - **On-Account / Billing Payment (`دفعة تحت الحساب / دفعة مستخلص`):** Payment settled against a contractual entitlement, linked to the relevant billing statement/claim and never reclassified as an advance without an approved corrective transaction.
   - Approving a billing statement must never be confused with proving its payment; a received payment is recorded in the subcontractor's sub-ledger only when actual payout is evidenced.
4. **Custody Linkage Without Double-Counting (`قيد واحد وأثران مترابطان` — Non-Duplication Rule):**
   - When an Engineer pays a subcontractor from custody, a single financial movement with one shared transaction reference (`sharedCustodyPaymentTxId`) is created and surfaced in two linked views:
     - As cash received in the subcontractor's contract sub-ledger (`SubcontractorLedgerEntry`).
     - As cash expended in the Engineer's custody settlement (`CustodySettlementEntry` / `CustodySubcontractorAdvance`).
   - **Non-Duplication Invariant:** The contractor sub-ledger and custody settlement reference one shared financial transaction (`sharedCustodyPaymentTxId`). The same payment is **never counted twice** in aggregate project expenses, recognized cash outflows (`RecognizedOutflow`), or budget exposure calculations. Disbursing a custody to an Engineer is not proof that the subcontractor received funds; the subcontractor sub-ledger is credited only when actual payout to the subcontractor is evidenced.

---

### CR-01 — Subcontractor Nomination → Commitment (`OD-06A-1`, `OD-06A-5` — OWNER-APPROVED; BOQ vs Override `OPEN`)

- **Aggregate:** `SubcontractorNomination` with `SubcontractorNominationItem` lines, linked to the company-wide Subcontractor Master Identity (`NEW-REQ-01`).
- **Author:** Engineer assigned to an ACTIVE project.
- **Budget line & Multiple Commitments (`OD-06A-5 / R-01`, OWNER-APPROVED):**
  - Category `SUBCONTRACTOR`, same project, approved budget. The nomination's `budgetLineId` is **immutable from SUBMITTED onward**. This lets approval resolve its lock target safely (§7).
  - Multiple independent commitments for different subcontractors/contracts may be linked to a single budget line. Each contract and subcontractor sub-account remains isolated, while their exposures are summed to check capacity against the shared budget line. Sub-lines may be used when separate control over materially distinct work scopes is required.
- **Retention terms:** entered with the nomination from the subcontract agreement (see CR-02, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3`). They are fixed when the commitment is approved.
- **Total & Initial Commitment Value (`OD-06A-1`):** `estimatedAmount` is a server-computed Σ item lines. *(Open detail `OPEN`: how the initial commitment value is derived if the BOQ sum differs from an explicit contract/override value is not settled in the recorded decisions; neither is assumed to override the other without Owner clarification.)*
- **Approval (`OD-06A-1 / BD-03`, OWNER-APPROVED):** Manager only, and the Manager cannot be the creator or the submitter.
- **Approval effect (`OD-06A-1`, OWNER-APPROVED):** Upon Manager approval of the subcontractor nomination/contract request, the system automatically and atomically creates the financial `Commitment` as `APPROVED`, creates the `CommitmentItem` rows, reserves the amount on the appropriate budget line, and preserves full links between the nomination, contract, commitment, and approval. No financial commitment is created prior to approval.
- **Bypass guard:** after cutover, Purchasing cannot create commitments on `SUBCONTRACTOR` lines. Otherwise Purchasing could skip the BOQ path (BD-14).
- **Cardinality:**
  - One approved nomination produces exactly one commitment.
  - `Commitment.nominationId` is UNIQUE and nullable (nullable because Purchasing commitments have no nomination).
  - `Nomination.resultingCommitmentId` is UNIQUE and NULL until approval.
  - Both are set in the same transaction.
- **Idempotency, retry safety, and duplicate approval (`OD-06A-1`, OWNER-APPROVED):**
  - Approval follows the canonical order: it locks the `budget_lines` row first, then the nomination row (a level-6 header lock), then revalidates.
  - Concurrent approvals of the same nomination, and of any nomination on the same line, serialize on the budget-line lock. They then queue on the nomination row.
  - The second caller finds the nomination already `APPROVED` with a commitment, and returns that commitment without creating anything (idempotent retry protection). If the status is not `SUBMITTED` and there is no commitment, it fails.
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

### CR-02 — Subcontractor Billing (`UC-1`, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3`, `OD-03`, `OD-06A-3` — OWNER-APPROVED; Deduction Priority `OPEN`)

**Entities:** `SubcontractorBilling`, `SubcontractorBillingLine`, `BillingAuditSnapshot`, `BillingDeduction`, and the advance recovery ledger (CR-03).

**Billing line identity:**
- `commitmentItemId` is mandatory.
- The server sets `unitRate` as a snapshot of `CommitmentItem.contractRate`. The client cannot supply it.
- Unique per `(billingId, commitmentItemId)`.
- There is **no user-chosen VO field**. VO quantity is a pooled extension of the item (`BD-12`).

**Quantity rule:**
- `Effective Qty(item) = contractQuantity + Σ approved VO quantity adjustments on the item`.
- Cumulative approved billed quantity must be ≤ `Effective Qty(item)`.
- An ADDITIONAL_ITEM VO line becomes its own `CommitmentItem` with its own `contractRate`.

#### Retention — `UC-1`, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3` (ALL OWNER-APPROVED)

*Scope note:* retention here is a contractual holdback on a subcontractor statement. It is not tax withholding, which `AGENTS.md` §4 excludes.

1. **Terms come from each subcontract (`OD-01A / BD-11` & `OD-01B / UC-2` OWNER-APPROVED).**
   - The retention rate and the cumulative retention cap are defined strictly by each approved subcontract agreement.
   - The system introduces **no universal default rate and no universal numerical cap**.
   - The rate is an explicit percentage entered for the subcontract. Retention terms must accurately reflect the approved subcontract.
   - **Zero-Retention Contracts (`OD-01B / UC-2` Approved Specification):** Where a subcontract agreement stipulates zero retention, it is explicitly captured and represented as:
     - `retentionApplicable = false`
     - `retentionRatePercent = 0.00`
     - `retentionCapMode = NO_CAP`
     - **No retention deduction row** is created for billing statements against such zero-retention contracts.
   - For contracts where retention applies, the rate has the structural validity bound `0.00` to `100.00%`, and the cap is governed by the contract (`NO_CAP`, fixed `CAP_AMOUNT`, or dynamic percentage cap on effective contract value `Eff_C` under `OD-01C / UC-3`). An absent cap (`NO_CAP`) and a cap of `0.00` are never confused.
   - A nomination with the rate or the cap form left unspecified cannot be submitted.
2. **Terms are fixed at commitment approval (`OD-01B / UC-2` OWNER-APPROVED).**
   - The retention terms entered on the nomination become the commitment's retention terms when the commitment is approved. After that, commitment retention terms are **strictly immutable** on the commitment record.
   - **No informal contract mutation:** Commitment retention terms cannot be altered after approval except through an authorized formal contract amendment/addendum.
   - For contracts where retention applies, preserve the approved `UC-1` calculation and all applicable cap controls.
3. **Calculation basis & Rounding (`UC-1` & `OD-07C` OWNER-APPROVED).**
   - The system calculates scheduled retention automatically on the **current statement's Gross Amount, before any other deduction**:
     `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)`
   - **Rounding rule (`UC-1`):** Computed with exact `Decimal` arithmetic (`ROUND_HALF_UP` to 2 decimal places / halalas: third decimal digit `≥ 5` rounds up, `< 5` rounds down; zero floating-point usage) *before* applying `min(scheduledRetentionThisBill, remainingRetentionCap)`.
4. **Cumulative cap & Dynamic Variation Order Interaction (`OD-01C / UC-3` OWNER-APPROVED).**
   - Where the contract specifies a percentage retention cap, the cap is **dynamic on the effective contract value (`Eff_C`) after approved Variation Orders** (`OD-01C / UC-3`).
   - `Actual Retention = min(scheduledRetentionThisBill, max(EffectiveRetentionCap − PreviouslyRetained, 0))` when a cap applies (`Actual Retention = scheduledRetentionThisBill` when `NO_CAP`).
   - **Previously Retained** = Σ active retention deductions on the `APPROVED` (non-reversed) statements of the same commitment, excluding the current statement. Pending statements do not count.
   - **Scope reductions (Negative VOs) under `OD-01C / UC-3`:** A negative Variation Order **never rewrites historical approved retention** and **never generates an automatic cash refund** of previously retained amounts. The new recalculated cap applies **prospectively**: if `PreviouslyRetained` already equals or exceeds the new recalculated cap (`EffectiveRetentionCap`), new retention deductions stop (`0.00`) on subsequent billing statements until available cap space reopens.
5. **Accountant downward adjustment (statement level only, `OD-01A / BD-11` OWNER-APPROVED).**
   - During audit of an individual bill, the Accountant may propose a **downward adjustment** of the retention for the current statement only, reducing it to any amount from `0.00` up to scheduled `Actual Retention`.
   - A non-empty reason is mandatory. The audit snapshot stores the calculated, cap-limited and adjusted amounts, a flag that an adjustment was made, and the reason. An audit event records who changed it, from what and to what.
   - **Adjustment bounds & contract fidelity:** The adjustment must not exceed scheduled retention or the remaining applicable cap, and must not violate the governing contract.
   - **Discretion vs. contract amendment:** Any reduction requiring a formal contract amendment must follow an authorized contract amendment process. Accountant audit discretion is strictly limited to statement-level audit adjustments and is not authority to override or informally amend contractual terms.
   - The adjustment never changes the commitment's rate or cap and does not affect any other statement.
6. **Final approval & Immutability (`OD-01A / BD-11` OWNER-APPROVED).**
   - The Manager keeps final approval authority over the statement and any retention adjustment.
   - A statement with an adjustment is visibly flagged to the Manager with its mandatory reason.
   - **Append-only immutability:** Approved billing and audit records remain immutable; approved historical retention records are never altered retroactively.
7. **Release of retention is outside v1 scope.**
   - No release workflow is in v1 scope; held retention is tracked as a derived contractual balance.

#### Re-Audit of Subcontractor Billing (`OD-03` — OWNER-APPROVED)

- **Direct Return to `SUBMITTED` When BOQ Quantities Are Unchanged (`OD-03`):**
  - If a billing statement requires re-audit because financial deductions or caps changed (for example, concurrent cap/advance exhaustion or Manager return on deductions) while field BOQ quantities remain unchanged, the billing statement is returned directly to `SUBMITTED` (`AUDITED → SUBMITTED`) so the Accountant can re-audit it directly without forcing the Engineer to re-enter unchanged BOQ quantities.
  - Each audit cycle preserves an independent append-only historical snapshot (`BillingAuditSnapshot`). Deductions from the prior audit cycle are marked as **superseded by re-audit** (and any `RESERVED` advance recovery entries from the superseded cycle are compensated with `RELEASED` entries) and are **never deleted**.
  - If field BOQ quantities must change, the billing returns to the Engineer (`REJECTED` / reopened to `DRAFT`) for quantity correction and resubmission.
  - Once final Manager `APPROVED` status is reached, the approved audit snapshot is frozen.

#### Billing Deductions & Carry-Forward (`OD-06A-3 / BD-12` — OWNER-APPROVED; Priority Order `OPEN`)

- Deduction types are `ADVANCE_RECOVERY`, `RETENTION`, `PENALTY`, `OTHER`. Amounts are positive (`Decimal(15,2) > 0.00`; zero-amount deduction rows are not created).
- Only the Accountant creates or records deductions during the audit cycle (`SUBMITTED → AUDITED`), scoped to that cycle's `BillingAuditSnapshot`.
- **Non-Negative Net & Carry-Forward Rule (`OD-06A-3`, OWNER-APPROVED):**
  - Net billing payable must never be negative (`Net = Gross − AppliedDeductions ≥ 0.00`).
  - Total deductions applied in a billing statement cannot exceed the gross value of work due in that statement (`Σ AppliedDeductions ≤ Gross`).
  - Any deduction amount that cannot be applied in the current statement remains an active carry-forward balance linked to its deduction type and source (e.g., remaining verified advance balance, remaining retention cap, or unapplied penalty/other balance) and is neither lost/forfeited nor double-deducted in subsequent statements.
  - **Open Sub-Rule (`OPEN`):** **The exact priority order for applying deduction categories (`ADVANCE_RECOVERY`, `RETENTION`, `PENALTY`, `OTHER`) when their combined total exceeds the statement's Gross amount has not yet been selected by the Owner and must not be assumed or invented.**

**Lifecycle** (§10): `DRAFT → SUBMITTED → AUDITED → APPROVED`, with `AUDITED → SUBMITTED` (re-audit when BOQ unchanged, `OD-03`), `REJECTED`, `CANCELLED` and `REVERSED`.

**Checks by stage:**

| Stage | Check | Nature |
|---|---|---|
| Submit | Item belongs to the commitment. Quantity ≤ remaining (counting approved plus pending). Evidence present. | Advisory; may be stale |
| Audit | Re-check under locks. Create new `BillingAuditSnapshot`, deductions, and advance reservations (`RESERVED`). Calculate retention (`UC-1`) and apply dynamic cap (`OD-01C`). Enforce `Net ≥ 0` (`OD-06A-3`). | Snapshot recorded (append-only) |
| **Approve** | Full re-check under locks. Quantity, money and retention cap use **approved** history only. Confirm advance recoveries (`CONFIRMED`) and freeze snapshot. If financial caps changed concurrently while BOQ is valid, return to `SUBMITTED` for Accountant re-audit (`OD-03`). | **Authoritative** |

### CR-03 — Custody, Subcontractor Advances, and Exposure Non-Duplication (`OD-06B-1`, `OD-06B-3`, `OD-07A` — ALL OWNER-APPROVED)

**Custody amounts:**
- `Custody.amount` is retained as the requested amount.
- `disbursedAmount` is set by the Accountant at issuance. It is mandatory and must satisfy `0 < disbursedAmount ≤ amount`.
- Liability, exposure and settlement use `disbursedAmount`.
- It is immutable after `ISSUED`. A correction uses an explicit Manager-approved adjustment record (`OD-06E-1`).
- The difference `amount − disbursedAmount` is released at issuance and is not active exposure.
- Every disbursement writes an audit event with the delta.

**Remaining custody balance** = `disbursedAmount − approved expenses − verified advances − cash returned ≥ 0.00`.

**Two Approved Custody Paths for Subcontractor Advances (`OD-07A / BD-18` — OWNER-APPROVED):**
1. **Path 1 — Dedicated Commitment-Linked Custody (`7A-1`):**
   - A custody linked directly to an approved subcontractor commitment (`C`).
   - The outstanding balance of this custody (`OutstandingCustodiesOn(C)`) is absorbed within the commitment's own exposure envelope `max(Eff_C, AL_C + OutstandingCustodiesOn(C))` rather than being added a second time to the budget line's exposure.
2. **Path 2 — General `SITE_OPERATIONS` Custody (`7A-2`):**
   - An Engineer's general `SITE_OPERATIONS` custody may be used to pay a subcontractor advance.
   - Prior to payout verification, the unspent cash remains under the general custody's exposure.
   - Upon verification/documentation of the payout to the subcontractor (`VERIFIED`), the exposure effect transfers from the general `SITE_OPERATIONS` custody to the subcontractor commitment while reducing the general custody's exposure 1-for-1 without double-counting.
- **Accountability Separation (`OD-07A`):** Contractual exposure on the subcontractor commitment and personal cash-possession accountability on the Engineer are distinct; transferring exposure never erases the Engineer's custody responsibility except to the extent settled and evidenced (`NEW-REQ-01`).

**Subcontractor Advance Ceiling & Verification (`OD-06B-1 / BD-16, BD-17` — OWNER-APPROVED):**
- An advance requires an approved subcontractor commitment (`C`).
- **Ceiling:** The advance ceiling is governed by the contract or an explicit financial approval by the Manager; the system imposes **no arbitrary universal default percentage or amount**. Every advance must stay within the remaining contractual capacity after approved billings and open advances:
  `advance.amount <= Eff_C - ApprovedBills - OpenAdvances`
- **Verification:** The custodian Engineer records the advance with mandatory receipt proof (`NEW-REQ-01`). Status flows `RECORDED → VERIFIED | REJECTED`, verified by the Accountant.
- An advance is recorded on the subcontractor's sub-ledger only upon proven actual payout and receipt, and becomes **recoverable from billing statements only after verification (`VERIFIED`)**. A rejected advance leaves the cash liability with the custodian Engineer.

**Recovery from Billings (`OD-06B-1` — OWNER-APPROVED):**
- Recovery value is governed by the approved contract terms for each advance: percentage, fixed amount, or schedule.
- During billing audit, the Accountant sets the recovery amount within the remaining balance of `VERIFIED` advances and not exceeding the billing amount available after retention (`OD-06A-3`).
- **FIFO scope (`OD-06B-1`):** FIFO is used **only** to allocate an already-computed recovery amount across advances that share compatible recovery terms; advances with distinct contractual terms maintain independent recovery schedules.
- **Recovery ledger (`AdvanceRecoveryEntry`, append-only):**
  - Entry states are `RESERVED` (at billing audit), `CONFIRMED` (at billing approval), and `RELEASED` (compensating entry on return for re-audit `OD-03`, rejection, cancellation, or reversal).
  - **Remaining recoverable balance** = `advance.amount − cashReturnedBySubcontractor − Σ(active RESERVED + active CONFIRMED entries not released) ≥ 0.00`.
  - The Engineer cannot edit any recovery value. Recovery is allowed only when the advance's commitment equals the billing's commitment.

**Partial Cash Return of a Subcontractor Advance (`OD-06B-3 / R-02` — OWNER-APPROVED):**
- A subcontractor may return part (or all) of an advance in cash rather than via billing deduction.
- A new receipt transaction is recorded linked to the original advance, capturing the receipt date, receiver, receipt evidence/voucher, amount, and explicit cash destination:
  1. **Added to an open Engineer custody:** increases the available cash balance of that open custody; or
  2. **Received into company treasury:** recorded as a treasury cash receipt.
- The advance's outstanding balance is reduced by the received amount, and its status remains `PARTIALLY_SETTLED` until the remaining balance reaches `0.00`, at which point it closes (`FULLY_RECOVERED` / `CLOSED`).
- The returned amount must never exceed the advance's remaining unrecovered balance and is never counted twice.

### CR-04 — Site Labor Sheet (`OUT OF SCOPE / DEFERRED` per `OWNER_DECISION_REGISTER_2026-10-31.md` & `AGENTS.md` §3–§4)

> **Authoritative Scope Status (2026-10-31 — `OUT OF SCOPE / DEFERRED`):**
> - Under `OWNER_DECISION_REGISTER_2026-10-31.md` (§4, §5) and `REQUIREMENTS_AMENDMENT_2026-10-31.md` (§14.2, §15), **there is no current Owner approval to implement worker attendance sheets, working hours, or overtime workflows (`SiteLaborSheet`) under CR-04**. Expanding scope to include attendance/timesheet tracking requires a **separate written scope override**.
> - Under **`OD-07C` (item 2, OWNER-APPROVED WITH SCOPE CONSTRAINT)**, worker name normalization and duplicate-prevention rules are approved **only for the portion of labor/payroll data that is in scope** (`PayrollEntry` capture under Slice 8), and do **not** authorize implementing an attendance or check-in/check-out workflow.
> - Where `ApprovedSiteLaborSheets` appears in the cash coverage (`OD-05A`) or project cost (`OD-05B`) formulas, it is strictly conditional (`only if CR-04 is later authorized in scope`) and evaluates to `0.00` while CR-04 remains deferred.

*(Historical draft design notes below are retained for reference only and are **not authorized for implementation** without a separate written scope override):*
- Draft entities: `SiteLaborSheet` and `SiteLaborSheetLine` (one sheet per `(projectId, laborBudgetLineId, periodYear, periodMonth)`, plain-text normalized worker name, attendance days, daily wage, overtime at `1.50 × (dailyWage ÷ projectStandardDayHours)`). **Status: DEFERRED / OUT OF SCOPE.**

### CR-05 — Material Receiving Note, Payment Gate, and Custody Urgent Materials Exception (`OD-04 / BD-13`, `BD-05` — OWNER-APPROVED)

**1. Standard Purchase Order & MRN Path (`BD-05` — OWNER-APPROVED):**
- A Purchasing-authored `Commitment` on a `MATERIALS` line is the PO, with `CommitmentItem` rows (`sourceType = PURCHASING`).
- **Chain:** Commitment → CommitmentItem (ordered qty, rate) → MRNItem (delivered, accepted, rejected) → Expense material line (invoiced qty).
- **MRN rules:** `Delivered = Accepted + Rejected`; cumulative accepted over approved MRNs ≤ ordered quantity per item; rejected quantities are never payable; payable quantity = `Σ accepted (APPROVED MRNs) − Σ invoiced (APPROVED expenses)` under lock.
- **MRN Authority (`BD-05`):** Engineer creates, receives, inspects, and submits the MRN; **Manager approves** (`creator ≠ approver`).
- **Standard PO Gate:** At `approveExpense` under locks, standard PO/vendor material expenses require `APPROVED` MRNs with `invoiced quantity ≤ accepted − previously invoiced` per item, followed by the budget check (`C-07`).

**2. Urgent Site Material Purchases Funded from Custody (`OD-04 / BD-13` — OWNER-APPROVED):**
- **Approved Exception:** Urgent small material purchases funded from a site Engineer's custody are **exempt from creating a separate MRN** and from requiring a prior PO `CommitmentItem`.
- **No Independent Fixed SAR Cap:** There is **no independent fixed SAR cap per transaction and no fixed SAR cap per custody**; the natural spending limit is the **actual remaining disbursed cash balance in the custody** (`RemainingBalance(K)`).
- **Mandatory Documentation per Transaction:** Every custody-funded urgent material purchase must record:
  1. Material description and explicit purpose.
  2. Project and linked Custody (`custodyId`).
  3. Amount (`Decimal(15,2)`) and transaction date.
  4. Clear tax invoice or clear field receipt attachment.
  5. Material photo / field proof attachment.
- **Settlement & Review:** Each such purchase is subject to the normal custody settlement review, Accountant verification, and Manager approval workflow.
- **Scope Boundary of Exception:** This exception applies strictly to urgent small purchases funded from site custody; standard supplier purchases and purchase orders remain subject to the normal PO/MRN workflow above.

### CR-06 — Equipment (`OUT OF SCOPE / DEFERRED` per `OWNER_DECISION_REGISTER_2026-10-31.md` & `AGENTS.md` §3–§4)

> **Authoritative Scope Status (2026-10-31 — `OUT OF SCOPE / DEFERRED`):**
> - Under `OWNER_DECISION_REGISTER_2026-10-31.md` (§4, §5) and `REQUIREMENTS_AMENDMENT_2026-10-31.md` (§15), **there is no current Owner approval to implement an equipment operating-hour or timesheet system (`EquipmentTimesheet`) under CR-06**. Expanding scope to include equipment operating-hour tracking requires a **separate written scope override**.

*(Historical draft design notes below are retained for reference only and are **not authorized for implementation** without a separate written scope override):*
- Draft entities: `Equipment`, `EquipmentContract`, and `EquipmentTimesheet` (rented/supplier equipment tied to an `EQUIPMENT` commitment, hour-meter vs clock-time basis, `METER_FAILURE` flag, signed field ticket, and `F6` rule that timesheets add no extra budget exposure beyond the commitment). **Status: DEFERRED / OUT OF SCOPE.**

### CR-07 — Variation Order Integration (`OD-06C-4 / R-05`, `BD-12` — OWNER-APPROVED)

- **No Effect Before Approval (`OD-06C-4`, OWNER-APPROVED):** A Variation Order (`VO`) has no financial impact on a commitment before it is `APPROVED`.
- **VO Line Types (extending Slice 20, `BD-12`):**
  - `QUANTITY_ADJUSTMENT`: references an existing `CommitmentItem`, keeps the same contractual rate, and applies a quantity delta.
  - `ADDITIONAL_ITEM`: creates a new `CommitmentItem` (`sourceType = VARIATION`) upon approval.
- **Post-Approval Effect on Commitment (`OD-06C-4`, OWNER-APPROVED):**
  - Positive VOs increase the effective ceiling (`Eff_C = Commitment.amount + Σ APPROVED VO impact`) of the **same contract commitment** after verifying contractual cover and project budget availability (`OD-06D-3`).
  - Negative VOs (scope reductions) **release only the unused portion of the commitment** and **never** cancel or invalidate already-executed work, approved billing statements, or subcontractor advances already paid (`OD-06C-4`), nor do they rewrite historical retention or trigger automatic cash refunds (`OD-01C / UC-3`).
  - A negative adjustment is rejected if it would drop effective quantity below cumulative approved billed quantity or drop `Eff_C` below committed/paid obligations.
- **Audit & History Preservation (`OD-06C-4`):** The original contract commitment value and the complete log of all Variation Orders, before/after values, reasons, and approvals are permanently preserved.
- **Contract Ceiling vs Budget Exception (`OD-06D-3`):** Any increase above the contract ceiling requires an approved VO or formal contract addendum; a project budget-line exception alone never raises the contract value.

### CR-08 — Field Progress, Milestones, and Independence from Owner Billing (`OD-06D-1 / R-04`, `BD-17` — OWNER-APPROVED)

- **Independence from Owner Billing (`OD-06D-1 / R-04`, OWNER-APPROVED):**
  - The field milestones and progress completion workflow operates **independently** of the Owner billing workflow, with **optional reference linking**.
  - Field progress and milestone completion may be documented and approved before any Owner billing is drafted.
  - Approving a field milestone **does not** automatically generate an Owner billing claim and **does not** constitute a financial approval.
  - An Owner billing may optionally link to one or more milestones, Engineer progress reports, and visual attachments to evidence fulfillment of a contractual billing condition when needed.
- **Chain & Roles (Slices 10 and 12, `BD-17`):**
  - `ProgressReport ↔ Milestone` (many-to-many) `↔ Attachment` (on the report).
  - The Engineer creates the progress report and attaches visual evidence; the Manager approves the report; only the **Manager** marks a milestone `COMPLETED` (`F5`, `BD-17`).
- **Evidence Gate:** Completing a milestone requires at least one linked `APPROVED` progress report with at least one active (non-voided) visual attachment; otherwise `MILESTONE_EVIDENCE_MISSING` is raised and audited. After milestone completion, its supporting evidence is immutable.

### CR-09 — Budget Governance, Contractual Exposure, Custody Overruns, and Revision Lineage (`OD-02A..C`, `OD-06D-3`, `OD-07A`, `OD-07B` — OWNER-APPROVED; `SPLIT` Sub-Rule `OPEN`, `AL_C` Normalization `TECH-CLAR`)

#### 4.9.1 Contractual Exposure & Budget Line Exposure Model (`OD-06D-3`, `OD-07A`, `OD-02A`)

1. **Contractual Commitment Exposure (`OD-06D-3 / BD-19, BD-20` — OWNER-APPROVED WITH `AL_C` TECH CLARIFICATION):**
   - For each commitment `C`, contractual exposure is:
     `Exposure_C = max(Eff_C, AL_C)`
     where `Eff_C = commitment.amount + Σ APPROVED VO impact on C` is the effective contract value after approved Variation Orders, and `AL_C` is the total approved liabilities/exposures linked to contract `C` after removing any duplication.
   - When dedicated subcontractor custodies (`7A-1` under `OD-07A`) are linked to commitment `C`, their outstanding uninvoiced balance `OutstandingCustodiesOn(C)` is absorbed inside the commitment's exposure envelope:
     `Exposure_C = max(Eff_C, AL_C + OutstandingCustodiesOn(C))`
   - **Technical Clarification Required (`OD-06D-3`):** The exact component elements, statuses, and de-duplication keys of `AL_C` across commitment types must be normalized in the technical specification before code implementation.
2. **Budget Line Exposure Terms (Evaluated Across the Line's `Lineage Group` per `OD-02A`):**

| Term | Definition |
|---|---|
| **E(L)** Effective budget line amount | `line.amount + Σ EXECUTED transfers in − Σ EXECUTED transfers out` |
| **Eff_C** Effective commitment amount | `commitment.amount + Σ APPROVED VO impact on C` |
| **Exposure_C** Commitment exposure term | `max(Eff_C, AL_C)` (or `max(Eff_C, AL_C + OutstandingCustodiesOn(C))` for dedicated commitment-linked custodies per `OD-07A`) |
| **X(L)** Active exposure (across lineage group per `OD-02A`) | `Σ Exposure_C` + `Σ APPROVED unlinked expenses` + `OutstandingGeneralCustodies(L)` + `approved payroll` + `approved labor sheets (only if CR-04 is later authorized)` |
| **OutstandingGeneralCustodies(L)** | For each general (`SITE_OPERATIONS`) custody in `ISSUED` or `PARTIALLY_SETTLED`: `disbursedAmount − approved settled expenses − verified subcontractor advances (transferred to C per OD-07A) − cashReturnedAmount` |
| **Available(L)** | `E(L) − X(L)` |
| **P(L)** Pending projection | `Σ SUBMITTED commitments` + `Σ SUBMITTED unlinked expenses` + `Σ SUBMITTED / APPROVED-unissued custodies` + `Σ SUBMITTED payroll` + `linked-expense overflow` |
| **Projected(L)** | `Available(L) − P(L)` |

**Why nothing is counted twice (`OD-07A`, `NEW-REQ-01`):**
- Under `OD-07A` Path 1 (`7A-1`), a dedicated custody linked to subcontractor commitment `C` sits inside `max(Eff_C, AL_C + OutstandingCustodiesOn(C))` and is never added as a separate line custody exposure.
- Under `OD-07A` Path 2 (`7A-2`), when an advance is paid from a general `SITE_OPERATIONS` custody and verified (`VERIFIED`), its exposure transfers to the subcontractor commitment while reducing `OutstandingGeneralCustodies(L)` by the exact verified amount.
- Under `NEW-REQ-01`, a custody-funded subcontractor payment shares one canonical transaction ID between the subcontractor sub-ledger and the custody settlement so it is never summed twice.
- Billings, MRNs, and retention deductions do not add separate budget line exposure beyond `Exposure_C`.

#### 4.9.2 Separation of Project Budget Overrun vs. Contract Ceiling Overrun (`OD-06D-3` — OWNER-APPROVED) & Custody Overrun Check (`OD-07B` — OWNER-APPROVED)

1. **Strict Separation of Overrun Types (`OD-06D-3 / BD-19, BD-20` — OWNER-APPROVED):**
   - **Project Budget-Line Overrun (`X_after > E(L)`):** Halts new financial approval until the Manager records a reasoned exception within Manager authority (`OVER_BUDGET_APPROVED`). **A project budget exception never raises the value or ceiling of a contract.**
   - **Contract Ceiling Overrun (obligations exceeding `Eff_C`):** Halts new financial approval until an **approved Variation Order (`VO`) or formal contract addendum** raises `Eff_C`. A budget exception is never a substitute for amending the contract.
2. **Two-Stage Custody Budget Overrun Workflow (`OD-07B / BD-20`, Option `7B-1` — OWNER-APPROVED):**
   - **At Manager Custody Approval (`approveCustody`):** The system checks available budget on the line. If an overrun exists, the Manager must record the mandatory reason, the overrun amount, and the **approved overrun cap** (`authorizedOverrunCap`).
   - **At Accountant Custody Disbursement (`issueCustody`):** The Accountant re-checks available budget under lock at the moment of disbursement:
     - If the actual overrun remains within the Manager's approved cap (`actualOverrun ≤ authorizedOverrunCap`), disbursement is permitted.
     - If the overrun has grown beyond the approved cap (because other approvals consumed budget in the meantime), disbursement is **blocked** (`OVER_BUDGET_REQUIRES_MANAGER_EXCEPTION`) until the Manager approves an additional overrun cap via an independent action on the approved custody (e.g. `authorizeCustodyOverrun`), which records the updated cap and mandatory reason in an append-only authorization/audit record.
   - **Role Constraint:** The Accountant never has authority to approve a budget overrun.

#### 4.9.3 Budget Transfer & Contingency (`BD-15`)

- Same project only; inter-project transfers are forbidden (`AGENTS.md`).
- **Availability rule:** `0 < amount ≤ Projected(L_source)` (`E − X − P`, evaluated with lineage-carried exposure per `OD-02A`) under the source line lock.
- Both lines belong to the same approved budget (`source ≠ target`). Statuses: `REQUESTED → APPROVED → EXECUTED`, with `REJECTED`, `CANCELLED` and `REVERSED`. Manager self-initiation is flagged `SELF_AUTHORIZED` with a mandatory reason. Execution locks both lines in id order.
- **Contingency:** One dedicated `CONTINGENCY` line holds the reserve; direct spend on it is `0.00` (cannot be targeted by expenses, commitments, custodies, or payroll) and it is consumed only via an approved `BudgetTransfer`.

#### 4.9.4 Budget Revisions and Revision Lineage (`OD-02A`, `OD-02B`, `OD-02C` — OWNER-APPROVED; `SPLIT` Sub-Rule `OPEN`)

1. **Exposure Continuity Across Revisions (`OD-02A` — OWNER-APPROVED WITH OPEN SUB-RULE):**
   - Version 1 is the immutable baseline; approving a new revision marks the prior version `SUPERSEDED`.
   - Historical financial transactions, commitments, and custodies remain strictly bound to their original `budgetLineId` (never retroactively relinked).
   - **Lineage-Group Exposure Carry-Forward (`OD-02A`):** Active and pending financial exposure from prior revisions carries forward across the budget line's **`lineage group`** so that available capacity on a revised line never restarts at zero while commitments or exposures exist on ancestor lines. Effective exposure is calculated across the connected chain of related budget lines.
2. **Strict Post-Approval Lineage Immutability (`OD-02B` — OWNER-APPROVED):**
   - `BudgetLineLineage` records are editable only while the new budget revision is in `DRAFT`.
   - Once the budget revision is `APPROVED`, **`BudgetLineLineage` records are strictly immutable and cannot be modified**. Any subsequent structural change must go through a new budget revision, never through historical edits or post-approval lineage amendment records.
3. **Budget Revision Approval Gate (`OD-02C` — OWNER-APPROVED WITH OPEN SUB-RULE):**
   - A budget revision cannot be approved until **every old budget line** from the immediately preceding approved revision receives an explicit classification/fate (`CONTINUED`, `SPLIT`, `MERGED`, or `REMOVED`), while new lines may be added as `ADDED` (`BUDGET_LINEAGE_INCOMPLETE` blocks approval).
   - **Protection of Encumbered Lines (`OD-02C`):** Budget lines carrying active exposure or active commitments **cannot be `REMOVED`** without explicit approved handling. Superseded lines are closed to new budget-consuming records.
   - **Open Sub-Rule for `SPLIT` (`OD-02A / OD-02C` — `OPEN`):** **The exact rule for allocating prior exposure when an encumbered old budget line is `SPLIT` into multiple new lines—either via explicit `allocationSharePercent` percentages summing to `100%`, or by restricting `SPLIT` strictly to unencumbered (`dormant`) lines—has not yet been selected by the Owner and remains `OPEN`.**

### CR-10 — Project Liquidity, Temporary Company Funding, Cash Coverage, and Contractual Margin (`OD-05A`, `OD-05B`, `OD-05C / BD-21` — ALL OWNER-APPROVED)

#### 4.10.1 Operational Liquidity Sources & Temporary Company Funding (`OD-05C / BD-21` — OWNER-APPROVED)

The approved operational liquidity model for a project consists strictly of **two inflow paths**:

1. **Owner Billing Collections (`ActiveOwnerPayments`):**
   - Every amount collected from the property/facility Owner links to an `OwnerBilling` record, capturing collection date, amount (`Decimal(15,2)`), collection method, and supporting proof document.
   - Supports **partial collections** and tracks the remaining uncollected balance per `OwnerBilling` via append-only `OwnerPaymentAllocation` records.
2. **Temporary Company-to-Project Liquidity Funding (`ActiveCompanyProjectFunding`):**
   - When the company injects liquidity into a project prior to collecting an Owner billing, the funding is recorded as a **temporary internal repayable transfer**, capturing project, amount, date, funding source, reason, Manager approval, transfer reference, and expected Owner billing (if applicable).
   - **Not Revenue or Profit:** Company funding is **never** classified as revenue, profit, or an Owner billing collection.
   - **No Permanent Equity Category:** No permanent capital-contribution (`PERMANENT_EQUITY`) category is created in this operational model (`OD-05C`).
3. **Repayment of Company Funding (`ActiveCompanyProjectFundingRepayments` — Non-Automatic, Manager-Approved):**
   - Returning temporary funding to company treasury is a **separate, explicitly approved transaction** (partial or full, linked to the original funding record).
   - **Never Automatic:** The system **must never automatically repay** company funding merely because an Owner billing is collected. The Manager reviews project liquidity needs, near-term obligations, and available cash coverage before approving any repayment amount.
   - **Bounds:** Cumulative repayments linked to a funding record cannot exceed its outstanding balance, and cannot exceed the project's available liquidity per system records.
4. **Company-Level Aggregation & Margin Exclusion (`OD-05C`):**
   - Company-to-project funding appears as an inflow at the **project level** for project cash-coverage tracking, but **must be eliminated/excluded as an internal transfer when aggregating cash flows at the company level** so it is never counted as a new external cash inflow.
   - Neither company funding nor its repayment enters `ProjectContractualMargin`.
5. **Technical/Schema Naming Alignment Note (`OD-05C`):**
   - Existing draft/schema names (`CapitalInjection` / `CapitalInjectionRepayment`) must be reconciled with the approved temporary internal company-to-project funding semantics (`ActiveCompanyProjectFunding` / `ActiveCompanyProjectFundingRepayments`) prior to code implementation; no Prisma schema or database rename is performed in this documentation task.

#### 4.10.2 Project-Level Inflows & Net Cash Coverage Position After Approved Payables (`OD-05A / BD-09` — OWNER-APPROVED)

1. **Project Net Inflows (`NetInflows`):**
   `NetInflows = ActiveOwnerPayments + ActiveCompanyProjectFunding - ActiveCompanyProjectFundingRepayments`
2. **Evidenced Custody Cash Out (`EvidencedCustodyCashOut`):**
   `EvidencedCustodyCashOut = SUM(disbursedAmount - cashReturnedAmount)`
   evaluated across all custodies that have reached `ISSUED` or subsequent states (`PARTIALLY_SETTLED`, `SETTLED`, `CLOSED`), excluding custody requests whose cash has not been disbursed.
3. **Approved Direct Payables (`ApprovedDirectPayables`):**
   `ApprovedDirectPayables = ApprovedDirectExpenses(custodyId IS NULL) + ApprovedPayroll + ApprovedSiteLaborSheets(only if CR-04 is authorized) + ApprovedSubcontractorBilling.netAmount`
   - Custody-settled expenses (`custodyId IS NOT NULL`) and custody-paid subcontractor advances are already inside `EvidencedCustodyCashOut` and must **never** be counted a second time inside `ApprovedDirectPayables`.
4. **Recognized Outflow & Net Cash Coverage Position (`OD-05A`):**
   `RecognizedOutflow = EvidencedCustodyCashOut + ApprovedDirectPayables`
   `NetCashCoveragePosition = NetInflows - RecognizedOutflow`
   - **Mandatory Display Name:** The indicator must be titled **Net Cash Coverage Position After Approved Payables** / **صافي تغطية السيولة بعد المستحقات المعتمدة**.
   - **Non-Negotiable Protection:** This metric is an oversight coverage indicator and **must never be labeled or represented as actual bank cash or a reconciled bank balance** (bank reconciliation is permanently out of scope per `AGENTS.md` §3–§4).

#### 4.10.3 Project Contractual Margin (`OD-05B / BD-10` — OWNER-APPROVED)

- **Recognized Project Cost (`RecognizedProjectCost`):**
  `RecognizedProjectCost = ApprovedDirectExpenses + ApprovedCustodySettledExpenses + ApprovedPayroll + ApprovedSiteLaborSheets(only if CR-04 is later authorized) + SUM(ApprovedSubcontractorBilling.grossAmount - ActivePenaltyDeductions)`
- **Project Contractual Margin (`ProjectContractualMargin`):**
  `ProjectContractualMargin = ApprovedOwnerBilling.netAmount - RecognizedProjectCost`
- **Governing Rules (`OD-05B`):**
  - Owner billing is recognized upon Manager `APPROVED` status.
  - Company funding and its repayments are excluded from `RecognizedProjectCost` and `ProjectContractualMargin`.
  - **Subcontractor Cost Basis:** Retention holdbacks and advance recoveries do **not** reduce the cost of completed subcontractor work; therefore `SubcontractorBilling.netAmount` must **never** be used as project cost—subcontractor cost is strictly `grossAmount - ActivePenaltyDeductions`. Unspent custody cash and unrecovered advances are not project cost.

#### 4.10.4 Dashboard Metrics Summary

| Metric | Approved Formula / Definition |
|---|---|
| **Certified Billing Receivable** | `Σ ApprovedOwnerBilling.netAmount − Σ ActiveOwnerPaymentAllocations` |
| **Collected from Owner** | `Σ ActiveOwnerPayments` |
| **Net Cash Coverage Position After Approved Payables (`صافي تغطية السيولة بعد المستحقات المعتمدة`)** | `NetInflows − RecognizedOutflow` (`OD-05A`; never labeled as reconciled bank balance) |
| **Recognized Outflow** | `EvidencedCustodyCashOut + ApprovedDirectPayables` (`OD-05A`) |
| **Recognized Project Cost** | `ApprovedDirectExpenses + ApprovedCustodySettledExpenses + ApprovedPayroll + ApprovedSiteLaborSheets(if CR-04 authorized) + SUM(ApprovedSubcontractorBilling.grossAmount − ActivePenaltyDeductions)` (`OD-05B`) |
| **Project Contractual Margin** | `ApprovedOwnerBilling.netAmount − RecognizedProjectCost` (`OD-05B`; not accounting profit) |
| **Estimated Contractual Margin** | `Contract Value − Approved Budget Baseline` |

---

## 5. Corrected Logical Model *(Synchronized with 2026-10-31 Owner Decisions)*

*Logical design only. Types: all monetary fields use `Decimal(15,2)` (`OD-07C` item 1), quantity is `Decimal(15,4)`, all times are `Timestamptz`. Every financial entity carries `createdAt`, `updatedAt` and `deletedAt` (the latter only for never-submitted drafts). Audit is mandatory for all of them.*

| Entity | Key fields | Constraints and indexes | Cardinality |
|---|---|---|---|
| `Subcontractor` & `SubcontractorLedgerEntry` (`NEW-REQ-01`) | Master subcontractor identity (company-wide); sub-ledger entry per `(project, commitment)`: `paidAt`, `amount` (`Decimal(15,2)`), `movementType` (ADVANCE, ON_ACCOUNT, BILLING_PAYMENT), `cashSource`, `paymentMethod`, `reference`, `receiptAttachmentId`, `paidById`, `recordedById`, `approvedById`, `custodyId` (nullable), `canonicalTransactionId` | Single master identity per subcontractor; isolated sub-ledger per `(projectId, commitmentId)`; UNIQUE `canonicalTransactionId` shared with custody settlement when paid from Engineer custody (`NEW-REQ-01`) | 1 subcontractor → N contracts → N sub-ledger entries |
| `SubcontractorNomination` | project, budgetLine (immutable from SUBMITTED), subcontractor, scope, `estimatedAmount` (server Σ; BOQ vs override derivation `OPEN`), **`retentionApplicable`, `retentionRatePercent`, `retentionCapMode` (`NO_CAP`, `CAP_AMOUNT`, or dynamic % on `Eff_C`), `retentionCapAmount`**, status, creator/submitter/approver/rejecter, `resultingCommitmentId` | UNIQUE `resultingCommitmentId`; partial UNIQUE `(project, normalized subcontractor, budgetLine)` where status = SUBMITTED; retention terms required before SUBMITTED (`OD-01A..C`); index `(projectId,status)` | 1→N items; 0..1→1 commitment |
| `SubcontractorNominationItem` | itemNo, description, unit, quantity, unitRate, lineAmount | UNIQUE `(nominationId,itemNo)`; qty > 0, rate ≥ 0 | |
| `Commitment` (extended) | `nominationId`, **retention terms copied from nomination and fixed at approval (`OD-01B`)** | UNIQUE `nominationId` (nullable); multiple independent commitments allowed per budget line (`OD-06A-5`); retention terms immutable after approval except by formal amendment (`OD-01B`) | 1→N items |
| `CommitmentItem` | `sourceType`, source links, itemNo, description, unit, `contractQuantity`, `contractRate`, `lineAmount` | UNIQUE `(commitmentId,itemNo)`; UNIQUE source links; CHECK source consistency; all immutable after approval | |
| `SubcontractorBilling` & `BillingAuditSnapshot` (`OD-03`) | commitment, `currentAuditSnapshotId`, `currentAuditCycleNo`, status; append-only `BillingAuditSnapshot`: `auditCycleNo`, gross, totalDeductions, net, **retention snapshot (`rateApplied`, `scheduledRetentionThisBill`, `capLimitedRetention`, `adjustedRetention`, `isRetentionAdjusted`, `retentionAdjustmentReason`, `previouslyRetainedSnapshot`)**, `auditedById`, `auditedAt` | `net ≥ 0` (`OD-06A-3`); `adjusted ≤ cap-limited ≤ scheduled`; reason required when adjusted; `BillingAuditSnapshot` is append-only (`@@unique([billingId, auditCycleNo])`) and frozen at `APPROVED` (`OD-03`) | 1→N lines, 1→N snapshots, 1→N deductions |
| `SubcontractorBillingLine` | `commitmentItemId`, `currentQuantity`, `unitRate` (server), `lineAmount`, informational `cumulativeBeforeQuantity` | UNIQUE `(billingId,commitmentItemId)`; qty > 0 | |
| `BillingDeduction` (`OD-03`, `OD-06A-3`) | `auditSnapshotId`, type (`ADVANCE_RECOVERY`, `RETENTION`, `PENALTY`, `OTHER`), `amount > 0`, reason, `advanceId` (nullable), status (`ACTIVE`, `SUPERSEDED_BY_REAUDIT`, `VOIDED`), unapplied carry-forward tracking (`OD-06A-3`) | Append-only per audit snapshot (`OD-03`); prior cycle deductions marked `SUPERSEDED_BY_REAUDIT` and never deleted; no row created for `0.00` retention (`OD-01B`) | |
| `CustodySubcontractorAdvance` & `AdvanceCashReturn` (`OD-06B-1`, `OD-06B-3`) | custody, commitment, subcontractor, amount, paidAt, receipt attachment (mandatory), status (`RECORDED`, `VERIFIED`, `REJECTED`, `PARTIALLY_SETTLED`, `FULLY_RECOVERED`), verifiedBy; cash return: `amount`, `receivedAt`, `receivedById`, `destinationType` (`OPEN_CUSTODY` or `COMPANY_TREASURY`), `targetCustodyId`, `receiptAttachmentId` | `0 < amount ≤ Eff_C − ApprovedBills − OpenAdvances` (`OD-06B-1`); cash return `≤ remainingBalance` (`OD-06B-3`) | N per custody / commitment |
| `AdvanceRecoveryEntry` | advance, deduction, `auditSnapshotId`, amount, state (`RESERVED`, `CONFIRMED`, `RELEASED`), `priorEntryId`, createdAt | Strictly append-only; UNIQUE per deduction and state | |
| `Custody` & `CustodyOverrunAuthorization` (`OD-07A`, `OD-07B`) | `disbursedAmount`, `commitmentId` (nullable for dedicated subcontractor custody `7A-1` vs general `SITE_OPERATIONS` custody `7A-2`); append-only `CustodyOverrunAuthorization`: `custodyId`, `sequenceNo`, `authorizedOverrunCap`, `reason`, `authorizedById` (`7B-1`) | `0 < disbursed ≤ amount`; two-stage overrun check at Manager approval and Accountant disbursement (`OD-07B`) | |
| `SiteLaborSheet` / `Line` (**DEFERRED / OUT OF SCOPE**) | Deferred pending separate written scope override (`CR-04`); worker name normalization applies to in-scope `PayrollEntry` data only (`OD-07C`) | **OUT OF SCOPE / DEFERRED** | |
| `MaterialReceivingNote` / `MRNItem` | commitment, deliveryNoteRef, supplier, status; item: commitmentItemId, delivered, accepted, rejected | `delivered = accepted + rejected`; UNIQUE `(mrnId,commitmentItemId)` | |
| `Expense` (extended, `OD-04 / BD-13`) | `commitmentId` (nullable for custody-funded urgent material purchases under `OD-04`), `custodyId`, material lines, urgent material fields (description, purpose, invoice/receipt attachment, material photo attachment), over-budget snapshot | Custody-funded urgent small material purchases exempt from MRN with no fixed SAR cap (bounded by remaining custody cash, `OD-04`); standard PO expenses require `CommitmentItem` + approved `MRN` | |
| `Equipment` / `EquipmentContract` / `EquipmentTimesheet` (**DEFERRED / OUT OF SCOPE**) | Deferred pending separate written scope override (`CR-06`) | **OUT OF SCOPE / DEFERRED** | |
| `BudgetTransfer` | project, source/target line, amount, reason, requester, approver, status, `selfAuthorized` flag | source ≠ target; same project; amount > 0 | |
| `BudgetLineLineage` (`OD-02A..C`) | `previousLineId` (nullable), `newLineId` (nullable), `relationType` (`CONTINUED`, `SPLIT`, `MERGED`, `REMOVED`, `ADDED`), `lineageGroupId`, revision budget ids | Carries active/pending exposure across revisions via `lineageGroupId` (`OD-02A`; `SPLIT` allocation sub-rule `OPEN`); strictly immutable after revision approval (`OD-02B`); complete fate mapping required at revision approval (`OD-02C`) | N:M between lines of adjacent revisions |
| `OwnerBilling` | project, number, amount (`netAmount`), milestone/report reference links (optional, `OD-06D-1`), status | UNIQUE `(project,number)`; independent of milestone approval (`OD-06D-1`) | |
| `OwnerPayment` / `OwnerPaymentAllocation` | payment, amount, collection method, proof attachment, bank ref; allocation: payment, billing, amount, state | UNIQUE reference per project; supports partial collections (`OD-05C`); append-only allocations | |
| `CapitalInjection` / `Repayment` *(Tech alignment: Temporary Company-to-Project Funding, `OD-05C`)* | project, amount, date, source, reason, Manager approval, transfer ref, expected `OwnerBilling` (optional); repayment: amount, date, Manager approval, transfer ref | Temporary internal company-to-project funding only (no `PERMANENT_EQUITY`, `OD-05C`); repayment requires separate Manager approval (never automatic on Owner collection); schema naming alignment noted prior to coding | |
| `FinancialCorrectionEntry` (`OD-06E-1`) | `originalRecordType`, `originalRecordId`, `correctionType` (`PARTIAL_ADJUSTMENT`, `FULL_REVERSAL`, `OVERPAYMENT_RECEIVABLE`), `amountDelta`, `reason`, `approvedById`, affected custody/contract links | Append-only non-destructive correction record; prevents circular/duplicate corrections (`OD-06E-1`) | |
| `Attachment` | owner type and id, project, category, file name, storage key, MIME, size, checksum, uploader, supersedes link, void fields | index `(ownerType,ownerId)`; size ≤ 10 MB; Wave 0 implemented at `7615e91` (production cloud storage provider `OPEN`) | |
| `ProgressReportMilestone` | report, milestone | PK `(report,milestone)` | N:M |
| `VariationOrderLine` (extended, `OD-06C-4`, `OD-07C`) | `lineType` (`QUANTITY_ADJUSTMENT`, `ADDITIONAL_ITEM`), `commitmentItemId`, monetary fields `Decimal(15,2)` | Rate-equality validation; negative VO releases unused capacity only (`OD-06C-4`) | |

### 5.1 Enumeration of Individual Monetary Fields Covered by AUD-09 Normalization (`OD-07C` Scope)

Under **`OD-07C` item 1**, all monetary values across in-scope entities are standardized to exact `Decimal(15,2)` arithmetic (never `Float`, `Double`, or raw JavaScript `number`). The following **40 individual `model.field` properties** constitute the exhaustive list of monetary fields:

1. `BudgetLine.allocatedAmount`
2. `BudgetTransfer.amount`
3. `SubcontractorNomination.estimatedAmount`
4. `SubcontractorNominationItem.unitRate`
5. `SubcontractorNominationItem.lineAmount`
6. `Commitment.amount`
7. `CommitmentItem.contractRate`
8. `CommitmentItem.lineAmount`
9. `VariationOrder.amount`
10. `VariationOrderLine.unitPrice`
11. `VariationOrderLine.lineAmount`
12. `SubcontractorBilling.grossAmount`
13. `SubcontractorBilling.totalDeductions`
14. `SubcontractorBilling.netAmount`
15. `SubcontractorBillingLine.unitRate`
16. `SubcontractorBillingLine.lineAmount`
17. `BillingAuditSnapshot.grossAmount`
18. `BillingAuditSnapshot.totalDeductions`
19. `BillingAuditSnapshot.netAmount`
20. `BillingAuditSnapshot.scheduledRetentionThisBill`
21. `BillingAuditSnapshot.capLimitedRetention`
22. `BillingAuditSnapshot.adjustedRetention`
23. `BillingAuditSnapshot.previouslyRetainedSnapshot`
24. `BillingDeduction.amount`
25. `CustodySubcontractorAdvance.amount`
26. `AdvanceCashReturn.amount`
27. `AdvanceRecoveryEntry.amount`
28. `SubcontractorLedgerEntry.amount` (`SubcontractorCashPayment.amount` under `NEW-REQ-01`)
29. `Custody.amount`
30. `Custody.disbursedAmount`
31. `Custody.cashReturnedAmount`
32. `CustodyOverrunAuthorization.authorizedOverrunCap`
33. `Expense.amount`
34. `PayrollEntry.amount` *(payroll data capture only per `AGENTS.md` §3 and §5.3)*
35. `OwnerBilling.amount` *(certified billing amount; planned CR-10 model, not in Prisma schema yet)*
36. `OwnerPayment.amount`
37. `OwnerPaymentAllocation.amount`
38. `CapitalInjection.amount` *(temporary internal company-to-project liquidity funding)*
39. `Repayment.amount` *(repayment of temporary company funding)*
40. `FinancialCorrectionEntry.amountDelta`

> **Preservation of Quantity Fields Distinction:**
> Quantity fields—including `VariationOrderLine.quantity`, `CommitmentItem.contractQuantity`, `SubcontractorNominationItem.quantity`, `SubcontractorBillingLine.currentQuantity`, `MRNItem.deliveredQuantity`, `MRNItem.acceptedQuantity`, and `MRNItem.rejectedQuantity`—represent physical counts or measurements, are **not monetary currency fields**, and remain `Decimal(15,4)` (or integer counts) rather than monetary `Decimal(15,2)`.

> **Explicit Scope Boundary Confirmation:**
> - **Zero CR-04 Fields Modified or Brought Into Scope:** No `SiteLaborSheet`, `SiteLaborSheetLine`, daily labor attendance, working hour, overtime, or worker hourly-rate fields are modified, created, or brought into scope.
> - **Zero CR-06 Fields Modified or Brought Into Scope:** No `Equipment`, `EquipmentContract`, `EquipmentTimesheet`, equipment operating-hour meter, or machine rental rate fields are modified, created, or brought into scope.
> - **Mandatory Scope Constraint:** `CR-04` and `CR-06` remain strictly **`OUT OF SCOPE / DEFERRED`** under `AGENTS.md` §3 and §4 unless and until a separate written scope override is formally issued by the Owner.

---

## 6. Financial Invariants *(Synchronized with 2026-10-31 Owner Decisions)*

1. **Money (`C-12`, `R-03`, `UC-1`, `OD-07C` — OWNER-APPROVED):** All monetary fields use `Decimal(15,2)`, server-recomputed, with no client-trusted totals. Line amounts and retention use exact `Decimal` arithmetic with `ROUND_HALF_UP` to 2 decimal places.
2. **Subcontractor Master Identity & Cash Ledger (`NEW-REQ-01` — OWNER-APPROVED):** One company-wide subcontractor identity with isolated per-project, per-contract sub-ledgers. Custody-funded subcontractor payments share a single canonical transaction ID between the subcontractor sub-ledger and the custody settlement and are never counted twice.
3. **Commitment (`OD-06A-1`, `OD-06A-5` — OWNER-APPROVED; BOQ vs Override `OPEN`):** Created atomically and idempotently upon Manager approval of nomination. Multiple independent commitments may bind to one budget line. Items are immutable after approval.
4. **Billing quantity & rate:** Cumulative approved quantity ≤ contract quantity + approved VO adjustments per item. Line rate = item contract rate (server-written).
5. **Billing money & VO ceiling (`OD-06C-4` — OWNER-APPROVED):** Cumulative approved gross ≤ `Eff_C` (`Commitment.amount + Σ APPROVED VO impact`). Negative VOs release only unused capacity and never invalidate executed work, approved billings, or paid advances.
6. **Billing Net & Deduction Carry-Forward (`OD-06A-3` — OWNER-APPROVED; Priority Order `OPEN`):** `Net = Gross − AppliedDeductions ≥ 0.00`. Applied deductions cannot exceed Gross; unapplied balances carry forward by deduction type/source without expiring or repeating. *(Priority order among deduction categories when exceeding Gross remains `OPEN`.)*
7. **Retention (`UC-1`, `OD-01A / BD-11`, `OD-01B / UC-2`, `OD-01C / UC-3`, `OD-07C` — ALL OWNER-APPROVED):**
   - `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` using `Decimal` with `ROUND_HALF_UP` to 2 dp, applied before `min(scheduledRetentionThisBill, remainingRetentionCap)` (`UC-1`, `OD-07C`).
   - Rate and cap come strictly from the approved subcontract (`OD-01A`). Zero-retention contracts use `retentionApplicable = false`, `retentionRatePercent = 0.00`, `retentionCapMode = NO_CAP`, with no retention deduction row created (`OD-01B`).
   - Retention terms are immutable after commitment approval except by formal authorized contract amendment (`OD-01B`).
   - Percentage retention cap is dynamic on `Eff_C` after approved VOs; negative VOs never rewrite historical retention or trigger automatic cash refunds—the new cap applies prospectively and pauses new retention if historical retention ≥ new cap (`OD-01C`).
   - Accountant may propose a statement-level downward adjustment (`0.00 ≤ Adjusted ≤ Actual`) with a mandatory reason and Manager approval (`OD-01A`).
   - Each audit cycle creates an append-only `BillingAuditSnapshot`; unchanged-BOQ re-audit returns directly to `SUBMITTED`, marks prior deductions superseded (never deleted), and freezes the snapshot upon final Manager `APPROVED` status (`OD-03`).
8. **Subcontractor Advances & Partial Cash Return (`OD-06B-1`, `OD-06B-3` — OWNER-APPROVED):**
   - Requires approved commitment; `advance.amount ≤ Eff_C − ApprovedBills − OpenAdvances`; recoverable from billings only after payout verification (`VERIFIED`).
   - FIFO applies only to allocate a computed recovery amount across advances with compatible terms; distinct terms keep independent schedules (`OD-06B-1`).
   - Partial cash return (`OD-06B-3`) links to the original advance, credits an open Engineer custody or company treasury, and keeps the advance `PARTIALLY_SETTLED` until its remaining balance reaches `0.00`.
9. **Custody & Overrun Authorization (`OD-07A`, `OD-07B` — OWNER-APPROVED):**
   - Liability = `disbursedAmount`. Remaining = `disbursedAmount − approved expenses − verified advances − cashReturnedAmount ≥ 0.00`. No settlement on a `CLOSED` custody.
   - Two-stage budget overrun check (`OD-07B`): checked at Manager approval (recording reason, overrun, and approved overrun cap) and re-checked at Accountant disbursement (`issueCustody`); if overrun exceeds the approved cap, disbursement is blocked until the Manager approves an additional cap via an independent action (`authorizeCustodyOverrun`).
10. **MRN & Custody Urgent Material Purchases (`OD-04 / BD-13`, `BD-05` — OWNER-APPROVED):**
    - Standard PO material expenses require `APPROVED` MRNs (`delivered = accepted + rejected`, `invoiced ≤ accepted − previously invoiced`).
    - Urgent small site material purchases funded from Engineer custody are exempt from a separate MRN with **no independent fixed SAR cap** (bounded by actual remaining disbursed custody cash) and require clear invoice/receipt, material photo, description, purpose, amount, project, and custody link.
11. **Contractual Exposure & Budget Line Exposure (`OD-02A..C`, `OD-06D-3`, `OD-07A` — OWNER-APPROVED; `SPLIT` `OPEN`, `AL_C` `TECH-CLAR`):**
    - `Exposure_C = max(Eff_C, AL_C)` (and `max(Eff_C, AL_C + OutstandingCustodiesOn(C))` for dedicated commitment-linked custodies under `OD-07A` Path 1). Under `OD-07A` Path 2 (`SITE_OPERATIONS` custody), verifying a subcontractor advance transfers exposure from the general custody to the commitment without double-counting. *(Component/status definition of `AL_C` requires technical normalization before coding per `OD-06D-3`.)*
    - Project budget-line overruns require a reasoned Manager exception (never raising contract value); contract-ceiling overruns require an approved VO/contract amendment (`OD-06D-3`).
    - Active and pending exposure carries forward across budget revisions via `lineage group` (`OD-02A`), `BudgetLineLineage` is strictly immutable post-approval (`OD-02B`), and every old line must have an explicit fate before revision approval (`OD-02C`; `SPLIT` exposure allocation sub-rule remains `OPEN`).
12. **Cash Coverage, Contractual Margin, and Temporary Company Funding (`OD-05A`, `OD-05B`, `OD-05C` — ALL OWNER-APPROVED):**
    - `NetInflows = ActiveOwnerPayments + ActiveCompanyProjectFunding − ActiveCompanyProjectFundingRepayments`.
    - `EvidencedCustodyCashOut = SUM(disbursedAmount − cashReturnedAmount)` for `ISSUED`/settled/closed custodies.
    - `ApprovedDirectPayables = ApprovedDirectExpenses(custodyId IS NULL) + ApprovedPayroll + ApprovedSiteLaborSheets(only if CR-04 is authorized) + ApprovedSubcontractorBilling.netAmount`.
    - `RecognizedOutflow = EvidencedCustodyCashOut + ApprovedDirectPayables`; `NetCashCoveragePosition = NetInflows − RecognizedOutflow` (labeled **Net Cash Coverage Position After Approved Payables** / **صافي تغطية السيولة بعد المستحقات المعتمدة**, never as reconciled bank cash).
    - `RecognizedProjectCost = ApprovedDirectExpenses + ApprovedCustodySettledExpenses + ApprovedPayroll + ApprovedSiteLaborSheets(only if CR-04 is authorized) + SUM(ApprovedSubcontractorBilling.grossAmount − ActivePenaltyDeductions)`.
    - `ProjectContractualMargin = ApprovedOwnerBilling.netAmount − RecognizedProjectCost`.
    - Temporary company-to-project funding is not revenue/profit/Owner collection; repayment requires separate Manager approval (never automatic on Owner collection), is eliminated in company-wide cash aggregation, and is excluded from contractual margin (`OD-05C`).
13. **Non-Destructive Financial Corrections (`OD-06E-1` — OWNER-APPROVED):** Approved financial records are never edited in place or deleted. Recording-amount errors with correct actual cash paid use a linked partial corrective entry; wrong transaction/counterparty uses full reversal + re-recording; actual cash overpayments preserve the true cash paid record and book the excess as a recoverable balance due from the subcontractor.

---

## 7. Transaction & Lock Strategy *(Completed per `OD-07C` item 3 — OWNER-APPROVED)*

**Canonical lock order** (one strictly ascending hierarchy across levels 1–7, with no pre-lock exceptions):

| Level | Rows |
|---|---|
| 1 | `budget_lines` (all rows in the target `lineage group` / family per `OD-02A`), ordered by `id ASC` |
| 2 | `commitments`, ordered by `id ASC` |
| 3 | `commitment_items`, ordered by `id ASC` |
| 4 | `custodies`, ordered by `id ASC` |
| 5 | `custody_subcontractor_advances`, ordered by `id ASC` |
| 6 | The operational header (nomination, billing, expense, payroll, MRN, VO, budget transfer, budget revision) |
| 7 | Children / snapshots / deductions / recovery entries / overrun authorizations / sub-ledger entries, then `audit_logs` |

Audit is written last, in the same transaction. If the audit write fails, everything rolls back (`AGENTS.md` §21).

**Rules:**
1. **No pre-lock exceptions.** Every transaction takes its locks in strictly ascending level. It may skip levels, but it never takes a lower level after a higher one.
2. **Pre-reads.** A plain non-locking read before the transaction is allowed only to find the lock targets (for example, a nomination's `budgetLineId` or lineage group). Everything is revalidated after the locks are held.
3. **Stable lock targets.** Keys used to resolve lock targets (`nomination.budgetLineId`, approved `BudgetLineLineage`) are immutable once active.
4. **Same level, many rows:** always ordered by `id ASC`.
5. **Owner-Cash & Company-Funding Domain Locks (`OD-07C` item 3):** Operations on Owner billings, Owner payments, and temporary company-to-project funding lock `owner_billings (id ASC) → owner_payments (id ASC) → company_project_funding / capital_injections (id ASC) → INSERT allocations / repayments / audit_logs`.

| Workflow | Canonical Locks (in order) | Key Checks & Actions (`OD-07C` item 3) |
|---|---|---|
| Nomination submit | `nomination (6)` | Partial UNIQUE constraint blocks duplicate open nomination; retention terms present (`OD-01A..C`). |
| **Nomination approval (`OD-06A-1`)** | **`budget_lines (1) → nomination (6) → INSERT commitment (2) & items (3) → audit (7)`** | Idempotent: if already `APPROVED` with commitment, return it. Check budget (`OD-06D-3`), create commitment & items atomically, copy retention terms (`OD-01B`). |
| Custody approval (`OD-07B`) | `budget_lines (1) → [commitments (2) if linked 7A-1] → custodies (4) → [overrun auth (7)] → audit (7)` | Check available capacity (`OD-07A`, `OD-07B`); if over budget, Manager records reason, overrun amount, and `authorizedOverrunCap` (`7B-1`). |
| Custody disbursement (`issueCustody`, `OD-07B`) | `budget_lines (1) → [commitments (2) if linked 7A-1] → custodies (4) → audit (7)` | Accountant re-checks overrun against `authorizedOverrunCap`; if within cap, set `disbursedAmount` and `ISSUED`; if overrun > cap, block until Manager runs `authorizeCustodyOverrun` (`7B-1`). |
| Custody overrun cap increase (`authorizeCustodyOverrun`, `OD-07B`) | `budget_lines (1) → [commitments (2)] → custodies (4) → INSERT overrun auth (7) → audit (7)` | Manager-only independent action on approved custody recording additional `authorizedOverrunCap` and mandatory reason (`7B-1`). |
| Subcontractor advance verify / reverse (`OD-06B-1`, `OD-07A`) | `budget_lines (1) → commitments (2) → custodies (4) → advances (5) → sub-ledger (7) → audit (7)` | Check `advance.amount ≤ Eff_C − ApprovedBills − OpenAdvances` and custody balance; transfer exposure from general custody to commitment (`7A-2`); write single-ID linked sub-ledger & custody entry (`NEW-REQ-01`). |
| Subcontractor advance partial cash return (`OD-06B-3`) | `budget_lines (1) → commitments (2) → [custodies (4) if returned to open custody] → advances (5) → sub-ledger (7) → audit (7)` | Verify `returnAmount ≤ remainingAdvanceBalance`; credit open Engineer custody or company treasury; set `PARTIALLY_SETTLED` (or closed if zero). |
| Billing submit | `billing (6)` (advisory read) | Advisory quantity and evidence check. |
| Billing audit (`OD-03`, `OD-06A-3`) | `commitments (2) → advances (5, id ASC) → billing (6) → INSERT snapshot, deductions, RESERVED entries (7)` | Append new `BillingAuditSnapshot`; reserve advance recoveries (`OD-06B-1`); calculate retention (`UC-1`) & dynamic cap (`OD-01C`); enforce `Net ≥ 0` (`OD-06A-3`). |
| Billing return for re-audit (`AUDITED → SUBMITTED`, `OD-03`) | `commitments (2) → advances (5, id ASC) → billing (6) → INSERT RELEASED entries & supersede prior deductions (7)` | Direct return to `SUBMITTED` when BOQ quantities are unchanged; mark prior cycle deductions `SUPERSEDED_BY_REAUDIT` (never delete); append `RELEASED` recovery entries (`OD-03`). |
| Billing approval | `budget_lines (1) → commitments (2) → items (3, id ASC) → advances (5, id ASC) → billing (6) → confirm entries (7)` | Authoritative quantity, ceiling (`Eff_C`), and dynamic retention cap check (`OD-01C`). If cap/advance exhausted concurrently while BOQ is unchanged, return to `SUBMITTED` for re-audit (`OD-03`); otherwise confirm recoveries and freeze snapshot. |
| Billing reject / cancel / reverse | `commitments (2) → advances (5, id ASC) → billing (6) → INSERT RELEASED entries (7)` | Append `RELEASED` recovery entries; voided/reversed retention stops counting in `PreviouslyRetained`. |
| MRN approval / reversal (`BD-05`) | `commitments (2) → items (3, id ASC) → MRN (6) → audit (7)` | Cumulative accepted ≤ ordered; reversal blocked if any approved expense consumed quantity. |
| Expense approval (PO material or urgent custody material, `OD-04`) | `budget_lines (1) → [commitments (2) → items (3, id ASC)] → [custodies (4) if custody-funded] → expense (6) → audit (7)` | Standard PO expense: verify approved MRN quantity gate (`CR-05`). Custody urgent material purchase (`OD-04`): verify remaining custody cash (`disbursedAmount` balance) and mandatory receipt/photo/purpose evidence without MRN. |
| Payroll approval (`OD-07C`) | `budget_lines (1) → payroll_entry (6) → audit (7)` | Normalize worker names / check duplicate rules (`OD-07C` item 2); evaluate budget line soft-limit check (`OD-06D-3`). |
| Variation Order approval (`OD-06C-4`, `OD-07C`) | `budget_lines (1) → commitments (2) → items (3, id ASC) → variation_order (6) → audit (7)` | Verify contractual cover and budget line capacity; for negative VO, ensure reduction only releases unused capacity and respects billed quantities, paid advances, and prospective retention cap (`OD-01C`, `OD-06C-4`). |
| Budget transfer (and reversal, `BD-15`) | `budget_lines (1, both lines & lineage groups in id ASC) → transfer (6) → audit (7)` | Check `amount ≤ Projected(source)` under lock; same project. |
| Budget revision approval (`OD-02A..C`) | `budget_lines (1, all project lines in id ASC) → budget (6) → INSERT immutable lineage (7) → audit (7)` | Verify every old line has explicit fate (`CONTINUED`, `SPLIT`, `MERGED`, `REMOVED`), no encumbered line removed without handling, freeze `BudgetLineLineage` (`OD-02B`). |
| Owner payment collection, allocation & reversal (`OD-05C`) | `owner_billings (id ASC) → owner_payments (id ASC) → INSERT allocations / compensating entries → audit` | Verify allocation bounds (`≤ payment` and `≤ billing`); atomic compensating allocations on payment reversal. |
| Temporary company project funding & repayment (`OD-05C`) | `company_project_funding / capital_injections (id ASC) → INSERT repayment → audit` | Separate Manager-approved repayment (never automatic on Owner collection); verify `repayment ≤ outstandingFunding` and `≤ availableProjectLiquidity`. |
| Non-destructive financial correction (`OD-06E-1`) | Target domain locks (levels 1–6 as applicable) `→ INSERT corrective/reversal/receivable entry (7) → audit (7)` | Preserve original record untouched; link partial adjustment, full reversal + re-entry, or overpayment receivable (`OD-06E-1`). |

The retention checks reuse the commitment lock that billing audit and approval already take. No lock was added and the order is unchanged.

Read consistency uses `READ COMMITTED` plus these row locks. Stored cumulative values are informational only. If one differs from the ledger, the ledger wins, a `LEDGER_MISMATCH` audit event is written, and the stored value is corrected.

---

## 8. SOD Matrix *(Synchronized with 2026-10-31 Owner Decisions)*

E = Engineer, P = Purchasing, A = Accountant, M = Manager. A dash means not permitted.

| Record | Create | Submit | Audit | Approve | Reject | Modify | Cancel | Reverse / Correct |
|---|---|---|---|---|---|---|---|---|
| Nomination (`OD-06A-1`) | E | E | – | M (≠ creator; auto-creates commitment) | M | E (draft) | E (draft), M | – |
| Billing (`OD-03`, `OD-01A`) | E | E | A (new snapshot) | M (freezes snapshot) | A (at audit), M (returns to `SUBMITTED` if BOQ unchanged, or `REJECTED`) | E (draft), A (deductions, retention reduction during audit) | E, M | M (`OD-06E-1`) |
| Custody advance (`OD-06B-1`, `OD-07A`) | E (custodian) | E | A verifies (`VERIFIED`) | – | A | E (draft) | E (draft) | M (`OD-06E-1`) |
| Advance partial cash return (`OD-06B-3`) | A, E | – | A | M (if treasury/custody adjustment requires) | – | – | – | M (`OD-06E-1`) |
| Labor sheet (`CR-04`) | **OUT OF SCOPE / DEFERRED** (Requires separate written scope override) | – | – | – | – | – | – | – |
| MRN (`BD-05`) | E | E | – | **M (≠ creator)** | M | E (draft) | E, M | M |
| Equipment registry / timesheet (`CR-06`) | **OUT OF SCOPE / DEFERRED** (Requires separate written scope override) | – | – | – | – | – | – | – |
| Expense (PO or custody urgent material, `OD-04`) | E, A | E, A | A (custody settlement review) | M (≠ submitter) | M | submitter (draft) | submitter, M | M (`OD-06E-1`) |
| Variation Order (`OD-06C-4`) | E | E | – | M (≠ creator) | M | E (draft) | E, M | M |
| Budget transfer (`BD-15`) | A, M | A, M | – | M | M | – | requester, M | M |
| Over-budget / Custody overrun cap (`OD-06D-3`, `OD-07B`) | – | – | A checks at disbursement (`issueCustody`) | **M only** (at approval or via `authorizeCustodyOverrun`) | – | – | – | – |
| Milestone completion (`OD-06D-1`, `BD-17`) | – | – | – | M (needs approved evidence; independent of Owner billing) | – | – | – | M |
| Owner billing (`OD-05B`, `OD-06D-1`) | A | A | – | M | M | A (draft) | A (draft), M | M (`OD-06E-1`) |
| Owner payment (`OD-05C`) | A | – | – | – | – | A (before allocation) | – | M (`OD-06E-1`) |
| Temporary company project funding (`OD-05C`) | M | – | – | M | – | – | – | M (`OD-06E-1`) |
| Company funding repayment (`OD-05C`) | A, M | A | – | **M (mandatory; never automatic)** | M | – | – | M (`OD-06E-1`) |
| Financial correction entry (`OD-06E-1`) | A, M | A | – | **M only** | M | – | – | M |
| Attachment upload | all, on their own records | | | | | uploader (draft only) | | – |

**Standing rules:**
- Creator and submitter can never be the final approver of the same record.
- Where the Manager is the only top authority and self-authorizes (transfers, reversals, corrections), the action is flagged and a reason is mandatory.
- Purchasing has no approval authority and no payroll access.
- The Accountant never gives final approval and **cannot approve a budget overrun** (`OD-07B`).

---

## 9. Attachment Architecture and Lifecycle Rules

### Attachment architecture

- An `Attachment` is **evidence only** and never a financial source.
- It belongs to one business record (owner type and id) and carries the project for access control.
- Storage goes through a provider abstraction (`upload`, `get link`, `remove`). **Wave 0 attachment infrastructure is implemented at commit `7615e91`, but the production cloud object-storage provider has not yet been selected (`OPEN`)**; production cloud storage must not be marked enabled until a provider is selected and configured.
- MIME types allowed: JPEG, PNG, WebP, PDF. The server verifies file content (magic bytes), not the client's header. Maximum file size: 10 MB.
- Storage keys are server-generated with no user-controlled path parts.
- Access: the user must be authorized for the parent record (object-level), never just authenticated.
- Audit events: `ATTACHMENT_UPLOADED`, `ATTACHMENT_VOIDED`, `ATTACHMENT_REPLACED`.

### Attachment lifecycle

The state of an attachment is **derived from the status of its parent record**. It is not stored separately.

| Parent status | Attachment behavior |
|---|---|
| `DRAFT` | Uploader may upload and void. Replacement creates a new row linked to the old one. |
| `SUBMITTED`, `AUDITED` | **LOCKED.** No void, no replacement (preserved across `AUDITED → SUBMITTED` re-audit under `OD-03`). The Accountant may add audit evidence. |
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
| Subcontractor cash payment / advance (`NEW-REQ-01`, `OD-06B-1`) | Signed receipt / acknowledgment attachment |
| Advance partial cash return (`OD-06B-3`) | Receipt / voucher attachment |
| Custody-funded urgent material purchase (`OD-04 / BD-13`) | Clear tax invoice or field receipt **plus** material photo / field proof |
| MRN | Signed delivery note |
| Expense (standard submissions) | At least one photo or document (`C-11`) |
| Progress report | None to submit. At least one photo is needed for the milestone gate (`OD-06D-1`, `BD-17`). |
| VO | Optional. No source requires it. |
| Labor sheet (`CR-04`) / Equipment timesheet (`CR-06`) | **OUT OF SCOPE / DEFERRED** until separate written scope override |

---

## 10. Lifecycle & Non-Destructive Financial Correction Rules (`OD-03`, `OD-06E-1` — OWNER-APPROVED)

| Entity | States | Rules |
|---|---|---|
| Nomination (`OD-06A-1`) | `DRAFT → SUBMITTED → APPROVED / REJECTED`; `CANCELLED` from `DRAFT` | `APPROVED` is terminal and atomically creates the `Commitment`. A rejected nomination is not reopened. |
| Commitment | existing (`DRAFT, SUBMITTED, APPROVED, REJECTED`) | Created `APPROVED` by nomination. Retention terms immutable after approval except by formal amendment (`OD-01B`). Adjusted by approved VOs (`OD-06C-4`). |
| Billing (`OD-03`) | `DRAFT → SUBMITTED → AUDITED → APPROVED`; **`AUDITED → SUBMITTED` (when BOQ unchanged)**; `REJECTED → DRAFT` (when BOQ changes); `CANCELLED`; `REVERSED` | Unchanged-BOQ re-audit returns directly to `SUBMITTED` (`OD-03`); each audit cycle writes an append-only `BillingAuditSnapshot`; final `APPROVED` freezes the snapshot. |
| Billing deduction (`OD-03`, `OD-06A-3`) | `ACTIVE / SUPERSEDED_BY_REAUDIT / VOIDED` | Scoped to `BillingAuditSnapshot`. Marked `SUPERSEDED_BY_REAUDIT` on re-audit (never deleted); `VOIDED` on reject/cancel/reverse. Unapplied balances carry forward (`OD-06A-3`). |
| Advance (`OD-06B-1`, `OD-06B-3`) | `RECORDED → VERIFIED / REJECTED`; settlement derived: `UNRECOVERED → PARTIALLY_SETTLED → FULLY_RECOVERED / CLOSED` | Recoverable from billings only when `VERIFIED` (`OD-06B-1`). Partial cash return keeps status `PARTIALLY_SETTLED` until balance is `0.00` (`OD-06B-3`). |
| Custody (`OD-07A`, `OD-07B`) | existing 9 states | Adds `disbursedAmount` at `ISSUED`; supports dedicated commitment custody (`7A-1`) and general `SITE_OPERATIONS` custody (`7A-2`); overrun cap checked at approval and disbursement (`7B-1`). |
| MRN | `DRAFT → SUBMITTED → APPROVED / REJECTED`; `REJECTED → DRAFT`; `CANCELLED`; `REVERSED` | Reversal allowed only if no approved expense consumed its quantity. |
| Budget transfer | `REQUESTED → APPROVED → EXECUTED`; `REJECTED`; `CANCELLED`; `REVERSED` | |
| Budget revision (`OD-02A..C`) | existing Budget statuses (`DRAFT, SUBMITTED, APPROVED, REJECTED, SUPERSEDED`) | Requires explicit fate for every old line (`OD-02C`); `BudgetLineLineage` strictly immutable after approval (`OD-02B`); carries exposure across `lineage group` (`OD-02A`). |
| Owner billing (`OD-05B`, `OD-06D-1`) | `DRAFT → SUBMITTED → APPROVED`; `CANCELLED`; `REVERSED` | Independent of milestone completion (`OD-06D-1`); reversal only with no live allocations. |
| Owner payment (`OD-05C`) | `RECORDED → (allocation derived)`; `REVERSED` | Supports partial collection of `OwnerBilling` (`OD-05C`). |
| Temporary company project funding (`OD-05C`) | `ACTIVE → PARTIALLY_REPAID → REPAID`; `REVERSED` | Temporary internal transfer only; repayment requires separate Manager approval (never automatic on Owner collection). |
| Labor sheet (`CR-04`) / Equipment timesheet (`CR-06`) | **OUT OF SCOPE / DEFERRED** | Requires separate written scope override. |

### Non-Destructive Correction of Approved Financial Transactions (`OD-06E-1 / R-06, R-07` — OWNER-APPROVED)

Every approved financial transaction, its history, and its original supporting documents are permanently preserved (no in-place edit, no deletion):

1. **Partial Corrective Entry (`تصحيح جزئي`):**
   - Used when the actual physical cash payment was right, but the recorded amount contained an entry error.
   - Creates a linked corrective entry referencing the original transaction without mutating the original record.
2. **Full Reversal and Re-Recording (`عكس كامل وإعادة تسجيل`):**
   - Used when the transaction itself or the subcontractor, contract, or counterparty was wrong.
   - Reverses the full effect of the original transaction via a compensating entry and records the new correct transaction.
3. **Actual Cash Overpayment (`دفع فعلي زائد`):**
   - When actual cash paid to a subcontractor/counterparty exceeded the amount due, the historical payment record **must never be rewritten** as if less cash had been paid.
   - The full actual cash paid remains recorded as paid, and the excess difference is recorded as a **recoverable balance due from the subcontractor/counterparty**, never as a mutation of the payment date or payment amount.
4. **Audit & Anti-Duplication Controls:**
   - Every correction records the mandatory reason, actor, timestamp, Manager approval, and explicit links to affected subcontractor sub-ledgers, custodies, and budget lines.
   - Duplicate and circular corrections are blocked.

---

## 11. Slice Impact *(Synchronized 2026-10-31)*

| Slice | Impact | Breaking? | Reopen? | Reason |
|---|---|---|---|---|
| Wave 0 (`7615e91`) | DELIVERED (Local/Dev) | No | No | Universal attachment infrastructure implemented at `7615e91`; production cloud storage provider remains `OPEN`. |
| 3 Budget | REOPEN | No | Yes | Budget vs contract overrun separation (`OD-06D-3`), transfers, revisions with `lineage group` exposure continuity (`OD-02A`), strict lineage immutability (`OD-02B`), fate gate (`OD-02C`, `SPLIT` sub-rule `OPEN`). |
| 4 Expenses | EXTEND (behavioural) | No | No | Standard PO/MRN gate plus `OD-04 / BD-13` custody-funded urgent material purchase exception (no fixed SAR cap; bounded by remaining custody cash). |
| 5 Commitments | EXTEND | No | No | Subcontractor master identity & sub-ledger (`NEW-REQ-01`), `CommitmentItem`, `nominationId`, multiple commitments per line (`OD-06A-5`), retention terms (`OD-01A..C`), `Exposure_C = max(Eff_C, AL_C)` (`OD-06D-3`). |
| 6 Custody | REOPEN | Yes (logic) | Yes | `disbursedAmount`, dual custody paths (`7A-1` & `7A-2`, `OD-07A`), advance ceiling & recovery (`OD-06B-1`), partial cash advance return (`OD-06B-3`), two-stage overrun check & `authorizeCustodyOverrun` (`OD-07B`). |
| 7 Billing | REOPEN (redesign) | **Yes** | Yes | BOQ lines, append-only `BillingAuditSnapshot`, direct return to `SUBMITTED` when BOQ unchanged (`OD-03`), dynamic retention cap on `Eff_C` (`OD-01C`), non-negative net & deduction carry-forward (`OD-06A-3`; priority `OPEN`). |
| 8 Payroll | EXTEND | No | No | Worker name normalization & duplicate prevention for in-scope payroll data (`OD-07C`), budget overrun exception (`OD-06D-3`). (`CR-04` labor sheets remain `OUT OF SCOPE`). |
| 10 Progress Reports & 12 Milestones | EXTEND | No | No | Visual evidence gate (`BD-17`) and independence of field milestones from Owner billing with optional reference linking (`OD-06D-1`). |
| 20 Variation Orders | **EXTEND** | No | No | Line types, item links, unused-only negative VO reduction (`OD-06C-4`), prospective dynamic retention cap interaction (`OD-01C`). |
| 9, 13, 15 (Dashboards, Cash Flow) | EXTEND | No | No | **Net Cash Coverage Position After Approved Payables** (`OD-05A`), **Project Contractual Margin** (`OD-05B`), Owner collections & temporary company-to-project funding (`OD-05C`). |

---

## 12. Dependency Graph *(Synchronized 2026-10-31; `CR-04` & `CR-06` Deferred Out of Scope)*

```
Wave 0 (7615e91)  Attachment infrastructure (Merged; prod cloud storage provider OPEN)
   │
   ├─► Slice 22  CR-01 + NEW-REQ-01  Subcontractor master identity, sub-ledger, Nomination + CommitmentItem (BOQ vs override OPEN)
   │      ├─► Slice 23  CR-03  Custody (7A-1 & 7A-2), subcontractor advances (OD-06B-1), partial cash return (OD-06B-3), overrun cap (OD-07B)
   │      │        │
   │      └────────┴─► Slice 24  CR-02 + CR-07 (Slice 20 ext)  Billing, append-only re-audit (OD-03), dynamic retention (OD-01A..C), recovery (Deduction priority OPEN)
   │
   ├─► Slice 26  CR-05  Purchasing item lines + MRN + expense gate + custody urgent material exception (OD-04 / BD-13)
   │      └─► [Slice 27 / CR-06  Equipment — OUT OF SCOPE / DEFERRED until separate written scope override]
   │
   ├─► [Slice 25 / CR-04  Site Labor Sheet — OUT OF SCOPE / DEFERRED until separate written scope override]
   └─► Slice 28  CR-08  Visual progress & milestone independence from Owner billing (OD-06D-1)

Slice 29  CR-09  Budget governance, lineage exposure continuity (OD-02A..C; SPLIT sub-rule OPEN; AL_C normalization TECH-CLAR)
Slice 30  CR-10  Cash coverage (OD-05A), contractual margin (OD-05B), Owner collections & temporary company funding (OD-05C; model naming TECH-ALIGN)
```

---

## 13. Implementation Waves *(Synchronized 2026-10-31)*

| Wave | Slice | Scope | Status / Prerequisites & Gates | Acceptance Gate |
|---|---|---|---|---|
| 0 | `Wave 0` (`7615e91`) | Attachment entity, storage abstraction, validation, lifecycle | **Implemented in repo (`7615e91`)**; production cloud object-storage provider selection remains **`OPEN`**. | Upload, MIME/magic-byte and 10 MB rejection, lock by parent status, access control |
| 1 | 22 | `CR-01` + `NEW-REQ-01` | Owner-approved (`OD-06A-1`, `OD-06A-5`, `OD-01B`, `NEW-REQ-01`). **Open detail:** BOQ sum vs contract override derivation (`OD-06A`). | Unified subcontractor master identity & sub-ledger; atomic/idempotent commitment creation; multiple commitments per line |
| 1 | 23 | `CR-03` | Owner-approved (`OD-06B-1`, `OD-06B-3`, `OD-07A`, `OD-07B`, `NEW-REQ-01`). | Dual custody paths (`7A-1`, `7A-2`), advance ceiling & verification, partial cash return, single-ID custody/sub-ledger link, two-stage overrun cap |
| 1 | 24 | `CR-02` + `CR-07` (Slice 20 ext) | Owner-approved (`UC-1`, `OD-01A..C`, `OD-03`, `OD-06A-3`, `OD-06C-4`). **Open sub-rule:** Deduction priority order when exceeding gross (`OD-06A-3`). | Dynamic retention cap on `Eff_C`, prospective negative VO handling, direct `AUDITED → SUBMITTED` re-audit with append-only snapshots, non-negative net & carry-forward |
| 2 | 25 | `CR-04` | **OUT OF SCOPE / DEFERRED** (`AGENTS.md` §3–§4). In-scope payroll worker name normalization is covered under `OD-07C`. | Blocked until separate written scope override |
| 2 | 26 | `CR-05` | Owner-approved (`OD-04 / BD-13`, `BD-05`). | Standard PO/MRN quantity gate + custody-funded urgent material purchase exception (no fixed SAR cap; bounded by remaining custody cash + mandatory receipt/photo/purpose) |
| 2 | 27 | `CR-06` | **OUT OF SCOPE / DEFERRED** (`AGENTS.md` §3–§4). | Blocked until separate written scope override |
| 2 | 28 | `CR-08` | Owner-approved (`OD-06D-1`, `BD-17`). | Milestone completion gated by approved visual report; independent of Owner billing with optional reference link |
| 3 | 29 | `CR-09` | Owner-approved (`OD-02A..C`, `OD-06D-3`, `OD-07B`). **Open sub-rule:** `SPLIT` exposure allocation (`OD-02A/02C`). **Tech clarification:** `AL_C` normalization (`OD-06D-3`). | Lineage-group exposure carry-forward, strict lineage immutability, per-line fate gate, budget vs contract overrun separation |
| 3 | 30 | `CR-10` | Owner-approved (`OD-05A`, `OD-05B`, `OD-05C`, `OD-06E-1`). **Tech alignment:** Reconcile `CapitalInjection` naming with temporary company-to-project funding (`OD-05C`). | Net Cash Coverage Position After Approved Payables, Project Contractual Margin, non-automatic Manager-approved company funding repayment, company-level elimination |

---

## 14. Test Strategy (design only) *(Synchronized with 2026-10-31 Owner Decisions)*

- **Unit:**
  - `UC-1` & `OD-07C`: `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` via `Decimal` (`ROUND_HALF_UP` to 2 dp, zero floating-point) before `min(scheduledRetentionThisBill, remainingRetentionCap)`.
  - `OD-01A..C`: Contractual retention rate/cap, zero-retention representation (`retentionApplicable = false`, `retentionRatePercent = 0.00`, `retentionCapMode = NO_CAP`, no deduction row), post-approval term immutability, Accountant downward adjustment with mandatory reason, and dynamic percentage cap on `Eff_C` across positive and negative VOs (prospective pause when `PreviouslyRetained ≥ newCap`, no historical rewrite or auto-refund).
  - `OD-03` & `OD-06A-3`: Direct `AUDITED → SUBMITTED` re-audit when BOQ quantities are unchanged, append-only `BillingAuditSnapshot`, prior deductions marked `SUPERSEDED_BY_REAUDIT`, non-negative net (`Net ≥ 0`), and carry-forward of unapplied deduction balances.
  - `OD-06B-1`, `OD-06B-3`, `OD-07A`, `NEW-REQ-01`: Advance ceiling (`≤ Eff_C − ApprovedBills − OpenAdvances`), `VERIFIED`-only recovery, FIFO limited to compatible terms, partial cash advance return (to open custody or company treasury), dual custody exposure paths (`7A-1` & `7A-2`), and single-ID deduplication between subcontractor sub-ledger and custody settlement.
  - `OD-04 / BD-13`: Custody-funded urgent material purchases allowed without MRN up to actual remaining disbursed custody cash (no fixed SAR cap), rejecting missing invoice/receipt, material photo, description, or purpose; standard PO expenses still blocked without approved MRN.
  - `OD-02A..C`, `OD-06D-3`, `OD-07B`: Lineage-group exposure carry-forward, post-approval lineage immutability, per-line fate gate, separation of project budget overrun vs contract ceiling overrun (`Exposure_C = max(Eff_C, AL_C)`), and two-stage custody overrun cap check (`7B-1`).
  - `OD-05A..C` & `OD-06E-1`: `EvidencedCustodyCashOut`, `ApprovedDirectPayables`, `RecognizedOutflow`, `NetCashCoveragePosition`, `RecognizedProjectCost` (`grossAmount − ActivePenaltyDeductions`), `ProjectContractualMargin`, non-automatic company funding repayment, company-level internal transfer elimination, and non-destructive financial corrections (partial adjustment, full reversal + re-entry, actual cash overpayment receivable).
- **Integration, Concurrency, Authorization & E2E:** Lock-order conformance for all workflows in §7; negative tests for unauthorized roles (e.g., Accountant attempting to approve a custody overrun or auto-repaying company funding without Manager approval).

---

## 15. Acceptance Matrix *(Synchronized 2026-10-31)*

> **Note:** An Owner decision approval records the normative requirement in the specification; it does **not** mean the code is implemented and does **not** authorize coding without an explicit implementation task brief.

| CR | Business Design | Data Model | Authorization | Financial Rules | Tests | Specification Readiness Status (2026-10-31) | Approved Decisions & Open Gates |
|---|---|---|---|---|---|---|---|
| `NEW-REQ-01` | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — READY FOR SLICE DESIGN** | `NEW-REQ-01` (Master subcontractor identity, per-contract sub-ledger, single-ID custody link) |
| CR-01 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — 1 OPEN DETAIL** | Approved: `OD-06A-1`, `OD-06A-5`, `OD-01B`. **OPEN:** Initial commitment value derivation if BOQ sum differs from explicit contract/override value (`OD-06A`). |
| CR-02 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — 1 OPEN SUB-RULE** | Approved: `UC-1`, `OD-01A..C`, `OD-03`, `OD-06A-3`, `OD-07C`. **OPEN:** Priority order of deduction categories when total deductions exceed bill gross amount (`OD-06A-3`). |
| CR-03 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — READY FOR SLICE DESIGN** | Approved: `OD-06B-1`, `OD-06B-3`, `OD-07A` (`7A-1` & `7A-2`), `OD-07B` (`7B-1`), `NEW-REQ-01`. |
| CR-04 | Deferred | Deferred | Deferred | Deferred | Deferred | **OUT OF SCOPE / DEFERRED** | Attendance, timesheets, overtime, and site labor sheets are **out of scope** (`AGENTS.md` §3–§4) until a separate written scope override. (`OD-07C` worker name normalization applies to in-scope data only.) |
| CR-05 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — READY FOR SLICE DESIGN** | Approved: `OD-04 / BD-13` (custody urgent material exception with no independent fixed SAR cap; bounded by remaining custody cash), `BD-05`. |
| CR-06 | Deferred | Deferred | Deferred | Deferred | Deferred | **OUT OF SCOPE / DEFERRED** | Equipment operating-hour / timesheet workflow is **out of scope** (`AGENTS.md` §3–§4) until a separate written scope override. |
| CR-07 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — READY FOR SLICE DESIGN** | Approved: `OD-06C-4` (VO commitment rules, unused-only reduction), `OD-01C` (prospective dynamic retention cap), `OD-07C` (`Decimal(15,2)`). |
| CR-08 | Approved | Specified | Specified | n/a | Specified | **SPEC APPROVED — READY FOR SLICE DESIGN** | Approved: `OD-06D-1` (milestone independence from Owner billing with optional reference link), `BD-17`. |
| CR-09 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — 1 OPEN SUB-RULE & 1 TECH CLARIFICATION** | Approved: `OD-02A..C`, `OD-06D-3`, `OD-07A`, `OD-07B`. **OPEN:** `SPLIT` exposure allocation sub-rule (`OD-02A/02C`). **TECH CLARIFICATION:** Normalize `AL_C` components/statuses (`OD-06D-3`). |
| CR-10 | Approved | Specified | Specified | Approved | Specified | **SPEC APPROVED — 1 TECH ALIGNMENT** | Approved: `OD-05A`, `OD-05B`, `OD-05C`, `OD-06E-1`. **TECH ALIGNMENT:** Reconcile `CapitalInjection` schema/model naming with temporary company-to-project funding semantics (`OD-05C`). |

---

## 16. Business Decisions Register *(Synchronized with `OWNER_DECISION_REGISTER_2026-10-31.md`)*

| Register ID / Addendum ID | Status (2026-10-31) | Approved Normative Rule & Open Details | Target Slice(s) |
|---|---|---|---|
| **`UC-1`** Retention rounding | **OWNER-APPROVED** | `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` using `Decimal` (`ROUND_HALF_UP` to 2 dp) before applying `min(scheduledRetentionThisBill, remainingRetentionCap)`. | Slice 24 |
| **`OD-01A / BD-11`** Contractual retention policy | **OWNER-APPROVED** | Rate & cap from approved subcontract; auto-calculated; Accountant statement-level downward adjustment with mandatory reason within contract bounds; Manager approves bill & adjustment; segregated from advance recovery/penalties; no retroactive mutation. | Slices 22, 24 |
| **`OD-01B / UC-2`** Zero-retention contracts & term immutability | **OWNER-APPROVED** | Zero-retention allowed (`retentionApplicable=false`, `retentionRatePercent=0.00`, `retentionCapMode=NO_CAP`, no deduction row); commitment retention terms immutable after approval except by formal authorized amendment. | Slices 22, 24 |
| **`OD-01C / UC-3`** Retention cap with Variation Orders | **OWNER-APPROVED** | Percentage cap is dynamic on effective contract value (`Eff_C`) after approved VOs. Negative VOs do not rewrite historical retention or auto-refund cash; new cap applies prospectively and pauses new retention while historical retention ≥ new cap. | Slices 22, 24 |
| **`OD-02A`** Exposure continuity across budget revisions | **OWNER-APPROVED WITH OPEN SUB-RULE** | Carry forward prior financial exposure across `lineage group` so new revision lines do not restart capacity at zero; historical transactions remain bound to original lines. **OPEN:** `SPLIT` exposure allocation (`allocationSharePercent` vs unencumbered-only restriction). | Slice 29 |
| **`OD-02B`** Lineage immutability | **OWNER-APPROVED** | `BudgetLineLineage` records are strictly immutable after budget revision approval; later structural changes require a new budget revision. | Slice 29 |
| **`OD-02C`** Budget revision approval gate | **OWNER-APPROVED WITH OPEN SUB-RULE** | Every old budget line must receive an explicit fate (`CONTINUED`, `SPLIT`, `MERGED`, `REMOVED`; plus `ADDED` for new lines); lines with active exposure/commitments cannot be removed without explicit handling. **OPEN:** `SPLIT` sub-rule. | Slice 29 |
| **`OD-03`** Subcontractor billing re-audit | **OWNER-APPROVED** | If only deductions/caps change and BOQ quantities are unchanged, return bill directly to `SUBMITTED` (`AUDITED → SUBMITTED`) for Accountant re-audit; preserve append-only snapshot per audit cycle and mark prior deductions superseded (never deleted); if BOQ changes, Engineer corrects and resubmits; final approval freezes snapshot. | Slice 24 |
| **`OD-04 / BD-13`** Urgent material purchases from custody | **OWNER-APPROVED** | Small urgent site materials funded from Engineer custody are exempt from creating a separate MRN with **no independent fixed SAR cap** (natural limit = actual remaining disbursed custody cash); requires clear receipt/invoice, material photo, description, purpose, amount, project, and custody link. Standard POs follow normal PO/MRN path (`BD-05`). | Slice 26 |
| **`OD-05A / BD-09 [Reg] / BD-10 [Add]`** Cash coverage after approved payables | **OWNER-APPROVED** | `EvidencedCustodyCashOut = issued/closed custody (disbursedAmount - cashReturnedAmount)`; `ApprovedDirectPayables = direct expenses (custodyId IS NULL) + approved payroll + approved labor sheets (if CR-04 enters scope) + approved subcontractor billing netAmount`; `RecognizedOutflow = EvidencedCustodyCashOut + ApprovedDirectPayables`; displayed as **Net Cash Coverage Position After Approved Payables** (`صافي تغطية السيولة بعد المستحقات المعتمدة`), never as reconciled bank cash; no double-counting of custody-settled expenses. | Slice 30 |
| **`OD-05B / BD-10 [Reg] / BD-21 [Add]`** Project contractual margin | **OWNER-APPROVED** | `ProjectContractualMargin = ApprovedOwnerBilling.netAmount - RecognizedProjectCost`, where `RecognizedProjectCost = ApprovedDirectExpenses + ApprovedCustodySettledExpenses + ApprovedPayroll + ApprovedSiteLaborSheets(if CR-04 enters scope) + SUM(ApprovedSubcontractorBilling.grossAmount - ActivePenaltyDeductions)`. Excludes company funding/repayments; retention and advance recovery do not reduce project cost. | Slice 30 |
| **`OD-05C / BD-21 [Reg] / BD-09 [Add]`** Project liquidity sources & company funding | **OWNER-APPROVED (TECH ALIGNMENT NOTED)** | Two paths: (1) Owner billing collections linked to `OwnerBilling` (partial supported); (2) Temporary company-to-project liquidity funding. Company funding is not revenue/profit/Owner collection; repayment is a separate Manager-approved transaction (partial/full), **never automatic** upon Owner billing collection; eliminated at company-level aggregation; excluded from margin; no permanent equity category. *(Reconcile `CapitalInjection` naming before coding.)* | Slice 30 |
| **`OD-06A-1 / BD-03 [Reg]`** Nomination to commitment conversion | **OWNER-APPROVED (1 DETAIL OPEN)** | Manager approval of subcontractor nomination atomically and idempotently creates the `Commitment` and reserves budget line capacity; no commitment before approval; links preserved. **OPEN:** Initial commitment value derivation if BOQ sum differs from explicit contract/override value. | Slice 22 |
| **`OD-06A-3 / BD-12 [Reg]`** Billing deduction cap & carry-forward | **OWNER-APPROVED WITH OPEN SUB-RULE** | Billing net ≥ 0; applied deductions ≤ bill gross work value; unapplied deduction balances carry forward by type/source without expiring or repeating. **OPEN:** Exact priority order of deduction categories when total deductions exceed bill gross amount. | Slice 24 |
| **`OD-06A-5 / R-01 [Reg]`** Multiple commitments per budget line | **OWNER-APPROVED** | Multiple independent subcontractor commitments/contracts allowed on one budget line; isolated per-contract accounts with aggregated exposure check against shared budget line capacity. | Slice 22 |
| **`OD-06B-1 / BD-16, BD-17 [Reg] / BD-18 [Add]`** Subcontractor advance ceiling & recovery | **OWNER-APPROVED** | Requires approved commitment; within `Eff_C - ApprovedBills - OpenAdvances`; recoverable from billings only after payout verification (`VERIFIED`); contract governs recovery terms; Accountant sets recovery within remaining verified balance and post-retention bill capacity; FIFO only across compatible terms; distinct terms keep separate schedules. | Slices 23, 24 |
| **`OD-06B-3 / R-02 [Reg]`** Partial cash return of subcontractor advance | **OWNER-APPROVED** | Partial cash return allowed, linked to original advance, reducing balance (`PARTIALLY_SETTLED` until zero, then closed); destination recorded (open Engineer custody or company treasury) with receipt, date, and receiver; ≤ remaining balance; no double-counting. | Slice 23 |
| **`OD-06C-4 / R-05 [Reg] / BD-12 [Add]`** Variation Orders on subcontractor commitment | **OWNER-APPROVED** | No commitment impact before VO approval; approved VO adjusts the same commitment after budget and contract ceiling checks; negative VO releases unused capacity only and never touches executed work, approved billings, or paid advances; full history preserved. | Slice 24 |
| **`OD-06D-1 / R-04 [Reg] / BD-17 [Add]`** Milestone independence from Owner billing | **OWNER-APPROVED** | Field milestones/completion operate independently of Owner billing with optional reference link; milestone approval does not auto-create an Owner billing or financial approval. | Slice 28 |
| **`OD-06D-3 / BD-19, BD-20 [Reg] / R-02 [Add]`** Contractual exposure & budget control | **OWNER-APPROVED WITH TECH CLARIFICATION** | `Exposure_C = max(Eff_C, AL_C)`. Separates project budget overrun (stops approval until reasoned Manager exception; never raises contract value) from contract ceiling overrun (stops approval until approved VO/addendum). **TECH CLARIFICATION:** Normalize `AL_C` components/statuses before coding. | Slice 29 |
| **`OD-06E-1 / R-06, R-07 [Reg]`** Correction of approved financial transactions | **OWNER-APPROVED** | No in-place edit or delete; partial corrective entry for recording-amount errors with right actual cash paid; full reversal + new entry for wrong transaction/counterparty; actual cash overpayment preserves true cash paid and records excess as recoverable from subcontractor; full audit/account links preserved. | All Financial Slices |
| **`OD-07A / BD-18`** Custody & advance exposure non-duplication | **OWNER-APPROVED** | Both paths approved: (1) Dedicated commitment-linked custody (`7A-1`) inside `max(Eff_C, AL_C + OutstandingCustodiesOn(C))`; (2) General `SITE_OPERATIONS` custody (`7A-2`) transferring exposure to commitment upon advance verification without double-counting, preserving Engineer cash accountability. | Slices 23, 29 |
| **`OD-07B / BD-20`** Custody budget overrun between approval & issue | **OWNER-APPROVED** | Check available budget at Manager approval (recording reason, overrun, and approved overrun cap); Accountant re-checks at disbursement (`issueCustody`); allow if ≤ cap, block if > cap until Manager approves additional cap via independent action (`7B-1`); Accountant cannot approve overruns. | Slices 23, 29 |
| **`OD-07C / AUD-09..AUD-12`** Technical/documentation corrections | **OWNER-APPROVED WITH SCOPE CONSTRAINT** | (1) `Decimal(15,2)` monetary precision; (2) worker name normalization/deduplication for in-scope data; (3) complete canonical lock-order table; (4) synchronize `UC-1` rounding formula text before cap. Does **not** authorize CR-04 or CR-06. | All Slices |
| **`NEW-REQ-01`** Subcontractor master identity & cash payment sub-ledger | **OWNER-APPROVED** | Single company-wide subcontractor identity with isolated per-project, per-contract sub-ledgers; mandatory cash payment fields; single shared transaction ID linking custody-funded subcontractor payments to custody settlement to prevent double-counting. | Slices 22, 23, 24 |
| **`CR-04` (`BD-03`, `BD-19` labor sheets)** | **OUT OF SCOPE / DEFERRED** | Worker attendance, timesheets, overtime, and site labor sheets remain out of scope (`AGENTS.md` §3–§4) until a separate written scope override. | Deferred |
| **`CR-06` (`BD-16` equipment timesheets)** | **OUT OF SCOPE / DEFERRED** | Equipment operating-hour / timesheet workflows remain out of scope (`AGENTS.md` §3–§4) until a separate written scope override. | Deferred |

---

## 17. Preconditions for Implementation Execution *(Synchronized 2026-10-31)*

1. **Resolution of Remaining Open Sub-Rules & Technical Clarifications:**
   - Before implementing `CR-09` budget line splitting, obtain Owner selection on the `OD-02A/02C` `SPLIT` exposure allocation sub-rule (`allocationSharePercent` summing to 100% vs restricting `SPLIT` to unencumbered lines).
   - Before implementing `CR-02` billing deduction auto-truncation when deductions exceed gross, obtain Owner selection on the `OD-06A-3` deduction category priority order.
   - Before implementing `CR-01` nomination approval if a contract override distinct from Σ BOQ lines is desired, resolve the `OD-06A` BOQ sum vs override detail.
   - Before implementing `CR-09` exposure calculations, complete the technical normalization of `AL_C` components/statuses (`OD-06D-3`).
   - Before implementing `CR-10` company-to-project funding, reconcile existing `CapitalInjection` model/field naming with the approved temporary company funding semantics (`OD-05C`).
   - Before enabling production cloud attachment storage, select and configure the production object-storage provider.
2. **Scope Protection (`CR-04` & `CR-06`):** Do not implement CR-04 attendance/timesheets/overtime/labor sheets or CR-06 equipment operating-hour timesheets without a separate written scope override.
3. **Cutover handling (`BD-14`):** Any in-flight `DRAFT` or `SUBMITTED` flat billings from Slice 7 at deployment cutover must be settled or cancelled before switching to BOQ-line billing.
4. **Wave discipline & Engineering Contract:** Execute authorized slices strictly in dependency order (§12, §13) with full adherence to `AGENTS.md v1.2.0` (`Decimal(15,2)` arithmetic, append-only financial records, no hard deletes, transactional audit logs, server-side RBAC + object-level authorization, Arabic/RTL-first UI with logical CSS properties).

---

## 18. Final Consistency Audit & Changelog *(v2.0 — 2026-10-31)*

| Area | Check | Result |
|---|---|---|
| **1. Lock hierarchy (`OD-07C`)** | One ascending hierarchy (levels 1–7) with complete rows for nomination, custody approval/disbursement/overrun, advance verify/return, billing audit/re-audit/approval, MRN, expense, payroll, VO, budget transfer/revision, Owner collections, temporary company funding, and financial corrections. | Consistent & Owner-approved (`OD-07C`) |
| **2. Exposure, custody & advance non-duplication (`OD-07A`, `NEW-REQ-01`)** | Both dedicated commitment-linked custodies (`7A-1`) and general `SITE_OPERATIONS` custodies (`7A-2`) prevent double-counting. Custody-funded subcontractor payments share one canonical transaction ID across the subcontractor sub-ledger and custody settlement (`NEW-REQ-01`). | Consistent & Owner-approved |
| **3. Revision lineage (`OD-02A..C`)** | Exposure carries forward across `lineage group` (`OD-02A`), `BudgetLineLineage` is strictly immutable post-approval (`OD-02B`), and every old line requires an explicit fate (`OD-02C`). `SPLIT` exposure allocation sub-rule is explicitly preserved as `OPEN`. | Consistent; `SPLIT` sub-rule `OPEN` |
| **4. Retention & VO interaction (`UC-1`, `OD-01A..C`, `OD-07C`)** | `scheduledRetentionThisBill = round_half_up(grossAmount * retentionRatePercent / 100, 2)` via `Decimal` before cap (`UC-1`); contractual rate/cap and Accountant statement reduction (`OD-01A`); zero-retention and post-approval term immutability (`OD-01B`); dynamic percentage cap on `Eff_C` with prospective-only handling on negative VOs (`OD-01C`). | Consistent & Owner-approved |
| **5. Billing re-audit & deductions (`OD-03`, `OD-06A-3`)** | Direct return to `SUBMITTED` when BOQ quantities are unchanged, append-only `BillingAuditSnapshot`, superseded prior deductions never deleted (`OD-03`). Non-negative net and carry-forward of unapplied deductions (`OD-06A-3`), with deduction priority order preserved as `OPEN`. | Consistent; priority order `OPEN` |
| **6. Urgent custody material purchases (`OD-04 / BD-13`)** | Urgent small site material purchases funded from Engineer custody are exempt from MRN with no independent fixed SAR cap (bounded by actual remaining disbursed custody cash) and mandatory receipt/photo/purpose evidence. | Consistent & Owner-approved |
| **7. Cash coverage, margin & company funding (`OD-05A..C`)** | Metric titled **Net Cash Coverage Position After Approved Payables** (`صافي تغطية السيولة بعد المستحقات المعتمدة`), never labeled as reconciled bank cash (`OD-05A`). Margin uses `grossAmount − ActivePenaltyDeductions` for subcontractors (`OD-05B`). Company funding repayment requires separate Manager approval (never automatic on Owner collection) and is eliminated at company-level aggregation (`OD-05C`). | Consistent & Owner-approved |
| **8. Non-destructive financial corrections (`OD-06E-1`)** | Partial adjustment, full reversal + re-entry, and actual cash overpayment receivable rules integrated with full audit trail. | Consistent & Owner-approved |
| **9. Scope Exclusions (`CR-04`, `CR-06`)** | CR-04 attendance/timesheets/overtime/labor sheets and CR-06 equipment operating-hour timesheets explicitly marked `OUT OF SCOPE / DEFERRED`. | Strictly enforced |

### Changelog

- **v2.0 (2026-10-31):** Synchronized specification in place with `OWNER_DECISION_REGISTER_2026-10-31.md` and `REQUIREMENTS_AMENDMENT_2026-10-31.md`. Integrated `NEW-REQ-01`, `UC-1`, `OD-01A..C`, `OD-02A..C`, `OD-03`, `OD-04 / BD-13`, `OD-05A..C`, `OD-06A-1/3/5`, `OD-06B-1/3`, `OD-06C-4`, `OD-06D-1/3`, `OD-06E-1`, `OD-07A`, `OD-07B`, and `OD-07C`, while preserving all open sub-rules, technical clarifications, and `CR-04`/`CR-06` scope exclusions.
- **v1.1 (2026-10-29):** Specification closure-gate update recording `UC-1`, `BD-11`, and `UC-2` approvals.

OWNER DECISIONS SYNCHRONIZED (2026-10-31) — DOCUMENTATION-ONLY UPDATE — OPEN SUB-RULES, TECHNICAL CLARIFICATIONS & SCOPE EXCLUSIONS EXPLICITLY GATED
