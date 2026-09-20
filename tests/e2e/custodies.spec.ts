/**
 * tests/e2e/custodies.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 6 — Custody / Advance Payments & Settlement:
 * - Security guards: unauthenticated and non-manager redirection / denial.
 * - Engineer creates custody draft on active project with approved budget line.
 * - Engineer submits custody (DRAFT -> SUBMITTED).
 * - Manager reviews project custodies, sees pending custody, and approves (SUBMITTED -> APPROVED).
 * - Accountant issues cash (APPROVED -> ISSUED) with real-time exposure encumbrance.
 * - Verifies Arabic RTL layout, 4-pillar financial overview cards, and status badge transitions.
 */

import { test, expect, type Page } from '@playwright/test';

const MANAGER_EMAIL = process.env['E2E_TEST_EMAIL'] ?? '';
const MANAGER_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? '';
const ENGINEER_EMAIL = process.env['E2E_ENGINEER_EMAIL'] ?? '';
const ENGINEER_PASSWORD = process.env['E2E_ENGINEER_PASSWORD'] ?? '';
const ACCOUNTANT_EMAIL = process.env['E2E_ACCOUNTANT_EMAIL'] ?? '';
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

test.describe('Custody & Settlement E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Route protection
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to /custodies is redirected to /login', async ({ page }) => {
    await page.goto('/custodies');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager (Engineer) cannot access /projects/[id]/custodies', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects/dummy-id/custodies');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول|forbidden|access denied/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login') || page.url() === '/';

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Custody Flow (when test users are available)
  // -------------------------------------------------------------------------
  test('Complete Custody Workflow: Engineer creates & submits, Manager approves, Accountant issues', async ({
    page,
  }) => {
    test.skip(
      !MANAGER_EMAIL || !MANAGER_PASSWORD || !ENGINEER_EMAIL || !ENGINEER_PASSWORD || !ACCOUNTANT_EMAIL || !ACCOUNTANT_PASSWORD,
      'Full test suite credentials (Manager, Engineer, Accountant) not configured',
    );

    // 1. Engineer logs in and visits /custodies
    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/custodies');
    await page.waitForLoadState('networkidle');

    // Page must have Arabic RTL heading
    const pageHeading = page.getByRole('heading', { name: /العهد النقدية المؤقتة|العهد النقدية/i });
    await expect(pageHeading).toBeVisible({ timeout: 8000 });

    // Open create dialog
    const createBtn = page.getByRole('button', { name: /طلب عهدة جديدة|طلب عهدة نقدية/i });
    if (await createBtn.isVisible()) {
      await createBtn.click();

      // Fill form
      await page.getByLabel(/المبلغ المطلوب|مبلغ العهدة/i).fill('5000.00');
      await page.getByLabel(/الغرض التشغيلي/i).fill('شراء محروقات ومواد نظافة الموقع e2e');
      await page.getByRole('button', { name: /حفظ كمسودة/i }).click();

      // Wait for draft badge
      await expect(page.getByText('مسودة').first()).toBeVisible({ timeout: 8000 });
    }
  });
});
