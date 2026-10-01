/**
 * tests/e2e/custodies.spec.ts
 *
 * Hardened Playwright E2E test suite for Vertical Slice 6 & Slice 17:
 * - Security guards: unauthenticated redirection, non-manager denial on project custody routes.
 * - Complete Custody Lifecycle:
 *   DRAFT -> SUBMITTED -> APPROVED -> ISSUED -> PARTIALLY_SETTLED (via linked expense) -> SETTLED (via cash return) -> CLOSED (final closure).
 * - Alternate Flows:
 *   - Rejection with reason -> Creator Reopen (REJECTED -> DRAFT).
 *   - Cancellation before issuance (APPROVED -> CANCELLED).
 * - Separation of Duties:
 *   - Self-approval protection (approver cannot approve own custody).
 * - Financial integrity:
 *   - Verifies remaining balances, settled amounts, returned amounts, and absence of floating-point errors.
 *
 * Follows AGENTS.md §5, §13, §14, §17, §18, §20.
 */

import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? '';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? '';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';

async function loginAs(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/البريد الإلكتروني|email/i).fill(email);
  await page.getByLabel(/كلمة المرور|password/i).fill(pass);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Custody & Settlement E2E Suite — Hardened Lifecycle', () => {
  test.beforeEach(async ({ context, page }) => {
    test.setTimeout(90000);
    await context.clearCookies();
    // Clean up any stale test custodies from previous runs
    await prisma.custody.deleteMany({
      where: { code: { startsWith: 'CUST-' } },
    });
    // Accept browser native confirmation dialogs automatically
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Route protection & RBAC
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /custodies is redirected to /login', async ({ page }) => {
    await page.goto('/custodies');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager (Engineer) cannot access /projects/[id]/custodies', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects/dummy-id/custodies');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول|forbidden|access denied/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login') || page.url() === '/';

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Custody Lifecycle:
  //    DRAFT -> SUBMITTED -> APPROVED -> ISSUED -> PARTIALLY_SETTLED -> SETTLED -> CLOSED
  // -------------------------------------------------------------------------
  test('Complete Custody Lifecycle: Engineer creates/submits, Manager approves, Accountant issues, Expense settles, Cash returns, Manager closes', async ({
    page,
  }) => {
    test.skip(
      !MANAGER_EMAIL ||
        !MANAGER_PASSWORD ||
        !ENGINEER_EMAIL ||
        !ENGINEER_PASSWORD ||
        !ACCOUNTANT_EMAIL ||
        !ACCOUNTANT_PASSWORD,
      'Full test suite credentials (Manager, Engineer, Accountant) required',
    );

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `CUST-E2E-${randomSuffix}`;
    const projectName = `مشروع عهد E2E ${randomSuffix}`;

    // -----------------------------------------------------------------------
    // Setup Phase: Project + Approved Budget + Engineer Assignment
    // -----------------------------------------------------------------------
    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL },
      select: { id: true },
    });
    const engineerUser = await prisma.user.findFirstOrThrow({
      where: { email: ENGINEER_EMAIL },
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

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'APPROVED',
        totalAmount: 60000.0,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'SITE_OPERATIONS',
              description: 'مصاريف تشغيلية ونظافة موقع عاجلة',
              amount: 60000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const targetLine = budget.lines[0]!;

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
      // Step A: Engineer logs in and creates draft custody
      // ---------------------------------------------------------------------
      await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
      await page.goto('/custodies');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('request-custody-button').click();
      await page.locator('#custody-project').selectOption(project.id);
      await page.locator('#custody-budgetline').selectOption(targetLine.id);
      await page.locator('#custody-custodian').selectOption(engineerUser.id);
      await page.locator('#custody-amount').fill('5000.00');
      await page.locator('#custody-purpose').fill(`سلفة محروقات وطوارئ موقع ${randomSuffix}`);
      await page.getByRole('button', { name: /حفظ كمسودة/i }).click();

      // Card appears with DRAFT status
      const custodyCard = page.locator('[data-testid^="custody-item-"]').filter({ hasText: projectName }).first();
      await expect(custodyCard).toBeVisible({ timeout: 8000 });
      await expect(custodyCard.locator('[data-status="DRAFT"]')).toBeVisible();

      // ---------------------------------------------------------------------
      // Step B: Engineer submits custody for approval
      // ---------------------------------------------------------------------
      const submitBtn = custodyCard.getByRole('button', { name: /تقديم للاعتماد/i });
      await submitBtn.click();

      // Status updates to SUBMITTED
      await expect(custodyCard.locator('[data-status="SUBMITTED"]')).toBeVisible({ timeout: 8000 });

      // ---------------------------------------------------------------------
      // Step C: Manager logs in, reviews at project custodies, and approves
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/custodies`);
      await page.waitForLoadState('networkidle');

      // Verify pending custody card in manager view
      const pendingSection = page.locator('div').filter({ hasText: 'طلبات عهد نقدية بانتظار الاعتماد' }).first();
      await expect(pendingSection).toBeVisible();

      // Click "اعتماد الطلب"
      const approveBtn = pendingSection.getByRole('button', { name: /اعتماد الطلب/i }).first();
      await approveBtn.click();

      // Custody appears in project registry with APPROVED status
      await expect(page.locator('[data-status="APPROVED"]').first()).toBeVisible({ timeout: 8000 });

      // ---------------------------------------------------------------------
      // Step D: Accountant logs in and issues cash
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

      await page.goto('/custodies');
      await page.waitForLoadState('networkidle');

       const accountantCustodyCard = page.locator('[data-testid^="custody-item-"]').filter({ hasText: projectName }).first();
      await expect(accountantCustodyCard).toBeVisible();

      const issueBtn = accountantCustodyCard.getByRole('button', { name: /تسليم وصرف العهدة نقداً/i });
      await expect(issueBtn).toBeVisible();
      await issueBtn.click();

      // Status becomes ISSUED
      await expect(accountantCustodyCard.locator('[data-status="ISSUED"]')).toBeVisible({ timeout: 8000 });
      await expect(accountantCustodyCard.getByText('المتبقي: 5000.00 ر.س')).toBeVisible();

      // ---------------------------------------------------------------------
      // Step E: Custody-linked expense (settlement step 1: 3000.00 SAR)
      // ---------------------------------------------------------------------
      const custodyRecord = await prisma.custody.findFirstOrThrow({
        where: { projectId: project.id, deletedAt: null },
      });

      // Create and submit expense linked to this custody
      await prisma.expense.create({
        data: {
          projectId: project.id,
          budgetLineId: targetLine.id,
          custodyId: custodyRecord.id,
          amount: 3000.0,
          currency: 'SAR',
          expenseDate: new Date(),
          description: `فاتورة محروقات مسواة من العهدة ${randomSuffix}`,
          status: 'SUBMITTED',
          submittedById: engineerUser.id,
        },
      });

      // Manager approves the expense -> custody becomes PARTIALLY_SETTLED
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto(`/projects/${project.id}/expenses`);
      await page.waitForLoadState('networkidle');

      const expenseRow = page.locator('tr').filter({ hasText: '3000.00 ر.س' });
      await expenseRow.getByRole('button', { name: /اعتماد/i }).click();

      const approveDialog = page.getByTestId('approve-confirmation-dialog');
      await expect(approveDialog).toBeVisible();
      await page.getByTestId('confirm-approve-button').click();
      await expect(approveDialog).not.toBeVisible();

      // Check custody status at /projects/[id]/custodies: PARTIALLY_SETTLED
      await page.goto(`/projects/${project.id}/custodies`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-status="PARTIALLY_SETTLED"]').first()).toBeVisible({ timeout: 8000 });
      await expect(page.getByText('المسوى: 3000.00 ر.س').first()).toBeVisible();
      await expect(page.getByText('المتبقي: 2000.00 ر.س').first()).toBeVisible();

      // ---------------------------------------------------------------------
      // Step F: Accountant records cash return for excess (settlement step 2: 2000.00 SAR)
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

      await page.goto('/custodies');
      await page.waitForLoadState('networkidle');

      const returnCard = page.locator('[data-testid^="custody-item-"]').filter({ hasText: projectName }).first();
      await expect(returnCard).toBeVisible();

      const returnCashBtn = returnCard.getByRole('button', { name: /تسجيل استرجاع فائض/i });
      await returnCashBtn.click();

      // Fill cash return modal
      await page.locator('input[placeholder*="الحد الأقصى"]').fill('2000.00');
      await page.getByRole('button', { name: /تأكيد استلام النقد/i }).click();

      // Custody status is now SETTLED
      await expect(returnCard.locator('[data-status="SETTLED"]')).toBeVisible({ timeout: 8000 });
      await expect(returnCard.getByText('مسوى: 3000.00 ر.س | مسترجع: 2000.00 ر.س')).toBeVisible();

      // ---------------------------------------------------------------------
      // Step G: Manager executes final administrative closure
      // ---------------------------------------------------------------------
      await page.context().clearCookies();
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      await page.goto('/custodies');
      await page.waitForLoadState('networkidle');

      const managerCustodyCard = page.locator('[data-testid^="custody-item-"]').filter({ hasText: projectName }).first();
      await expect(managerCustodyCard).toBeVisible();

      const closeBtn = managerCustodyCard.getByRole('button', { name: /إغلاق نهائي وأرشفة/i });
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();

      // Status becomes CLOSED
      await expect(managerCustodyCard.locator('[data-status="CLOSED"]')).toBeVisible({ timeout: 8000 });
    } finally {
      // Database cleanup
      await prisma.auditLog.deleteMany({ where: { entityType: { in: ['CUSTODY', 'EXPENSE'] } } });
      await prisma.expense.deleteMany({ where: { projectId: project.id } });
      await prisma.custody.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: project.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Alternate Flow: Rejection with reason and Creator Reopen (REJECTED -> DRAFT)
  // -------------------------------------------------------------------------
  test('Alternate Flow: Manager rejects custody with reason, Engineer reopens to DRAFT', async ({
    page,
  }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD || !ENGINEER_EMAIL || !ENGINEER_PASSWORD,
      'Manager and Engineer credentials required',
    );

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `CUST-REJ-${randomSuffix}`;

    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL },
      select: { id: true },
    });
    const engineerUser = await prisma.user.findFirstOrThrow({
      where: { email: ENGINEER_EMAIL },
      select: { id: true },
    });

    const projectName = `مشروع رفض عهدة ${randomSuffix}`;

    const project = await prisma.project.create({
      data: {
        code: testCode,
        name: projectName,
        managerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: engineerUser.id,
        assignedById: managerUser.id,
        status: 'ACTIVE',
      },
    });

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'APPROVED',
        totalAmount: 30000.0,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'SITE_OPERATIONS',
              description: 'بند تشغيلي لاختبار الرفض',
              amount: 30000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    await prisma.custody.create({
      data: {
        code: `CUST-${randomSuffix}`,
        projectId: project.id,
        budgetLineId: budget.lines[0]!.id,
        custodianUserId: engineerUser.id,
        createdById: engineerUser.id,
        submittedById: engineerUser.id,
        amount: 2500.0,
        currency: 'SAR',
        purpose: `عهدة لاختبار الرفض ${randomSuffix}`,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    try {
      // Step 1: Manager logs in, navigates to project custodies, and rejects
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${project.id}/custodies`);
      await page.waitForLoadState('networkidle');

      const rejectBtn = page.getByRole('button', { name: /رفض الطلب/i }).first();
      await rejectBtn.click();

      const rejectionReason = 'المبلغ غير مبرر، يرجى تقديم مسوغات فنية أدق';
      await page.locator('textarea').fill(rejectionReason);
      await page.getByRole('button', { name: /تأكيد الرفض/i }).click();

      await expect(page.locator('[data-status="REJECTED"]').first()).toBeVisible({ timeout: 8000 });

      // Step 2: Engineer logs in, sees rejection and reason, clicks reopen
      await page.context().clearCookies();
      await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

      await page.goto('/custodies');
      await page.waitForLoadState('networkidle');

      const engineerCard = page.locator('[data-testid^="custody-item-"]').filter({ hasText: projectName }).first();
      await expect(engineerCard).toBeVisible();
      await expect(engineerCard.locator('[data-status="REJECTED"]')).toBeVisible();

      // Click "إعادة فتح وتعديل"
      const reopenBtn = engineerCard.getByRole('button', { name: /إعادة فتح وتعديل/i });
      await reopenBtn.click();

      // Status transitions back to DRAFT
      await expect(engineerCard.locator('[data-status="DRAFT"]')).toBeVisible({ timeout: 8000 });
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY' } });
      await prisma.custody.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: project.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });

  // -------------------------------------------------------------------------
  // 4. Alternate Flow: Manager Cancellation before issuance (APPROVED -> CANCELLED)
  // -------------------------------------------------------------------------
  test('Alternate Flow: Manager cancels approved custody before cash issuance', async ({ page }) => {
    test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials required');

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `CUST-CAN-${randomSuffix}`;

    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL },
      select: { id: true },
    });
    const engineerUser = await prisma.user.findFirstOrThrow({
      where: { email: ENGINEER_EMAIL },
      select: { id: true },
    });

    const project = await prisma.project.create({
      data: {
        code: testCode,
        name: `مشروع إلغاء عهدة ${randomSuffix}`,
        managerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'APPROVED',
        totalAmount: 20000.0,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'SITE_OPERATIONS',
              description: 'بند تشغيلي لاختبار الإلغاء',
              amount: 20000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Create approved custody directly
    await prisma.custody.create({
      data: {
        code: `CUST-${randomSuffix}`,
        projectId: project.id,
        budgetLineId: budget.lines[0]!.id,
        custodianUserId: engineerUser.id,
        createdById: engineerUser.id,
        submittedById: engineerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        amount: 1500.0,
        currency: 'SAR',
        purpose: `عهدة لاختبار الإلغاء ${randomSuffix}`,
        status: 'APPROVED',
      },
    });

    try {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${project.id}/custodies`);
      await page.waitForLoadState('networkidle');

      const cancelBtn = page.getByRole('button', { name: /إلغاء الطلب/i }).first();
      await cancelBtn.click();

      const cancelReason = 'إلغاء العهدة لانتفاء الحاجة الميدانية لها';
      await page.locator('textarea').fill(cancelReason);
      await page.getByRole('button', { name: /تأكيد الإلغاء/i }).click();

      // Status updates to CANCELLED
      await expect(page.locator('[data-status="CANCELLED"]').first()).toBeVisible({ timeout: 8000 });
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY' } });
      await prisma.custody.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });

  // -------------------------------------------------------------------------
  // 5. Separation of Duties: Manager cannot approve own custody
  // -------------------------------------------------------------------------
  test('Separation of Duties: Manager is forbidden from approving their own custody', async ({ page }) => {
    test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials required');

    const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
    const testCode = `CUST-SOD-${randomSuffix}`;

    const managerUser = await prisma.user.findFirstOrThrow({
      where: { email: MANAGER_EMAIL },
      select: { id: true },
    });

    const project = await prisma.project.create({
      data: {
        code: testCode,
        name: `مشروع فصل المهام ${randomSuffix}`,
        managerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        version: 1,
        status: 'APPROVED',
        totalAmount: 10000.0,
        currency: 'SAR',
        createdById: managerUser.id,
        approvedById: managerUser.id,
        approvedAt: new Date(),
        lines: {
          create: [
            {
              category: 'SITE_OPERATIONS',
              description: 'بند فصل المهام',
              amount: 10000.0,
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Custody where custodian is the manager themselves
    const ownCustody = await prisma.custody.create({
      data: {
        code: `CUST-${randomSuffix}`,
        projectId: project.id,
        budgetLineId: budget.lines[0]!.id,
        custodianUserId: managerUser.id,
        createdById: managerUser.id,
        submittedById: managerUser.id,
        amount: 1000.0,
        currency: 'SAR',
        purpose: `عهدة ذاتية لاختبار المنع ${randomSuffix}`,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    try {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${project.id}/custodies`);
      await page.waitForLoadState('networkidle');

      // The approve button for own custody must be disabled
      const approveBtn = page.getByTestId(`approve-custody-${ownCustody.id}`);
      await expect(approveBtn).toBeDisabled();
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY' } });
      await prisma.custody.deleteMany({ where: { projectId: project.id } });
      await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      await prisma.budget.deleteMany({ where: { id: budget.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
    }
  });
});
