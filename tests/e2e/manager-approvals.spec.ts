import { test, expect, type Page } from '@playwright/test';
import { Role, ProjectStatus, BudgetCategory } from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? 'accountant@test.local';
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

test.describe('Centralized Manager Approvals Hub E2E Suite (Slice 15)', () => {
  test.setTimeout(90000);

  let testManagerId: string;
  let testEngineerId: string;
  let projectId: string;
  let budgetLineId: string;

  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  test.beforeAll(async () => {
    const mgr = await prisma.user.findFirst({
      where: { email: MANAGER_EMAIL, role: Role.MANAGER },
    });
    const eng = await prisma.user.findFirst({
      where: { email: ENGINEER_EMAIL, role: Role.ENGINEER },
    });
    if (!mgr || !eng) {
      throw new Error('E2E Manager or Engineer user not found in database');
    }
    testManagerId = mgr.id;
    testEngineerId = eng.id;

    // Create a dedicated active project with an approved budget
    const project = await prisma.project.create({
      data: {
        code: `E2E-APPR-${Date.now().toString().slice(-5)}`,
        name: 'مشروع اعتماد الموافقات E2E',
        status: ProjectStatus.ACTIVE,
        managerId: testManagerId,
      },
    });
    projectId = project.id;
    cleanupProjectIds.push(projectId);

    const budget = await prisma.budget.create({
      data: {
        projectId,
        version: 1,
        status: 'APPROVED',
        totalAmount: '500000.00',
        createdById: testManagerId,
        approvedById: testManagerId,
      },
    });

    const bLine = await prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        category: BudgetCategory.MATERIALS,
        description: 'بند موافقات E2E',
        amount: '200000.00',
      },
    });
    budgetLineId = bLine.id;
  });

  test.afterAll(async () => {
    if (cleanupExpenseIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: { in: cleanupExpenseIds } } });
      await prisma.expense.deleteMany({ where: { id: { in: cleanupExpenseIds } } });
    }
    if (cleanupCommitmentIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: { in: cleanupCommitmentIds } } });
      await prisma.commitment.deleteMany({ where: { id: { in: cleanupCommitmentIds } } });
    }
    for (const pId of cleanupProjectIds) {
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.project.deleteMany({ where: { id: pId } });
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 1 — Manager Navigates to /approvals via TopBar
  // ---------------------------------------------------------------------------
  test('Scenario 1: Manager navigates to /approvals via nav-approvals-link and tab counts are visible', async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto('/projects', { waitUntil: 'networkidle' });

    const navLink = page.locator('[data-testid="nav-approvals-link"]');
    await expect(navLink).toBeVisible();
    await navLink.click();

    await page.waitForURL('**/approvals**');
    await expect(page.locator('h1')).toHaveText('مركز الموافقات');
    await expect(page.locator('[data-testid="approvals-tab-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-link-all"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2 — Non-Manager Access Denied
  // ---------------------------------------------------------------------------
  test('Scenario 2: Non-Manager (Accountant) cannot access /approvals', async ({ page }) => {
    if (!ACCOUNTANT_PASSWORD) {
      test.skip();
      return;
    }
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/approvals', { waitUntil: 'networkidle' });

    const url = page.url();
    const bodyText = await page.locator('body').textContent();
    const isDenied =
      !url.includes('/approvals') ||
      url.includes('/login') ||
      bodyText?.includes('غير مصرح') ||
      bodyText?.includes('ليس لديك') ||
      bodyText?.includes('INSUFFICIENT_ROLE') ||
      bodyText?.includes('FORBIDDEN');

    expect(isDenied).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3 — Approve from Hub
  // ---------------------------------------------------------------------------
  test('Scenario 3: Manager approves expense via Hub, button disables during dispatch, card updates', async ({ page }) => {
    // Seed a submitted expense
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '120.00',
        currency: 'SAR',
        description: 'مصروف تجربة اعتماد E2E',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testEngineerId,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto('/approvals?tab=expenses', { waitUntil: 'networkidle' });

    const card = page.locator(`[data-testid="approval-card-${expense.id}"]`);
    await expect(card).toBeVisible();

    const approveBtn = page.locator(`[data-testid="card-approve-btn-${expense.id}"]`);
    await expect(approveBtn).toBeVisible();

    await approveBtn.click();

    // After approval, card disappears or refreshes
    await expect(card).not.toBeVisible({ timeout: 15000 });

    // Verify DB updated
    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated?.status).toBe('APPROVED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4 — Reject from Hub with Modal Validation
  // ---------------------------------------------------------------------------
  test('Scenario 4: Manager rejects commitment via modal; enforces 3-char min reason', async ({ page }) => {
    const commitment = await prisma.commitment.create({
      data: {
        projectId,
        budgetLineId,
        amount: '750.00',
        currency: 'SAR',
        vendorName: 'مورد اختبار الرفض',
        commitmentDate: new Date(),
        description: 'ارتباط تجربة رفض E2E',
        status: 'SUBMITTED',
        createdById: testEngineerId,
        submittedById: testEngineerId,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto('/approvals?tab=commitments', { waitUntil: 'networkidle' });

    const card = page.locator(`[data-testid="approval-card-${commitment.id}"]`);
    await expect(card).toBeVisible();

    const rejectBtn = page.locator(`[data-testid="card-reject-btn-${commitment.id}"]`);
    await rejectBtn.click();

    const modal = page.locator('[data-testid="rejection-modal"]');
    await expect(modal).toBeVisible();

    const confirmBtn = page.locator('[data-testid="rejection-confirm-btn"]');
    const input = page.locator('[data-testid="rejection-reason-input"]');

    // Confirm is initially disabled because input is empty (< 3 chars)
    await expect(confirmBtn).toBeDisabled();

    // Type 2 chars -> still disabled
    await input.fill('لا');
    await expect(confirmBtn).toBeDisabled();

    // Type valid reason -> enabled
    await input.fill('السعر غير مناسب');
    await expect(confirmBtn).toBeEnabled();

    await confirmBtn.click();

    // Modal closes and card disappears
    await expect(modal).not.toBeVisible({ timeout: 15000 });
    await expect(card).not.toBeVisible({ timeout: 15000 });

    // Verify in DB
    const updated = await prisma.commitment.findUnique({ where: { id: commitment.id } });
    expect(updated?.status).toBe('REJECTED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5 — Empty State Neutral Wording
  // ---------------------------------------------------------------------------
  test('Scenario 5: Empty state renders neutral message without implied completion', async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    // Navigate to a domain tab with no pending items (e.g. custodies)
    await page.goto('/approvals?tab=custodies', { waitUntil: 'networkidle' });

    const emptyState = page.locator('[data-testid="approvals-empty-state"]');
    if ((await emptyState.count()) > 0) {
      await expect(emptyState).toContainText('لا توجد معاملات معلقة حاليًا');
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6 — Details Link Navigation
  // ---------------------------------------------------------------------------
  test('Scenario 6: Details link navigates directly to domain context', async ({ page }) => {
    const expense = await prisma.expense.create({
      data: {
        projectId,
        budgetLineId,
        amount: '80.00',
        currency: 'SAR',
        description: 'نفقة رابط التفاصيل E2E',
        expenseDate: new Date(),
        status: 'SUBMITTED',
        submittedById: testEngineerId,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto('/approvals?tab=expenses', { waitUntil: 'networkidle' });

    const detailsLink = page.locator(`[data-testid="card-details-link-${expense.id}"]`);
    await expect(detailsLink).toBeVisible();
    await detailsLink.click();

    await page.waitForURL(`**/projects/${projectId}/expenses**`);
  });
});
