import { test, expect, type Page } from '@playwright/test';
import { AssignmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const _MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
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

test.describe('Site Engineer Workspace E2E Suite (Vertical Slice 14)', () => {
  test.setTimeout(90000);

  let assignedProjectId: string;
  let assignedProjectCode: string;
  let unassignedProjectId: string;

  test.beforeAll(async () => {
    const mgr = await prisma.user.findFirst({
      where: { email: MANAGER_EMAIL, role: Role.MANAGER },
    });
    const eng = await prisma.user.findFirst({
      where: { email: ENGINEER_EMAIL, role: Role.ENGINEER },
    });
    if (!mgr || !eng) {
      throw new Error('E2E Manager or Engineer user not found');
    }

    // 1. Create assigned active project
    assignedProjectCode = `E2E-WS-${Date.now().toString().slice(-5)}`;
    const assignedProject = await prisma.project.create({
      data: {
        code: assignedProjectCode,
        name: 'مشروع مساحة المهندس E2E',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    assignedProjectId = assignedProject.id;

    await prisma.projectAssignment.create({
      data: {
        projectId: assignedProjectId,
        engineerId: eng.id,
        assignedById: mgr.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    // 2. Create unassigned project
    const unassignedProject = await prisma.project.create({
      data: {
        code: `E2E-UN-${Date.now().toString().slice(-5)}`,
        name: 'مشروع غير مخصص E2E',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    unassignedProjectId = unassignedProject.id;
  });

  test.afterAll(async () => {
    if (assignedProjectId) {
      await prisma.projectAssignment.deleteMany({ where: { projectId: assignedProjectId } });
      await prisma.project.deleteMany({ where: { id: assignedProjectId } });
    }
    if (unassignedProjectId) {
      await prisma.project.deleteMany({ where: { id: unassignedProjectId } });
    }
  });

  test('engineer navigates from top-bar to /my-projects and enters scoped workspace', async ({
    page,
  }) => {
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/my-reports');
    await page.waitForURL('**/my-reports');

    // 1. Verify Top Bar navigation contains /my-projects link
    const myProjectsLink = page.getByTestId('nav-my-projects-link');
    await expect(myProjectsLink).toBeVisible();
    await myProjectsLink.click();

    // 2. Verify /my-projects portfolio page
    await page.waitForURL('**/my-projects');
    await expect(page.getByTestId('page-title')).toContainText('مشاريعي الميدانية');

    // 3. Verify assigned project card is visible
    const projectCard = page.getByTestId(`project-card-${assignedProjectId}`);
    await expect(projectCard).toBeVisible();
    await expect(projectCard).toContainText(assignedProjectCode);

    // 4. Click enter workspace
    const enterLink = projectCard.getByTestId('enter-workspace-link');
    await enterLink.click();

    // 5. Verify /my-projects/[projectId] workspace page
    await page.waitForURL(`**/my-projects/${assignedProjectId}`);
    await expect(page.getByTestId('engineer-workspace-header')).toBeVisible();
    await expect(page.getByTestId('engineer-workspace-header')).toContainText('مشروع مساحة المهندس E2E');
    await expect(page.getByTestId('engineer-workspace-header')).toContainText('مهندس موقع');

    // 6. Verify tabs are present
    await expect(page.getByTestId('tab-milestones')).toBeVisible();
    await expect(page.getByTestId('tab-reports')).toBeVisible();
    await expect(page.getByTestId('tab-expenses')).toBeVisible();
    await expect(page.getByTestId('tab-custodies')).toBeVisible();
    await expect(page.getByTestId('tab-categories')).toBeVisible();

    // 7. Verify quick action link for new report
    await expect(page.getByTestId('create-report-link')).toBeVisible();
  });

  test('engineer receives 403 Forbidden alert when attempting direct access to unassigned project workspace', async ({
    page,
  }) => {
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    // Attempt direct navigation to unassigned project workspace
    await page.goto(`/my-projects/${unassignedProjectId}`);

    // Verify Forbidden Alert component is rendered
    await expect(page.getByTestId('unassigned-forbidden-alert')).toBeVisible();
    await expect(page.getByTestId('unassigned-forbidden-alert')).toContainText('غير مصرح بالدخول');
  });
});
