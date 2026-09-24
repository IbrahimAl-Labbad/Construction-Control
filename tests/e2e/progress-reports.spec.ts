import { test, expect, type Page } from '@playwright/test';
import { Role, ProjectStatus } from '@prisma/client';
import { prisma } from '../../lib/db/prisma';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'manager@test.local';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? 'engineer@test.local';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
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

test.describe('Progress Reports E2E Suite (Vertical Slice 10)', () => {
  test.setTimeout(90000);

  let testProjectId: string;
  let testProjectCode: string;
  const cleanupReportIds: string[] = [];

  test.beforeAll(async () => {
    // Find manager user
    const mgr = await prisma.user.findFirst({
      where: { email: MANAGER_EMAIL, role: Role.MANAGER },
    });
    if (!mgr) {
      throw new Error(`Manager user not found for email: ${MANAGER_EMAIL}`);
    }

    // Create an active project for testing
    testProjectCode = `PRJ-E2E-${Date.now()}`;
    const project = await prisma.project.create({
      data: {
        code: testProjectCode,
        name: 'مشروع الاختبار الميداني الشامل',
        status: ProjectStatus.ACTIVE,
        managerId: mgr.id,
      },
    });
    testProjectId = project.id;
  });

  test.afterAll(async () => {
    for (const id of cleanupReportIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROGRESS_REPORT', entityId: id } });
      await prisma.progressReport.deleteMany({ where: { id } });
    }
    if (testProjectId) {
      await prisma.progressReport.deleteMany({ where: { projectId: testProjectId } });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
  });

  test('Flow 1: Site Engineer creates DRAFT, edits, and submits', async ({ page }) => {
    // 1. Login as Engineer
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);

    // 2. Navigate to /my-reports
    await page.goto('/my-reports');
    await expect(page.getByTestId('page-title')).toContainText('تقارير التقدم الميداني');

    // 3. Click create new report
    await page.getByTestId('create-report-button').click();
    await page.waitForURL('**/my-reports/new');

    // 4. Fill form
    await page.getByTestId('project-select').selectOption(testProjectId);
    await page.getByTestId('report-title-input').fill('تقرير إنجاز الهيكل الخرساني');
    await page.getByTestId('work-description-input').fill('تم صب أعمدة الدور الأرضي بنجاح مع أخذ مكعبات الاختبار.');
    await page.getByTestId('progress-percentage-input').fill('35');
    await page.getByTestId('blockers-input').fill('لا توجد عوائق تشغيلية.');
    await page.getByTestId('weather-condition-input').fill('صحو معتدل');

    // 5. Submit form (save draft)
    await page.getByTestId('save-report-button').click();

    // 6. Wait for redirect to detail page
    await page.waitForURL((url) => url.pathname.startsWith('/my-reports/') && !url.pathname.endsWith('/new'));
    const reportUrl = page.url();
    const reportId = reportUrl.split('/').pop()!;
    cleanupReportIds.push(reportId);

    // Verify detail page elements
    await expect(page.getByTestId('report-title')).toContainText('تقرير إنجاز الهيكل الخرساني');
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('مسودة');

    // 7. Click edit draft link
    await page.getByTestId('edit-draft-link').click();
    await page.waitForURL(`**/my-reports/${reportId}/edit`);

    // Edit progress percentage
    await page.getByTestId('progress-percentage-input').fill('40');
    await page.getByTestId('save-report-button').click();

    await page.waitForURL(`**/my-reports/${reportId}`);
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('مسودة');

    // 8. Submit report for review
    await page.getByTestId('submit-report-button').click();
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('قيد المراجعة');

    // Edit link must no longer be visible once SUBMITTED
    await expect(page.getByTestId('edit-draft-link')).toHaveCount(0);
  });

  test('Flow 2: Manager reviews, rejects, Engineer reopens & resubmits, Manager approves', async ({ page }) => {
    // 1. Engineer creates and submits a report
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/my-reports/new');

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const dateStr = pastDate.toISOString().slice(0, 10);

    await page.getByTestId('project-select').selectOption(testProjectId);
    await page.getByTestId('report-date-input').fill(dateStr);
    await page.getByTestId('report-title-input').fill('تقرير العزل المائي للأساسات');
    await page.getByTestId('work-description-input').fill('تم تنفيذ طبقتين من العزل المائي البيتوميني.');
    await page.getByTestId('save-report-button').click();

    await page.waitForURL((url) => url.pathname.startsWith('/my-reports/') && !url.pathname.endsWith('/new'));
    const reportId = page.url().split('/').pop()!;
    cleanupReportIds.push(reportId);

    await page.getByTestId('submit-report-button').click();
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('قيد المراجعة');

    // 2. Manager logs in
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // 3. Manager navigates to global list (/progress-reports)
    await page.goto('/progress-reports');
    await expect(page.getByTestId('page-title')).toContainText('تقارير التقدم الميداني');

    // Filter by project
    await page.getByTestId('project-filter-select').selectOption(testProjectId);
    await page.waitForTimeout(500);

    // Open report
    await page.getByTestId(`review-report-${reportId}`).click();
    await page.waitForURL(`**/progress-reports/${reportId}`);

    // 4. Manager rejects with reason
    await page.getByTestId('reject-report-button').click();
    await page.getByTestId('rejection-reason-input').fill('يرجى توضيح سماكة طبقة الحماية وتاريخ فحص العزل');
    await page.getByTestId('confirm-reject-button').click();

    await expect(page.getByTestId('progress-report-status-badge')).toContainText('مرفوض');

    // 5. Engineer logs back in
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto(`/my-reports/${reportId}`);

    await expect(page.getByTestId('rejection-notice-banner')).toBeVisible();
    await expect(page.getByTestId('rejection-notice-banner')).toContainText('سماكة طبقة الحماية');

    // Click reopen
    await page.getByTestId('reopen-report-button').click();
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('مسودة');

    // Edit and resubmit
    await page.getByTestId('edit-draft-link').click();
    await page.getByTestId('work-description-input').fill('تم تنفيذ طبقتين عزل بسماكة 4 ملم مع فحص واختبار الغمر بالماء.');
    await page.getByTestId('save-report-button').click();
    await page.waitForURL(`**/my-reports/${reportId}`);

    await page.getByTestId('submit-report-button').click();
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('قيد المراجعة');

    // 6. Manager logs in and approves
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto(`/progress-reports/${reportId}`);

    await page.getByTestId('approve-report-button').click();
    await expect(page.getByTestId('progress-report-status-badge')).toContainText('معتمد');

    // Approved report is strictly immutable: no action buttons
    await expect(page.getByTestId('approve-report-button')).toHaveCount(0);
    await expect(page.getByTestId('reject-report-button')).toHaveCount(0);
  });

  test('Flow 3: Project-scoped navigation from project detail page', async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    // Navigate to project detail page
    await page.goto(`/projects/${testProjectId}`);

    // Verify sub-navigation button exists
    const progressBtn = page.getByTestId('view-progress-reports-button');
    await expect(progressBtn).toBeVisible();
    await progressBtn.click();

    // Verify URL is /projects/[projectId]/progress
    await page.waitForURL(`**/projects/${testProjectId}/progress`);
    await expect(page.getByText('تقارير التقدم الميداني للمشروع')).toBeVisible();
  });

  test('Flow 4: Accountant denied access to Engineer routes and Progress Reports', async ({ page }) => {
    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);

    // Attempt to access engineer route
    await page.goto('/my-reports');
    // Guard displays permission error header
    await expect(page.getByText('غير مصرح بالدخول')).toBeVisible();

    // Attempt to access manager progress reports route
    await page.goto('/progress-reports');
    await expect(page.getByText('غير مصرح بالدخول')).toBeVisible();
  });
});
