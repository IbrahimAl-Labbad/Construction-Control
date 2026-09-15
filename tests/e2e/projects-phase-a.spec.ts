/**
 * tests/e2e/projects-phase-a.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 2 — Projects (Phase A):
 * - Role authorization enforcement: Engineer, Accountant, Purchasing blocked
 * - Manager creates project
 * - Project appears in list
 * - Project details display correctly
 * - Duplicate code rejection
 * - AuditLog verification
 */

import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../lib/db/prisma';

// ---------------------------------------------------------------------------
// Test Credentials from environment
// ---------------------------------------------------------------------------
const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? '';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? '';
const ACCOUNTANT_PASSWORD = process.env['E2E_ACCOUNTANT_PASSWORD'] ?? '';
const PURCHASING_EMAIL = process.env['E2E_PURCHASING_EMAIL'] ?? '';
const PURCHASING_PASSWORD = process.env['E2E_PURCHASING_PASSWORD'] ?? '';

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

test.describe('Projects Phase A E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Unauthenticated access blocked
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /projects is redirected to /login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // 2. Non-manager roles blocked (Engineer, Accountant, Purchasing)
  // -------------------------------------------------------------------------
  test('non-manager (Engineer) cannot access /projects', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  test('non-manager (Accountant) cannot access /projects', async ({ page }) => {
    test.skip(!ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD, 'Accountant credentials not configured');

    await loginAs(page, ACCOUNTANT_EMAIL, ACCOUNTANT_PASSWORD);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  test('non-manager (Purchasing) cannot access /projects', async ({ page }) => {
    test.skip(!PURCHASING_EMAIL || !PURCHASING_PASSWORD, 'Purchasing credentials not configured');

    await loginAs(page, PURCHASING_EMAIL, PURCHASING_PASSWORD);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3. Manager Project Lifecycle (Create, List, View, Duplicate Rejection)
  // -------------------------------------------------------------------------
  test.describe('Manager Project Operations', () => {
    test.beforeEach(async () => {
      test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials not configured');
    });

    test('Manager creates project, views it in list, and views details with audit log verified', async ({ page }) => {
      const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
      const testCode = `PRJ-${randomSuffix}`;
      const testName = `مشروع برج الأندلس ${randomSuffix}`;
      const testLocation = 'الرياض - حي النرجس';
      const testDescription = 'مشروع سكني وتجاري مكون من 12 طابقاً.';

      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      // 1. Navigate to /projects
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // Top bar check
      await expect(page.locator('header')).toBeVisible();
      await expect(page.getByTestId('nav-projects-link')).toBeVisible();
      await expect(page.getByTestId('nav-users-link')).toBeVisible();

      // Click "إنشاء مشروع جديد"
      await page.getByTestId('new-project-button').click();
      await page.waitForURL('**/projects/new');
      await page.waitForLoadState('networkidle');

      // 2. Fill Create Project Form
      await page.getByTestId('input-project-code').fill(testCode);
      await page.getByTestId('input-project-name').fill(testName);
      await page.getByTestId('input-project-location').fill(testLocation);
      await page.getByTestId('textarea-project-description').fill(testDescription);

      // Submit
      await page.getByTestId('submit-create-project-button').click();

      // Should redirect back to /projects
      await page.waitForURL('**/projects', { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 3. Verify Project appears in list
      const projectRow = page.getByTestId(`project-row-${testCode}`);
      await expect(projectRow).toBeVisible({ timeout: 10000 });
      await expect(projectRow).toContainText(testCode);
      await expect(projectRow).toContainText(testName);
      await expect(projectRow.getByTestId('project-status-badge')).toHaveText('قيد التخطيط');

      // 4. Click to view Project Details
      await page.getByTestId(`view-project-${testCode}`).click();
      await page.waitForURL(/\/projects\/[a-z0-9]+/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Verify Project Details
      await expect(page.getByTestId('project-code')).toHaveText(testCode);
      await expect(page.getByTestId('project-name')).toHaveText(testName);
      await expect(page.getByTestId('project-location')).toHaveText(testLocation);
      await expect(page.getByTestId('project-description')).toHaveText(testDescription);

      // 5. Verify database AuditLog exists
      const createdProject = await prisma.project.findUnique({
        where: { code: testCode },
        select: { id: true },
      });
      expect(createdProject).not.toBeNull();

      if (createdProject) {
        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'PROJECT',
            entityId: createdProject.id,
            action: 'PROJECT_CREATED',
          },
        });
        expect(audit).not.toBeNull();
        expect((audit?.metadata as Record<string, unknown>)?.['code']).toBe(testCode);
      }

      // 6. Test duplicate code rejection
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('input-project-code').fill(testCode);
      await page.getByTestId('input-project-name').fill('مشروع مكرر لنفس الكود');
      await page.getByTestId('submit-create-project-button').click();

      // Verify error banner
      const errorBanner = page.getByTestId('form-error-banner');
      await expect(errorBanner).toBeVisible({ timeout: 8000 });
      await expect(errorBanner).toContainText('كود المشروع مستخدم بالفعل');
    });
  });
});
