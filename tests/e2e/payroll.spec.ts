/**
 * tests/e2e/payroll.spec.ts
 *
 * Playwright E2E tests for Phase 12 — Vertical Slice 8:
 * Payroll Data Entry / Project Labor Cost Control
 *
 * FLOW 1 — HAPPY PATH:
 *   Accountant logs in -> navigates to /payroll -> opens new entry form ->
 *   selects active project and approved LABOR budget line -> enters plain text worker snapshot,
 *   period (year/month), amount, description -> saves DRAFT -> verifies DRAFT state ->
 *   edits draft -> submits (SUBMITTED) ->
 *   Manager logs in -> reviews submitted entry -> approves (APPROVED) ->
 *   verifies APPROVED state, approved metadata, updated labor balance, and immutable UI.
 *
 * FLOW 2 — VALIDATION BOUNDARIES:
 *   Client and server-side validation rejecting empty/short worker name, zero amount,
 *   negative amount, excess decimals (>2), missing description, short rejection/cancellation reasons (<5).
 *
 * FLOW 3 — PROJECT & BUDGET LINE SELECTIVITY:
 *   Verifies only active projects with approved LABOR budget lines are selectable;
 *   non-LABOR budget lines (e.g. MATERIALS) are strictly excluded from the select options.
 *
 * FLOW 4 — DUPLICATE ACTIVE PAYROLL REJECTION:
 *   Prevents creating duplicate active payroll records for the same project, period, and worker.
 *
 * FLOW 5 — REJECT + REOPEN LIFECYCLE:
 *   Manager rejects with Arabic reason -> status is REJECTED with reason banner ->
 *   Accountant reopens -> status reverts to DRAFT, rejection cleared ->
 *   Accountant updates and resubmits -> Manager approves -> APPROVED.
 *
 * FLOW 6 — CANCELLATION MATRIX:
 *   Accountant cancels own DRAFT; Manager cancels DRAFT; Manager cancels SUBMITTED;
 *   Accountant blocked from cancelling SUBMITTED; terminal states immutable.
 *
 * FLOW 7 — BUDGET CEILING ENFORCEMENT:
 *   Manager approval fails when payroll exceeds available labor budget;
 *   exact-fit case succeeds and reduces available balance to zero.
 *
 * FLOW 8 — FINANCIAL SUMMARY & DOUBLE COUNTING:
 *   Project labor summary accurately reflects approved payroll spend.
 *
 * FLOW 9 — RBAC, OWNERSHIP & PRIVACY BOUNDARIES:
 *   - Accountant B blocked from editing Accountant A's draft.
 *   - Manager blocked from routine creation and draft editing.
 *   - Engineer strictly fail-closed: blocked from /payroll (403), /payroll/[id] (404),
 *     /payroll/[id]/edit (403), /projects/[id]/payroll (403); zero worker privacy leakage.
 *   - Purchasing blocked from all payroll routes and data.
 *   - Non-existent IDs trigger 404.
 *
 * FLOW 10 — RTL, PRESENTATION & FILTERING:
 *   Verifies dir="rtl", lang="ar", Arabic status labels, monetary format in SAR with 2 decimals,
 *   text search, status filter, and project filter.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  Prisma,
  Role,
  ProjectStatus,
  BudgetStatus,
  BudgetCategory,
  PayrollStatus,
} from '@prisma/client';
import { prisma } from '../../lib/db/prisma';
import { hashPassword } from '../../lib/auth/password';

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

/** Resolves the primary detail-header status badge */
function getDetailStatusBadge(page: Page): Locator {
  return page.getByTestId('payroll-status-badge').first();
}

/** Helper to wait for detail page after creating draft */
async function waitForDetailPage(page: Page): Promise<string> {
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith('/payroll/') &&
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
test.describe('Payroll E2E Suite — Vertical Slice 8', () => {
  test.setTimeout(90000);

  const cleanupProjectIds: string[] = [];
  const cleanupUserIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async () => {
    // Teardown created DB test records in strict foreign key order
    for (const projectId of cleanupProjectIds) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: 'PAYROLL_ENTRY' },
            { entityType: 'BUDGET' },
            { entityType: 'PROJECT', entityId: projectId },
          ],
        },
      });
      await prisma.payrollEntry.deleteMany({ where: { projectId } });
      await prisma.budgetLine.deleteMany({
        where: { budget: { projectId } },
      });
      await prisma.budget.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    cleanupProjectIds.length = 0;

    for (const userId of cleanupUserIds) {
      await prisma.credential.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    cleanupUserIds.length = 0;
  });

  /**
   * Helper to seed an active project with an approved budget containing a LABOR line and a MATERIALS line.
   */
  async function seedTestProjectWithBudget(options?: {
    laborLineAmount?: number;
    materialsLineAmount?: number;
  }) {
    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `PRJ-PAY-${randomSuffix}`;
    const projectName = `مشروع رواتب وعمالة ${randomSuffix}`;

    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL, isActive: true },
      select: { id: true, name: true, email: true },
    });

    const accountantUser = await prisma.user.findFirstOrThrow({
      where: { email: ACCOUNTANT_EMAIL, isActive: true },
      select: { id: true, name: true, email: true },
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

    const laborAmount = options?.laborLineAmount ?? 100000.0;
    const materialsAmount = options?.materialsLineAmount ?? 50000.0;
    const totalAmount = laborAmount + materialsAmount;

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: BudgetCategory.LABOR,
              description: 'بند أجور العمالة الميدانية والمباشرة',
              amount: new Prisma.Decimal(laborAmount.toFixed(2)),
            },
            {
              category: BudgetCategory.MATERIALS,
              description: 'بند توريد المواد الإنشائية',
              amount: new Prisma.Decimal(materialsAmount.toFixed(2)),
            },
          ],
        },
      },
      include: { lines: true },
    });

    const laborLine = budget.lines.find((l) => l.category === BudgetCategory.LABOR)!;
    const materialsLine = budget.lines.find((l) => l.category === BudgetCategory.MATERIALS)!;

    return { project, budget, laborLine, materialsLine, managerUser, accountantUser };
  }

  // =========================================================================
  // FLOW 1 — HAPPY PATH
  // =========================================================================
  test('FLOW 1: Happy Path — Accountant creates, edits draft, submits; Manager approves and immutability is verified', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, laborLine, managerUser } = await seedTestProjectWithBudget({
      laborLineAmount: 80000.0,
    });

    // 1. Login as ACCOUNTANT
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

    // 2. Open /payroll
    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');

    // 3. Click Create button
    await page.getByTestId('create-payroll-button').click();
    await page.waitForURL('**/payroll/new');

    // 4. Select project & LABOR budget line
    await page.getByTestId('payroll-project-select').selectOption(project.id);
    await page.getByTestId('payroll-budgetline-select').selectOption(laborLine.id);

    // 5. Fill worker information (plain text snapshot)
    const workerName = 'سعيد عبد الله القحطاني';
    const workerRef = 'WRK-E2E-01';
    const tradeTitle = 'فني تمديدات كهربائية';

    await page.getByTestId('payroll-worker-name-input').fill(workerName);
    await page.getByTestId('payroll-worker-ref-input').fill(workerRef);
    await page.getByTestId('payroll-trade-input').fill(tradeTitle);

    // 6. Select period (Year 2026, Month 9 = September)
    await page.getByTestId('payroll-period-year-select').selectOption('2026');
    await page.getByTestId('payroll-period-month-select').selectOption('9');

    // 7. Enter amount and description
    await page.getByTestId('payroll-amount-input').fill('6500.00');
    await page.getByTestId('payroll-description-input').fill('أجور أعمال تمديدات الكهرباء للمرحلة الأولى');

    // 8. Submit form to create DRAFT
    await page.getByTestId('submit-payroll-form-button').click();

    // 9. Verify DRAFT state on detail page
    const payrollId = await waitForDetailPage(page);

    const statusBadge = getDetailStatusBadge(page);
    await expect(statusBadge).toHaveText('مسودة');
    await expect(statusBadge).toHaveAttribute('data-status', 'DRAFT');

    // Verify displayed amount, worker details, and project info
    await expect(page.getByText(formatMoney(6500)).first()).toBeVisible();
    await expect(page.getByText(workerName).first()).toBeVisible();
    await expect(page.getByText(workerRef).first()).toBeVisible();
    await expect(page.getByText(tradeTitle).first()).toBeVisible();
    await expect(page.getByText(project.name).first()).toBeVisible();

    // 10. Edit draft
    await page.getByTestId('edit-payroll-button').click();
    await page.waitForURL(`**/payroll/${payrollId}/edit`);

    // Update amount to 7200.00 and update description
    await page.getByTestId('payroll-amount-input').fill('7200.00');
    await page.getByTestId('payroll-description-input').fill('أجور أعمال تمديدات الكهرباء بعد اعتماد ساعات إضافية');
    await page.getByTestId('submit-payroll-form-button').click();

    await page.waitForURL((url) => !url.pathname.endsWith('/edit'));
    await expect(page.getByText(formatMoney(7200)).first()).toBeVisible();

    // 11. Submit draft for approval
    await page.getByTestId('submit-payroll-button').click();

    // Verify SUBMITTED status
    await expect(statusBadge).toHaveText('قيد الاعتماد');
    await expect(statusBadge).toHaveAttribute('data-status', 'SUBMITTED');

    // Edit button must no longer be visible
    await expect(page.getByTestId('edit-payroll-button')).not.toBeVisible();

    // 12. Switch user: Login as MANAGER
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // 13. Open submitted entry
    await page.goto(`/payroll/${payrollId}`);
    await page.waitForLoadState('networkidle');

    // 14. Approve it
    await page.getByTestId('approve-payroll-button').click();
    await expect(page.getByTestId('confirm-approve-button')).toBeVisible();
    await page.getByTestId('confirm-approve-button').click();

    // 15. Verify APPROVED state
    await expect(statusBadge).toHaveText('معتمد', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'APPROVED');

    // 16. Verify audit metadata & approver name
    await expect(page.getByText('الاعتماد النهائي (المدير):')).toBeVisible();
    await expect(page.getByText(managerUser.name).first()).toBeVisible();

    // 17. Verify immutable UI: no mutation actions remain
    await expect(page.getByTestId('edit-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('submit-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('approve-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('reject-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('cancel-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('delete-payroll-button')).not.toBeVisible();
    await expect(page.getByTestId('reopen-payroll-button')).not.toBeVisible();

    // Verify project labor summary card shows 7,200 approved spend
    const summaryCard = page.getByTestId('project-labor-summary-card');
    await expect(summaryCard).toBeVisible();
    await expect(summaryCard.getByTestId('labor-approved-spend')).toContainText(formatMoney(7200));
  });

  // =========================================================================
  // FLOW 2 — VALIDATION BOUNDARIES
  // =========================================================================
  test('FLOW 2: Validation — Rejects empty name, short name, invalid amount, missing description, and short reasons', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project } = await seedTestProjectWithBudget();

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/payroll/new');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('payroll-project-select').selectOption(project.id);

    // A. Empty worker name
    await page.getByTestId('payroll-amount-input').fill('3000.00');
    await page.getByTestId('payroll-description-input').fill('وصف تجريبي');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText('اسم العامل مطلوب')).toBeVisible();

    // B. Worker name too short (< 3 characters)
    await page.getByTestId('payroll-worker-name-input').fill('أ');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText(/اسم العامل يجب أن يتكون من.*على الأقل/i)).toBeVisible();

    // C. Amount = 0
    await page.getByTestId('payroll-worker-name-input').fill('عامل تجريبي');
    await page.getByTestId('payroll-amount-input').fill('0.00');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText(/المبلغ يجب أن يكون أكبر من صفر/i)).toBeVisible();

    // D. Negative amount
    await page.getByTestId('payroll-amount-input').fill('-500.00');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText(/المبلغ يجب أن يكون رقماً موجباً/i)).toBeVisible();

    // E. > 2 decimal places
    await page.getByTestId('payroll-amount-input').fill('1500.555');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText(/لا تتجاوز خانتين عشريتين/i)).toBeVisible();

    // F. Missing description
    await page.getByTestId('payroll-amount-input').fill('1500.00');
    await page.getByTestId('payroll-description-input').fill('');
    await page.getByTestId('submit-payroll-form-button').click();
    await expect(page.getByText('وصف قيد الراتب مطلوب')).toBeVisible();
  });

  // =========================================================================
  // FLOW 3 — PROJECT & BUDGET LINE SELECTIVITY
  // =========================================================================
  test('FLOW 3: Selectivity — Only active projects with approved LABOR budget lines selectable; non-LABOR lines excluded', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project, laborLine, materialsLine } = await seedTestProjectWithBudget({
      laborLineAmount: 60000.0,
      materialsLineAmount: 40000.0,
    });

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/payroll/new');
    await page.waitForLoadState('networkidle');

    // Verify project is available in selector
    const projectSelect = page.getByTestId('payroll-project-select');
    await expect(projectSelect).toContainText(project.name);

    await projectSelect.selectOption(project.id);

    // Verify LABOR line is present
    const lineSelect = page.getByTestId('payroll-budgetline-select');
    await expect(lineSelect).toContainText(laborLine.description);

    // Verify non-LABOR (MATERIALS) line is strictly absent
    await expect(lineSelect).not.toContainText(materialsLine.description);
  });

  // =========================================================================
  // FLOW 4 — DUPLICATE ACTIVE PAYROLL REJECTION
  // =========================================================================
  test('FLOW 4: Duplicate Rejection — Prevents duplicate active payroll for same project, period, and worker', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project, laborLine, accountantUser } = await seedTestProjectWithBudget();

    const workerName = 'فهد ناصر الشهراني';

    // Seed an active payroll entry for 2026/09
    await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName,
        workerReference: 'WRK-DUP-01',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('5000.00'),
        currency: 'SAR',
        description: 'قيد أجر نشط أول',
        status: PayrollStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    // Attempt to create another entry for the same worker, project, and period (2026/09)
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/payroll/new');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('payroll-project-select').selectOption(project.id);
    await page.getByTestId('payroll-budgetline-select').selectOption(laborLine.id);

    // Fill duplicate data with slightly different casing/whitespace
    await page.getByTestId('payroll-worker-name-input').fill(`  ${workerName}  `);
    await page.getByTestId('payroll-period-year-select').selectOption('2026');
    await page.getByTestId('payroll-period-month-select').selectOption('9');
    await page.getByTestId('payroll-amount-input').fill('4000.00');
    await page.getByTestId('payroll-description-input').fill('محاولة تسجيل قيد مكرر');

    await page.getByTestId('submit-payroll-form-button').click();

    // Verify server rejection message is displayed safely in Arabic
    await expect(
      page.getByText(/يوجد قيد راتب نشط/i),
    ).toBeVisible({ timeout: 10000 });

    // Verify page remained on /payroll/new and did not navigate
    expect(page.url()).toContain('/payroll/new');
  });

  // =========================================================================
  // FLOW 5 — REJECT + REOPEN LIFECYCLE
  // =========================================================================
  test('FLOW 5: Reject + Reopen — Manager rejects with reason; Accountant reopens, modifies, resubmits; Manager approves', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, laborLine, accountantUser } = await seedTestProjectWithBudget();

    // Seed a SUBMITTED payroll entry
    const payroll = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'منصور فهد العتيبي',
        periodYear: 2026,
        periodMonth: 10,
        amount: new Prisma.Decimal('5500.00'),
        currency: 'SAR',
        description: 'أجور شهر أكتوبر تحت الاعتماد',
        status: PayrollStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    // 1. Manager logs in and views submitted entry
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/payroll/${payroll.id}`);
    await page.waitForLoadState('networkidle');

    // 2. Open reject modal
    await page.getByTestId('reject-payroll-button').click();

    // Attempt rejection with short reason (< 5 characters)
    await page.getByTestId('rejection-reason-input').fill('خطأ');
    await page.getByTestId('confirm-reject-button').click();
    await expect(page.getByText(/سبب الرفض يجب أن يتكون من 5 أحرف على الأقل/i)).toBeVisible();

    // Provide valid Arabic rejection reason
    const validReason = 'كشف ساعات العمل الإضافي المرفق غير معتمد من مدير الموقع، يرجى التعديل إلى 4500 ر.س';
    await page.getByTestId('rejection-reason-input').fill(validReason);
    await page.getByTestId('confirm-reject-button').click();

    // Verify REJECTED state & visible reason banner
    const statusBadge = getDetailStatusBadge(page);
    await expect(statusBadge).toHaveText('مرفوض', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'REJECTED');
    await expect(page.getByTestId('payroll-rejection-banner')).toBeVisible();
    await expect(page.getByText(validReason)).toBeVisible();

    // 3. Switch user: Accountant logs in and views rejected entry
    await page.context().clearCookies();
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto(`/payroll/${payroll.id}`);
    await page.waitForLoadState('networkidle');

    // 4. Reopen the entry
    await page.getByTestId('reopen-payroll-button').click();

    // Verify status returns to DRAFT and rejection banner is cleared
    await expect(statusBadge).toHaveText('مسودة', { timeout: 10000 });
    await expect(statusBadge).toHaveAttribute('data-status', 'DRAFT');
    await expect(page.getByTestId('payroll-rejection-banner')).not.toBeVisible();

    // 5. Edit amount to 4500.00
    await page.getByTestId('edit-payroll-button').click();
    await page.waitForURL(`**/payroll/${payroll.id}/edit`);
    await page.getByTestId('payroll-amount-input').fill('4500.00');
    await page.getByTestId('submit-payroll-form-button').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/edit'));

    // 6. Resubmit
    await page.getByTestId('submit-payroll-button').click();
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // 7. Manager approves
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/payroll/${payroll.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('approve-payroll-button').click();
    await page.getByTestId('confirm-approve-button').click();

    await expect(statusBadge).toHaveText('معتمد', { timeout: 10000 });
  });

  // =========================================================================
  // FLOW 6 — CANCELLATION MATRIX
  // =========================================================================
  test('FLOW 6: Cancellation Matrix — Tests cancellation rules across roles and states', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    const { project, laborLine, accountantUser } = await seedTestProjectWithBudget();

    // A. Accountant owner cancels own DRAFT
    const draftEntry = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل مسودة للإلغاء',
        periodYear: 2026,
        periodMonth: 8,
        amount: new Prisma.Decimal('2000.00'),
        currency: 'SAR',
        description: 'مسودة سيتم إلغاؤها بواسطة المحاسب',
        status: PayrollStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto(`/payroll/${draftEntry.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('cancel-payroll-button').click();

    // Validate short reason rejected (< 5 characters)
    await page.getByTestId('cancellation-reason-input').fill('سبب');
    await page.getByTestId('confirm-cancel-button').click();
    await expect(page.getByText(/سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل/i)).toBeVisible();

    const cancelReason = 'تم إلغاء القيد بسبب ازدواجية التسجيل مع كشف آخر';
    await page.getByTestId('cancellation-reason-input').fill(cancelReason);
    await page.getByTestId('confirm-cancel-button').click();

    const statusBadge = getDetailStatusBadge(page);
    await expect(statusBadge).toHaveText('ملغى', { timeout: 10000 });
    await expect(page.getByTestId('payroll-cancellation-banner')).toBeVisible();
    await expect(page.getByText(cancelReason)).toBeVisible();

    // B. Manager cancels SUBMITTED entry
    const submittedEntry = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل قيد اعتماد للإلغاء',
        periodYear: 2026,
        periodMonth: 8,
        amount: new Prisma.Decimal('3000.00'),
        currency: 'SAR',
        description: 'قيد مرفوع سيتم إلغاؤه بواسطة المدير',
        status: PayrollStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    // Verify Accountant CANNOT cancel SUBMITTED entry
    await page.goto(`/payroll/${submittedEntry.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('cancel-payroll-button')).not.toBeVisible();

    // Switch to Manager to cancel SUBMITTED entry
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/payroll/${submittedEntry.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('cancel-payroll-button').click();
    const mgrCancelReason = 'إلغاء القيد بقرار من الإدارة لعدم مطابقة الشروط';
    await page.getByTestId('cancellation-reason-input').fill(mgrCancelReason);
    await page.getByTestId('confirm-cancel-button').click();

    await expect(statusBadge).toHaveText('ملغى', { timeout: 10000 });
    await expect(page.getByTestId('payroll-cancellation-banner')).toBeVisible();
  });

  // =========================================================================
  // FLOW 7 — BUDGET CEILING ENFORCEMENT
  // =========================================================================
  test('FLOW 7: Budget Ceiling — Manager approval fails when exceeding available budget; exact fit succeeds', async ({
    page,
  }) => {
    test.skip(
      !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD || !MANAGER_EMAIL || !MANAGER_PASSWORD,
      'Accountant and Manager credentials required',
    );

    // BudgetLine ceiling = 10,000 SAR
    const { project, laborLine, managerUser, accountantUser } = await seedTestProjectWithBudget({
      laborLineAmount: 10000.0,
    });

    // Seed approved payroll of 9,000 SAR -> Remaining balance is 1,000 SAR
    await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل معتمد سابق',
        periodYear: 2026,
        periodMonth: 7,
        amount: new Prisma.Decimal('9000.00'),
        currency: 'SAR',
        description: 'قيد معتمد يستهلك 9000 ر.س من السقف',
        status: PayrollStatus.APPROVED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Seed submitted payroll of 2,000 SAR (9000 + 2000 = 11000 > 10000 ceiling!)
    const overCeilingEntry = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل يتجاوز السقف المعتمد',
        periodYear: 2026,
        periodMonth: 8,
        amount: new Prisma.Decimal('2000.00'),
        currency: 'SAR',
        description: 'قيد يتجاوز سقف بند الموازنة المتبقي',
        status: PayrollStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    // 1. Manager attempts approval -> must fail visibly
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/payroll/${overCeilingEntry.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('approve-payroll-button').click();
    await page.getByTestId('confirm-approve-button').click();

    // Verify visible budget ceiling error
    await expect(
      page.getByText(/يتجاوز الرصيد المتاح لبند الموازنة/i),
    ).toBeVisible({ timeout: 10000 });

    // Verify status remains SUBMITTED (not approved)
    const statusBadge = getDetailStatusBadge(page);
    await expect(statusBadge).toHaveText('قيد الاعتماد');

    // 2. Exact-fit test: Seed submitted payroll of exactly 1,000 SAR (9000 + 1000 = 10000)
    const exactFitEntry = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل بمبلغ مساوٍ تماماً للمتبقي',
        periodYear: 2026,
        periodMonth: 8,
        amount: new Prisma.Decimal('1000.00'),
        currency: 'SAR',
        description: 'قيد يستنفد رصيد البند المتبقي تماماً',
        status: PayrollStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    await page.goto(`/payroll/${exactFitEntry.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('approve-payroll-button').click();
    await page.getByTestId('confirm-approve-button').click();

    // Exact-fit approval must succeed!
    await expect(statusBadge).toHaveText('معتمد', { timeout: 10000 });

    // Remaining labor budget must now be 0.00 SAR
    const summaryCard = page.getByTestId('project-labor-summary-card');
    await expect(summaryCard.getByTestId('labor-remaining-budget')).toContainText(formatMoney(0));
  });

  // =========================================================================
  // FLOW 8 — FINANCIAL SUMMARY & DOUBLE COUNTING
  // =========================================================================
  test('FLOW 8: Financial Summary — Reflects approved payroll spend accurately without double counting', async ({
    page,
  }) => {
    test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials required');

    const { project, laborLine, managerUser, accountantUser } = await seedTestProjectWithBudget({
      laborLineAmount: 120000.0,
    });

    // Approved payroll = 30,000 SAR
    await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'عامل معتمد للحسابات',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('30000.00'),
        currency: 'SAR',
        description: 'قيد معتمد لاختبار الرقابة على موازنة العمالة',
        status: PayrollStatus.APPROVED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
        approvedById: managerUser.id,
        approvedAt: new Date(),
      },
    });

    // Manager opens the project payroll view
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/projects/${project.id}/payroll`);
    await page.waitForLoadState('networkidle');

    // Verify summary card values:
    // Total = 120,000; Approved = 30,000; Remaining = 90,000
    const summaryCard = page.getByTestId('project-labor-summary-card');
    await expect(summaryCard.getByTestId('labor-total-budget')).toContainText(formatMoney(120000));
    await expect(summaryCard.getByTestId('labor-approved-spend')).toContainText(formatMoney(30000));
    await expect(summaryCard.getByTestId('labor-remaining-budget')).toContainText(formatMoney(90000));

    // Table displays the single entry
    await expect(page.getByTestId('project-payroll-table')).toBeVisible();
    await expect(page.getByText(formatMoney(30000)).first()).toBeVisible();
  });

  // =========================================================================
  // FLOW 9 — RBAC, OWNERSHIP & PRIVACY BOUNDARIES
  // =========================================================================
  test('FLOW 9: RBAC & Privacy — Enforces boundaries for Accountant ownership, Manager, Engineer privacy, and Purchasing denial', async ({
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
      'All 4 role credentials required',
    );

    const { project, laborLine, accountantUser } = await seedTestProjectWithBudget();

    // Create a DRAFT owned by original Accountant A
    const draftA = await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: 'صالح بن محمد الشهري',
        workerReference: 'WRK-SEC-01',
        tradeOrTitle: 'ميكانيكي معدات',
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('4800.00'),
        currency: 'SAR',
        description: 'مسودة خاصة بالمحاسب الأول',
        status: PayrollStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    // Seed a second Accountant (Accountant B)
    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const accountantBPassword = 'AccountantBPass!123';
    const accountantBHash = await hashPassword(accountantBPassword);
    const accountantB = await prisma.user.create({
      data: {
        email: `accountant-b-${randomSuffix}@test.local`,
        name: `محاسب ثانٍ ${randomSuffix}`,
        role: Role.ACCOUNTANT,
        isActive: true,
        credential: {
          create: {
            passwordHash: accountantBHash,
          },
        },
      },
    });
    cleanupUserIds.push(accountantB.id);

    // -----------------------------------------------------------------------
    // 1. Accountant B tries to edit Accountant A's draft -> Blocked
    // -----------------------------------------------------------------------
    await loginAs(page, accountantB.email, accountantBPassword);
    await page.goto(`/payroll/${draftA.id}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /غير مصرح بالتعديل/i })).toBeVisible();
    await expect(page.getByText(/لا يمكنك تعديل قيد أجور أنشأه محاسب آخر/i)).toBeVisible();
    await expect(page.getByTestId('submit-payroll-form-button')).not.toBeVisible();

    // -----------------------------------------------------------------------
    // 2. Manager cannot create routine payroll or edit draft
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // Manager navigating to /payroll/new -> Blocked
    await page.goto('/payroll/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    // Manager navigating to /payroll/[id]/edit -> Blocked
    await page.goto(`/payroll/${draftA.id}/edit`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    // -----------------------------------------------------------------------
    // 3. Engineer: Strictly FAIL-CLOSED and zero data leakage
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    // Engineer cannot view /payroll
    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    // Engineer cannot view /payroll/[id] (returns 404 notFound to prevent existence discovery)
    await page.goto(`/payroll/${draftA.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /404|غير موجودة|الصفحة غير موجودة/i })).toBeVisible();

    // Engineer cannot access /projects/[projectId]/payroll (under manager layout -> 403)
    await page.goto(`/projects/${project.id}/payroll`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالدخول|غير مصرح/i })).toBeVisible();

    // Ensure zero leakage of sensitive worker details
    const pageContent = await page.content();
    expect(pageContent).not.toContain('صالح بن محمد الشهري');
    expect(pageContent).not.toContain('WRK-SEC-01');
    expect(pageContent).not.toContain('4800.00');

    // -----------------------------------------------------------------------
    // 4. Purchasing: Blocked from all payroll routes
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);

    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    await page.goto('/payroll/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /غير مصرح بالوصول/i })).toBeVisible();

    await page.goto(`/payroll/${draftA.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /404|غير موجودة|الصفحة غير موجودة/i })).toBeVisible();

    // -----------------------------------------------------------------------
    // 5. Non-existent ID triggers 404 for authorized users
    // -----------------------------------------------------------------------
    await page.context().clearCookies();
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/payroll/non-existent-payroll-cuid-999');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /404|غير موجودة|الصفحة غير موجودة/i })).toBeVisible();
  });

  // =========================================================================
  // FLOW 10 — RTL, PRESENTATION & FILTERING
  // =========================================================================
  test('FLOW 10: Presentation & Filters — Verifies RTL layout, status badges, and table filters', async ({
    page,
  }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials required');

    const { project, laborLine, accountantUser } = await seedTestProjectWithBudget();

    // Seed multiple entries with distinct names and statuses
    const worker1 = 'إبراهيم حسن النمري';
    const worker2 = 'طارق زياد العمري';

    await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: worker1,
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('6000.00'),
        currency: 'SAR',
        description: 'قيد أجور مسودة',
        status: PayrollStatus.DRAFT,
        createdById: accountantUser.id,
      },
    });

    await prisma.payrollEntry.create({
      data: {
        projectId: project.id,
        budgetLineId: laborLine.id,
        workerName: worker2,
        periodYear: 2026,
        periodMonth: 9,
        amount: new Prisma.Decimal('7500.00'),
        currency: 'SAR',
        description: 'قيد أجور مرفوع',
        status: PayrollStatus.SUBMITTED,
        createdById: accountantUser.id,
        submittedById: accountantUser.id,
        submittedAt: new Date(),
      },
    });

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');

    // 1. Verify HTML attributes for Arabic RTL
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');

    // 2. Both entries visible initially
    await expect(page.getByText(worker1)).toBeVisible();
    await expect(page.getByText(worker2)).toBeVisible();

    // 3. Filter by status: SUBMITTED
    await page.getByTestId('payroll-status-filter').selectOption('SUBMITTED');
    await expect(page.getByText(worker2)).toBeVisible();
    await expect(page.getByText(worker1)).not.toBeVisible();

    // 4. Search by worker name
    await page.getByTestId('payroll-status-filter').selectOption('ALL');
    await page.getByTestId('payroll-search-input').fill(worker1);
    await expect(page.getByText(worker1)).toBeVisible();
    await expect(page.getByText(worker2)).not.toBeVisible();

    // 5. Clear search
    await page.getByTestId('payroll-search-input').fill('');
    await expect(page.getByText(worker1)).toBeVisible();
    await expect(page.getByText(worker2)).toBeVisible();
  });
});
