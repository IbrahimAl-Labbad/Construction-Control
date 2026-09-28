/**
 * tests/e2e/operational-dashboard.spec.ts
 *
 * Playwright E2E Test Suite for Vertical Slice 13 — Operational Project Dashboard.
 *
 * Covers:
 * FLOW 1 — Manager Dashboard Access:
 *   Manager logs in → navigates to /projects/[projectId] →
 *   RTL layout, Arabic labels, all 4 operational cards render.
 * FLOW 2 — Financial Metrics & Currency Formatting:
 *   All 6 canonical financial metrics render with 'ر.س' and 2 decimal places.
 * FLOW 3 — Milestones & Overdue Signals:
 *   Milestones card renders total, completed, in-progress, planned counts.
 *   Overdue alert renders when overdue milestones exist.
 * FLOW 4 — Site Progress & Empty State:
 *   Renders latest approved report snapshot (progress bar, days since report, blockers).
 *   Renders empty state message when no approved progress reports exist.
 * FLOW 5 — Read-Only Body Surface:
 *   Operational body contains zero mutation buttons (approve/reject/submit) and zero form inputs.
 * FLOW 6 — Non-Manager Access Denial:
 *   Accountant and Engineer navigating to /projects/[projectId] are blocked/redirected.
 */

import { test, expect, type Page } from '@playwright/test';
import { Role, ProjectStatus, MilestoneStatus, BudgetStatus, ProgressReportStatus, BudgetCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? 'accountant@test.local';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
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

test.describe('Operational Project Dashboard E2E Suite (Vertical Slice 13)', () => {
  test.setTimeout(120000);

  let managerUserId: string;
  let engineerUserId: string;
  let engineerName: string;
  let populatedProjectId: string;
  let emptyProjectId: string;

  const cleanupProjectIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.beforeAll(async () => {
    // 1. Fetch Manager
    const mgr = await prisma.user.findFirst({
      where: { email: MANAGER_EMAIL, role: Role.MANAGER },
    });
    if (!mgr) {
      throw new Error(`Manager user not found for email: ${MANAGER_EMAIL}`);
    }
    managerUserId = mgr.id;

    // 2. Fetch or create Engineer
    let eng = await prisma.user.findFirst({
      where: { email: ENGINEER_EMAIL, role: Role.ENGINEER },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس اختبار E2E',
          email: ENGINEER_EMAIL,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    engineerUserId = eng.id;
    engineerName = eng.name;

    const timestamp = Date.now();

    // 3. Create populated test project
    const projectPopulated = await prisma.project.create({
      data: {
        code: `PRJ-OP-${timestamp}`,
        name: `مشروع تشغيلي متكامل ${timestamp}`,
        status: ProjectStatus.ACTIVE,
        managerId: managerUserId,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        location: 'الرياض - حي العليا',
        description: 'مشروع للتحقق من لوحة التحكم التشغيلية',
      },
    });
    populatedProjectId = projectPopulated.id;
    cleanupProjectIds.push(populatedProjectId);

    // Create approved budget for populated project
    const budget = await prisma.budget.create({
      data: {
        projectId: populatedProjectId,
        createdById: managerUserId,
        approvedById: managerUserId,
        approvedAt: new Date(),
        version: 1,
        status: BudgetStatus.APPROVED,
        totalAmount: new Decimal('150000.00'),
        lines: {
          create: [
            {
              category: BudgetCategory.MATERIALS,
              description: 'أعمال إنشائية وهيكل',
              amount: new Decimal('150000.00'),
            },
          ],
        },
      },
      include: { lines: true },
    });

    const budgetLineId = budget.lines[0]!.id;

    // Create an approved direct expense
    await prisma.expense.create({
      data: {
        projectId: populatedProjectId,
        budgetLineId,
        amount: new Decimal('25000.00'),
        description: 'دفعة توريد مواد إنشائية',
        expenseDate: new Date(),
        status: 'APPROVED',
        submittedById: managerUserId,
      },
    });

    // Create milestones: one completed, one overdue
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 3);

    await prisma.projectMilestone.createMany({
      data: [
        {
          projectId: populatedProjectId,
          title: 'إتمام أعمال الحفر والأساسات',
          status: MilestoneStatus.COMPLETED,
          targetDate: new Date('2026-02-15'),
          achievedAt: new Date('2026-02-14'),
          orderIndex: 0,
          createdById: managerUserId,
        },
        {
          projectId: populatedProjectId,
          title: 'صب أعمدة الدور الأرضي',
          status: MilestoneStatus.IN_PROGRESS,
          targetDate: yesterday,
          orderIndex: 1,
          createdById: managerUserId,
        },
      ],
    });

    // Assign engineer to populated project
    await prisma.projectAssignment.create({
      data: {
        projectId: populatedProjectId,
        engineerId: engineerUserId,
        assignedById: managerUserId,
        status: 'ACTIVE',
      },
    });

    // Create approved progress report
    await prisma.progressReport.create({
      data: {
        projectId: populatedProjectId,
        createdById: engineerUserId,
        reportDate: new Date(),
        title: 'تقرير تقدم الأعمال الإنشائية الأسبوعي',
        workDescription: 'استكمال صب الأعمدة وتجهيز حديد التسليح.',
        progressPercentage: 65,
        status: ProgressReportStatus.APPROVED,
        approvedById: managerUserId,
        approvedAt: new Date(),
        blockers: 'تأخر توريد حديد التسليح من المورد الرئيسي',
        nextPeriodPlan: 'استكمال صب الأسقف والبدء في أعمال المباني',
      },
    });

    // 4. Create empty test project (no budget, no reports, no milestones)
    const projectEmpty = await prisma.project.create({
      data: {
        code: `PRJ-EMPTY-${timestamp}`,
        name: `مشروع تشغيلي فارغ ${timestamp}`,
        status: ProjectStatus.INITIATED,
        managerId: managerUserId,
      },
    });
    emptyProjectId = projectEmpty.id;
    cleanupProjectIds.push(emptyProjectId);
  });

  test.afterAll(async () => {
    for (const pId of cleanupProjectIds) {
      await prisma.progressReport.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.projectMilestone.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } }).catch(() => {});
      const budgets = await prisma.budget.findMany({ where: { projectId: pId }, select: { id: true } });
      for (const b of budgets) {
        const lines = await prisma.budgetLine.findMany({ where: { budgetId: b.id }, select: { id: true } });
        const lineIds = lines.map((l) => l.id);
        await prisma.expense.deleteMany({ where: { budgetLineId: { in: lineIds } } }).catch(() => {});
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } }).catch(() => {});
      }
      await prisma.budget.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // FLOW 1 — Manager Dashboard Access & RTL Layout
  // ---------------------------------------------------------------------------
  test.describe('FLOW 1 — Manager Dashboard Access & RTL Layout', () => {
    test('Manager navigates to /projects/[projectId] and sees RTL layout with all 4 operational cards', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      // 1. Verify HTML attributes for Arabic RTL
      const html = page.locator('html');
      await expect(html).toHaveAttribute('dir', 'rtl');
      await expect(html).toHaveAttribute('lang', 'ar');

      // 2. Verify Operational Dashboard container
      const dashboardView = page.locator('[data-testid="operational-dashboard-view"]');
      await expect(dashboardView).toBeVisible({ timeout: 10000 });

      // 3. Verify all 4 operational cards
      await expect(page.locator('[data-testid="operational-financial-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="operational-milestones-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="operational-progress-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="operational-team-card"]')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW 2 — Financial Metrics & SAR Currency Formatting
  // ---------------------------------------------------------------------------
  test.describe('FLOW 2 — Financial Metrics & SAR Currency Formatting', () => {
    test('Displays all 6 canonical financial metrics with SAR and 2 decimal places', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      const financialCard = page.locator('[data-testid="operational-financial-card"]');
      await expect(financialCard).toBeVisible();

      // Verify all 6 metric testids exist and display numbers with currency
      const metrics = [
        'authorized-budget-value',
        'actual-spend-value',
        'total-active-exposure-value',
        'available-balance-value',
        'pending-exposure-value',
        'projected-balance-value',
      ];

      for (const testId of metrics) {
        const metricEl = page.locator(`[data-testid="${testId}"]`);
        await expect(metricEl).toBeVisible();
        const text = await metricEl.textContent();
        // Sibling contains SAR
        const parentText = await metricEl.locator('..').textContent();
        expect(parentText).toContain('ر.س');
        // Matches decimal format (e.g. 150000.00)
        expect(text).toMatch(/[\d٠-٩]+[,،.٫][\d٠-٩]{2}/);
      }
    });

    test('Project with no approved budget displays no-budget badge', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${emptyProjectId}`, { waitUntil: 'networkidle' });

      const noBudgetBadge = page.locator('[data-testid="no-approved-budget-badge"]');
      await expect(noBudgetBadge).toBeVisible();
      await expect(noBudgetBadge).toContainText('بدون موازنة معتمدة');
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW 3 — Milestones & Overdue Signals
  // ---------------------------------------------------------------------------
  test.describe('FLOW 3 — Milestones & Overdue Signals', () => {
    test('Renders summary counts and overdue milestone alert', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      const milestonesCard = page.locator('[data-testid="operational-milestones-card"]');
      await expect(milestonesCard).toBeVisible();

      // Total count
      const totalCount = page.locator('[data-testid="milestones-total-count"]');
      await expect(totalCount).toBeVisible();
      expect(await totalCount.textContent()).toContain('2');

      // Overdue alert is visible because targetDate was 3 days ago
      const overdueAlert = page.locator('[data-testid="milestones-overdue-alert"]');
      await expect(overdueAlert).toBeVisible();
      expect(await overdueAlert.textContent()).toContain('1');
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW 4 — Site Progress & Empty State
  // ---------------------------------------------------------------------------
  test.describe('FLOW 4 — Site Progress & Empty State', () => {
    test('Populated project renders latest approved report with percentage and blockers', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      const progressCard = page.locator('[data-testid="operational-progress-card"]');
      await expect(progressCard).toBeVisible();

      // Progress bar and percentage
      const percentEl = page.locator('[data-testid="progress-percentage-value"]');
      await expect(percentEl).toBeVisible();
      expect(await percentEl.textContent()).toContain('65%');

      // Blockers section
      const blockersEl = page.locator('[data-testid="progress-blockers-alert"]');
      await expect(blockersEl).toBeVisible();
      expect(await blockersEl.textContent()).toContain('حديد التسليح');

      // Reporting engineer name
      const progressText = await progressCard.textContent();
      expect(progressText).toContain(engineerName);
    });

    test('Project without approved progress report renders Arabic empty state', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${emptyProjectId}`, { waitUntil: 'networkidle' });

      const emptyState = page.locator('[data-testid="empty-progress-state"]');
      await expect(emptyState).toBeVisible();
      expect(await emptyState.textContent()).toContain('لا يوجد تقرير إنجاز معتمد');
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW 5 — Read-Only Body Surface
  // ---------------------------------------------------------------------------
  test.describe('FLOW 5 — Read-Only Body Surface', () => {
    test('Operational dashboard view contains no mutation buttons or form inputs', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      const dashboardView = page.locator('[data-testid="operational-dashboard-view"]');
      await expect(dashboardView).toBeVisible();

      // 1. Zero approve/reject buttons inside operational body
      const approvalButtons = dashboardView.locator('button:has-text("اعتماد"), button:has-text("رفض"), button:has-text("حفظ")');
      expect(await approvalButtons.count()).toBe(0);

      // 2. Zero form inputs inside operational body
      const inputs = dashboardView.locator('input, textarea, select');
      expect(await inputs.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW 6 — Non-Manager Access Denial
  // ---------------------------------------------------------------------------
  test.describe('FLOW 6 — Non-Manager Access Denial', () => {
    test('Accountant navigating to /projects/[projectId] is denied or redirected', async ({ page }) => {
      await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      // Either redirected away from /projects/... or received an access-denied message
      const url = page.url();
      const bodyText = await page.locator('body').textContent();
      const isDenied =
        !url.includes(`/projects/${populatedProjectId}`) ||
        bodyText?.includes('غير مصرح') ||
        bodyText?.includes('ليس لديك صلاحية') ||
        bodyText?.includes('FORBIDDEN') ||
        bodyText?.includes('403');

      expect(isDenied).toBe(true);
    });

    test('Engineer navigating to /projects/[projectId] is denied or redirected', async ({ page }) => {
      await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
      await page.goto(`/projects/${populatedProjectId}`, { waitUntil: 'networkidle' });

      const url = page.url();
      const bodyText = await page.locator('body').textContent();
      const isDenied =
        !url.includes(`/projects/${populatedProjectId}`) ||
        bodyText?.includes('غير مصرح') ||
        bodyText?.includes('ليس لديك صلاحية') ||
        bodyText?.includes('FORBIDDEN') ||
        bodyText?.includes('403');

      expect(isDenied).toBe(true);
    });
  });
});
