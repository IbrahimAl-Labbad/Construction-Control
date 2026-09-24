/**
 * tests/e2e/subcontractor-billings.spec.ts
 *
 * Playwright E2E tests for Phase 11 — Subcontractor Billings Workflow:
 *
 * FLOW 1 — HAPPY PATH:
 *   Accountant logs in -> navigates to /subcontractor-billings -> creates new billing ->
 *   selects approved Commitment -> verifies subcontractorName derived from commitment.vendorName ->
 *   enters referenceNumber, billingPeriod, claimDate, grossAmount, description -> saves draft ->
 *   verifies DRAFT state -> edits draft -> submits (SUBMITTED) ->
 *   Manager logs in -> opens submitted billing -> approves (APPROVED) ->
 *   verifies approved actor, approved timestamp, cumulative certified updated, remaining commitment decreased.
 *
 * FLOW 2 — REJECT + REOPEN:
 *   Accountant creates and submits -> Manager rejects with Arabic reason -> verifies REJECTED status + reason ->
 *   Accountant opens -> reopens -> verifies DRAFT status + rejection metadata cleared ->
 *   edits gross amount -> resubmits -> Manager approves -> verifies APPROVED.
 *
 * FLOW 3 — COMMITMENT CEILING:
 *   Commitment with known ceiling -> billing whose approval exceeds remaining balance ->
 *   Manager attempts approval -> approval fails visibly with COMMITMENT_CEILING_EXCEEDED error ->
 *   billing remains SUBMITTED -> no false APPROVED state -> certified total unchanged.
 *
 * FLOW 4 — APPROVED IMMUTABILITY:
 *   Approved billing in UI -> no edit/cancel/delete action -> fields read-only ->
 *   direct navigation to /subcontractor-billings/[id]/edit does not provide editable form.
 *
 * FLOW 5 — NO DOUBLE COUNTING:
 *   BudgetLine = 1,000,000; Approved Commitment = 600,000; Approved Expense = 80,000; Approved Billing = 200,000.
 *   Open project commitments view -> Total Active Exposure = 680,000 NOT 880,000.
 *   Open billing view -> Cumulative Certified = 200,000, Remaining Commitment = 400,000.
 *   UI clearly distinguishes BudgetLine Active Exposure from Commitment Certified Progress.
 *
 * FLOW 6 — CANCELLATION:
 *   Accountant creates & submits -> Manager cancels with reason ->
 *   status = CANCELLED -> no approve/reject/edit/delete/transition actions ->
 *   direct edit navigation rejected.
 *
 * ROLE COVERAGE:
 *   ACCOUNTANT, MANAGER, ENGINEER, PURCHASING UI behavior and access restrictions.
 *
 * RTL / PRESENTATION:
 *   RTL layout, Arabic labels, status badges (مسودة، قيد الاعتماد، معتمد، مرفوض، ملغى), 2 decimal places.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  Prisma,
  Role,
  ProjectStatus,
  BudgetStatus,
  CommitmentStatus,
  ExpenseStatus,
  SubcontractorBillingStatus,
} from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

// ---------------------------------------------------------------------------
// Credentials from Environment
// ---------------------------------------------------------------------------
const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? 'accountant@test.local';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const PURCHASING_EMAIL = process.env['E2E_PURCHASING_EMAIL'] ?? 'purchasing@test.local';
const PURCHASING_PASSWORD = process.env['E2E_PURCHASING_PASSWORD'] ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats numbers using identical ar-SA locale formatting as the UI application */
function formatMoney(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Resolves the primary detail-header status badge (avoids matching table history badges) */
function getDetailStatusBadge(page: Page): Locator {
  return page.getByTestId('billing-status-badge').first();
}

/** Helper to wait for detail page after creating draft */
async function waitForDetailPage(page: Page): Promise<string> {
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith('/subcontractor-billings/') &&
      !url.pathname.endsWith('/new') &&
      !url.pathname.endsWith('/edit'),
    { timeout: 15000 },
  );
  return page.url().split('/').pop()!;
}

/** Standard login helper */
async function loginAs(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/البريد الإلكتروني|email/i).fill(email);
  await page.getByLabel(/كلمة المرور|password/i).fill(pass);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
test.describe('Subcontractor Billings E2E Suite', () => {
  test.setTimeout(90000);

  const cleanupProjectIds: string[] = [];
  const cleanupBudgetIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async () => {
    // Teardown created DB test records in strict foreign key order
    for (const projectId of cleanupProjectIds) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: 'SUBCONTRACTOR_BILLING' },
            { entityType: 'COMMITMENT' },
            { entityType: 'EXPENSE' },
            { entityType: 'BUDGET' },
            { entityType: 'PROJECT', entityId: projectId },
          ],
        },
      });
      await prisma.subcontractorBilling.deleteMany({ where: { projectId } });
      await prisma.expense.deleteMany({ where: { projectId } });
      await prisma.commitment.deleteMany({ where: { projectId } });
      await prisma.budgetLine.deleteMany({
        where: { budget: { projectId } },
      });
      await prisma.budget.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    cleanupProjectIds.length = 0;
    cleanupBudgetIds.length = 0;
  });

  /**
   * Helper to seed an active project with an approved budget and an approved commitment.
   */
  async function seedTestProjectWithCommitment(options?: {
    budgetLineAmount?: number;
    commitmentAmount?: number;
    vendorName?: string;
  }) {
    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `PRJ-SUB-${randomSuffix}`;
    const projectName = `مشروع مقاولي باطن ${randomSuffix}`;

    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL, isActive: true },
      select: { id: true, name: true },
    });

    const purchasingUser = await prisma.user.findFirstOrThrow({
      where: { email: PURCHASING_EMAIL, isActive: true },
      select: { id: true, name: true },
    });

    const project = await prisma.project.create({
      data: {
        code: testCode,
        name: projectName,
        managerId: managerUser.id,
        status: ProjectStatus.ACTIVE,
      },
    });
    cleanupProjectIds.push(project.id);

    const bAmount = options?.budgetLineAmount ?? 200000.0;
    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: bAmount,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'SUBCONTRACTOR',
              description: 'أعمال مقاولات باطن إنشائية',
              amount: bAmount,
            },
          ],
        },
      },
      include: { lines: true },
    });
    cleanupBudgetIds.push(budget.id);

    const targetLine = budget.lines[0]!;
    const cAmount = options?.commitmentAmount ?? 100000.0;
    const vendorName = options?.vendorName ?? `شركة الإنشاءات الحديثة ${randomSuffix}`;

    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        vendorName,
        referenceNumber: `COMM-${randomSuffix}`,
        amount: new Prisma.Decimal(cAmount.toFixed(2)),
        currency: 'SAR',
        description: 'عقد مقاولة باطن لتنفيذ الهيكل الإنشائي',
        commitmentDate: new Date(),
        status: CommitmentStatus.APPROVED,
        createdById: purchasingUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    return { project, budget, targetLine, commitment, managerUser };
  }

  // =========================================================================
  // FLOW 1 — HAPPY PATH
  // =========================================================================
  test('FLOW 1: Happy Path — Accountant creates, edits draft, submits; Manager approves and updates commitment balance', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, commitment, managerUser } = await seedTestProjectWithCommitment({
      budgetLineAmount: 250000.0,
      commitmentAmount: 100000.0,
      vendorName: 'شركة الإتقان لمقاولات الباطن',
    });

    const refNumber = `SUB-HP-${Math.floor(Math.random() * 89999 + 10000)}`;

    // 1. Login as ACCOUNTANT
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

    // 2. Open /subcontractor-billings
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');

    // 3. Create a new billing
    await page.getByTestId('create-billing-button').click();
    await page.waitForURL('**/subcontractor-billings/new');

    // 4. Select project & approved Commitment
    await page.getByTestId('billing-project-select').selectOption(project.id);
    await page.getByTestId('billing-commitment-select').selectOption(commitment.id);

    // 5. Verify subcontractorName is derived from Commitment.vendorName
    await expect(page.getByTestId('billing-subcontractor-name-display')).toHaveValue(
      commitment.vendorName,
    );
    await expect(page.getByTestId('billing-subcontractor-name-display')).toHaveAttribute(
      'readonly',
      '',
    );

    // 6. Enter billing details
    await page.getByTestId('billing-reference-number-input').fill(refNumber);
    await page.getByTestId('billing-period-input').fill('سبتمبر 2026');
    await page.getByTestId('billing-claim-date-input').fill('2026-09-15');
    await page.getByTestId('billing-gross-amount-input').fill('25000.00');
    await page.getByTestId('billing-description-input').fill('أعمال حدادة وصب قواعد المرحلة الأولى');

    // 7. Save draft
    await page.getByTestId('billing-form-save-button').click();

    // 8. Verify DRAFT state on detail page
    const billingId = await waitForDetailPage(page);

    const statusBadge = getDetailStatusBadge(page);
    await expect(statusBadge).toHaveText('مسودة');
    await expect(statusBadge).toHaveAttribute('data-status', 'DRAFT');

    // 9. Edit the draft
    await page.getByTestId('detail-edit-button').click();
    await page.waitForURL(`**/subcontractor-billings/${billingId}/edit`);

    // Update gross amount to 30000.00
    await page.getByTestId('billing-gross-amount-input').fill('30000.00');
    await page.getByTestId('billing-description-input').fill('أعمال حدادة وصب قواعد وأعمدة المرحلة الأولى');
    await page.getByTestId('billing-form-save-button').click();

    await page.waitForURL((url) => !url.pathname.endsWith('/edit'));
    await expect(page.getByText(formatMoney(30000)).first()).toBeVisible();

    // 10. Submit
    await page.getByTestId('detail-submit-button').click();

    // 11. Verify SUBMITTED state
    await expect(statusBadge).toHaveText('قيد الاعتماد');
    await expect(statusBadge).toHaveAttribute('data-status', 'SUBMITTED');

    // 12. Switch: Login as MANAGER
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // 13. Open submitted billing
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');

    // 14. Approve it
    await page.getByTestId('detail-approve-button').click();

    // 15. Verify APPROVED state
    await expect(statusBadge).toHaveText('معتمد', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'APPROVED');

    // 16. Verify audit metadata & commitment balance updates
    // Approved actor & timestamp shown
    await expect(page.getByText('اعتُمد بواسطة')).toBeVisible();
    await expect(page.getByText(managerUser.name)).toBeVisible();

    // Cumulative certified updated to 30,000.00 and remaining commitment balance decreased to 70,000.00
    const commitmentSummarySection = page.locator('section[aria-label*="ملخص مستخلصات الالتزام"]');
    await expect(commitmentSummarySection).toBeVisible();
    await expect(commitmentSummarySection.getByText(formatMoney(30000)).first()).toBeVisible();
    await expect(commitmentSummarySection.getByText(formatMoney(70000)).first()).toBeVisible();
  });

  // =========================================================================
  // FLOW 2 — REJECT + REOPEN
  // =========================================================================
  test('FLOW 2: Reject + Reopen — Manager rejects with reason, Accountant reopens, edits gross amount, and resubmits for approval', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, commitment } = await seedTestProjectWithCommitment({
      budgetLineAmount: 200000.0,
      commitmentAmount: 80000.0,
    });

    const refNumber = `SUB-REJ-${Math.floor(Math.random() * 89999 + 10000)}`;

    // 1. Accountant creates and submits billing
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/subcontractor-billings/new');
    await page.getByTestId('billing-project-select').selectOption(project.id);
    await page.getByTestId('billing-commitment-select').selectOption(commitment.id);
    await page.getByTestId('billing-reference-number-input').fill(refNumber);
    await page.getByTestId('billing-period-input').fill('أكتوبر 2026');
    await page.getByTestId('billing-claim-date-input').fill('2026-09-18');
    await page.getByTestId('billing-gross-amount-input').fill('40000.00');
    await page.getByTestId('billing-description-input').fill('مستخلص أعمال تركيب هياكل معدنية');
    await page.getByTestId('billing-form-save-button').click();

    const billingId = await waitForDetailPage(page);

    const statusBadge = getDetailStatusBadge(page);
    await page.getByTestId('detail-submit-button').click();
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // 2. Manager opens billing
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');

    // 3. Manager rejects with valid Arabic rejection reason
    await page.getByTestId('detail-reject-button').click();
    const rejectModal = page.getByTestId('detail-reject-modal');
    await expect(rejectModal).toBeVisible();

    const arabicRejectionReason = 'المبلغ المطلوب لا يتطابق مع تقرير الإنجاز الميداني، يرجى التخفيض إلى 25000 ر.س';
    await page.getByTestId('detail-rejection-reason-input').fill(arabicRejectionReason);
    await page.getByTestId('detail-rejection-confirm').click();

    // 4. Verify REJECTED status and visible reason
    await expect(statusBadge).toHaveText('مرفوض', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'REJECTED');
    await expect(page.getByText(arabicRejectionReason)).toBeVisible();

    // 5. Accountant opens the rejected billing
    await page.context().clearCookies();
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');

    // 6. Reopen it
    await page.getByTestId('detail-reopen-button').click();

    // 7. Verify DRAFT status
    await expect(statusBadge).toHaveText('مسودة', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'DRAFT');

    // 8. Verify rejection metadata is cleared
    await expect(page.getByRole('heading', { name: 'سبب الرفض' })).not.toBeVisible();

    // 9. Edit gross amount
    await page.getByTestId('detail-edit-button').click();
    await page.waitForURL(`**/subcontractor-billings/${billingId}/edit`);
    await page.getByTestId('billing-gross-amount-input').fill('25000.00');
    await page.getByTestId('billing-form-save-button').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/edit'));
    await expect(page.getByText(formatMoney(25000)).first()).toBeVisible();

    // 10. Resubmit
    await page.getByTestId('detail-submit-button').click();
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // 11. Manager approves
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('detail-approve-button').click();

    // 12. Verify APPROVED
    await expect(statusBadge).toHaveText('معتمد', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'APPROVED');
  });

  // =========================================================================
  // FLOW 3 — COMMITMENT CEILING
  // =========================================================================
  test('FLOW 3: Commitment Ceiling — Manager approval fails visibly with COMMITMENT_CEILING_EXCEEDED error and remains SUBMITTED', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    // Prepare Commitment with ceiling = 50,000.00 SAR
    const { project, commitment } = await seedTestProjectWithCommitment({
      budgetLineAmount: 150000.0,
      commitmentAmount: 50000.0,
    });

    const refNumber = `SUB-CEIL-${Math.floor(Math.random() * 89999 + 10000)}`;

    // Accountant creates billing of 60,000.00 SAR (exceeds commitment ceiling of 50,000.00 SAR)
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/subcontractor-billings/new');
    await page.getByTestId('billing-project-select').selectOption(project.id);
    await page.getByTestId('billing-commitment-select').selectOption(commitment.id);
    await page.getByTestId('billing-reference-number-input').fill(refNumber);
    await page.getByTestId('billing-period-input').fill('نوفمبر 2026');
    await page.getByTestId('billing-claim-date-input').fill('2026-09-19');
    await page.getByTestId('billing-gross-amount-input').fill('60000.00');
    await page.getByTestId('billing-description-input').fill('مستخلص يتجاوز سقف الالتزام التعاقدي');
    await page.getByTestId('billing-form-save-button').click();

    const billingId = await waitForDetailPage(page);

    const statusBadge = getDetailStatusBadge(page);

    // Submit it
    await page.getByTestId('detail-submit-button').click();
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // Manager attempts approval
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('detail-approve-button').click();

    // Expected:
    // - approval fails visibly
    // - application error surfaces ceiling breach
    const ceilingError = page.getByText(/يتجاوز الرصيد المتبقي للالتزام/);
    await expect(ceilingError).toBeVisible({ timeout: 10000 });

    // - billing remains SUBMITTED
    // - no false APPROVED state is displayed
    await expect(statusBadge).toHaveText('قيد الاعتماد');
    await expect(statusBadge).toHaveAttribute('data-status', 'SUBMITTED');

    // - commitment certified total remains unchanged (0.00)
    const commitmentSummarySection = page.locator('section[aria-label*="ملخص مستخلصات الالتزام"]');
    await expect(commitmentSummarySection.getByText(formatMoney(0)).first()).toBeVisible();
  });

  // =========================================================================
  // FLOW 4 — APPROVED IMMUTABILITY
  // =========================================================================
  test('FLOW 4: Approved Immutability — Approved billing cannot be edited, cancelled, or deleted in UI and direct edit URL is blocked', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project, targetLine, commitment, managerUser } = await seedTestProjectWithCommitment({
      budgetLineAmount: 200000.0,
      commitmentAmount: 100000.0,
    });

    const accountantUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.ACCOUNTANT, isActive: true },
      select: { id: true },
    });

    // Seed an already APPROVED billing
    const approvedBilling = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        referenceNumber: `SUB-IMMUT-${Math.floor(Math.random() * 89999 + 10000)}`,
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('45000.00'),
        currency: 'SAR',
        description: 'مستخلص معتمد لا يقبل التعديل',
        status: SubcontractorBillingStatus.APPROVED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto(`/subcontractor-billings/${approvedBilling.id}`);
    await page.waitForLoadState('networkidle');

    // Verify in UI:
    // - no edit action
    await expect(page.getByTestId('detail-edit-button')).not.toBeVisible();
    // - no cancel action
    await expect(page.getByTestId('detail-cancel-button')).not.toBeVisible();
    // - no delete action
    await expect(page.getByTestId('detail-delete-button')).not.toBeVisible();
    // - fields are read-only / terminal notice visible
    await expect(page.getByText(/المستخلص معتمد — للعرض فقط/i)).toBeVisible();

    // Direct navigation to /subcontractor-billings/[id]/edit must NOT provide an editable form
    await page.goto(`/subcontractor-billings/${approvedBilling.id}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /لا يمكن تعديل هذا المستخلص/i })).toBeVisible();
    await expect(page.getByText(/التعديل متاح فقط للمستخلصات في حالة مسودة/i)).toBeVisible();
    await expect(page.getByTestId('billing-form-save-button')).not.toBeVisible();
  });

  // =========================================================================
  // FLOW 5 — NO DOUBLE COUNTING
  // =========================================================================
  test('FLOW 5: No Double Counting — BudgetLine Active Exposure remains 680,000 (NOT 880,000) while Certified Billing is 200,000', async ({
    page,
  }) => {
    test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials required');

    // Scenario:
    // BudgetLine = 1,000,000
    // Approved Commitment = 600,000
    // Approved Expense = 80,000
    // Approved Billing = 200,000
    const { project, targetLine, commitment, managerUser } = await seedTestProjectWithCommitment({
      budgetLineAmount: 1000000.0,
      commitmentAmount: 600000.0,
      vendorName: 'مجموعة التشييد المتطورة',
    });

    const accountantUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.ACCOUNTANT, isActive: true },
      select: { id: true },
    });

    const engineerUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.ENGINEER, isActive: true },
      select: { id: true },
    });

    // Seed approved expense = 80,000.00
    await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        amount: new Prisma.Decimal('80000.00'),
        currency: 'SAR',
        description: 'مصروف نقدي معتمد للمشروع',
        expenseDate: new Date(),
        status: ExpenseStatus.APPROVED,
        submittedById: engineerUser.id,
        submittedAt: new Date(),
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Seed approved billing = 200,000.00
    const billing = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        referenceNumber: `SUB-DBL-${Math.floor(Math.random() * 89999 + 10000)}`,
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('200000.00'),
        currency: 'SAR',
        description: 'مستخلص الأعمال المنجزة — لا يُنشئ تعرضاً إضافياً',
        status: SubcontractorBillingStatus.APPROVED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // 1. Manager opens the project commitments & financial exposure view
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/projects/${project.id}/commitments`);
    await page.waitForLoadState('networkidle');

    // Verify:
    // Total Active Exposure = 680,000 (NOT 880,000)
    const exposureCard = page.getByTestId('total-exposure');
    await expect(exposureCard).toContainText('680000.00');
    await expect(exposureCard).not.toContainText('880000');

    // Verify breakdown description confirms: ApprovedExpenses (80,000) + Commitments (600,000)
    await expect(page.getByText(/منفق فعلي:\s*80000\.00.*ارتباطات:\s*600000\.00/i)).toBeVisible();

    // 2. Independently verify Subcontractor Billing Detail view
    await page.goto(`/subcontractor-billings/${billing.id}`);
    await page.waitForLoadState('networkidle');

    // Cumulative Certified Billing = 200,000.00
    // Remaining Commitment = 400,000.00
    const summarySection = page.locator('section[aria-label*="ملخص مستخلصات الالتزام"]');
    await expect(summarySection).toBeVisible();
    await expect(summarySection.getByText(formatMoney(200000)).first()).toBeVisible();
    await expect(summarySection.getByText(formatMoney(400000)).first()).toBeVisible();

    // The UI must clearly distinguish BudgetLine Active Exposure from Commitment Certified Progress
    await expect(
      page.getByText(/إجمالي المستخلصات المعتمدة لا يُعدّ تعرضاً فعلياً على بند الموازنة/i),
    ).toBeVisible();
  });

  // =========================================================================
  // FLOW 6 — CANCELLATION
  // =========================================================================
  test('FLOW 6: Cancellation — Manager cancels submitted billing with reason; status is CANCELLED with no mutation paths', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, commitment } = await seedTestProjectWithCommitment({
      budgetLineAmount: 180000.0,
      commitmentAmount: 90000.0,
    });

    const refNumber = `SUB-CNC-${Math.floor(Math.random() * 89999 + 10000)}`;

    // Accountant creates and submits billing
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/subcontractor-billings/new');
    await page.getByTestId('billing-project-select').selectOption(project.id);
    await page.getByTestId('billing-commitment-select').selectOption(commitment.id);
    await page.getByTestId('billing-reference-number-input').fill(refNumber);
    await page.getByTestId('billing-period-input').fill('سبتمبر 2026');
    await page.getByTestId('billing-claim-date-input').fill('2026-09-17');
    await page.getByTestId('billing-gross-amount-input').fill('35000.00');
    await page.getByTestId('billing-description-input').fill('مستخلص أعمال سيتم إلغاؤه');
    await page.getByTestId('billing-form-save-button').click();

    const billingId = await waitForDetailPage(page);

    const statusBadge = getDetailStatusBadge(page);
    await page.getByTestId('detail-submit-button').click();
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // Manager opens and cancels it
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/subcontractor-billings/${billingId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('detail-cancel-button').click();
    const cancelModal = page.getByTestId('detail-cancel-modal');
    await expect(cancelModal).toBeVisible();

    const cancellationReason = 'تم إلغاء المستخلص بناءً على اتفاق فسخ عقد مقاولة الباطن';
    await page.getByTestId('detail-cancel-reason-input').fill(cancellationReason);
    await page.getByTestId('detail-cancel-confirm').click();

    // Verify:
    // - status = CANCELLED
    await expect(statusBadge).toHaveText('ملغى', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'CANCELLED');

    // - no approve action
    await expect(page.getByTestId('detail-approve-button')).not.toBeVisible();
    // - no reject action
    await expect(page.getByTestId('detail-reject-button')).not.toBeVisible();
    // - no edit action
    await expect(page.getByTestId('detail-edit-button')).not.toBeVisible();
    // - no delete action
    await expect(page.getByTestId('detail-delete-button')).not.toBeVisible();
    // - no further transition actions / terminal notice visible
    await expect(page.getByText('المستخلص ملغى — للعرض فقط.')).toBeVisible();

    // Then verify direct navigation to edit does not expose a mutation path
    await page.goto(`/subcontractor-billings/${billingId}/edit`);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: /غير مصرح بالوصول|لا يمكن تعديل هذا المستخلص/i }),
    ).toBeVisible();
    await expect(page.getByTestId('billing-form-save-button')).not.toBeVisible();
  });

  // =========================================================================
  // ROLE COVERAGE
  // =========================================================================
  test('ROLE COVERAGE: Enforces distinct UI actions and boundaries for Accountant, Manager, Engineer, and Purchasing', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL ||
        !ACCOUNTANT_PASSWORD ||
        !MANAGER_EMAIL ||
        !MANAGER_PASSWORD ||
        !ENGINEER_EMAIL ||
        !ENGINEER_PASSWORD ||
        !PURCHASING_EMAIL ||
        !PURCHASING_PASSWORD,
      'All 4 role credentials required for role coverage test',
    );

    const { project, targetLine, commitment } = await seedTestProjectWithCommitment();

    const accountantUser = await prisma.user.findFirstOrThrow({
      where: { email: ACCOUNTANT_EMAIL, isActive: true },
      select: { id: true },
    });

    // Create a DRAFT billing owned by Accountant
    const draftBilling = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('15000.00'),
        currency: 'SAR',
        description: 'مسودة محاسب لاختبار الصلاحيات',
        status: SubcontractorBillingStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    // Create a SUBMITTED billing
    const submittedBilling = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('20000.00'),
        currency: 'SAR',
        description: 'مستخلص مرفوع لاختبار الصلاحيات',
        status: SubcontractorBillingStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    // -----------------------------------------------------------------------
    // 1. ACCOUNTANT: can create, edit own draft, submit own draft, cannot approve
    // -----------------------------------------------------------------------
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-billing-button')).toBeVisible();

    await page.goto(`/subcontractor-billings/${draftBilling.id}`);
    await expect(page.getByTestId('detail-edit-button')).toBeVisible();
    await expect(page.getByTestId('detail-submit-button')).toBeVisible();

    await page.goto(`/subcontractor-billings/${submittedBilling.id}`);
    await expect(page.getByTestId('detail-approve-button')).not.toBeVisible();

    // -----------------------------------------------------------------------
    // 2. MANAGER: can approve, reject, cancel; cannot create billing
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-billing-button')).not.toBeVisible();

    await page.goto('/subcontractor-billings/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    await page.goto(`/subcontractor-billings/${submittedBilling.id}`);
    await expect(page.getByTestId('detail-approve-button')).toBeVisible();
    await expect(page.getByTestId('detail-reject-button')).toBeVisible();
    await expect(page.getByTestId('detail-cancel-button')).toBeVisible();

    // -----------------------------------------------------------------------
    // 3. ENGINEER: can view, cannot mutate
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-billing-button')).not.toBeVisible();
    await expect(page.getByText('وضع القراءة فقط — المهندسون لا يملكون صلاحيات تعديل المستخلصات.')).toBeVisible();

    await page.goto(`/subcontractor-billings/${submittedBilling.id}`);
    await expect(page.getByTestId('detail-approve-button')).not.toBeVisible();
    await expect(page.getByTestId('detail-reject-button')).not.toBeVisible();
    await expect(page.getByTestId('detail-cancel-button')).not.toBeVisible();
    await expect(page.getByTestId('detail-edit-button')).not.toBeVisible();

    // -----------------------------------------------------------------------
    // 4. PURCHASING: blocked from accessing subcontractor billing data/actions
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();
    await expect(page.getByText(/لا تملك صلاحية عرض مستخلصات مقاولي الباطن/i)).toBeVisible();

    await page.goto(`/subcontractor-billings/${submittedBilling.id}`);
    await page.waitForLoadState('networkidle');
    // Direct detail page access for Purchasing triggers notFound (404 page)
    await expect(page.getByRole('heading', { name: /404|غير موجودة|الصفحة غير موجودة/i })).toBeVisible();
  });

  // =========================================================================
  // RTL / PRESENTATION
  // =========================================================================
  test('RTL & PRESENTATION: Validates Arabic RTL layout, status badges, and 2-decimal monetary display', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project, targetLine, commitment } = await seedTestProjectWithCommitment();

    const accountantUser = await prisma.user.findFirstOrThrow({
      where: { role: Role.ACCOUNTANT, isActive: true },
      select: { id: true },
    });

    // Create a draft billing with specific monetary value
    const billing = await prisma.subcontractorBilling.create({
      data: {
        projectId: project.id,
        budgetLineId: targetLine.id,
        commitmentId: commitment.id,
        subcontractorName: commitment.vendorName,
        referenceNumber: 'SUB-RTL-001',
        billingPeriod: 'سبتمبر 2026',
        claimDate: new Date(),
        grossAmount: new Prisma.Decimal('12345.67'),
        currency: 'SAR',
        description: 'اختبار العرض والتنسيق العربي واتجاه RTL',
        status: SubcontractorBillingStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

    // 1. Verify HTML attributes on /subcontractor-billings
    await page.goto('/subcontractor-billings');
    await page.waitForLoadState('networkidle');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');

    // 2. Verify Arabic status tab filters
    await expect(page.getByTestId('billing-filter-tab-ALL')).toHaveText('الكل');
    await expect(page.getByTestId('billing-filter-tab-DRAFT')).toHaveText('المسودات');
    await expect(page.getByTestId('billing-filter-tab-SUBMITTED')).toHaveText('قيد الاعتماد');
    await expect(page.getByTestId('billing-filter-tab-APPROVED')).toHaveText('المعتمدة');
    await expect(page.getByTestId('billing-filter-tab-REJECTED')).toHaveText('المرفوضة');
    await expect(page.getByTestId('billing-filter-tab-CANCELLED')).toHaveText('الملغاة');

    // 3. Verify detail page RTL and monetary formatting to 2 decimal places
    await page.goto(`/subcontractor-billings/${billing.id}`);
    await page.waitForLoadState('networkidle');

    // Monetary value formatted with 2 decimal places in ar-SA
    await expect(page.getByText(formatMoney(12345.67)).first()).toBeVisible();
    await expect(page.getByText('ر.س').first()).toBeVisible();

    // Status badge uses required Arabic text: "مسودة"
    const badge = getDetailStatusBadge(page);
    await expect(badge).toHaveText('مسودة');
  });
});
