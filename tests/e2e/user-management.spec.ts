/**
 * tests/e2e/user-management.spec.ts
 *
 * End-to-end tests for User Management Vertical Slice 1:
 * - Create, deactivate, reactivate user accounts
 * - Role authorization enforcement
 * - Form validation feedback
 * - Deactivated user authentication rejection
 * - Self-deactivation prevention
 */

import { test, expect, type Page } from '@playwright/test';

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

/**
 * Navigate to /users and wait until the page is fully hydrated —
 * i.e. the create-user form (a streamed client component) is visible and stable.
 */
async function goToUsersPage(page: Page): Promise<void> {
  await page.goto('/users');
  // Wait for streaming / hydration to complete before assertions or interactions
  await page.waitForLoadState('networkidle');
  // Ensure the form is actually present and stable before returning
  await page.locator('#create-user-form').waitFor({ state: 'visible', timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('User Management E2E Flow', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Unauthenticated access blocked
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /users is redirected to /login', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // 2. Non-manager access blocked
  // -------------------------------------------------------------------------
  test('non-manager (Engineer) cannot access /users', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Access must be blocked: either a redirect to login or an inline access-denied message
    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3-9. Manager User Management Full Lifecycle
  // -------------------------------------------------------------------------
  test.describe('Manager Operations Lifecycle', () => {
    test.beforeEach(async () => {
      test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials not configured');
    });

    test('renders user management page, minimal top bar, and form', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await goToUsersPage(page);

      // Top bar
      await expect(page.locator('header')).toBeVisible();
      await expect(page.getByRole('button', { name: /تسجيل الخروج/i })).toBeVisible();

      // Page heading and key sections
      await expect(page.getByRole('heading', { name: 'إدارة المستخدمين', level: 1 })).toBeVisible();
      await expect(page.locator('#create-user-form')).toBeVisible();
      await expect(page.locator('[data-testid="user-list-table"]')).toBeVisible();
    });

    test('displays field-level validation errors for invalid input', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await goToUsersPage(page);

      // Fill with invalid data — form is stable after goToUsersPage
      await page.locator('#name').fill('أ'); // Too short
      await page.locator('#email').fill('not-an-email');
      await page.locator('#role').selectOption('ENGINEER');
      await page.locator('#password').fill('weak'); // Missing uppercase, digit, symbol

      await page.locator('#create-user-submit').click();

      // Inline field-level errors from server-side validation
      await expect(page.locator('#name-error')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('#email-error')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('#password-error')).toBeVisible({ timeout: 8000 });
    });

    test('Manager self-deactivation is disabled', async ({ page }) => {
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await goToUsersPage(page);

      // Find the manager's own row in the user table
      const managerRow = page.locator(`tr:has-text("${MANAGER_EMAIL}")`);
      await expect(managerRow).toBeVisible({ timeout: 8000 });

      // The toggle button on the manager's own row must be disabled
      const toggleButton = managerRow.locator('button');
      await expect(toggleButton).toBeDisabled();
    });

    test('Full lifecycle: create user, authenticate, deactivate, authenticate blocked, reactivate', async ({
      page,
      browser,
    }) => {
      const uniqueSuffix = Date.now();
      const newUserName = `مهندس اختبار ${uniqueSuffix}`;
      const newUserEmail = `test.eng.${uniqueSuffix}@test.local`;
      const newUserPassword = `P@ssw0rd_${uniqueSuffix}!`;

      // 1. Manager logs in and creates a new user
      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
      await goToUsersPage(page);

      await page.locator('#name').fill(newUserName);
      await page.locator('#email').fill(newUserEmail);
      await page.locator('#role').selectOption('ENGINEER');
      await page.locator('#password').fill(newUserPassword);

      await page.locator('#create-user-submit').click();

      // Success message appears mentioning the new user's name
      await expect(page.locator('[data-testid="create-user-success"]')).toBeVisible({ timeout: 10000 });

      // New user row appears in the table
      const newUserRow = page.locator(`tr:has-text("${newUserEmail}")`);
      await expect(newUserRow).toBeVisible({ timeout: 10000 });
      await expect(newUserRow.locator('text=نشط')).toBeVisible();

      // 2. Newly created user can authenticate
      const userContext = await browser.newContext({ locale: 'ar-SA' });
      const userPage = await userContext.newPage();
      await loginAs(userPage, newUserEmail, newUserPassword);
      await expect(userPage).not.toHaveURL(/\/login/);
      await userContext.close();

      // 3. Manager deactivates the new user
      const deactivateButton = newUserRow.locator('button:has-text("تعطيل")');
      await deactivateButton.click();

      // Status badge changes to "غير نشط" and action button changes to "تفعيل"
      await expect(newUserRow.locator('text=غير نشط')).toBeVisible({ timeout: 10000 });
      await expect(newUserRow.locator('button:has-text("تفعيل")')).toBeVisible();

      // 4. Deactivated user cannot authenticate
      const blockedContext = await browser.newContext({ locale: 'ar-SA' });
      const blockedPage = await blockedContext.newPage();

      await blockedPage.goto('/login');
      await blockedPage.waitForLoadState('networkidle');
      await blockedPage.getByLabel(/البريد الإلكتروني|email/i).fill(newUserEmail);
      await blockedPage.getByLabel(/كلمة المرور|password/i).fill(newUserPassword);
      await blockedPage.getByRole('button', { name: /تسجيل الدخول|sign in|login/i }).click();

      // Must stay on /login with an error indicator
      await expect(blockedPage).toHaveURL(/\/login/, { timeout: 10000 });
      const errorIndicator = blockedPage.locator('[role="alert"], [data-testid="auth-error"]');
      await expect(errorIndicator.first()).toBeVisible({ timeout: 8000 });
      await blockedContext.close();

      // 5. Manager reactivates the user
      const activateButton = newUserRow.locator('button:has-text("تفعيل")');
      await activateButton.click();

      // Status updates back to "نشط" and button reverts to "تعطيل"
      await expect(newUserRow.locator('text=نشط')).toBeVisible({ timeout: 10000 });
      await expect(newUserRow.locator('button:has-text("تعطيل")')).toBeVisible();

      // 6. Reactivated user can authenticate again
      const reauthContext = await browser.newContext({ locale: 'ar-SA' });
      const reauthPage = await reauthContext.newPage();
      await loginAs(reauthPage, newUserEmail, newUserPassword);
      await expect(reauthPage).not.toHaveURL(/\/login/);
      await reauthContext.close();
    });
  });
});
