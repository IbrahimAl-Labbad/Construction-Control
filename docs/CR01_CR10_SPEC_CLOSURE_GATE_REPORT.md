# CR-01 → CR-10 Specification Closure Gate Report

Date: 2026-10-29. Documentation-only review. No production code, Prisma schema, migration, test or configuration was changed. Code tests were **not run** (no code changed). All claims below come from **source inspection**, not executed tests.

## A. Baseline

- Branch `slice-21`, HEAD `e236aa7` (`feat(slice-21): … concurrency hardening …`). Working tree was **clean** at start (no untracked or modified files).
- The addendum was written against `c9f0e28` (`slice-20`). `c9f0e28..e236aa7` changed 48 files, including approve/submit/update use cases for expenses, custodies, VOs, commitments and billings. Findings `F1`–`F6` were not re-derived line by line; the schema facts below were re-checked.
- Inspected: `AGENTS.md`, the addendum, the Owner Decision Brief, `CR_Impact_Architecture_Review.md`, `prisma/schema.prisma` (VO line, custody, budget), `lib/budget/calculations.ts`, git history.
- Changed: `docs/DESIGN_ADDENDUM_CR01_CR10_FINAL.md` (status labels, `UC-1` formula at §6.7, baseline note), `docs/OWNER_DECISION_BRIEF_CR01_CR10.md` (stale line 8 sentence and line-reference note), and this new report.
- **Owner-approval evidence:** the only record is the Brief's statement of an Owner instruction on 2026-10-11 approving `UC-1`. The original instruction is not in the repository, so it is cited second-hand; `UC-1` is preserved as approved. No approval record exists for anything else. The addendum's "APPROVED & LOCKED" labels are not evidence.

## B. Owner Decision Register

Status of every row: **Pending — no Owner approval record**. Alternatives and evidence are in the Brief section named in the last column. Recommendations are the Brief's, and are not approvals.

| Decision ID | CR | Current status | Exact Owner decision required | Blocking impact |
|---|---|---|---|---|
| `UC-1` | 02 | **OWNER-APPROVED** (2026-10-11) | None. | None. |
| `BD-11` (OD-01A) | 02, 01 | Owner-proposed, pending; original wording not fully retrievable | Option 1A-1 or 1A-2; does approval include the "contract approval snapshot" (`UC-2`)? | Blocks CR-01 and CR-02 retention. |
| `UC-2` (OD-01B) | 01, 02 | Pending | Freeze retention terms (1B-1) or design an amendment mechanism (1B-2). | Blocks CR-01 and CR-02. |
| `UC-3` (OD-01C) | 02, 07 | Pending | Cap rule 1C-1 to 1C-4, and whether a percentage cap uses the original or revised contract sum. The sources do not say. | Blocks CR-02, and CR-07 negative VOs. |
| OD-02A (`AUD-02`) | 09 | Pending | 2A-1, 2A-2 or 2B for exposure continuity across revisions. | Blocks CR-09. Budget revision work stays deferred. |
| OD-02B (`AUD-05`) | 09 | Pending | Remove the post-approval lineage-amendment clause (A:461, current working copy). | Blocks CR-09 wording. |
| OD-02C | 09 | Pending | Revision gate when `E(L_new) < X_eff` (block, allow with Manager reason, or silent), and treatment of in-flight records. | Blocks CR-09. |
| OD-03 (`AUD-04`, `AUD-03-1/2`) | 02 | Pending | T1a, T1b or T2 for re-audit, and the append-only snapshot design `S1` vs `S2`. | Blocks CR-02. |
| OD-04A (`BD-13`, `OBD-09`, `AUD-06`) | 05 | Pending | 4A (no petty-cash bypass) or 4B (with SAR caps). | Blocks CR-05. SAR caps are not in any source. |
| OD-04B (`BD-05`) | 05 | Pending | Confirm MRN authority (Engineer creates, Manager approves). | Blocks CR-05. |
| OD-05A (`BD-10`, `AUD-03`) | 10 | Pending | Approve cash-coverage formulas 1–4 and the label. | Blocks CR-10. |
| OD-05B (`BD-21`, `INV-OPA-1`) | 10 | Pending | Approve formulas 5–6, `INV-OPA-1`, and the single `OwnerBilling.amount`. | Blocks CR-10. |
| OD-05C (`BD-09`) | 10 | Pending | Confirm capital-injection classification. | Blocks CR-10. |
| NEW-OD-01 | 04, 10 | Pending | Labor sheet funding F1 or F2. | Blocks CR-04 and CR-10. |
| NEW-OD-02 | 10 | Pending | Treatment of `OTHER` deductions (A, B or C). | Blocks CR-10. |
| OD-06A (`R-01` vs `OBD-01`, `BD-14`) | 01 | Pending | Keep the Σ-lines commitment amount and the legacy cutover, or allow a Manager override. | Blocks CR-01. |
| OD-06B (`BD-18`) | 03 | Pending | 6B-1 or 6B-2. | Blocks CR-03. |
| OD-06C (`BD-03`, `BD-19`, `AUD-10`, `AUD-05-4`) | 04 | Pending | OT1/OT2; DUP1/DUP2; LAB-1/2/3. | Blocks CR-04, which is itself blocked by `NEW-OD-03`. |
| OD-06D (`BD-16`, `BD-17`) | 06, 08 | Pending | Confirm equipment scope and the milestone evidence gate. | Blocks CR-06 and CR-08. |
| OD-06E (`BD-12`, `BD-15`) | 07, 09 | Pending | VO1/VO2; BT1/BT2. | Blocks CR-07 and CR-09. |
| OD-06F (`R-02`–`R-07`, `C-07`) | all | Pending | Confirm each rule. | `R-02` is amended by OD-07A. `R-07` is amended by OD-03. |
| NEW-OD-03 | 04, 06 | **Blocked by `AGENTS.md`** | Written task-brief override of `AGENTS.md` §3 (time tracking and timesheets) and §4 (attendance and time tracking), or restrict CR-04 and CR-06 to lump-sum capture. No override exists. | CR-04 and CR-06 may not be implemented. |
| NEW-OD-04 | 08 and all attachments | Pending | Confirm JPEG, PNG, WebP and PDF, magic-byte check, 10 MB cap. | **Directly gates Slice 18 / attachment infrastructure.** |
| OD-07A (`AUD-07`, `AUD-07A-1..5`) | 03, 09 | Pending | 7A-1/2/3; 7A-C1/C2; 7A-R1/R2. | Blocks CR-03 and CR-09. |
| OD-07B (`AUD-08`, `BD-20`) | 03, 09 | Pending | 7B-1, 7B-2 or 7B-3. | Blocks CR-03 and CR-09. |
| Technical sign-off (`AUD-09`, `AUD-11`, `PROV-AUD-13..16`) | 07, 09, 06 | Pending | Approve VO line schema, lock-table additions, lineage closure list. | Blocks affected CRs. |

## C. Specification Findings

Status keys: **R** = RESOLVED BY SAFE DOCUMENTATION CORRECTION. **BO** = BLOCKED — OWNER DECISION REQUIRED. **BT** = BLOCKED — TECHNICAL SPECIFICATION GAP. **NR** = NOT REPRODUCED AGAINST CURRENT BASELINE. `A:nnn` line numbers refer to the current working copy of the addendum (re-mapped 2026-10-29 from the committed `e236aa7` numbering).

| Finding ID | Severity | Evidence (source inspection) | Required action | Owner decision required? |
|---|---|---|---|---|
| `AUD-01` Unapproved items labelled "APPROVED & LOCKED" | **Critical** (governance) | Addendum A:1–54, 869–948 labelled `BD-*`, `R-*`, `UC-2`, `UC-3` as Owner-locked. No approval record exists. | **R**: labels corrected in the addendum. Only `UC-1` is shown as Owner-approved; every other item is shown as "PROPOSED". | No. The decisions themselves remain pending. |
| `AUD-12` A:570 "Retention (proposed, BD-11)" omits the `UC-1` formula | Medium | Confirmed at A:570. | **R**: `UC-1` formula added to §6.7 and the heading qualified. | No. |
| Stale "Slice 21 has not started" and the stale addendum baseline `c9f0e28` | Low | HEAD is `e236aa7`, commit `slice-21`. | **R**: Brief wording corrected; addendum §17 notes the moved baseline. | No. |
| `SPEC-01` Slice-number collision | **High** (traceability) | The Review numbers Attachment Infrastructure "Slice 18" (Review:674, 980). The addendum renumbered it "Slice 21" (A:781, 810). The repo already has `slice-18` (navigation), `slice-19` (observability), `slice-20` (VOs) and `slice-21` (concurrency hardening). The request's "Slice 18" matches the Review, not the addendum. | **BO / BT**: the Owner must say which numbering is authoritative before any "Slice 18" authorization is meaningful. I did not choose one. | **Yes.** Which numbering applies and what the Slice 18 request refers to. |
| `AUD-02` Exposure restarts on a new revision line | **Critical** | `BudgetLine` rows belong to one `Budget` version; exposure is per line; A:439 makes lineage reporting-only. No lineage entity exists in the schema. | Cannot be fixed without choosing a model. | **BO** (OD-02A, OD-02C) |
| `AUD-05` Lineage immutability vs "amendment record" clause | Medium | Confirmed at A:461. The fix depends on Q-OD-02B. | Wait for the decision. | **BO** |
| `AUD-04` "Immutable after AUDITED" vs re-audit | **High** | Confirmed at A:182–183, 196, 579, 740. | Wait for OD-03. | **BO** |
| `AUD-03` Payables vs cash outflow; no formula for recognized project cost | **High** | A:502 and A:519–526 still define liquidity and outflow. Formulas exist only as Brief proposals. | Wait for OD-05. | **BO** |
| `AUD-07`, `AUD-07A-1..5` Custody and advance double-counting | **Critical** | A:362–373 (`R-02`), A:366 (`P(L)`). Schema has no `disbursedAmount` or advance entity; only `cashReturnedAmount` (schema:637). | Wait for OD-07A. | **BO** |
| `AUD-08` Overrun authorization has no step before issue | **High** | A:403–406 and A:545 name "exception fields" with no entity or step. | Wait for OD-07B. | **BO** |
| `AUD-06` Petty-cash exemption removed without an Owner decision | **High** | A:292 states "no petty-cash or amount threshold", whereas `OBD-09` (Review:952) proposed an exemption. | Wait for OD-04A. | **BO** |
| `AUD-09` VO line precision and `ADDITIONAL_ITEM` compatibility | **High** | `VariationOrderLine` quantities are `Decimal(15,2)` (schema:1164–1170). No `lineType` or `commitmentItemId`. | Technical design sign-off. | **BT**; also depends on `BD-12` (OD-06E). |
| `AUD-10` Worker duplicate and payroll overlap | Medium | Workers are plain text in the proposed model. Related CR-04 is scope-blocked. | Wait for OD-06C and `NEW-OD-03`. | **BO** |
| `AUD-11`, `PROV-AUD-13` Missing lock-order rows | **High** | The lock table at A:632–646 has no rows for MRN reversal, equipment timesheet, labor sheet, custody approve/issue, advance verify/reverse, payroll or expense approval, or revision approval. | Technical specification must be completed after OD-02, OD-05 and OD-07. | **BT** |
| `PROV-AUD-14`, `PROV-AUD-15` `lineageGroupId` scope and the superseded-line closure list | **High** | A:440 and A:462 vs A:552. | Depends on OD-02A. | **BO** |
| `PROV-AUD-16` Equipment timesheet has no link to commitment items | Medium | A:548–550. | Moot unless the scope override (`NEW-OD-03`) is granted. | **BO** |
| `NEW-OD-03` Time tracking and attendance vs `AGENTS.md` | **Critical** (scope) | `AGENTS.md` §3 line 87, §4 lines 116 and 120. CR-04 (A:264, 723) and CR-06 (A:550) require attendance and timesheets. No written override exists. | Do not authorize CR-04 or CR-06. | **BO** |
| Attachment infrastructure specification (A:688–728, 556) | **High** | NEW-OD-04 is unapproved. The MIME and size rules are labelled "LOCKED" without a record (now relabelled "PROPOSED"). No storage provider is chosen (A:694). Authorization of upload is defined only by role cells. | Owner confirmation, plus a storage decision. The addendum itself says no vendor is chosen. | **BO / BT** |
| Decimal precision consistency | Medium | `VariationOrderLine` and `Custody` use `Decimal(15,2)` (compliant with `AGENTS.md` §13). Quantity precision for VOs and BOQ is not specified in the current schema. | Part of `AUD-09`. | **BT** |
| Evidence-at-submit table (A:720–731) | Low | Not contradicted by `AGENTS.md`; some rows depend on scope-blocked CR-04 and CR-06. | None now. | No. |
| Retention terms: A:182 "returns through the existing `REJECTED` path" | **High** | Same as `AUD-04`. | Wait for OD-03. | **BO** |
| `UC-1` wording | n/a | Consistent everywhere after the §6.7 correction. Rounding is explicit, `Decimal`, half-up, 2 dp, before the cap. | None. | No. |
| Any finding claimed as a runtime defect | n/a | None was reproduced. No test was executed. Concurrency tests exist in `tests/integration/*concurrency*` but were not run. | None. | No. |

## D. Readiness Verdict

**NOT READY — CRITICAL/HIGH CONFLICTS REMAIN**

Reasons:
- Critical and high conflicts remain open: `AUD-02`, `AUD-07`, `AUD-04`, `AUD-03`, `AUD-08`, `AUD-09`, `AUD-11`, `SPEC-01`.
- Roughly 25 Owner decisions are unrecorded. Only `UC-1` is approved.
- `NEW-OD-03` blocks CR-04 and CR-06 on a scope conflict with `AGENTS.md`.
- The attachment specification itself depends on unapproved `NEW-OD-04`, no storage provider, and an unresolved slice-number collision.

The project may **not** request authorization for Slice 18 (Attachment Infrastructure) yet. Slice 18 was not started. No follow-on prompt was created.

## E. Verification of this change set

- Only the three documentation files above changed. No `AGENTS.md`, code, Prisma, migration, test or config change.
- `git status` at the start showed no untracked or modified files, so no user work could be touched.
- The addendum text was rewritten with scripted replacements; the diff was reviewed for status labels only. The line endings of the addendum are LF in the working copy (git warns it will normalize to CRLF).
- `A:nnn` line references in the Brief and this report were re-mapped on 2026-10-29 to the current working copy (see the supplemental report for the method).
- Code tests were not run. No code changed.


---

# Supplemental Report — Targeted Verification (2026-10-29)

Scope: F1–F6 revalidation, documentation diff integrity, line references, slice identity. This is **not** a completion of the full CR-01–CR-10 review.

## S1. F1–F6 revalidation against `slice-21` @ `e236aa7`

Method: **static inspection** unless stated. The only tests run were 3 unit files via `npx.cmd vitest run`: `variation-order-calculations`, `budget-calculations` and `canonical-budget-exposure-d1`. All 30 tests passed. They exercise the pure helpers only and do **not** prove any F-finding. No integration or concurrency test was run. The database-backed suites were not run.

Addendum rows: `A:35`–`A:40` (Findings table).

| ID | Invariant / defect assessed | Current evidence | Result |
|---|---|---|---|
| **F1** | `approveExpense` is the only point where expense spend becomes "actual". There is no payment or disbursement subsystem. `issueCustody` is the only real cash-release step. | Schema models are `User, Credential, AuditLog, Project, Budget, BudgetLine, Expense, Commitment, Custody, SubcontractorBilling, PayrollEntry, ProgressReport, ProjectAssignment, ProjectMilestone, VariationOrder, VariationOrderLine` plus auth tables (`schema.prisma:149–1239`). There is no payment model. Exposure counts `APPROVED` expenses (`lib/budget/calculations.ts:12–13, 82–86`). `issueCustody` is Accountant-only (`issue-custody.ts:57`) and sets `ISSUED` (`:88`). `record-cash-return.ts` only records money coming back (`:55, :133`). | **CONFIRMED** (static). Nuance: `approvePayroll` is a second path where an amount becomes approved exposure (`approve-payroll.ts:274–297`). It is data capture, not payment, so the cash conclusion stands. |
| **F2** | Billing approval checks `Commitment.amount` only. The effective-ceiling helpers are defined but unused. `approveVariationOrder` locks `budget_lines → commitments → variation_orders`. | `calculateRevisedBudgetLineCeiling` and `calculateEffectiveCommitmentCeiling` are defined at `lib/variation-orders/calculations.ts:169, 190`. They are only re-exported (`lib/variation-orders/index.ts:22–23`) and unit-tested (`tests/unit/lib/variation-order-calculations.test.ts`). No other `lib/` caller exists. Billing approval passes `lockedCommitment.amount` to `checkBillingCeiling` (`approve-billing.ts:271–275`), so approved VOs do not raise the billing ceiling. VO approval locks the three tables in that order (`approve-variation-order.ts:121, 134, 147`). | **CONFIRMED** (static), with one correction: VO approval does its own **inline** ceiling arithmetic for negative VOs (`approve-variation-order.ts:262, 274, 294, 341`) instead of calling the helpers. "Nothing uses the helpers" is true. "VO ceiling logic is absent" would be false. The 30 unit tests ran and passed for the helpers. |
| **F3** | `Commitment` has a single `amount` and no lines. `Expense` has no `commitmentId`. | `Commitment` has a single `amount Decimal(15,2)` (`schema.prisma:551`) and relations only to billings and VOs (`:536–606`). `Expense` (`:471–`) links to project, budget line, users and `custodyId` (`:509`) only. `commitmentId` appears in the schema only on `SubcontractorBilling` (`:723`) and `VariationOrder` (`:1085`). | **CONFIRMED** (static). |
| **F4** | The over-budget check runs at `approveCommitment`, `approveExpense` and `issueCustody`. In `issueCustody` the actor is the Accountant. | `approve-commitment.ts:286`; `approve-expense.ts:339`; `issue-custody.ts:276` (all use `isBudgetLineOverCeiling`). `issueCustody` actor: `requireRole(Role.ACCOUNTANT)` (`:57`). `approve-commitment` and `approve-expense` are Manager-only. | **PARTLY CORRECTED** (static). The statement is true but **incomplete**. Two more ceiling checks exist: `approvePayroll` (`approve-payroll.ts:285–297`, `BUDGET_LINE_EXCEEDED`, Manager-only) and `approveCustody` (`approve-custody.ts:211–218`, which only compares the custody amount to the line total, not to exposure). The soft-limit design must therefore cover payroll as well. The addendum finding is **not edited**, because the right wording depends on CR-09 soft-limit decisions. |
| **F5** | Milestones are Manager-managed. Progress reports are approved by the Manager. | Every milestone use case calls `requireManager()` (`lib/milestones/use-cases/*.ts`, e.g. `complete-milestone.ts:29`). `approve-progress-report.ts:32` and `reject-progress-report.ts:39` use `requireManager()`. `cancel-progress-report.ts:42` uses `requireAuth()` only. | **CONFIRMED** (static). The cancel path is a separate authorization question, outside F5. |
| **F6** | Approved equipment timesheets must not add budget exposure (a prior draft said they did), because that would double-count the commitment. | The statement is about **proposed** design, since neither `EquipmentTimesheet` nor `Equipment` exists in the schema or `lib/` (zero hits). The current addendum text is consistent: "approved timesheets do **not** add exposure" (A:320) and "timesheets and MRNs add none" (A:589). The existing exposure function has no timesheet input (`calculations.ts:48–59`). | **CONFIRMED as a design-consistency claim only.** It **cannot be established as repository behavior** (nothing is implemented). It is also subject to scope blocker `NEW-OD-03`. |

### Items that remain unverified
- Runtime behavior under concurrency (`tests/integration/*concurrency*`) was not executed.
- Whether the full integration and unit suites pass at HEAD was not established.
- All other findings in the first report (`AUD-02` to `AUD-12`, `PROV-AUD-*`, `NEW-OD-*`) were confirmed against the documents and, where stated, the schema. They were **not** re-verified here.

## S2. Documentation diff integrity

- `git status --short` shows exactly `M` for the addendum and the Brief, and `??` for this report. No other file is changed. No file was staged, committed, reset or reverted.
- `git diff --stat`, current: addendum `174` lines changed (89 insertions, 85 deletions); Brief `142` lines changed (this includes re-mapped `A:nnn` references). The report is untracked, so it is not in the diff.
- `git diff --check`: no whitespace errors (exit 0). Git prints only the autocrlf advisory warning.
- `git diff -w --stat` and `git diff --ignore-cr-at-eol --stat` give the **same numbers** as the plain diff.
- LF/CRLF: `core.autocrlf=true`. `git ls-files --eol` shows `i/lf w/lf` for both files (index and working copy both LF). The addendum was LF before my edits (checked before writing). The conversion warning is advisory and **caused no whole-file churn**. The diff lines are real content changes (labels, status text, the `UC-1` formula, reference notes).
- The Brief's churn (142 lines) comes from the re-mapped line references, a mechanical rewrite of `A:nnn` numbers and `#L` anchors only.

## S3. Line-reference fixes

- I mapped every old addendum line number to the current working copy by parsing `git diff -U0` hunks for the addendum, then rewrote `A:nnn` references (130 in the Brief, 26 in this report), `A lines …` lists and `…ADDENDUM….md#L` anchors. Where a line was reworded, the reference points to the reworded line.
- Spot checks after the rewrite: lineage amendment clause now A:461 (was 458); petty-cash sentence A:292 (was 289); retention invariant heading A:570 (was 567); "retention figures immutable after AUDITED" A:183 (was 180); attachment slice in the dependency graph A:781 (was 777).
- Schema line references, `R:nnn` (Review) references and `AGENTS.md` references are unchanged because those files are unchanged.
- Limitation: if the addendum is edited again, line numbers shift again. Prefer quoting the text or the section heading.

## S4. Slice identity

| Kind | Examples | Meaning |
|---|---|---|
| **Logical roadmap identifier** | "Slice 18" (`CR_Impact_Architecture_Review.md:674, 980`), "Slice 21" (addendum dependency graph and Wave 0 table) | A planned unit of CR work. The two documents number it differently. |
| **Git branch / commit label** | branch `slice-21`; commits `2c12ec8 feat(slice-18)` (navigation), `1b83576 feat(slice-19)` (observability), `c9f0e28 feat(slice-20)` (VOs), `e236aa7 feat(slice-21)` (concurrency hardening) | Historical labels of work already delivered. |

- **Proposed canonical work identity: `Attachment Infrastructure — Wave 0`.** It is recorded in the addendum §17 item 2 as *proposed, pending Owner confirmation*.
- No historical slice was renumbered and no branch or commit was changed.
- Owner confirmation still required before any implementation authorization: (1) that `Attachment Infrastructure — Wave 0` is the canonical identity and that the authorization refers to it, not to a numeric slice label; (2) the branch name and baseline commit the work starts from; (3) `NEW-OD-04` (file types and size cap) and a storage provider decision; (4) an explicit written authorization naming the scope.

## S5. Remaining limitations and Owner decisions

- Owner decisions in section B of the first report remain pending, apart from `UC-1`. Nothing new was approved.
- Critical/high findings from the first report (`AUD-02`, `AUD-03`, `AUD-04`, `AUD-07`, `AUD-08`, `AUD-09`, `AUD-11`, `SPEC-01`) are not resolved by this targeted check.
- F4 shows the soft-limit design must also cover payroll approval. This adds to, but does not change, the CR-09 decision set.

## S6. Verdict

**NOT READY — CRITICAL/HIGH CONFLICTS REMAIN** (unchanged). F1–F6 hold, with two corrections (F2: inline VO ceiling arithmetic exists; F4: payroll and custody-approval checks are missing from the list). The first report's full review is **not** complete: runtime behavior and the remaining findings were not re-verified. Slice 18 / `Attachment Infrastructure — Wave 0` was not started.
