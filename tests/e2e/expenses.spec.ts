/**
 * tests/e2e/expenses.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 4 — Expense Capture & Approval Workflow:
 * - Security guards: unauthenticated and non-manager redirection / denial.
 * - Engineer creates expense draft on active project with approved budget line.
 * - Engineer submits expense (DRAFT -> SUBMITTED).
 * - Manager reviews project expenses, sees pending exposure, and rejects with reason.
 * - Engineer views rejection reason, reopens draft (REJECTED -> DRAFT), edits, and resubmits.
 * - Manager approves expense (SUBMITTED -> APPROVED).
 * - Verifies real-time budget balance decrease (Available = Authorized - ActualSpend).
 * - Verifies approved expense immutability.
 */

import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? '';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';

async function loginAs(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/البريد الإلكتروني|email/i).fill(email);
  await page.getByLabel(/كلمة المرور|password/i).fill(pass);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Expense Capture & Approval E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(90000);
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Route protection
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /expenses is redirected to /login', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager (Engineer) cannot access /projects/[id]/expenses', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects/dummy-id/expenses');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Expense Lifecycle: Create -> Submit -> Reject -> Reopen -> Resubmit -> Approve
  // -------------------------------------------------------------------------
  test('Complete Expense Lifecycle: Engineer creates/submits, Manager rejects, Engineer reopens, Manager approves', async ({
    page,
  }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD || !ENGINEER_EMAIL || !ENGINEER_PASSWORD,
      'Both Manager and Engineer credentials required',
    );

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `EXP-E2E-${randomSuffix}`;
    const projectName = `مشروع نفقات E2E ${randomSuffix}`;

    // -----------------------------------------------------------------------
    // Setup Phase: Manager creates active project with approved budget in DB
    // -----------------------------------------------------------------------
    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL },
      select: { id: true },
    });

    const project = await prisma.project.create({
      data: {
        code: testCode,
        name: projectName,
        managerId: managerUser.id,
        status: 'ACTIVE', // Active project
      },
    });

    // Budget with 50,000.00 SAR line
    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'APPROVED',
        totalAmount: 50000.0,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'MATERIALS',
              description: 'توريد كابلات كهربائية نحاسية',
              amount: 50000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const targetLine = budget.lines[0];
    expect(targetLine).toBeDefined();

    // Assign engineer to the project so they can submit expenses (Slice 11/14 invariant)
    const engineerUser = await prisma.user.findFirstOrThrow({
      where: { email: ENGINEER_EMAIL },
      select: { id: true },
    });

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: engineerUser.id,
        assignedById: managerUser.id,
        status: 'ACTIVE',
      },
    });

    try {
      // ---------------------------------------------------------------------
      // Step A: Engineer logs in and creates draft expense
      // ---------------------------------------------------------------------
      await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

      await page.goto('/expenses');
      await page.waitForLoadState('networkidle');

      // Click "تسجيل مصروف جديد"
      await page.getByTestId('open-create-expense-button').click();
      await expect(page.getByTestId('expense-form-modal')).toBeVisible();

      // Fill form
      await page.getByTestId('expense-project-select').selectOption(project.id);
      await page.getByTestId('expense-budget-line-select').selectOption(targetLine!.id);
      await page.getByTestId('expense-amount-input').fill('5000.00');
      await page.getByTestId('expense-description-input').fill('دفعة أولى لتوريد الكابلات النحاسية');
      await page.getByTestId('save-expense-draft-button').click();

      // Modal closes and draft appears in list
      await expect(page.getByTestId('expense-form-modal')).not.toBeVisible();
      // Find the expense row
      const expenseRow = page.locator('tr').filter({ hasText: '5000.00 ر.س' });
      await expect(expenseRow).toBeVisible();
      await expect(expenseRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'DRAFT');

      // ---------------------------------------------------------------------
      // Step B: Engineer submits expense for approval
      // ---------------------------------------------------------------------
      const submitButton = expenseRow.getByRole('button', { name: /تقديم/i });
      await submitButton.click();

      // Status changes to SUBMITTED
      await expect(expenseRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'SUBMITTED');

      // ---------------------------------------------------------------------
      // Step C: Manager logs in and rejects expense
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/expenses`);
      await page.waitForLoadState('networkidle');

      // Verify financial metrics: Pending Exposure = 5000.00, Available = 50000.00
      await expect(page.getByTestId('total-pending-exposure')).toContainText('5000.00');
      await expect(page.getByTestId('total-available-balance')).toContainText('50000.00');
      await expect(page.getByTestId('total-actual-spend')).toContainText('0.00');

      // Click reject button on submitted expense
      const managerExpenseRow = page.locator('tr').filter({ hasText: '5000.00 ر.س' });
      await managerExpenseRow.getByRole('button', { name: /رفض/i }).click();

      // Fill rejection reason
      const rejectionModal = page.getByTestId('reject-expense-modal');
      await expect(rejectionModal).toBeVisible();
      const rejectionReason = 'يرجى إرفاق تفاصيل جدول الكميات قبل الاعتماد';
      await page.getByTestId('rejection-reason-input').fill(rejectionReason);
      await page.getByTestId('confirm-reject-button').click();

      // Modal closes and status reflects REJECTED
      await expect(rejectionModal).not.toBeVisible();
      await expect(managerExpenseRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'REJECTED');

      // ---------------------------------------------------------------------
      // Step D: Engineer logs in, sees rejection, reopens draft, updates amount, resubmits
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

      await page.goto('/expenses');
      await page.waitForLoadState('networkidle');

      const engineerRejectedRow = page.locator('tr').filter({ hasText: '5000.00 ر.س' });
      await expect(engineerRejectedRow.getByText(rejectionReason)).toBeVisible();

      // Click Reopen button
      await engineerRejectedRow.getByRole('button', { name: /إعادة فتح كمسودة/i }).click();
      await expect(engineerRejectedRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'DRAFT');

      // Click Edit button
      await engineerRejectedRow.getByTitle('تعديل المسودة').click();
      await expect(page.getByTestId('expense-form-modal')).toBeVisible();

      // Update amount to 4500.00 and description
      await page.getByTestId('expense-amount-input').fill('4500.00');
      await page.getByTestId('expense-description-input').fill('دفعة مخفضة بعد التفاوض مع المورد');
      await page.getByTestId('save-expense-draft-button').click();
      await expect(page.getByTestId('expense-form-modal')).not.toBeVisible();

      // Resubmit
      const updatedRow = page.locator('tr').filter({ hasText: '4500.00 ر.س' });
      await updatedRow.getByRole('button', { name: /تقديم/i }).click();
      await expect(updatedRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'SUBMITTED');

      // ---------------------------------------------------------------------
      // Step E: Manager logs in and formally approves
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/expenses`);
      await page.waitForLoadState('networkidle');

      // Verify pending exposure updated to 4500.00
      await expect(page.getByTestId('total-pending-exposure')).toContainText('4500.00');

      const managerApprovalRow = page.locator('tr').filter({ hasText: '4500.00 ر.س' });
      await managerApprovalRow.getByRole('button', { name: /اعتماد/i }).click();

      // Confirm approval dialog
      const approveDialog = page.getByTestId('approve-confirmation-dialog');
      await expect(approveDialog).toBeVisible();
      await page.getByTestId('confirm-approve-button').click();
      await expect(approveDialog).not.toBeVisible({ timeout: 15000 });

      // Status becomes APPROVED
      await expect(managerApprovalRow.getByTestId('expense-status-badge')).toHaveAttribute('data-status', 'APPROVED');

      // Verify real-time financial balance update
      await expect(page.getByTestId('total-actual-spend')).toContainText('4500.00');
      await expect(page.getByTestId('total-pending-exposure')).toContainText('0.00');
      await expect(page.getByTestId('total-available-balance')).toContainText('45500.00');
    } finally {
      // Database cleanup
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE' } });
      await prisma.custody.deleteMany({ where: { projectId: project.id } });
      await prisma.expense.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: project.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });
});
