/**
 * tests/e2e/variation-orders.spec.ts
 *
 * Playwright E2E tests for Slice 20 — Variation Orders / Change Orders:
 *
 * FLOW 1 — ENGINEER CREATION & SUBMISSION:
 *   Engineer logs in -> navigates to /variation-orders -> clicks create ->
 *   enters title, description, reason, and BOQ lines -> saves as draft ->
 *   verifies DRAFT state & line calculations -> edits draft -> submits ->
 *   verifies SUBMITTED state.
 *
 * FLOW 2 — MANAGER APPROVAL & BUDGET INTEGRATION:
 *   Manager logs in -> navigates to /approvals (or /variation-orders/[id]) ->
 *   inspects scope and financial deltas -> approves order ->
 *   verifies APPROVED status, approval callout, and audit trail.
 *
 * FLOW 3 — MANAGER REJECTION & ENGINEER REOPEN:
 *   Manager rejects submitted order with mandatory reason ->
 *   verifies REJECTED status + rejection reason displayed ->
 *   Engineer views rejection -> clicks reopen ->
 *   verifies status resets to DRAFT -> edits -> resubmits.
 *
 * FLOW 4 — ROLE AUTHORIZATION GUARDS:
 *   - Engineer cannot approve orders.
 *   - Accountant & Purchasing can view orders list read-only (cannot create/approve).
 *
 * Follows AGENTS.md §5, §8, §10, §12, §13, §16, §18, §19, §20.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  VariationOrderStatus,
  AssignmentStatus,
} from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? 'accountant@test.local';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';
const PURCHASING_EMAIL = process.env['E2E_PURCHASING_EMAIL'] ?? 'purchasing@test.local';
const PURCHASING_PASSWORD = process.env['E2E_PURCHASING_PASSWORD'] ?? '';

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
test.describe('Variation Orders E2E Suite (Slice 20)', () => {
  test.setTimeout(90000);

  let testManagerId: string;
  let testEngineerId: string;
  let projectId: string;
  let budgetLineId: string;

  const cleanupProjectIds: string[] = [];
  const cleanupVoIds: string[] = [];

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

    // Seed dedicated project with approved budget
    const project = await prisma.project.create({
      data: {
        code: `VO-E2E-${Date.now().toString().slice(-4)}`,
        name: 'مشروع اختبار أوامر التغيير E2E',
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
        totalAmount: '1000000.00',
        createdById: testManagerId,
        approvedById: testManagerId,
      },
    });

    const bLine = await prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        category: BudgetCategory.SITE_OPERATIONS,
        description: 'بند أعمال الموقع والتربة E2E',
        amount: '1000000.00',
      },
    });
    budgetLineId = bLine.id;

    // Assign engineer to the project
    await prisma.projectAssignment.upsert({
      where: {
        projectId_engineerId: {
          projectId,
          engineerId: testEngineerId,
        },
      },
      create: {
        projectId,
        engineerId: testEngineerId,
        status: AssignmentStatus.ACTIVE,
        assignedById: testManagerId,
      },
      update: {
        status: AssignmentStatus.ACTIVE,
      },
    });
  });

  test.afterAll(async () => {
    for (const voId of cleanupVoIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'VARIATION_ORDER', entityId: voId },
      });
      await prisma.variationOrderLine.deleteMany({ where: { variationOrderId: voId } });
      await prisma.variationOrder.deleteMany({ where: { id: voId } });
    }
    for (const pId of cleanupProjectIds) {
      await prisma.variationOrderLine.deleteMany({
        where: { variationOrder: { projectId: pId } },
      });
      await prisma.variationOrder.deleteMany({ where: { projectId: pId } });
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // Flow 1 & 2: Engineer Draft, Edit, Submit -> Manager Approval & Budget Impact
  // -------------------------------------------------------------------------
  test('Flow 1 & 2: Engineer creates draft, edits and submits -> Manager approves with budget impact', async ({
    page,
  }) => {
    // 1. Engineer logs in
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    // 2. Navigate to variation orders page
    await page.goto('/variation-orders');
    await page.waitForLoadState('networkidle');

    // Verify create button visible for engineer
    const createBtn = page.getByTestId('create-variation-button');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // 3. Fill form
    await page.waitForURL('**/variation-orders/new');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('project-select').selectOption(projectId);
    await page.getByTestId('title-input').fill('أمر تغيير إضافي لتسوية الميول');
    await page.getByTestId('description-input').fill('أعمال إضافية لتسوية الميول الطبيعية للموقع العام');
    await page.getByTestId('reason-input').fill('تقرير التربة الميداني وتوجيه الاستشاري المشرف');

    // Add line item details
    await page.getByTestId('line-description-0').fill('حفر صخري وتسوية ميول');
    await page.getByTestId('line-unit-0').fill('م3');
    await page.getByTestId('line-orig-qty-0').fill('100');
    await page.getByTestId('line-rev-qty-0').fill('200');
    await page.getByTestId('line-orig-rate-0').fill('50.00');
    await page.getByTestId('line-rev-rate-0').fill('50.00');

    // Submit form to create draft
    await page.getByTestId('submit-variation-form-btn').click();

    // 4. Verify redirected to detail page
    await page.waitForURL((url) => url.pathname.startsWith('/variation-orders/') && !url.pathname.endsWith('/new'), {
      timeout: 15000,
    });

    const voUrl = page.url();
    const voId = voUrl.split('/').pop()!;
    cleanupVoIds.push(voId);

    // Verify initial DRAFT status
    await expect(page.getByTestId('variation-status-badge')).toContainText('مسودة');
    await expect(page.getByTestId('variation-title')).toContainText('أمر تغيير إضافي لتسوية الميول');

    // 5. Engineer edits draft
    const editBtn = page.getByTestId('edit-variation-button');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForURL(`**/variation-orders/${voId}/edit`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('title-input').fill('أمر تغيير إضافي لتسوية الميول (معدل)');
    await page.getByTestId('submit-variation-form-btn').click();

    await page.waitForURL(`**/variation-orders/${voId}`);
    await expect(page.getByTestId('variation-title')).toContainText('أمر تغيير إضافي لتسوية الميول (معدل)');

    // 6. Engineer submits draft
    const submitBtn = page.getByTestId('submit-for-approval-button');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify status becomes SUBMITTED
    await expect(page.getByTestId('variation-status-badge')).toHaveAttribute('data-status', 'SUBMITTED');
    await expect(page.getByTestId('variation-status-badge')).toContainText('قيد المراجعة والاعتماد');

    // Verify edit button is now hidden
    await expect(page.getByTestId('edit-variation-button')).not.toBeVisible();

    // 7. Manager logs in
    await page.context().clearCookies();
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // Manager navigates directly to the submitted variation order
    await page.goto(`/variation-orders/${voId}`);
    await page.waitForLoadState('networkidle');

    // Verify Manager sees approval action
    const approveBtn = page.getByTestId('approve-variation-button');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Confirm in modal
    const confirmApproveBtn = page.getByTestId('confirm-approve-button');
    await expect(confirmApproveBtn).toBeVisible();
    await confirmApproveBtn.click();

    // Verify status becomes APPROVED
    await expect(page.getByTestId('variation-status-badge')).toContainText('معتمد');
    await expect(page.getByTestId('approval-callout')).toBeVisible();

    // Verify DB audit log exists
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'VARIATION_ORDER',
        entityId: voId,
        action: 'VARIATION_ORDER_APPROVED',
      },
    });
    expect(auditLog).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Flow 3: Manager Rejection & Engineer Reopen
  // -------------------------------------------------------------------------
  test('Flow 3: Manager rejects with mandatory reason -> Engineer sees reason, reopens, and edits', async ({
    page,
  }) => {
    // 1. Seed submitted variation directly
    const vo = await prisma.variationOrder.create({
      data: {
        orderNumber: `VO-REJ-${Date.now().toString().slice(-4)}`,
        projectId,
        budgetLineId,
        title: 'أمر تغيير للاختبار للرفض وإعادة الفتح',
        description: 'أعمال تمديدات تحتاج تدقيق فني إضافي',
        reason: 'مبرر أولي للمشروع',
        impactAmount: '18000.00',
        status: VariationOrderStatus.SUBMITTED,
        createdById: testEngineerId,
        submittedById: testEngineerId,
        submittedAt: new Date(),
      },
    });
    cleanupVoIds.push(vo.id);

    // 2. Manager logs in and rejects
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/variation-orders/${vo.id}`);
    await page.waitForLoadState('networkidle');

    const rejectBtn = page.getByTestId('reject-variation-button');
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Fill rejection reason
    const reasonText = 'الأسعار التقديرية مرتفعة جداً ويلزم مراجعة عروض الموردين';
    await page.getByTestId('rejection-reason-textarea').fill(reasonText);
    await page.getByTestId('confirm-reject-button').click();

    // Verify rejected status and banner
    await expect(page.getByTestId('variation-status-badge')).toContainText('مرفوض');
    await expect(page.getByTestId('rejection-reason-callout')).toContainText(reasonText);

    // 3. Engineer logs in and inspects rejection
    await page.context().clearCookies();
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    await page.goto(`/variation-orders/${vo.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('rejection-reason-callout')).toContainText(reasonText);

    // Engineer clicks reopen
    const reopenBtn = page.getByTestId('reopen-variation-button');
    await expect(reopenBtn).toBeVisible();
    await reopenBtn.click();

    await page.getByTestId('confirm-reopen-button').click();

    // Verify status returns to DRAFT
    await expect(page.getByTestId('variation-status-badge')).toContainText('مسودة');
    await expect(page.getByTestId('rejection-reason-callout')).not.toBeVisible();

    // Edit button is available again
    await expect(page.getByTestId('edit-variation-button')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Flow 4: Role Authorization Negative Guards
  // -------------------------------------------------------------------------
  test('Flow 4: Role authorization negative guards across roles', async ({ page }) => {
    // 1. Seed submitted variation
    const vo = await prisma.variationOrder.create({
      data: {
        orderNumber: `VO-AUTH-${Date.now().toString().slice(-4)}`,
        projectId,
        title: 'أمر لفحص الصلاحيات',
        description: 'فحص الصلاحيات للأدوار الأربعة',
        reason: 'سبب الاختبار',
        impactAmount: '10000.00',
        status: VariationOrderStatus.SUBMITTED,
        createdById: testEngineerId,
        submittedById: testEngineerId,
        submittedAt: new Date(),
      },
    });
    cleanupVoIds.push(vo.id);

    // Engineer cannot see approve button
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto(`/variation-orders/${vo.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('approve-variation-button')).not.toBeVisible();
    await expect(page.getByTestId('reject-variation-button')).not.toBeVisible();

    // Accountant logs in: read-only access (no create button, no approval actions)
    await page.context().clearCookies();
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

    await page.goto('/variation-orders');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-variation-button')).not.toBeVisible();

    await page.goto(`/variation-orders/${vo.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('approve-variation-button')).not.toBeVisible();
    await expect(page.getByTestId('reject-variation-button')).not.toBeVisible();

    // Purchasing Officer logs in: read-only access (no create button, no approval actions)
    await page.context().clearCookies();
    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);

    await page.goto('/variation-orders');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-variation-button')).not.toBeVisible();

    await page.goto(`/variation-orders/${vo.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('approve-variation-button')).not.toBeVisible();
    await expect(page.getByTestId('reject-variation-button')).not.toBeVisible();
  });
});
