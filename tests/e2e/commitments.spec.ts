/**
 * tests/e2e/commitments.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 5 — Purchasing & Commitments Workflow:
 * - Security guards: unauthenticated and non-manager redirection / denial.
 * - Purchasing Officer creates commitment draft on active project with approved budget line.
 * - Purchasing Officer submits commitment (DRAFT -> SUBMITTED).
 * - Manager reviews project commitments, sees pending exposure, and rejects with mandatory reason.
 * - Purchasing Officer views rejection reason, reopens draft (REJECTED -> DRAFT), edits, and resubmits.
 * - Manager approves commitment (SUBMITTED -> APPROVED).
 * - Verifies real-time budget exposure and balance updates:
 *   TotalExposure = ApprovedExpenses + ApprovedCommitments
 *   AvailableBalance = BudgetLine.amount - TotalExposure
 *   PendingExposure = SUM(SUBMITTED commitments) + SUM(SUBMITTED expenses)
 *   ProjectedBalance = AvailableBalance - PendingExposure
 */

import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const PURCHASING_EMAIL = process.env['E2E_PURCHASING_EMAIL'] ?? '';
const PURCHASING_PASSWORD = process.env['E2E_PURCHASING_PASSWORD'] ?? '';

async function loginAs(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/البريد الإلكتروني|email/i).fill(email);
  await page.getByLabel(/كلمة المرور|password/i).fill(pass);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Purchasing & Commitments E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Route protection
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /commitments is redirected to /login', async ({ page }) => {
    await page.goto('/commitments');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager (Purchasing) cannot access /projects/[id]/commitments', async ({ page }) => {
    test.skip(!PURCHASING_EMAIL || !PURCHASING_PASSWORD, 'Purchasing credentials not configured');

    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);
    await page.goto('/projects/dummy-id/commitments');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Commitment Lifecycle: Create -> Submit -> Reject -> Reopen -> Resubmit -> Approve
  // -------------------------------------------------------------------------
  test('Complete Commitment Lifecycle: Purchasing creates/submits, Manager rejects, Purchasing reopens, Manager approves', async ({
    page,
  }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD || !PURCHASING_EMAIL || !PURCHASING_PASSWORD,
      'Both Manager and Purchasing credentials required',
    );

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `COMM-E2E-${randomSuffix}`;
    const projectName = `مشروع مشتريات E2E ${randomSuffix}`;

    // -----------------------------------------------------------------------
    // Setup Phase: Active project with approved budget in DB
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
        status: 'ACTIVE',
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
              description: 'توريد حديد تسليح عالي المقاومة',
              amount: 50000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const targetLine = budget.lines[0];
    expect(targetLine).toBeDefined();

    try {
      // ---------------------------------------------------------------------
      // Step A: Purchasing Officer logs in and creates draft commitment
      // ---------------------------------------------------------------------
      await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);

      await page.goto('/commitments');
      await page.waitForLoadState('networkidle');

      // Click "إنشاء مسودة ارتباط شراء"
      await page.getByTestId('create-commitment-button').click();
      await expect(page.getByTestId('commitment-modal')).toBeVisible();

      // Fill form
      await page.getByTestId('commitment-project-select').selectOption(project.id);
      await page.getByTestId('commitment-budget-line-select').selectOption(targetLine!.id);
      await page.getByTestId('commitment-vendor-name-input').fill('شركة حديد الراجحي للتجارة والصناعة');
      await page.getByTestId('commitment-reference-number-input').fill(`PO-${randomSuffix}`);
      await page.getByTestId('commitment-amount-input').fill('15000.00');
      await page.getByTestId('commitment-description-input').fill('توريد حديد تسليح قطاعات مختلفة للمشروع');
      await page.getByTestId('commitment-save-draft-button').click();

      // Modal closes and draft appears in list
      await expect(page.getByTestId('commitment-modal')).not.toBeVisible();
      await expect(page.getByText('15000.00 ر.س')).toBeVisible();
      await expect(page.getByText('شركة حديد الراجحي للتجارة والصناعة')).toBeVisible();

      // Find the commitment card
      const commitmentCard = page.locator('div').filter({ hasText: '15000.00 ر.س' }).first();
      await expect(commitmentCard).toBeVisible();

      // ---------------------------------------------------------------------
      // Step B: Purchasing Officer submits commitment for approval
      // ---------------------------------------------------------------------
      const submitButton = page.getByTestId(/^submit-commitment-button-/).first();
      await submitButton.click();

      // Card status changes to SUBMITTED
      await expect(page.getByText('بانتظار مراجعة واعتماد المدير')).toBeVisible();

      // ---------------------------------------------------------------------
      // Step C: Manager logs in and reviews exposure, then rejects
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/commitments`);
      await page.waitForLoadState('networkidle');

      // Verify financial metrics: Pending Exposure = 15000.00, Available = 50000.00, Projected = 35000.00
      await expect(page.getByTestId('total-authorized-budget')).toContainText('50000.00');
      await expect(page.getByTestId('total-exposure')).toContainText('0.00');
      await expect(page.getByTestId('total-available-balance')).toContainText('50000.00');
      await expect(page.getByTestId('total-pending-exposure')).toContainText('15000.00');
      await expect(page.getByTestId('total-projected-balance')).toContainText('35000.00');

      // Manager clicks reject button
      const rejectButton = page.getByTestId(/^reject-commitment-button-/).first();
      await rejectButton.click();

      // Rejection modal appears
      const rejectionModal = page.getByTestId('reject-confirmation-modal');
      await expect(rejectionModal).toBeVisible();
      const rejectionReason = 'المبلغ أعلى من السقف التقديري، يرجى التفاوض للحصول على خصم 15%';
      await page.getByTestId('rejection-reason-input').fill(rejectionReason);
      await page.getByTestId('confirm-rejection-button').click();

      // Modal closes
      await expect(rejectionModal).not.toBeVisible();

      // ---------------------------------------------------------------------
      // Step D: Purchasing logs in, sees rejection, reopens, updates amount, resubmits
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);

      await page.goto('/commitments');
      await page.waitForLoadState('networkidle');

      // Sees rejection reason
      await expect(page.getByText(rejectionReason)).toBeVisible();

      // Click Reopen button
      const reopenButton = page.getByTestId(/^reopen-commitment-button-/).first();
      await reopenButton.click();

      // Click Edit button
      const editButton = page.getByTitle('تعديل المسودة').first();
      await editButton.click();
      await expect(page.getByTestId('commitment-modal')).toBeVisible();

      // Update amount to 12500.00 (with negotiated discount)
      await page.getByTestId('commitment-amount-input').fill('12500.00');
      await page.getByTestId('commitment-description-input').fill('توريد حديد تسليح بعد تطبيق خصم 15%');
      await page.getByTestId('commitment-save-draft-button').click();
      await expect(page.getByTestId('commitment-modal')).not.toBeVisible();

      // Resubmit
      await expect(page.getByText('12500.00 ر.س')).toBeVisible();
      const resubmitButton = page.getByTestId(/^submit-commitment-button-/).first();
      await resubmitButton.click();
      await expect(page.getByText('بانتظار مراجعة واعتماد المدير')).toBeVisible();

      // ---------------------------------------------------------------------
      // Step E: Manager logs in, verifies updated pending exposure, approves
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/commitments`);
      await page.waitForLoadState('networkidle');

      // Verify pending exposure updated to 12500.00 and projected to 37500.00
      await expect(page.getByTestId('total-pending-exposure')).toContainText('12500.00');
      await expect(page.getByTestId('total-projected-balance')).toContainText('37500.00');

      // Manager approves
      const approveButton = page.getByTestId(/^approve-commitment-button-/).first();
      await approveButton.click();

      // Confirmation dialog
      const approveModal = page.getByTestId('approve-confirmation-modal');
      await expect(approveModal).toBeVisible();
      await page.getByTestId('confirm-approval-button').click();
      await expect(approveModal).not.toBeVisible();

      // Verify real-time financial balance update (Mandatory Correction 1):
      // Total Exposure = 12500.00
      // Available Balance = 37500.00
      // Pending Exposure = 0.00
      // Projected Balance = 37500.00
      await expect(page.getByTestId('total-exposure')).toContainText('12500.00');
      await expect(page.getByTestId('total-available-balance')).toContainText('37500.00');
      await expect(page.getByTestId('total-pending-exposure')).toContainText('0.00');
      await expect(page.getByTestId('total-projected-balance')).toContainText('37500.00');
    } finally {
      // Database cleanup
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT' } });
      await prisma.commitment.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });
});
