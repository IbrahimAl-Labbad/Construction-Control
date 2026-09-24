import { test, expect, type Page } from '@playwright/test';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';

async function loginAs(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/البريد الإلكتروني|email/i).fill(email);
  await page.getByLabel(/كلمة المرور|password/i).fill(pass);
  await page.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Project Team & Engineer Assignment E2E Suite (Vertical Slice 11)', () => {
  test.setTimeout(90000);

  let testProjectId: string;
  let testProjectCode: string;
  let engineer1Id: string;
  let engineer1Name: string;
  const cleanupUserIds: string[] = [];

  test.beforeAll(async () => {
    // 1. Verify manager exists
    const mgr = await prisma.user.findFirst({
      where: { email: MANAGER_EMAIL, role: Role.MANAGER },
    });
    if (!mgr) {
      throw new Error(`Manager user not found for email: ${MANAGER_EMAIL}`);
    }

    // 2. Create test engineer
    engineer1Name = `مهندس E2E ${Date.now()}`;
    const eng1 = await prisma.user.create({
      data: {
        name: engineer1Name,
        email: `eng.e2e.${Date.now()}@test.local`,
        role: Role.ENGINEER,
        isActive: true,
      },
    });
    engineer1Id = eng1.id;
    cleanupUserIds.push(eng1.id);

    // 3. Create active project
    testProjectCode = `PRJ-E2E-TM-${Date.now()}`;
    const project = await prisma.project.create({
      data: {
        code: testProjectCode,
        name: 'مشروع اختبار فريق العمل E2E',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    testProjectId = project.id;
  });

  test.afterAll(async () => {
    if (testProjectId) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'PROJECT', entityId: testProjectId },
      });
      await prisma.projectAssignment.deleteMany({
        where: { projectId: testProjectId },
      });
      await prisma.project.deleteMany({
        where: { id: testProjectId },
      });
    }

    for (const uid of cleanupUserIds) {
      await prisma.user.deleteMany({ where: { id: uid } });
    }
  });

  test('Manager navigates to Project Team, assigns engineer, removes engineer, and reactivates', async ({
    page,
  }) => {
    // Step 1: Login as Manager
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // Step 2: Navigate to Project Overview
    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // Verify team button and widget
    await expect(page.getByTestId('project-team-button')).toBeVisible();
    await expect(page.getByTestId('project-engineers-count')).toContainText('0');

    // Step 3: Click team button to navigate to Team management page
    await page.getByTestId('project-team-button').click();
    await page.waitForURL(`**/projects/${testProjectId}/team`);

    // Verify team page title and empty state
    await expect(page.getByRole('heading', { level: 1 })).toContainText('فريق عمل المشروع');
    await expect(page.getByTestId('no-active-engineers')).toBeVisible();

    // Step 4: Open Assign Engineer dialog
    await page.getByTestId('assign-engineer-button').click();

    // Select the test engineer
    await page.getByTestId('engineer-select').selectOption(engineer1Id);
    await page.getByTestId('assign-engineer-reason').fill('تكليف أعمال المرحلة الأولى الميدانية');

    // Confirm assignment
    await page.getByTestId('confirm-assign-engineer').click();

    // Step 5: Verify engineer is displayed in the Active team table
    const activeRow = page.getByTestId(`active-member-row-${engineer1Id}`);
    await expect(activeRow).toBeVisible();
    await expect(activeRow).toContainText(engineer1Name);

    // Step 6: Verify active count updated on project overview
    await page.goto(`/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('project-engineers-count')).toContainText('1');

    // Step 7: Return to team page and remove engineer
    await page.goto(`/projects/${testProjectId}/team`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId(`remove-engineer-button-${engineer1Id}`).click();
    await page.getByTestId('remove-engineer-reason').fill('انتهاء أعمال المرحلة الميدانية الأولى');
    await page.getByTestId('confirm-remove-engineer').click();

    // Step 8: Verify active table is empty and inactive section shows previous assignment
    await expect(page.getByTestId('no-active-engineers')).toBeVisible();
    const inactiveRow = page.getByTestId(`inactive-member-row-${engineer1Id}`);
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow).toContainText(engineer1Name);
    await expect(inactiveRow).toContainText('انتهاء أعمال المرحلة الميدانية الأولى');

    // Step 9: Reassign (reactivate) the engineer
    await page.getByTestId('assign-engineer-button').click();
    await page.getByTestId('engineer-select').selectOption(engineer1Id);
    await page.getByTestId('assign-engineer-reason').fill('إعادة التكليف للمرحلة الثانية');
    await page.getByTestId('confirm-assign-engineer').click();

    // Step 10: Verify engineer is back in active table
    await expect(page.getByTestId(`active-member-row-${engineer1Id}`)).toBeVisible();
  });
});
