# Owner Decision Brief — Construction Control CR-01 → CR-10 (Integrated & Validated Edition)

## 0. Status, sources, conventions

- **Status:** Decision preparation only. **No new decisions are approved or locked in this review.**
- **Baseline Approval:** The only item with verified, explicit Owner approval is **`UC-1`** (explicit Owner instruction of 2026-10-11, which approved the `UC-1` `ROUND_HALF_UP` retention calculation rule only and expressly did not approve `BD-11`, `UC-2`, `UC-3`, or any other decision). `UC-1` is preserved unchanged throughout this brief.
- **Unapproved Status of All Other Items:** Every other business decision (`BD-*`, `R-*`, `UC-2`, `UC-3`, `OBD-*`, `OD-*`, `NEW-OD-*`), agent recommendation (`Rec.`), and technical design proposal (`§4`, `COR-*`) remains **unapproved** and requires explicit Owner decision or technical sign-off before implementation. The addendum's own "APPROVED & LOCKED" labels are not evidence of Owner approval (finding `AUD-01`).
- **Implementation is not authorized. Slice 21 has not started.** No application code, Prisma schema, database, migration, or test was modified by this review.
- **Sources.** `A` = [docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md) (945 lines); `R` = [docs/CR_Impact_Architecture_Review.md](file:///d:/Construction%20Control/docs/CR_Impact_Architecture_Review.md); [AGENTS.md](file:///d:/Construction%20Control/AGENTS.md); [prisma/schema.prisma](file:///d:/Construction%20Control/prisma/schema.prisma); [custody state machine](file:///d:/Construction%20Control/lib/custodies/state-machine.ts); [approve-custody.ts](file:///d:/Construction%20Control/lib/custodies/use-cases/approve-custody.ts); [issue-custody.ts](file:///d:/Construction%20Control/lib/custodies/use-cases/issue-custody.ts); [close-custody.ts](file:///d:/Construction%20Control/lib/custodies/use-cases/close-custody.ts); [record-cash-return.ts](file:///d:/Construction%20Control/lib/custodies/use-cases/record-cash-return.ts); [budget calculations](file:///d:/Construction%20Control/lib/budget/calculations.ts); [approve-variation-order.ts](file:///d:/Construction%20Control/lib/variation-orders/use-cases/approve-variation-order.ts).
- **Classification tags:** **OBD** = OWNER BUSINESS DECISION REQUIRED; **DOC** = DOCUMENTATION CORRECTION REQUIRED; **TECH** = TECHNICAL DESIGN CLARIFICATION REQUIRED (any schema, constraint, state-machine, formula or lock-order change; never an editorial fix); **SEM** = SOURCE EVIDENCE MISSING.
- **Status words:** *Previously Owner-approved* (only `UC-1`); *Owner-proposed, pending* (`BD-11`); *Agent recommendation, unapproved*; *Constraint* (repository or AGENTS.md fact).

## 1. Decision-ID register (single authoritative list)

| ID | Verified meaning | Defined at | Status | Handled in |
|---|---|---|---|---|
| `UC-1` | Retention is `round_half_up(Gross × Rate ÷ 100, 2)` using `Decimal`, `ROUND_HALF_UP` to two decimals, before the remaining cap is applied | A:157–160, 186 | **Previously Owner-approved (verified)** | OD-01 |
| `BD-11` | Retention policy: rate and cap come from each subcontract (explicit `0.00` allowed; cap is `CAP_AMOUNT ≥ 0` or `NO_CAP`), fixed at commitment approval, Gross basis, cumulative-cap formula, statement-level Accountant reduction with reason, Manager final approval, release out of v1 | A:141–176, 892 | Owner-proposed, pending; Owner's original wording not fully retrievable (SEM) | OD-01A |
| `UC-2` | Post-approval immutability of commitment retention terms (rate, cap mode, cap amount) | A:154–156, 187 | Pending Owner decision | OD-01B |
| `UC-3` | Retention cap representation and its interaction with approved Variation Orders | A:188 | Pending Owner decision | OD-01C |
| `C-01`…`C-12` | Core requirements; `C-07` = over-budget is a soft limit needing a Manager reason and audit event; `C-12` = AGENTS money/delete/audit contract | A:63–76 | Labeled confirmed in A; upstream "Specification v2.0" not in repo (SEM); `C-12` is Constraint | baseline |
| `F1`–`F6` | Repository findings at `c9f0e28` | A:30–37 | Constraint | baseline |
| `R-01` | Commitment amount = Σ rounded nomination lines (Manager cannot override with a lump sum) | A:82 | Agent recommendation; conflicts with `OBD-01` | OD-06A |
| `R-02` | Commitment exposure relief `max(Eff_C, AL_C)`; subcontract commitments have `AL_C = 0` so their term is `Eff_C` | A:83, 359 | Agent recommendation; amended by OD-07A | OD-06F, OD-07A |
| `R-03` | Line-level rounding, half-up, 2 dp, `Decimal` | A:84 | Agent recommendation | OD-06F |
| `R-04` | Manager-only reversal of approved records with compensating entries | A:85, 751 | Agent recommendation | OD-06F |
| `R-05` | Evidence is checked at SUBMIT | A:86 | Agent recommendation | OD-06F |
| `R-06` | Every override, rejection and reversal needs a non-empty trimmed reason | A:87 | Agent recommendation | OD-06F |
| `R-07` | Seven billing statuses `DRAFT…REVERSED`; rejecting role recorded | A:88, 736 | Agent recommendation; touched by OD-03 | OD-06F, OD-03 |
| `BD-03` | Site-labor overtime: `1.50 × (daily wage ÷ standard day hours)`, default 8 | A:255–260, 888 | Agent recommendation | OD-06C |
| `BD-05` | MRN: Engineer creates and submits, Manager approves (`creator ≠ approver`) | A:291, 889 | Agent recommendation (source default) | OD-04B |
| `BD-09` | Capital injection: `PERMANENT_EQUITY` vs `TEMPORARY_FINANCING` | A:484–497, 890 | Agent recommendation | OD-05C |
| `BD-10` | Recognized Outflow (approved-payable proxy) | A:516–523, 891 | Agent recommendation; redesigned in OD-05A | OD-05A |
| `BD-12` | Variation Order item and rate model: never change an item's rate; `QUANTITY_ADJUSTMENT` or `ADDITIONAL_ITEM` | A:45, 134, 323–333, 893 | Agent recommendation; conflicts with `OBD-12` | OD-06E, AUD-09 |
| `BD-13` | Material gate applies to every MATERIALS expense (no petty-cash threshold) | A:289, 894 | Agent recommendation; conflicts with `OBD-09` | OD-04A |
| `BD-14` | Legacy cutover policy; Purchasing blocked from SUBCONTRACTOR commitments | A:103, 183, 895 | Agent recommendation | OD-06A |
| `BD-15` | Budget transfers and contingency line | A:405–425, 896 | Agent recommendation | OD-06E |
| `BD-16` | Equipment scope (rented/supplier only) and meter-failure override | A:295–313, 897 | Agent recommendation | OD-06D |
| `BD-17` | Manager-only milestone completion with evidence gate | A:338–345, 898 | Agent recommendation (with constraint F5) | OD-06D |
| `BD-18` | Subcontractor advance verification and recovery; custody and commitment on the same budget line | A:219–245, 899 | Agent recommendation; affected by `AUD-07` | OD-06B, OD-07A |
| `BD-19` | Site labor sheet uniqueness per project/line/year/month; segregation from payroll | A:250–263, 900 | Agent recommendation; affected by `AUD-10` | OD-06C |
| `BD-20` | Custody issuance over budget: Manager exception with an authorized overrun cap | A:400–403, 901 | Agent recommendation; affected by `AUD-08` | OD-07B |
| `BD-21` | Owner billing recognized at Manager approval | A:473, 902 | Agent recommendation (source default) | OD-05B |
| `BD-01/02/04/06/07/08` | **No definition exists in any `docs/*.md` file** | none | Withdrawn; never used | none |
| `OBD-01` | Manager may adjust commitment amount at nomination approval | R:944 | Review default only | OD-06A |
| `OBD-02` | Ceiling applies to gross | R:945 | Review default; consistent with A | none |
| `OBD-03` | Backfill net payable on old approved billings | R:946 | Review default | OD-06A (`BD-14`) |
| `OBD-04`, `OBD-05` | Add `disbursedAmount`; undisbursed part released | R:947–948 | Review defaults; consistent with A:214 | OD-07B |
| `OBD-06` | Payroll and labor sheets coexist | R:949 | Review default | OD-06C |
| `OBD-07`, `OBD-08` | Partial MRN shipments; direct FK on Expense | R:950–951 | Review defaults; consistent with A | none |
| `OBD-09` | Petty-cash custody material purchases exempt from MRN (example 2,000 SAR) | R:952 | Review default; conflicts with `BD-13` | OD-04A |
| `OBD-10`, `OBD-11` | Equipment managed by Purchasing; contract links a commitment | R:953–954 | Review defaults | OD-06D |
| `OBD-12` | Billing lines name a `variationOrderId` | R:955 | Review default; conflicts with `BD-12` | OD-06E |
| `OBD-13` | Approved report with attachment gates milestone | R:956 | Review default | OD-06D |
| `OBD-14` | Accountant drafts owner billing | R:957 | Review default | OD-05B |
| `OD-*`, `NEW-OD-*` | This brief's decision labels (master matrix §5) | this brief | Pending | §3 |
| `AUD-*`, `PROV-AUD-*` | Findings (register §2) | audit; this brief | Open | §2, §4 |
| `COR-*` | Proposed addendum corrections (§6) | this brief | Proposals | §6 |

## 2. Findings register

| ID | Finding | Status | Handled in |
|---|---|---|---|
| `AUD-01` | Only `UC-1` has verified Owner approval; the addendum stamps many decisions "APPROVED & LOCKED" | Open | §0, COR-01 |
| `AUD-02` | After a budget revision, exposure restarts at zero on the new line, so committed capacity can be spent again | Open | OD-02 |
| `AUD-03` | Approved payables are conflated with cash outflow; "recognized project cost" has no formula | Open | OD-05 |
| `AUD-04` | "Immutable after AUDITED" conflicts with re-audit after a concurrent cap exhaustion | Open | OD-03 |
| `AUD-05` | Lineage immutability conflicts with a post-approval "amendment record" clause | Open | OD-02B |
| `AUD-06` | Petty-cash material exemption (`OBD-09`) was removed by `BD-13` without an Owner decision | Open | OD-04A |
| `AUD-07` | A custody on a fully committed subcontract line double-counts the advance until it is verified | Open | OD-07A |
| `AUD-08` | The Manager's overrun authorization has no defined step between custody approval and issue | Open | OD-07B |
| `AUD-09` | `VariationOrderLine` quantity precision and `ADDITIONAL_ITEM` schema compatibility | Open | §4.1 |
| `AUD-10` | Cross-record worker duplication and Payroll overlap with plain-text names | Open | OD-06C, §4.2 |
| `AUD-11` | Missing lock-order rows: MRN reversal, equipment timesheet approval/reversal, labor sheet approval/reversal | Open | §4.3 |
| `AUD-12` | A:567 still reads "Retention (proposed, BD-11)" and omits the `UC-1` formula | Open | COR-02 |
| `PROV-AUD-13` | Further lock rows missing: custody approve/issue/overrun, advance verify/reverse, payroll/expense approval, revision approval | Open | §4.3 |
| `PROV-AUD-14` | `lineageGroupId` described on line and lineage row; scoped to one pair, cannot key cross-revision exposure | Open | OD-02, §4.4 |
| `PROV-AUD-15` | Superseded-line closure rule (A:459) names only commitments, custodies and unlinked expenses | Open | OD-02, §4.4 |
| `PROV-AUD-16` | Equipment timesheets have no link to commitment items (A:546–547) although expense lines reference items (A:545) | Open, SEM | §4.3 |
| `AUD-07A-1` | `APPROVED`-unissued custodies drop out of `P(L)` before issuance, allowing parallel over-approval or budget transfers to drain capacity | Open (new) | OD-07A |
| `AUD-07A-2` | Stage separation: `Custody.amount` is checked at approval and reserved; `disbursedAmount` is checked at issuance and creates active exposure | Open (new) | OD-07A |
| `AUD-07A-3` | Concurrent billing or negative VO approval can consume commitment ceiling already advanced or reserved by linked custodies | Open (new) | OD-07A |
| `AUD-07A-4` | Formula distinction: `RemainingBalance(K)` vs. `R_linked(K)` (commitment balance) vs. `R_unlinked(K)` (line exposure balance) | Open (new) | OD-07A |
| `AUD-07A-5` | Strict balance guards on `SETTLED` and `CLOSED`: remaining balance must be zero, never clamped by status label | Open (new) | OD-07A |
| `AUD-03-1` | Stateful aggregate header (`SubcontractorBilling`) vs. strictly append-only audit artifacts (`BillingAuditSnapshot`, `BillingDeduction`, `AdvanceRecoveryEntry`) | Open (new) | OD-03 |
| `AUD-03-2` | Net evaluation of append-only recovery ledger entries to prevent double-counting `RESERVED` and `CONFIRMED` rows | Open (new) | OD-03 |
| `AUD-05-1` | Schema-verified field names: `Custody.cashReturnedAmount`, `PayrollEntry.amount`, `Expense.amount`, `SubcontractorBilling.grossAmount`, `netPayable` | Open (new) | OD-05 |
| `AUD-05-2` | `OwnerBilling.amount` single certified claim field vs. gross/net representation | Open (new) | OD-05 |
| `AUD-05-3` | Explicit query predicates filtering soft-deleted (`deletedAt IS NOT NULL`), pre-approval, and reversed/compensated rows | Open (new) | OD-05 |
| `AUD-05-4` | Prevention of duplicate labor cost recognition between `PayrollEntry` and `SiteLaborSheet` | Open (new) | OD-05, OD-06C |
| `INV-OPA-1` | Atomic write-time compensation invariant and canonical lock hierarchy for `OwnerPayment` reversal and allocations | Open (new) | OD-05 |

## 3. Decision areas

### OD-01 — Subcontractor retention (`BD-11`, `UC-2`, `UC-3`)

**Owner-approved rule (`UC-1`, preserved exactly).** Calculated retention = `round_half_up(Gross × Rate ÷ 100, 2)`, computed with `Decimal`, `ROUND_HALF_UP` to two decimals, before the remaining cap is applied. Nothing below changes it. `BD-11`, `UC-2` and `UC-3` remain unapproved until the Owner decides them.

**OD-01A — `BD-11` (retention policy).**
- *Rule as drafted* (A:145–175): rate and cap come from each subcontract; the rate is an explicit percentage and `0.00` is allowed only as an explicit entry; the cap is `CAP_AMOUNT ≥ 0.00` or explicit `NO_CAP`; retention is calculated on the statement's Gross; `Actual = min(Calculated, max(Cap − Previously Retained, 0))` over approved, non-reversed statements; the Accountant may reduce a statement's retention to any amount from `0.00` to `Actual` with a reason; the Manager's final approval is unchanged; release is out of v1.
- *Evidence gap (SEM).* The Owner's original `BD-11` wording is only partly retrievable. The record that is available lists a "contract approval snapshot" element, which overlaps `UC-2`. The Owner must say whether approving `BD-11` also decides `UC-2`.
- *Options.* **1A-1** approve as drafted. **1A-2** approve without the statement-level Accountant reduction (`Adjusted = Actual` always).
- *Recommended (unapproved):* 1A-1.
- **Q-OD-01A:** which option, and does it include the Owner's "contract approval snapshot" element?

**OD-01B — `UC-2` (post-approval immutability of commitment retention terms).**
- *Meaning.* Whether `retentionRate`, `retentionCapMode` and `retentionCapAmount` on the approved commitment may ever change. The Accountant's statement-level reduction is part of `BD-11`, not `UC-2`; the explicit-`0.00` rate is also part of `BD-11`.
- *Options.* **1B-1** terms are frozen once the commitment is approved (statement-level reduction remains the only flexibility, if `BD-11` allows it). **1B-2** a new Manager-approved amendment record is designed; it would need the same cap treatment as OD-01C.
- *Recommended (unapproved):* 1B-1.
- **Q-OD-01B:** freeze the terms (1B-1) or design an amendment mechanism (1B-2)?

**OD-01C — `UC-3` (cap representation and Variation Orders).**
*Scenario.* Contract 1,000,000; dynamic cap = 5% of the effective commitment ceiling = 50,000; approved statements retain 50,000 on 500,000 Gross. A negative approved VO of −200,000 lowers the ceiling to 800,000 (still above billed Gross, so A:329 allows it). The recalculated cap is 40,000, **below** the 50,000 already retained. Historical approved statements are immutable (AGENTS §13.7). Future retention can be set to 0, but that does not make cumulative retention ≤ the recalculated cap.

| Option | Cap rule | Is "cumulative approved retention ≤ cap" (A:572) still true? | Consequence |
|---|---|---|---|
| **1C-1** fixed cap (audit label `UC-3A`) | Fixed SAR cap (`CAP_AMOUNT`/`NO_CAP`) set at commitment approval; a paper percentage is converted once at nomination | Yes, always, against the fixed cap | After a positive VO the cap shrinks as a share of the contract; after a negative VO it grows as a share. No new mechanics. |
| **1C-2** dynamic, blocks negative VO (audit label `UC-3B`) | Cap = % of effective ceiling | Yes, because a negative VO that would push the cap below `Previously Retained` is refused | Legitimate scope reductions are blocked; the only way through is reversing an approved statement under `R-04`. |
| **1C-3** dynamic, prospective | Cap = % of effective ceiling, evaluated when each statement is approved; after a negative VO future retention is 0 | **No.** After the scenario, historical retention (50,000) exceeds the current cap (40,000). The invariant is redefined as prospective. | An informational flag shows the excess. **No recovery, refund or adjustment policy is defined or proposed**; handling of the excess stays an open Owner matter. |
| **1C-4** dynamic ratchet | Cap = highest percentage-derived value ever reached; never falls | Yes, against the ratchet cap | VOs are not blocked; the contract's percentage no longer tracks a reduced ceiling. |

- *Not determinable from sources (SEM):* whether a contract's percentage cap applies to the original or the revised contract sum. No subcontract terms exist in the repository. Rounding a dynamic cap to two decimals is part of this pending decision, not of `UC-1`.
- *Recommended (unapproved):* 1C-1, only because it needs no new mechanics and keeps the invariant true.
- **Q-OD-01C:** which option, and which contract base applies to a percentage cap?
- **AUD-12** is a documentation correction (COR-02), independent of these options.

### OD-02 — Budget revision continuity (`AUD-02`, `AUD-05`, `PROV-AUD-14`, `PROV-AUD-15`)

**Design facts (not policy).** Each `Budget` version owns its own `BudgetLine` rows ([schema 383–463](file:///d:/Construction%20Control/prisma/schema.prisma#L383-L463)); records bind to one line id and are never rebound (A:432, 436). Exposure is computed per line (A:354–365), so a new line starts at zero (`AUD-02`). Transfers belong to the revision in which they ran (A:454). Lineage links adjacent revisions only (A:450). None of this design is implemented or approved.

**Recommended model 2A-1 (unapproved).** Keep one `BudgetLine` row per revision and add no field to `BudgetLine`. The lineage rows are the only lineage representation.
- **R1 — where `lineageGroupId` lives.** On `BudgetLineLineage` rows only (as A:549 has it), for reporting, scoped to one revision pair. It is **not** on `BudgetLine`, and it is **not** used by exposure, locking or transfer logic. A:437 ("every line carries a shared `lineageGroupId`") and A:459 ("aggregates exposure across `lineageGroupId`") must be reworded (COR-07).
- **R2 — family.** For a current line `L`, `Anc*(L)` is every ancestor reached by following lineage rows backwards, and `Fam(L) = {L} ∪ Anc*(L)`. Then `X_eff(L) = Σ X_direct` and `P_eff(L) = Σ P_direct` over `Fam(L)`, using the definitions in A:354–365. `E(L)` is the line's own amount plus its own revision's executed transfers. `Available_eff = E − X_eff` and `Projected_eff = Available_eff − P_eff`. This keeps both active exposure and the pending projection across any number of revisions.
- **R3 — dormant line.** A line is *dormant* if `X_eff = 0`, `P_eff = 0`, and nothing non-terminal can still change them: no record in `DRAFT`, `SUBMITTED` or `AUDITED`, no approved-but-not-issued custody, and no submitted VO. (Those states are outside `X` and `P`: A:363, 372.)
- **R4 — mapping at revision approval.** Every non-dormant old line maps `CONTINUED` or `MERGED` with exactly one successor. `SPLIT` and `REMOVED` are allowed only for dormant lines. To carve budget out of an encumbered line, use `CONTINUED` plus `ADDED`. **No prior exposure is ever apportioned between split lines, so none can be allocated twice.**
- **R5 — successor evaluation.** For a record still bound to a superseded line, the soft limit, `E` and transfer checks are evaluated against its unique current descendant `succ*(L)`. The record's own `budgetLineId` never changes.
- **R6 — closure.** Superseded lines accept no new budget-consuming records (proposal, wider than A:459: commitments, nominations, custodies, payroll, labor sheets, VOs, unlinked expenses; `PROV-AUD-15`).
- **R7 — locks.** Level 1 takes every row of `Fam(succ*(L))` in id order. Lineage is immutable after approval, so a pre-read of the family is stable. If a revision commits between the pre-read and the lock, the transaction aborts and retries; it never takes an out-of-order or lower-level lock afterwards. Revision approval locks all of the project's lines in id order.
- **R8 — why nothing is double-counted or lost.** Given R3–R4, every non-dormant historical line has exactly one current descendant, so the families of the current lines are disjoint and together hold all live exposure.

| Case | Example | Result |
|---|---|---|
| Continued or modified | `L1`: E 1,000,000, X 800,000 → `L2`: E 1,200,000 | `Available(L2)` = 400,000, not 1,200,000 |
| Merged | `L1a` X 300,000 + `L1b` X 200,000 → `L2` | `X_eff(L2)` = 500,000, counted once |
| Split, dormant | `L1c` X 0 → `L2a`, `L2b` | nothing to allocate |
| Split, encumbered | `L1d` X 300,000 | refused; use `CONTINUED` to `L2a` (X_eff 300,000) plus `ADDED` `L2b` |
| Removed, encumbered | — | refused |
| Successive revisions | `L1 → L2 → L3` | `X_eff(L3) = X(L3) + X(L2) + X(L1)` |
| Transfers | 100,000 moved during v2 | changes `E(L2)` only; checked against `Projected_eff` |
| Concurrent approvals | commitment on `L2`, VO on a commitment bound to `L1` | same family locks, so they serialize |

**Alternatives considered and not selected.**
- **2A-2:** split of encumbered lines allowed, with a shared ceiling per connected component; harder to explain, and sibling lines consume each other's capacity.
- **2A-3:** a fixed percentage allocation of prior exposure across split lines. Not selected and not recommended: it cannot follow later changes on ancestor records (a VO, a custody return) without rebinding, which A:432 forbids, and it contradicts R4.
- **2B:** a stable `BudgetLine` identity plus a `BudgetRevisionLineSnapshot` table; it reworks the existing `budgetId` relation and slice 3 queries.

**Owner questions.**
- **Q-OD-02A:** choose 2A-1, 2A-2 or 2B. (`AUD-02` stays open until then.)
- **Q-OD-02B (`AUD-05`):** confirm removing the post-approval lineage-amendment clause at A:458, so lineage is strictly immutable after approval (COR-06).
- **Q-OD-02C:** when a revised amount is below carried exposure (`E(L_new) < X_eff(L_new)`) should the system (a) block, (b) allow with a Manager reason and audit event consistent with `C-07`, or (c) allow silently and report a negative balance? And what happens to in-flight `DRAFT`/`SUBMITTED` records on a superseded line: block the revision, let them continue against `succ*`, or force them closed? *Recommended (unapproved):* (b) and "continue against `succ*`".

### OD-03 — Billing re-audit (`AUD-04`, `AUD-03-1`, `AUD-03-2`, touches `R-07`)

**Problem.** A:179 says a statement refused at approval because a concurrent approval exhausted the cap "returns through the existing `REJECTED` path and is re-audited". A:180, 193 and 575 say retention figures and deductions are immutable after `AUDITED`. A:736 allows only `REJECTED → DRAFT`, which sends the Engineer back to re-submit unchanged BOQ quantities.

**Append-Only Snapshot & Deduction Architecture (Option `S1`, Recommended, Unapproved):**
- **Stateful Aggregate Header (`SubcontractorBilling`):** The header row in `subcontractor_billings` transitions through the status machine (`DRAFT`, `SUBMITTED`, `AUDITED`, `APPROVED`, `REJECTED`, `CANCELLED`, `REVERSED`) and updates pointer column `currentAuditSnapshotId` (nullable FK to `BillingAuditSnapshot`) and `currentAuditCycleNo` (`Int`, default `0`).
- **`BillingAuditSnapshot` (`billing_audit_snapshots`, INSERT-only, immutable):**
  - Fields: `id` (PK), `billingId` (FK `SubcontractorBilling`), `auditCycleNo` (`Int >= 1`, `@@unique([billingId, auditCycleNo])`), `grossAmount`, `retentionRateApplied`, `previouslyRetainedSnapshot`, `calculatedRetentionAmount`, `capLimitedRetentionAmount`, `adjustedRetentionAmount`, `isRetentionAdjusted`, `retentionAdjustmentReason`, `totalDeductions`, `netPayable`, `auditedById` (FK `User`), `auditedAt` (`Timestamptz`).
  - *Current cycle selection:* Each `SUBMITTED → AUDITED` transition sets `auditCycleNo = COALESCE(MAX(auditCycleNo), 0) + 1`, inserts a new snapshot, and sets `SubcontractorBilling.currentAuditSnapshotId = newSnapshot.id`. When in `SUBMITTED`, `REJECTED`, `CANCELLED`, or `DRAFT`, `currentAuditSnapshotId` is set to `NULL`.
- **`BillingDeduction` (`billing_deductions`, INSERT-only, Scoped to Snapshot):**
  - Fields: `id` (PK), `billingId` (FK `SubcontractorBilling`), `auditSnapshotId` (FK `BillingAuditSnapshot`, non-null), `type` (`ADVANCE_RECOVERY | RETENTION | PENALTY | OTHER`), `amount` (`Decimal(15,2) > 0`), `reason` (`Text`), `advanceId` (nullable FK `CustodySubcontractorAdvance`), `createdById` (FK `User`), `createdAt` (`Timestamptz`).
  - Uniqueness: `@@unique([auditSnapshotId, advanceId])` (where `advanceId IS NOT NULL`).
  - *Superseded deductions stop affecting current payable without UPDATE/DELETE:* No row is ever mutated. A deduction is active iff `deduction.auditSnapshotId = billing.currentAuditSnapshotId` and `billing.status IN ('AUDITED', 'APPROVED')`. Superseded cycle deductions remain historical evidence and contribute `0.00` to active payables.
- **`AdvanceRecoveryEntry` (`advance_recovery_entries`, Strictly Append-Only Ledger):**
  - Fields: `id` (PK), `advanceId` (FK `CustodySubcontractorAdvance`), `billingId` (FK `SubcontractorBilling`), `auditSnapshotId` (FK `BillingAuditSnapshot`), `deductionId` (FK `BillingDeduction`), `state` (`RESERVED | CONFIRMED | RELEASED`), `amount` (`Decimal(15,2) > 0`), `priorEntryId` (nullable FK to `AdvanceRecoveryEntry`, `UNIQUE` where `state = RELEASED`), `createdById` (FK `User`), `createdAt` (`Timestamptz`).
  - *Lifecycle per Audit Cycle n:*
    - At Audit (`SUBMITTED → AUDITED`, cycle $n$): insert `AdvanceRecoveryEntry(state = RESERVED)` for each advance recovery deduction.
    - On Return for Re-Audit (`AUDITED → SUBMITTED`), Reject, or Cancel: insert compensating `AdvanceRecoveryEntry(state = RELEASED, priorEntryId = reservedEntry.id)`.
    - At Re-Audit (cycle $n+1$): insert new snapshot $S_{n+1}$, new deductions, and new `RESERVED` entries.
    - At Approval (`AUDITED → APPROVED`): insert `AdvanceRecoveryEntry(state = CONFIRMED, priorEntryId = reservedEntry.id)`.
    - On Reversal (`APPROVED → REVERSED`): insert `AdvanceRecoveryEntry(state = RELEASED, priorEntryId = confirmedEntry.id)`.
  - *Net Recovery Balance Formula (no double-counting):*
    $$\text{ActiveReserved}(Adv) = \sum_{\substack{D.\text{advanceId} = Adv.\text{id} \\ \exists E(D, \text{RESERVED}) \land \neg \exists E(D, \text{CONFIRMED}) \land \neg \exists E(D, \text{RELEASED})}} D.\text{amount}$$
    $$\text{ActiveConfirmed}(Adv) = \sum_{\substack{D.\text{advanceId} = Adv.\text{id} \\ \exists E(D, \text{CONFIRMED}) \land \neg \exists E(D, \text{RELEASED})}} D.\text{amount}$$
    $$\text{RemainingRecoverable}(Adv) = Adv.\text{amount} - \big(\text{ActiveReserved}(Adv) + \text{ActiveConfirmed}(Adv)\big) \ge 0.00$$

**Transition options:**
- **T1a (Recommended, unapproved):** `AUDITED → SUBMITTED` on Manager return, with reason. Evidence stays locked (A:703). Inserts `RELEASED` recovery entries and clears `currentAuditSnapshotId = null` without requiring the Engineer to re-submit unchanged BOQ lines.
- **T1b:** `AUDITED → REJECTED` (Manager) then `REJECTED → SUBMITTED` (Accountant, only when BOQ is unchanged). Reuses existing void/release rules, but requires amending A:704 so `REJECTED` does not unlock Engineer attachments unless reopened to `DRAFT`.
- **T2:** keep `REJECTED → DRAFT → SUBMITTED → AUDITED` through the Engineer.
- **Q-OD-03:** T1a, T1b or T2?

### OD-04 — Material receiving gate (`BD-13`, `OBD-09`, `BD-05`, `AUD-06`)

**OD-04A.**
- **4A:** every MATERIALS expense, including custody-paid ones, needs a Purchasing `CommitmentItem` and an approved MRN (A:289, `BD-13`). Strongest control; urgent small cash purchases cannot be recorded on a MATERIALS line without a PO and MRN.
- **4B:** direct vendor expenses and PO-linked expenses still need an approved MRN. A custody-funded expense with no commitment may skip the MRN only if all of the following hold under the budget-line and custody locks: (1) per-expense cap; (2) cumulative cap per custody and per project-month; (3) at most one such expense per custody per day; (4) invoice and material photos attached (`C-11`); (5) Accountant verification and Manager approval, with a flag and audit event. The SAR caps are Owner inputs (SEM); no figure is assumed.
- *Recommended (unapproved):* 4A.
- **Q-OD-04A:** 4A or 4B (and, for 4B, the exact SAR caps)?

**OD-04B (`BD-05`).** Engineer creates and submits the MRN; the Manager approves; `creator ≠ approver`.
- **Q-OD-04B:** confirm `BD-05`?

### OD-05 — Cash coverage, project cost, margin, and owner payment consistency (`AUD-03`, `AUD-05-1..4`, `BD-09`, `BD-10`, `BD-21`, `INV-OPA-1`, `NEW-OD-01`, `NEW-OD-02`)

**Evidence & Domain Scope.** The system records physical cash movements only for owner payments, capital injections and repayments, and custody `disbursedAmount` and cash returns (`F1`, A:32). Approved expenses, payroll, labor sheets and subcontractor net payables are **approved liabilities**, not proof of cash disbursement (bank accounts and bank reconciliation are permanently out of scope: AGENTS §3–§4). Every liability metric is recognized at `status = 'APPROVED'` and never labeled "paid".

**OD-05A — Schema-Verified Cash Coverage Formulas (1–4):**
1. **Recorded Cash & Funding Inflows (`NetCashAndFundingInflows(P)`):**
   $$\text{NetCashAndFundingInflows}(P) = \sum_{\substack{op \in \text{OwnerPayment} \\ op.\text{projectId} = P \\ op.\text{deletedAt} = \text{null} \\ op.\text{status} = \text{'RECORDED'}}} op.\text{amount} + \sum_{\substack{ci \in \text{CapitalInjection} \\ ci.\text{projectId} = P \\ ci.\text{deletedAt} = \text{null} \\ ci.\text{status} \ne \text{'REVERSED'}}} ci.\text{amount} - \sum_{\substack{cr \in \text{CapitalInjectionRepayment} \\ cr.\text{injection}.\text{projectId} = P \\ cr.\text{entryType} = \text{'REPAYMENT'} \\ \neg \exists r:\, r.\text{compensatesRepaymentId} = cr.\text{id}}} cr.\text{amount}$$
   *(Write-offs under `entryType = 'WRITEOFF'` are non-cash accounting adjustments and excluded from cash flow.)*

2. **Evidenced Custody Cash Outflow (`EvidencedCustodyCashOut(P)`):**
   $$\text{EvidencedCustodyCashOut}(P) = \sum_{\substack{c \in \text{Custody} \\ c.\text{projectId} = P \\ c.\text{deletedAt} = \text{null} \\ c.\text{status} \in \{\text{'ISSUED'}, \text{'PARTIALLY\_SETTLED'}, \text{'SETTLED'}, \text{'CLOSED'}\}}} \big(c.\text{disbursedAmount} - c.\text{cashReturnedAmount}\big)$$
   *(Uses exact verified column `Custody.cashReturnedAmount` from `prisma/schema.prisma` L637.)*

3. **Approved Direct Payables (`ApprovedDirectPayables(P)` — CONDITIONAL on `Q-OD-06C3` & `NEW-OD-01`):**
   $$\text{ApprovedDirectLaborPayables}(P) = \sum_{\substack{pe \in \text{PayrollEntry} \\ pe.\text{projectId} = P,, pe.\text{deletedAt} = \text{null} \\ pe.\text{status} = \text{'APPROVED'}}} pe.\text{amount} + \sum_{\substack{ls \in \text{SiteLaborSheet} \\ ls.\text{projectId} = P,, ls.\text{deletedAt} = \text{null} \\ ls.\text{status} = \text{'APPROVED'} \\ ls.\text{custodyId} = \text{null}}} ls.\text{totalAmount}$$
   $$\text{ApprovedDirectPayables}(P) = \sum_{\substack{e \in \text{Expense} \\ e.\text{projectId} = P,, e.\text{deletedAt} = \text{null} \\ e.\text{status} = \text{'APPROVED'},, e.\text{custodyId} = \text{null}}} e.\text{amount} + \text{ApprovedDirectLaborPayables}(P) + \sum_{\substack{sb \in \text{SubcontractorBilling} \\ sb.\text{projectId} = P,, sb.\text{deletedAt} = \text{null} \\ sb.\text{status} = \text{'APPROVED'}}} \text{EffectiveNetPayable}(sb)$$
   where `EffectiveNetPayable(sb)` = `sb.currentAuditSnapshot.netPayable` for audited post-cutover billings and `sb.grossAmount` for grandfathered pre-cutover billings (`BD-14` / `OBD-03`).

4. **Recognized Outflow (`RecognizedOutflow(P)`, `BD-10`) & Net Cash Coverage Position (`NetCashCoveragePosition(P)`):**
   $$\text{RecognizedOutflow}(P) = \text{EvidencedCustodyCashOut}(P) + \text{ApprovedDirectPayables}(P)$$
   $$\text{NetCashCoveragePosition}(P) = \text{NetCashAndFundingInflows}(P) - \text{RecognizedOutflow}(P)$$
   - *Label:* "Net cash coverage after approved payables" (صافي تغطية السيولة بعد المستحقات المعتمدة). Replaces unqualified "Liquidity".
   - *Single counting:* Custody-settled expenses, custody-funded labor sheets (`F2`), and custody-paid subcontractor advances are inside (2). Subcontractor net payable in (3) already deducts recovered advances.
   - **Q-OD-05A:** approve formulas 1–4 and the net-coverage label?

**OD-05B — Project Cost, Margin, and Owner Payment Reversal Consistency (Formulas 5–6):**
5. **Recognized Project Cost (`RecognizedProjectCost(P)` — CONDITIONAL on `Q-OD-06C3`, `NEW-OD-01`, & `NEW-OD-02`):**
   $$\text{RecognizedLaborCost}(P) = \sum_{\substack{pe \in \text{PayrollEntry} \\ pe.\text{projectId} = P,, pe.\text{deletedAt} = \text{null} \\ pe.\text{status} = \text{'APPROVED'}}} pe.\text{amount} + \sum_{\substack{ls \in \text{SiteLaborSheet} \\ ls.\text{projectId} = P,, ls.\text{deletedAt} = \text{null} \\ ls.\text{status} = \text{'APPROVED'}}} ls.\text{totalAmount}$$
   $$\text{RecognizedProjectCost}(P) = \sum_{\substack{e \in \text{Expense} \\ e.\text{projectId} = P,, e.\text{deletedAt} = \text{null} \\ e.\text{status} = \text{'APPROVED'}}} e.\text{amount} + \text{RecognizedLaborCost}(P) + \sum_{\substack{sb \in \text{SubcontractorBilling} \\ sb.\text{projectId} = P,, sb.\text{deletedAt} = \text{null} \\ sb.\text{status} = \text{'APPROVED'}}} \Big(sb.\text{grossAmount} - \sum_{\substack{d \in sb.\text{currentAuditSnapshot}.\text{deductions} \\ d.\text{type} \in \text{CostReducingTypes}}} d.\text{amount}\Big)$$
   where `CostReducingTypes` = `{'PENALTY', 'OTHER'}` under `NEW-OD-02` Option `A` (`{'PENALTY'}` under Option `B`). Unspent custody cash, advances, retention, and advance recovery never alter cost.

6. **Project Contractual Margin (`ProjectContractualMargin(P)`, `BD-21`) & Certified Billing Receivable (`CertifiedBillingReceivable(P)`):**
   $$\text{ProjectContractualMargin}(P) = \sum_{\substack{ob \in \text{OwnerBilling} \\ ob.\text{projectId} = P,, ob.\text{deletedAt} = \text{null} \\ ob.\text{status} = \text{'APPROVED'}}} ob.\text{amount} - \text{RecognizedProjectCost}(P)$$
   $$\text{CertifiedBillingReceivable}(P) = \sum_{\substack{ob \in \text{OwnerBilling} \\ ob.\text{projectId} = P,, ob.\text{deletedAt} = \text{null} \\ ob.\text{status} = \text{'APPROVED'}}} ob.\text{amount} - \sum_{\substack{opa \in \text{OwnerPaymentAllocation} \\ opa.\text{billing}.\text{projectId} = P \\ opa.\text{billing}.\text{status} = \text{'APPROVED'} \\ opa.\text{payment}.\text{status} = \text{'RECORDED'} \\ opa.\text{entryType} = \text{'ALLOCATED'} \\ \neg \exists r:\, r.\text{compensatesAllocationId} = opa.\text{id}}} opa.\text{amount}$$
   - **Owner Payment Reversal & Allocation Atomic Invariant (`INV-OPA-1`):**
     Reversing an `OwnerPayment` (`RECORDED → REVERSED`, Manager-only) **must** execute in an atomic transaction that: (1) locks target `owner_billings (id ASC)` then `owner_payments`; (2) inserts compensating `OwnerPaymentAllocation(entryType = 'REVERSED', compensatesAllocationId = alloc.id)` for every active allocation of that payment; (3) sets `payment.status = 'REVERSED'`. An `OwnerPayment` with `status = 'REVERSED'` is guaranteed to have zero uncompensated allocations.
   - **Q-OD-05B1:** approve formulas 5–6 and invariant `INV-OPA-1`?
   - **Q-OD-05B2:** confirm that `OwnerBilling` has a single certified `amount` (`Decimal(15,2)`) as in R:635 and A:550, or specify if owner-side retention/deduction columns are required?

**OD-05C — `BD-09`.** `PERMANENT_EQUITY` (no balance, no repayment, no write-off) vs `TEMPORARY_FINANCING` (append-only repayment ledger, Manager-only write-off with reason) as in A:484–497.
- **Q-OD-05C:** confirm `BD-09`?

**NEW-OD-01 — Site labor sheet funding.**
- **F1 (Recommended, unapproved):** direct payable only (no `custodyId` on sheet, A:543).
- **F2:** optional `custodyId` on sheet, settling $S_{K,\text{unlinked}}$ under locks `budget_lines → custodies → sheet`.
- **Q-NEW-OD-01:** F1 or F2?

**NEW-OD-02 — `OTHER` billing deductions in cost.** Option **A** reduces cost like `PENALTY`; Option **B** does not; Option **C** Accountant flag at audit. *Recommended (unapproved):* A.
- **Q-NEW-OD-02:** A, B or C?

### OD-06 — Remaining business rules

**OD-06A — `R-01` vs `OBD-01`, and `BD-14`.**
- `R-01` keeps `Commitment.amount = Σ nomination lines` and forbids a Manager lump-sum override (protecting item sum equality A:562).
- `BD-14`: pre-cutover flat commitments, billings and VOs stay read-only history; after cutover SUBCONTRACTOR commitments come only from nominations, and Purchasing is blocked from them.
- *Recommended (unapproved):* keep `R-01` and `BD-14`.
- **Q-OD-06A:** approve `R-01` (over `OBD-01`) and `BD-14`?

**OD-06B — `BD-18` workflow.** The custodian Engineer records an advance with a mandatory receipt; the Accountant verifies it; only verified advances reduce the custodian's balance and can be recovered through the append-only ledger `RESERVED → CONFIRMED / RELEASED` (A:219–245). Option **6B-1** as drafted; **6B-2** adds Manager approval of each advance. *Recommended (unapproved):* 6B-1.
- **Q-OD-06B:** 6B-1 or 6B-2?

**OD-06C — `BD-03`, `BD-19`, `AUD-10`, `AUD-05-4` (Labor rules and exclusivity).**
- `BD-03`: **OT1** overtime formula at A:255–260; **OT2** no overtime column in v1 (R:292). *Recommended (unapproved):* OT1.
- `BD-19` + `AUD-10`: worker names are plain text. **DUP1:** unique index on normalized name within a sheet; warning flag + reason across project sheets and payroll. **DUP2:** hard block on normalized match. *Recommended (unapproved):* DUP1.
- **Q-OD-06C3 (Labor Path Exclusivity — `AUD-05-4`):** Choose:
  - **`LAB-1` *(Recommended, unapproved):*** Mutually exclusive per `((projectId, budgetLineId, periodYear, periodMonth)` + project-period worker uniqueness.
  - **`LAB-2`:** Coexistence on same line with hard worker-period non-overlap constraint.
  - **`LAB-3`:** Post-cutover deprecation of `PayrollEntry` in favor of `SiteLaborSheet`.
- **Q-OD-06C1 (`BD-03`):** OT1 or OT2? **Q-OD-06C2 (`BD-19`/`AUD-10`):** DUP1 or DUP2? **Q-OD-06C3:** LAB-1, LAB-2, or LAB-3?

**OD-06D — `BD-16` and `BD-17`.** Rented/supplier equipment under an `EquipmentContract` tied to an EQUIPMENT commitment; meter failure override with evidence; approved timesheets add no exposure (`F6`). Milestone completion Manager-only gated by approved visual report (constraint `F5`).
- **Q-OD-06D:** approve `BD-16` and confirm `BD-17`?

**OD-06E — `BD-12` (vs `OBD-12`) and `BD-15`.**
- `BD-12`: **6E-VO1** VO never changes rate; lines are `QUANTITY_ADJUSTMENT` or `ADDITIONAL_ITEM`; billing lines have no user-chosen VO. **6E-VO2** allow rate changes on existing items. *Recommended (unapproved):* 6E-VO1.
- `BD-15`: **6E-BT1** same-project transfers, `amount ≤ Projected(source)` under source lock, Manager approves, `CONTINGENCY` line consumed only by transfer. **6E-BT2** only Accountant may initiate. *Recommended (unapproved):* 6E-BT1.
- **Q-OD-06E1 (`BD-12`):** 6E-VO1 or 6E-VO2? **Q-OD-06E2 (`BD-15`):** 6E-BT1 or 6E-BT2?

**OD-06F — `R-02`…`R-07` and `C-07`.** Confirm: `R-02` relief `max(Eff_C, AL_C)` (amended by OD-07A); `R-03` line rounding; `R-04` Manager reversal; `R-05` evidence at submit; `R-06` non-empty reason; `R-07` seven billing statuses (amended by OD-03); `C-07` soft limit with reason and audit.
- **Q-OD-06F:** confirm each?

**NEW-OD-03 — AGENTS time and attendance exclusion (SEM blocker).**
- `AGENTS.md` §1 (lines 11–12) states this document wins over all other documentation. §3 (line 70) permits only "Payroll data capture (NOT payroll processing)". §3 (line 87) explicitly lists **"Time tracking / timesheets"** as permanently out of scope. §3 (lines 102–103) strictly forbids introducing out-of-scope features without explicit written approval in a task brief. §4 (lines 116, 120) permanently excludes **"Leave management / attendance"** and **"Time tracking"**.
- CR-04 captures `attendanceDays` and `overtimeHours` with mandatory attendance evidence (A:719). CR-06 introduces `EquipmentTimesheet` with daily start/stop hours and meter readings. Neither `CR_Impact_Architecture_Review.md` nor `DESIGN_ADDENDUM_CR01_CR10_FINAL.md` constitutes an Owner-signed task brief overriding the engineering contract.
- **Q-NEW-OD-03:** Provide explicit written task-brief authorization overriding `AGENTS.md` §3 (line 87) and §4 (lines 116, 120) for CR-04 and CR-06, or restrict CR-04 and CR-06 to lump-sum cost capture without attendance/timesheet tracking?

**NEW-OD-04 — Attachment rules.** JPEG, PNG, WebP and PDF only, magic-byte verification, 10 MB maximum (A:691).
- **Q-NEW-OD-04:** confirm these rules?

### OD-07 — Custody (`AUD-07`, `AUD-07A-1..5`, `AUD-08`, `BD-18`, `BD-20`, amends `R-02`)

**OD-07A — Reconciled Custody Exposure, Approval Reservations, and Lifecycle Guards.**

1. **Exact Three Custody Balances (Never Conflated):**
   - **Custodian Personal Liability (`RemainingBalance(K)`):** For every issued custody $K$, $\text{RemainingBalance}(K) = d_K - S_K - V_K - r_K \ge 0.00$. Approving a custody leaves liability at `0.00`.
   - **Linked-Custody Commitment Balance (`R_linked(K)`):** For $K$ linked to subcontract commitment $C$ (`K.commitmentId = C`), general expenses and labor sheets are prohibited ($S_K \equiv 0.00$), so $R_{\text{linked}}(K) = d_K - V_K - r_K = \text{RemainingBalance}(K)$. Summed across open linked custodies, it yields $R_{\text{linked}}(C)$.
   - **Unlinked-Custody Line Exposure Balance (`R_unlinked(K)`):** For $K$ with `commitmentId IS NULL`, $R_{\text{unlinked}}(K) = d_K - S_{K,\text{unlinked}} - S_{K,\text{linked}} - V_K - r_K$. Summed across open unlinked custodies, it yields $\text{OutstandingUnlinkedCustodies}(L)$.

2. **Single-Counting Invariant in `X(L)` and Numerical Proof (`AT-07A-4`):**
   - $$\begin{aligned} X(L) &= \sum_{C_{\text{sub}} \in L} \max\big(\text{Eff}_{C_{\text{sub}}},\, G(C_{\text{sub}}) + U(C_{\text{sub}}) + R_{\text{linked}}(C_{\text{sub}})\big) \\ &\quad + \sum_{C_{\text{po}} \in L} \max\big(\text{Eff}_{C_{\text{po}}},\, \text{AL}_{C_{\text{po}}}\big) + \text{ApprovedUnlinkedExpenses}(L) \\ &\quad + \text{OutstandingUnlinkedCustodies}(L) + \text{ApprovedLaborExposure}(L) \end{aligned}$$
   - **Numerical Acceptance Test (SAR 100,000 Unlinked Custody with SAR 30,000 Approved Expenses):**
     - $d_K = 100,000.00\text{ SAR}$; $S_{K,\text{unlinked}} = 30,000.00\text{ SAR}$; $V_K = 0.00$; $r_K = 0.00$.
     - $R_{\text{unlinked}}(K) = 100,000.00 - 30,000.00 - 0.00 = 70,000.00\text{ SAR} \implies \text{OutstandingUnlinkedCustodies}(L) = 70,000.00\text{ SAR}$.
     - $\text{ApprovedUnlinkedExpenses}(L) = 30,000.00\text{ SAR}$.
     - Combined exposure: $X(L) = 30,000.00 + 70,000.00 = \mathbf{100,000.00\text{ SAR}}$ *(never 130,000.00 SAR)*.
     - Identity: $S_{K,\text{unlinked}} + R_{\text{unlinked}}(K) = d_K - r_K = 100,000.00\text{ SAR}$. Every settled SAR moves 1-for-1 out of $\text{OutstandingUnlinkedCustodies}(L)$ into $\text{ApprovedUnlinkedExpenses}(L)$, counted exactly once.

3. **Guards for `SETTLED` and `CLOSED` (No Silent Zeroing):**
   - Active exposure and custodian liability evaluate $d_K - S_K - V_K - r_K$ across all post-issuance custodies (`status IN ('ISSUED', 'PARTIALLY_SETTLED', 'SETTLED', 'CLOSED')`), never clamping positive liability to zero by status label.
   - Transition to `SETTLED` requires $\text{RemainingBalance}(K) == 0.00$.
   - `closeCustody` locks `budget_lines (1) → [commitments (2)] → custodies (4)`, recomputes $\text{RemainingBalance}(K) == 0.00$, and verifies zero non-terminal child records exist (rejects with `CUSTODY_CLOSE_BALANCE_NOT_ZERO` or `CUSTODY_CLOSE_PENDING_CHILDREN_EXIST`).
   - Reversing an expense/advance on a `CLOSED` custody is hard-blocked (`CUSTODY_CLOSED_REVERSAL_FORBIDDEN`); reversing on a `SETTLED` custody atomically reopens status to `PARTIALLY_SETTLED` and sets `settledAt = null`.

4. **Approval vs. Issuance Stage Separation & Ceiling Guards:**
   - `approveCustody` checks and reserves `K.amount` against commitment capacity $A(C)$ and pending projection $P(L)$ (`7A-R1`).
   - `issueCustody` checks `disbursedAmount`, moves $K$ from $A(C)$ to $R(C)$, and immediately releases $K.\text{amount} - d_K$.
   - Reciprocal guard on $C$ (`7A-C1`): Subcontractor billing approval and negative VO approval enforce $G_{\text{after}}(C) + U(C) + R_{\text{linked}}(C) + A(C) \le \text{Eff}_{\text{after}}(C)$.
   - **Q-OD-07A1:** 7A-1, 7A-2 or 7A-3? **Q-OD-07A2:** 7A-C1 (strict reciprocal guard) or 7A-C2 (soft limit)? **Q-OD-07A3:** 7A-R1 (reserve unissued in P(L)) or 7A-R2?

**OD-07B — Custody overrun authorization (`AUD-08`, `BD-20`).**
- **7B-1 (Recommended, unapproved):** Append-only `CustodyOverrunAuthorization` entity (`id`, `custodyId`, `sequenceNo`, `authorizedOverrunCap`, `reason`, `authorizedById`, `createdAt`). Custody stays `APPROVED` without in-place mutation. `issueCustody` checks actual overrun $\le \text{authorizedOverrunCap}$.
- Alternatives: **7B-2** in-place mutation on `Custody`; **7B-3** new status `OVERRUN_EXCEPTION_PENDING`.
- **Q-OD-07B:** 7B-1, 7B-2 or 7B-3?

## 4. Technical design findings and proposals

**4.1 `AUD-09` — `VariationOrderLine` precision and `ADDITIONAL_ITEM` compatibility (open).**
- Alter `VariationOrderLine` quantities (`originalQuantity`, `revisedQuantity`, `quantityDelta`) to `Decimal(15,4)` (or `Decimal(17,4)`).
- Add `lineType` (`QUANTITY_ADJUSTMENT | ADDITIONAL_ITEM`) and nullable `commitmentItemId` with CHECK constraint.
- For `ADDITIONAL_ITEM`: original qty/rate = 0; approval instantiates a `CommitmentItem` of source `VARIATION`. For `QUANTITY_ADJUSTMENT`: contract rate is fixed; original/revised quantities written at approval under item lock.

**4.2 `AUD-10` technical items.** Normalized-name unique index within a sheet and cross-record duplicate detection rules (OD-06C).

**4.3 Lock order (`AUD-11`, `PROV-AUD-13`, `PROV-AUD-16`, `INV-OPA-1`).**
Levels: 1 `budget_lines`; 2 `commitments`; 3 `commitment_items`; 4 `custodies`; 5 `custody_subcontractor_advances`; 6 operational header; 7 children/allocations/audit.
- Owner Cash domain: `owner_billings (id ASC) → owner_payments (id ASC) → INSERT allocations / audit`.
- Billing audit: `commitments (2) → advances (5, id ASC) → billing (6) → INSERT snapshot/deductions/RESERVED entries (7)`.
- Custody approval: `budget_lines (1) → [commitments (2)] → custodies (4)`.
- Custody issue & overrun: `budget_lines (1) → [commitments (2)] → custodies (4) → authorization (7) → audit (7)`.
- No `projects` row lock.

**4.4 `PROV-AUD-14` and `PROV-AUD-15`.** Group id lives on lineage rows only; superseded line closure is widened.

## 5. Master decision matrix

Every row below except `UC-1` has **no Owner approval** (`Status = Unapproved`). `Rec.` is an agent recommendation only.

| Decision / Item | IDs | Scope | Alternatives | Rec. *(Unapproved)* | Approval Status | Class | Question |
|---|---|---|---|---|---|---|---|
| **Baseline `UC-1`** | `UC-1` | Retention rounding: `round_half_up(Gross × Rate ÷ 100, 2)` via `Decimal` before cap | — | — | **Previously Owner-approved (2026-10-11); preserved unchanged** | Verified Baseline | none |
| **OD-01A** | `BD-11` | Subcontract retention policy (7 points; builds on `UC-1` without altering `UC-1`) | `1A-1`, `1A-2` | `1A-1` | **Unapproved** (Owner-proposed draft pending sign-off) | `OBD`, `SEM` | `Q-OD-01A` |
| **OD-01B** | `UC-2` | Post-approval immutability of commitment retention terms | `1B-1`, `1B-2` | `1B-1` | **Unapproved** | `OBD` | `Q-OD-01B` |
| **OD-01C** | `UC-3` | Retention cap representation & Variation Order interaction | `1C-1`, `1C-2`, `1C-3`, `1C-4` | `1C-1` | **Unapproved** | `OBD`, `SEM` | `Q-OD-01C` |
| **OD-02A** | `AUD-02` | Budget revision exposure continuity model | `2A-1`, `2A-2`, `2B` (`2A-3` rejected) | `2A-1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-02A` |
| **OD-02B** | `AUD-05` | Remove post-approval lineage amendment clause at `A:458` | Keep or remove `A:458` parenthetical | Remove | **Unapproved** | `DOC` | `Q-OD-02B` |
| **OD-02C** | — | Revision approval gate when `E(L_new) < X_eff(L_new)` & in-flight records | Gates `(a)`, `(b)`, `(c)`; 3 in-flight rules | `(b)`; continue against `succ*` | **Unapproved** | `OBD` | `Q-OD-02C` |
| **OD-03** | `AUD-04`, `AUD-03-1..2` | Billing re-audit state transition & append-only `BillingAuditSnapshot` / `BillingDeduction` / recovery ledger | `T1a`, `T1b`, `T2`; `S1` (append-only) vs `S2` | `T1a` + `S1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-03` |
| **OD-04A** | `BD-13`, `OBD-09`, `AUD-06` | Material receiving gate vs. petty-cash exemption | `4A`, `4B` | `4A` | **Unapproved** | `OBD`, `SEM` | `Q-OD-04A` |
| **OD-04B** | `BD-05` | MRN approval authority (`Engineer → Manager`, `creator ≠ approver`) | Confirm or revise | Confirm | **Unapproved** | `OBD` | `Q-OD-04B` |
| **OD-05A** | `BD-10`, `AUD-03`, `AUD-05-1` | Schema-verified cash inflow, custody cash out (`cashReturnedAmount`), direct payables & net cash coverage | Approve as stated or revise | Approve as stated | **Unapproved** | `OBD`, `TECH` | `Q-OD-05A` |
| **OD-05B** | `BD-21`, `AUD-05-2`, `INV-OPA-1` | Schema-verified `RecognizedProjectCost`, margin, single `OwnerBilling.amount`, & `INV-OPA-1` reversal invariant | Confirm single `amount` & `INV-OPA-1` | Confirm single `amount` + `INV-OPA-1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-05B1`, `Q-OD-05B2` |
| **OD-05C** | `BD-09` | Capital injection classification (`PERMANENT_EQUITY` vs `TEMPORARY_FINANCING`) | Confirm or revise | Confirm | **Unapproved** | `OBD` | `Q-OD-05C` |
| **NEW-OD-01** | `BD-19` | Site labor sheet funding (`F1` direct payable only vs. `F2` optional `custodyId`) | `F1`, `F2` | `F1` | **Unapproved** | `OBD`, `TECH` | `Q-NEW-OD-01` |
| **NEW-OD-02** | — | Treatment of `OTHER` billing deductions in `RecognizedProjectCost` | `A`, `B`, `C` | `A` | **Unapproved** | `OBD` | `Q-NEW-OD-02` |
| **OD-06A** | `R-01`, `OBD-01`, `BD-14` | Commitment amount = Σ BOQ lines (`R-01`) & legacy cutover (`BD-14`) | Keep `R-01`/`BD-14` or `OBD-01` override | Keep `R-01`, `BD-14` | **Unapproved** | `OBD` | `Q-OD-06A` |
| **OD-06B** | `BD-18` | Subcontractor advance verification (Accountant) & recovery workflow | `6B-1`, `6B-2` | `6B-1` | **Unapproved** | `OBD` | `Q-OD-06B` |
| **OD-06C** | `BD-03`, `BD-19`, `AUD-10`, `AUD-05-4` | Overtime (`BD-03`), worker duplicates (`AUD-10`), & labor path exclusivity (`AUD-05-4`) | `OT1`/`OT2`; `DUP1`/`DUP2`; `LAB-1`/`2`/`3` | `OT1`; `DUP1`; `LAB-1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-06C1..3` |
| **OD-06D** | `BD-16`, `BD-17` | Equipment scope/meter failure (`BD-16`) & milestone evidence gate (`BD-17`) | Confirm or revise | Confirm | **Unapproved** | `OBD` | `Q-OD-06D` |
| **OD-06E** | `BD-12`, `OBD-12`, `BD-15` | VO item/rate model (`BD-12`) & budget transfers/contingency (`BD-15`) | `6E-VO1`/`2`; `6E-BT1`/`2` | `6E-VO1`; `6E-BT1` | **Unapproved** | `OBD` | `Q-OD-06E1`, `Q-OD-06E2` |
| **OD-06F** | `R-02`–`R-07`, `C-07` | Program-wide rules (`R-02`–`R-07`) and soft-limit rule (`C-07`) | Confirm or revise | Confirm | **Unapproved** | `OBD` | `Q-OD-06F` |
| **NEW-OD-03** | — | Explicit task-brief override for `AGENTS.md` §3 (L87) & §4 (L116, 120) exclusions on time tracking & attendance | Written contract override vs. scope restriction | None (Owner contract decision) | **Unapproved (`SEM` blocker)** | `OBD`, `SEM` | `Q-NEW-OD-03` |
| **NEW-OD-04** | — | Attachment MIME types (JPEG/PNG/WebP/PDF), magic-byte check & 10 MB cap | Confirm or revise | Confirm | **Unapproved** | `OBD` | `Q-NEW-OD-04` |
| **OD-07A** | `AUD-07`, `AUD-07A-1..5`, `BD-18`, `R-02` | Reconciled unlinked vs. linked custody exposure, `SETTLED`/`CLOSED` balance guards, and ceiling rules | `7A-1`/`2`/`3`; `7A-C1`/`C2`; `7A-R1`/`R2` | `7A-1` + `7A-C1` + `7A-R1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-07A1..3` |
| **OD-07B** | `AUD-08`, `BD-20` | Append-only `CustodyOverrunAuthorization` workflow (`7B-1`) | `7B-1`, `7B-2`, `7B-3` | `7B-1` | **Unapproved** | `OBD`, `TECH` | `Q-OD-07B` |
| **Technical Items** | `AUD-09`, `AUD-11`, `PROV-AUD-13..16`, `COR-01..14` | VO line schema (`§4.1`), lock table (`§4.3`), lineage/closure (`§4.4`), addendum corrections (`§6`) | Per §4 and §6 | Per §4 and §6 | **Unapproved** | `TECH` / `DOC` / `SEM` | Technical sign-off |

## 6. Proposed corrections to the addendum (none applied)

| Id | Location | Current text | Proposed change | Class | Depends on |
|---|---|---|---|---|---|
| COR-01 | [A lines 1, 5, 7, 18–19, 26, 43, 45, 47–51, 78, 126, 141, 154, 157, 185–188, 221, 224, 250, 255, 263, 289, 291, 295, 345, 400, 456, 473, 484, 516, 559, 652, 691, 865–878, 888–902, 908, 929, 944](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L1) | "DECISION-LOCKED", "APPROVED & LOCKED", "READY FOR IMPLEMENTATION APPROVAL" | Keep the lock label only for `UC-1` and for items the Owner expressly decides | DOC | Owner answers |
| COR-02 | [A:567](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L567) | "7. **Retention (proposed, BD-11):**" | State the `UC-1` formula before `Actual = min(...)`; keep status wording accurate | DOC | none |
| COR-03 | [A:180](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L180), [A:193](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L193), [A:575](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L575) | "After `AUDITED` the retention figures are immutable" (and deductions) | State aggregate header vs. append-only `BillingAuditSnapshot` & `BillingDeduction` scoped to snapshot (`S1`) | TECH | OD-03 |
| COR-04 | [A:179](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L179), [A:88](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L88), [A:657](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L657), [A:736–737](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L736) | Re-audit "through the existing `REJECTED` path"; `REJECTED → DRAFT` only; deductions voided only on reject/cancel/reverse | Re-audit transition `T1a` (`AUDITED → SUBMITTED`), append-only `RELEASED` recovery rows, role permissions | TECH | OD-03 |
| COR-05 | [A:188](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L188), [A:533–535](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L533-L535) | Fixed SAR cap `UC-3`; nomination and commitment retention fields | Cap mode and fields per OD-01C; add percentage field only for 1C-2, 1C-3 or 1C-4 | TECH | OD-01C |
| COR-06 | [A:458](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L458) | "…or via a Manager-only audited lineage amendment record…" | Remove parenthetical | DOC | Q-OD-02B |
| COR-07 | [A:434–438](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L434-L438), [A:459](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L459), [A:549](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L549), [A:593](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L593) | Lineage is "reporting only", never enters exposure; every line carries `lineageGroupId` | Replace with OD-02 family rule (R1–R8), place `lineageGroupId` on lineage rows only, widen closure list | TECH | OD-02A |
| COR-08 | [A:83](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L83), [A:359–364](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L359-L364), [A:370](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L370) | Subcontract term is `Eff_C`; submitted custodies enter `P(L)` | Replace with reconciled `R_linked(K)`, `R_unlinked(K)`, `Term(C)`, `P(L)` unissued reservation & `SETTLED`/`CLOSED` balance guards | TECH (amends `R-02`) | OD-07A |
| COR-09 | [A:400–403](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L400-L403), [A:542](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L542) | Manager "records an exception on the custody"; `Custody` has "over-budget exception fields" | Replace with `CustodyOverrunAuthorization` and issue check (7B-1); snapshot fields written at issue | TECH | OD-07B |
| COR-10 | [A:499](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L499), [A:505–514](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L505-L514), [A:516–523](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L516-L523), [A:594](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L594) | "Liquidity"; undefined "recognized project cost"; custody-based outflow | Formulas 1–6 with verified `cashReturnedAmount`, conditional labor terms, `INV-OPA-1` reversal invariant | TECH + OBD | OD-05 |
| COR-11 | [A:263](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L263), [A:543](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L543) | Sheet has no custody link; worker overlap is data-entry policy | `custodyId` rule under F2; labor path exclusivity under LAB-1/2/3 (`AUD-05-4`) | TECH | NEW-OD-01, OD-06C |
| COR-12 | [A:529](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L529), [A:555](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L555), [A:323–333](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L323-L333), [A:769](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L769) | "line type, `commitmentItemId`, rate-equality validation" only | The `AUD-09` proposal of §4.1 | TECH | none |
| COR-13 | [A:628–642](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L628-L642) | Lock table lacks listed rows | Add rows of §4.3 including Owner Cash domain canonical locks & retry rule | TECH | OD-02, OD-05, OD-07 |
| COR-14 | [A:289](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md#L289) | "There is no petty-cash or amount threshold" | Keep 4A, or add 4B controls | DOC if 4A; TECH + OBD if 4B | OD-04A |

## 7. Remaining gaps

**Genuine Owner decisions:**
- All questions in §5: `Q-OD-01A/B/C`, `Q-OD-02A/B/C`, `Q-OD-03`, `Q-OD-04A/B`, `Q-OD-05A`, `Q-OD-05B1..2`, `Q-OD-05C`, `Q-NEW-OD-01…04`, `Q-OD-06A…F`, `Q-OD-06C3`, `Q-OD-07A1..3`, `Q-OD-07B`.

**Missing source evidence (SEM):**
- Original `BD-11` wording overlap with `UC-2`.
- Upstream "Specification v2.0" behind `C-01`…`C-11`.
- Percentage retention cap contract base (original vs revised contract sum).
- Equipment timesheet hours mapping to commitment items (`PROV-AUD-16`).
- Reversal rule for an already-recovered advance.
- Written task-brief approval to override `AGENTS.md` time/attendance exclusions (`NEW-OD-03`).
- Any SAR cap for petty-cash option 4B.

## 8. Priority order

1. **Exposure integrity:** Q-OD-02A, Q-OD-02B, Q-OD-02C, Q-OD-07A1..3, Q-OD-07B.
2. **Executive formulas & labor cost path:** Q-OD-05A, Q-OD-05B1..2, Q-OD-06C3, Q-NEW-OD-02, Q-OD-05C, Q-NEW-OD-01.
3. **Retention and billing:** Q-OD-01A, Q-OD-01B, Q-OD-01C, Q-OD-03.
4. **Scope and contract:** Q-NEW-OD-03, Q-OD-04A, Q-OD-04B, Q-NEW-OD-04.
5. **Remaining rules:** Q-OD-06A…F.
6. **Technical design reviews (no Owner policy):** §4.1, §4.3, §4.4, S1 or S2.

## 9. Verification performed

- **Full-document ID and text audit** (`node` script over assembled document):
  - Verified every occurrence of `BD-03`, `BD-05`, `BD-09`–`BD-21`, `R-01`–`R-07`, `UC-1` (sole verified baseline), `UC-2`, `UC-3`, `OBD-01`–`OBD-14`, `AUD-01`–`AUD-12`, `PROV-AUD-13`–`PROV-AUD-16`, `AUD-07A-1..5`, `AUD-03-1..2`, `AUD-05-1..4`, `INV-OPA-1`, `OD-01`–`OD-07`, `NEW-OD-01`–`NEW-OD-04`, and `COR-01`–`COR-14`.
  - Confirmed 0 occurrences of replacement-fragment wording (`carries over`, `previous brief`), withdrawn fields (`allocationSharePercent`, `predecessorLineId`, `SiteLaborWorkerLine.unitRate`), or `projects` row locks.
  - Verified all line references against [docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md](file:///d:/Construction%20Control/docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md), [docs/CR_Impact_Architecture_Review.md](file:///d:/Construction%20Control/docs/CR_Impact_Architecture_Review.md), and [prisma/schema.prisma](file:///d:/Construction%20Control/prisma/schema.prisma).
  - Verified numerical acceptance test AT-07A-4 (SAR 100,000 unlinked custody with SAR 30,000 expenses yields exactly SAR 100,000 exposure in $X(L)$).
  - Verified atomic payment reversal invariant INV-OPA-1, canonical lock hierarchy, and conditional labor non-overlap rules.

## 10. Verdict

READY FOR OWNER DECISION REVIEW — NO REPOSITORY SOURCE FILES MODIFIED — NO IMPLEMENTATION AUTHORIZED
