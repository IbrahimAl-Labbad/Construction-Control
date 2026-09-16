/**
 * tests/e2e/projects-phase-b.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 2 — Projects (Phase B):
 * - Project metadata update (/projects/[id]/edit) + audit verification
 * - Project status transitions according to strict state machine + audit verification
 * - Project manager re-assignment + audit verification
 * - Security guards on edit routes
 */

import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Test Credentials from environment
// ---------------------------------------------------------------------------
const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? '';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Tests
// ---------------------------------------------------------------------------

test.describe('Projects Phase B E2E Suite', () => {
  let secondManagerId: string;
  let secondManagerName = 'المهندس مدير تجريبي ثاني';
  let secondManagerEmail = 'manager2_e2e@test.local';

  test.beforeAll(async () => {
    // Ensure a secondary active MANAGER exists for manager assignment tests
    const existing = await prisma.user.findUnique({
      where: { email: secondManagerEmail },
    });

    if (existing) {
      secondManagerId = existing.id;
    } else {
      const user = await prisma.user.create({
        data: {
          email: secondManagerEmail,
          name: secondManagerName,
          role: Role.MANAGER,
          isActive: true,
        },
      });
      secondManagerId = user.id;
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Edit page route protection
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to project edit page is redirected to /login', async ({ page }) => {
    await page.goto('/projects/dummy-id/edit');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager role is blocked from project edit page', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects/dummy-id/edit');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Phase B Workflow: Update, Change Status, Assign Manager
  // -------------------------------------------------------------------------
  test.describe('Manager Phase B Operations', () => {
    test.beforeEach(async () => {
      test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials not configured');
    });

    test('Manager edits metadata, transitions status, and reassigns manager with full audit', async ({ page }) => {
      const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
      const testCode = `PRJ-B-${randomSuffix}`;
      const originalName = `مشروع فاز ب ${randomSuffix}`;
      const updatedName = `مشروع فاز ب المعدل ${randomSuffix}`;
      const updatedLocation = 'الدمام - حي الشاطئ';
      const updatedDescription = 'تحديث نطاق العمل الإنشائي للمشروع بالكامل.';
      const editReason = 'تحديث بيانات المشروع حسب متطلبات المالك';

      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      // 1. Create a project to work with
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('input-project-code').fill(testCode);
      await page.getByTestId('input-project-name').fill(originalName);
      await page.getByTestId('input-project-location').fill('الرياض');
      await page.getByTestId('textarea-project-description').fill('وصف أولي للمشروع.');
      await page.getByTestId('submit-create-project-button').click();

      await page.waitForURL('**/projects', { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Navigate to project details
      await page.getByTestId(`view-project-${testCode}`).click();
      await page.waitForURL(/\/projects\/[a-z0-9]+/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 2. Test Edit Metadata
      await page.getByTestId('edit-project-button').click();
      await page.waitForURL(/\/projects\/[a-z0-9]+\/edit/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.getByTestId('edit-input-project-name').fill(updatedName);
      await page.getByTestId('edit-input-project-location').fill(updatedLocation);
      await page.getByTestId('edit-textarea-project-description').fill(updatedDescription);
      await page.getByTestId('edit-reason-input').fill(editReason);

      await page.getByTestId('submit-edit-project-button').click();

      // Redirect back to project details
      await page.waitForURL(/\/projects\/[a-z0-9]+$/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Verify updated values displayed
      await expect(page.getByTestId('project-name')).toHaveText(updatedName);
      await expect(page.getByTestId('project-location')).toHaveText(updatedLocation);
      await expect(page.getByTestId('project-description')).toHaveText(updatedDescription);

      // Verify PROJECT_UPDATED audit log in DB
      const projectRecord = await prisma.project.findUnique({
        where: { code: testCode },
        select: { id: true },
      });
      expect(projectRecord).not.toBeNull();
      const projectId = projectRecord!.id;

      const updateAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'PROJECT',
          entityId: projectId,
          action: 'PROJECT_UPDATED',
        },
      });
      expect(updateAudit).not.toBeNull();
      expect((updateAudit?.metadata as Record<string, unknown>)?.['reason']).toBe(editReason);

      // 3. Test Change Status (Strict State Machine)
      // Project is currently PLANNED -> allowed next: ACTIVE, CANCELLED
      await page.getByTestId('change-status-button').click();
      const statusDialog = page.getByTestId('change-status-dialog');
      await expect(statusDialog).toBeVisible();

      // Verify dropdown options
      const selectStatus = page.getByTestId('select-new-status');
      const statusOptions = await selectStatus.locator('option').allInnerTexts();
      expect(statusOptions).toContain('نشط');
      expect(statusOptions).toContain('ملغى');
      expect(statusOptions).not.toContain('معلق');
      expect(statusOptions).not.toContain('مكتمل');

      // Attempting to select ACTIVE without an approved budget fails with error
      await selectStatus.selectOption('ACTIVE');
      const statusReason = 'بدء الأعمال الميدانية واعتماد المخططات';
      await page.getByTestId('status-reason-input').fill(statusReason);
      await page.getByTestId('confirm-status-change-button').click();

      // Dialog remains open with budget required error
      await expect(statusDialog).toBeVisible();
      await expect(statusDialog.getByText(/موازنة معتمدة/i)).toBeVisible();

      // Seed approved budget for this project in PostgreSQL to satisfy the invariant
      await prisma.budget.create({
        data: {
          projectId,
          version: 1,
          status: 'APPROVED',
          totalAmount: 100000.0,
          currency: 'SAR',
          createdById: secondManagerId,
          approvedById: secondManagerId,
          approvedAt: new Date(),
        },
      });

      // Retry status change with approved budget -> now succeeds
      await page.getByTestId('confirm-status-change-button').click();

      // Dialog closes and status badge reflects ACTIVE
      await expect(statusDialog).not.toBeVisible();
      const statusBadge = page.getByTestId('project-status-badge');
      await expect(statusBadge).toHaveText('نشط');

      // Verify PROJECT_STATUS_CHANGED audit log
      const statusAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'PROJECT',
          entityId: projectId,
          action: 'PROJECT_STATUS_CHANGED',
        },
      });
      expect(statusAudit).not.toBeNull();
      const statusMeta = statusAudit?.metadata as Record<string, unknown>;
      expect(statusMeta?.['previousStatus']).toBe('PLANNED');
      expect(statusMeta?.['newStatus']).toBe('ACTIVE');
      expect(statusMeta?.['reason']).toBe(statusReason);

      // Transition ACTIVE -> ON_HOLD
      await page.getByTestId('change-status-button').click();
      await expect(statusDialog).toBeVisible();
      await selectStatus.selectOption('ON_HOLD');
      await page.getByTestId('confirm-status-change-button').click();
      await expect(statusDialog).not.toBeVisible();
      await expect(page.getByTestId('project-status-badge')).toHaveText('معلق');

      // 4. Test Assign Manager
      await page.getByTestId('assign-manager-button').click();
      const assignDialog = page.getByTestId('assign-manager-dialog');
      await expect(assignDialog).toBeVisible();

      // Select second manager
      await page.getByTestId('select-new-manager').selectOption(secondManagerId);
      const assignReason = 'نقل الإشراف المباشر إلى مدير مشاريع المنطقة الشرقية';
      await page.getByTestId('assign-manager-reason-input').fill(assignReason);
      await page.getByTestId('confirm-assign-manager-button').click();

      // Dialog closes and new manager displayed
      await expect(assignDialog).not.toBeVisible();
      await expect(page.getByTestId('project-manager-name')).toHaveText(secondManagerName);

      // Verify PROJECT_MANAGER_ASSIGNED audit log
      const assignAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'PROJECT',
          entityId: projectId,
          action: 'PROJECT_MANAGER_ASSIGNED',
        },
      });
      expect(assignAudit).not.toBeNull();
      const assignMeta = assignAudit?.metadata as Record<string, unknown>;
      expect(assignMeta?.['newManagerId']).toBe(secondManagerId);
      expect(assignMeta?.['reason']).toBe(assignReason);
    });
  });
});
