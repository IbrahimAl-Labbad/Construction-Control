/**
 * tests/e2e/milestones.spec.ts
 *
 * Playwright E2E Test Suite for Vertical Slice 12 — Project Planning & Milestones.
 *
 * Covers:
 * 1. Manager creates milestones
 * 2. Manager edits milestone metadata
 * 3. Manager starts milestone (PLANNED -> IN_PROGRESS)
 * 4. Manager completes milestone (IN_PROGRESS -> COMPLETED)
 * 5. Manager cancels milestone with cancellationReason (PLANNED -> CANCELLED)
 * 6. Manager soft-deletes PLANNED milestone
 * 7. Engineer sees assigned project's milestones (read-only)
 * 8. Engineer CANNOT see unassigned project's milestones (denied)
 * 9. Accountant can view milestones (read-only)
 * 10. Purchasing can view milestones (read-only)
 * 11. Terminal project freezes all milestone mutations
 * 12. Project overview page summary and links update dynamically
 */

import { test, expect, type Page } from '@playwright/test';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? 'accountant@test.local';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const PURCHASING_EMAIL = process.env['E2E_PURCHASING_EMAIL'] ?? 'purchasing@test.local';
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

test.describe('Project Planning & Milestones E2E Suite (Vertical Slice 12)', () => {
  test.setTimeout(120000);

  let managerUserId: string;
  let engineerUserId: string;
  let activeProjectId: string;
  let unassignedProjectId: string;
  let frozenProjectId: string;

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
          name: 'مهندس اختبار المعالم',
          email: ENGINEER_EMAIL,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    engineerUserId = eng.id;

    // 3. Create Project 1 (Active, assigned to Engineer)
    const p1 = await prisma.project.create({
      data: {
        code: `PRJ-MS-1-${Date.now()}`,
        name: 'مشروع المعالم الرئيسي E2E',
        status: ProjectStatus.ACTIVE,
        managerId: managerUserId,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-03-31'),
      },
    });
    activeProjectId = p1.id;
    cleanupProjectIds.push(p1.id);

    // Assign engineer to Project 1
    await prisma.projectAssignment.create({
      data: {
        projectId: activeProjectId,
        engineerId: engineerUserId,
        assignedById: managerUserId,
      },
    });

    // 4. Create Project 2 (Active, NOT assigned to Engineer)
    const p2 = await prisma.project.create({
      data: {
        code: `PRJ-MS-2-${Date.now()}`,
        name: 'مشروع معالم غير مسند E2E',
        status: ProjectStatus.ACTIVE,
        managerId: managerUserId,
      },
    });
    unassignedProjectId = p2.id;
    cleanupProjectIds.push(p2.id);

    // 5. Create Project 3 (COMPLETED terminal freeze)
    const p3 = await prisma.project.create({
      data: {
        code: `PRJ-MS-3-${Date.now()}`,
        name: 'مشروع معالم مجمد E2E',
        status: ProjectStatus.COMPLETED,
        managerId: managerUserId,
      },
    });
    frozenProjectId = p3.id;
    cleanupProjectIds.push(p3.id);
  });

  test.afterAll(async () => {
    if (cleanupProjectIds.length > 0) {
      await prisma.projectMilestone.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.projectAssignment.deleteMany({
        where: { projectId: { in: cleanupProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: cleanupProjectIds } },
      });
    }
  });

  test('Flow 1: Manager full milestone lifecycle, reorder, soft delete, and project overview update', async ({
    page,
  }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // 1. Visit Project Overview page & verify milestones link & widget
    await page.goto(`/projects/${activeProjectId}`);
    await page.waitForLoadState('networkidle');

    const milestonesNavBtn = page.getByTestId('project-milestones-button');
    await expect(milestonesNavBtn).toBeVisible();
    await milestonesNavBtn.click();

    // 2. Arrive at /projects/[projectId]/milestones
    await page.waitForURL(`**/projects/${activeProjectId}/milestones`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'المعالم التعاقدية والتخطيطية',
    );
    await expect(page.getByTestId('summary-total-count')).toHaveText('0');

    // 3. Create Milestone 1
    await page.getByTestId('create-milestone-button').click();
    await page.getByTestId('milestone-title-input').fill('أعمال الحفر وتجهيز الموقع');
    await page.getByTestId('milestone-target-date-input').fill('2026-10-15');
    await page.getByTestId('milestone-description-input').fill('حفر الأساسات وتسوية الموقع العام');
    await page.getByTestId('confirm-create-milestone-button').click();

    // Verify Milestone 1 appears in table as PLANNED
    await expect(page.getByTestId('milestone-title').first()).toContainText('أعمال الحفر وتجهيز الموقع');
    await expect(page.getByTestId('milestone-status-badge').first()).toContainText(/قيد التخطيط|مخطط/);
    await expect(page.getByTestId('summary-total-count')).toHaveText('1');

    // 4. Create Milestone 2
    await page.getByTestId('create-milestone-button').click();
    await page.getByTestId('milestone-title-input').fill('صب الخرسانة المسلحة');
    await page.getByTestId('milestone-target-date-input').fill('2026-11-20');
    await page.getByTestId('confirm-create-milestone-button').click();

    await expect(page.getByTestId('summary-total-count')).toHaveText('2');

    // 5. Edit Milestone 1
    const editBtn = page.getByTestId('edit-milestone-button').first();
    await editBtn.click();
    await page.getByTestId('edit-milestone-title-input').first().fill('أعمال الحفر وتجهيز الموقع - المرحلة أ');
    await page.getByTestId('edit-milestone-target-date-input').first().fill('2026-10-25');
    await page.getByTestId('confirm-edit-milestone-button').first().click();

    await expect(page.getByTestId('milestone-title').first()).toContainText(
      'أعمال الحفر وتجهيز الموقع - المرحلة أ',
    );

    // 6. Start Milestone 1 (PLANNED -> IN_PROGRESS)
    const row1 = page.locator('tr').filter({ hasText: 'أعمال الحفر وتجهيز الموقع' });
    const startBtn = row1.getByRole('button', { name: 'بدء' });
    await startBtn.click();
    await expect(row1.getByTestId('milestone-status-badge')).toContainText('قيد التنفيذ');
    await expect(page.getByTestId('summary-in-progress-count')).toHaveText('1');

    // 7. Complete Milestone 1 (IN_PROGRESS -> COMPLETED)
    const completeBtn = row1.getByRole('button', { name: 'إنجاز' });
    await expect(completeBtn).toBeEnabled();
    await completeBtn.click();
    await expect(row1.getByTestId('milestone-status-badge')).toContainText(/مكتمل|منجز/);
    await expect(page.getByTestId('summary-completed-count')).toHaveText('1');

    // 8. Cancel Milestone 2 (PLANNED -> CANCELLED)
    const cancelBtn = page.getByRole('button', { name: 'إلغاء' }).first();
    await cancelBtn.click();
    await page.getByPlaceholder(/أدخل سبب إلغاء هذا المعلم/i).fill('تعديل في التصاميم الإنشائية');
    await page.getByRole('button', { name: 'تأكيد الإلغاء' }).click();

    await expect(page.getByTestId('milestone-status-badge').nth(1)).toContainText(/ملغاة|ملغى/);

    // 9. Create and Soft-Delete Milestone 3
    await page.getByTestId('create-milestone-button').click();
    await page.getByTestId('milestone-title-input').fill('معلم تجريبي للحذف');
    await page.getByTestId('milestone-target-date-input').fill('2026-12-10');
    await page.getByTestId('confirm-create-milestone-button').click();

    await expect(page.getByTestId('summary-total-count')).toHaveText('3');

    // Click soft delete
    const deleteBtn = page.getByTitle('حذف المعلم (مسودة)').first();
    await deleteBtn.click();
    await page.getByTestId('confirm-delete-button').click();

    // Verify deleted milestone is removed
    await expect(page.getByText('معلم تجريبي للحذف')).toHaveCount(0);
    await expect(page.getByTestId('summary-total-count')).toHaveText('2');

    // 10. Check Project Overview summary widget
    await page.goto(`/projects/${activeProjectId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('project-milestones-summary')).toContainText('1 من 2 منجز');
  });

  test('Flow 2: Engineer scoping — view assigned project, blocked from unassigned project', async ({
    page,
  }) => {
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    // 1. Navigate to assigned project milestones -> ALLOWED (view-only)
    await page.goto(`/projects/${activeProjectId}/milestones`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'المعالم التعاقدية والتخطيطية',
    );
    // View-only: no create button, no mutation action buttons
    await expect(page.getByTestId('create-milestone-button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'بدء' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إنجاز' })).toHaveCount(0);

    // 2. Navigate to unassigned project milestones -> FORBIDDEN
    await page.goto(`/projects/${unassignedProjectId}/milestones`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('غير مصرح بالدخول')).toBeVisible();
  });

  test('Flow 3: Accountant and Purchasing view-only access', async ({ page }) => {
    // 1. Accountant
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto(`/projects/${activeProjectId}/milestones`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'المعالم التعاقدية والتخطيطية',
    );
    await expect(page.getByTestId('create-milestone-button')).toHaveCount(0);

    // 2. Purchasing
    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);
    await page.goto(`/projects/${activeProjectId}/milestones`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'المعالم التعاقدية والتخطيطية',
    );
    await expect(page.getByTestId('create-milestone-button')).toHaveCount(0);
  });

  test('Flow 4: Frozen project blocks all mutations', async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    await page.goto(`/projects/${frozenProjectId}/milestones`);
    await page.waitForLoadState('networkidle');

    // Verify frozen governance alert banner
    await expect(
      page.getByText(/المشروع في حالة تجميد/i),
    ).toBeVisible();

    // Create button is not rendered on frozen projects
    await expect(page.getByTestId('create-milestone-button')).toHaveCount(0);
  });
});
