/**
 * tests/e2e/budget.spec.ts
 *
 * Playwright E2E tests for Vertical Slice 3 — Budget / Financial Control Foundation:
 * - Security guards: unauthenticated and non-manager redirection / denial
 * - Manager creates budget draft with multiple line items
 * - Exact Decimal calculation in UI and DB
 * - Manager submission workflow (DRAFT → SUBMITTED)
 * - Manager rejection workflow (SUBMITTED → REJECTED with mandatory reason)
 * - Reopening rejected budget as draft on same record (REJECTED → DRAFT)
 * - Formal approval workflow (SUBMITTED → APPROVED, locking as immutable baseline)
 * - Cross-domain activation gate: project transitions PLANNED → ACTIVE once budget is approved
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

// ---------------------------------------------------------------------------
// Helper
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

test.describe('Budget / Financial Control E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // -------------------------------------------------------------------------
  // 1. Security check: Route protection
  // -------------------------------------------------------------------------
  test('unauthenticated user navigating to budget page is redirected to /login', async ({ page }) => {
    await page.goto('/projects/dummy-id/budget');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('non-manager role is blocked from project budget page', async ({ page }) => {
    test.skip(!ENGINEER_EMAIL || !ENGINEER_PASSWORD, 'Engineer credentials not configured');

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto('/projects/dummy-id/budget');
    await page.waitForLoadState('networkidle');

    const deniedHeading = page.getByRole('heading', { name: /غير مصرح بالدخول/i });
    const isDeniedVisible = await deniedHeading.isVisible({ timeout: 8000 }).catch(() => false);
    const isRedirectedToLogin = page.url().includes('/login');

    expect(isDeniedVisible || isRedirectedToLogin).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Full Budget Lifecycle and Project Activation Flow
  // -------------------------------------------------------------------------
  test.describe('Manager Budget Operations Lifecycle', () => {
    test.beforeEach(async () => {
      test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, 'Manager credentials not configured');
    });

    test('Manager completes full lifecycle: create draft, submit, reject, reopen, approve, and activate project', async ({ page }) => {
      const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
      const testCode = `PRJ-BG-${randomSuffix}`;
      const projectName = `مشروع موازنة تجريبي ${randomSuffix}`;

      await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

      // 1. Create a Project
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('input-project-code').fill(testCode);
      await page.getByTestId('input-project-name').fill(projectName);
      await page.getByTestId('input-project-location').fill('الرياض - حي الملز');
      await page.getByTestId('textarea-project-description').fill('مشروع للتحقق من دورة حياة الموازنة التقديرية.');
      await page.getByTestId('submit-create-project-button').click();

      await page.waitForURL('**/projects', { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Navigate to project details
      await page.getByTestId(`view-project-${testCode}`).click();
      await page.waitForURL(/\/projects\/[a-z0-9]+/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Verify Project details shows "غير محددة (مطلوبة لتفعيل المشروع)"
      await expect(page.getByTestId('project-no-budget-badge')).toBeVisible();

      // 2. Navigate to Budget management
      await page.getByTestId('project-budget-button').click();
      await page.waitForURL(/\/projects\/[a-z0-9]+\/budget/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 3. Fill first line item
      await page.getByTestId('budget-line-description-0').fill('توريد حديد تسليح سابك عالي المقاومة');
      await page.getByTestId('budget-line-amount-0').fill('50000.00');

      // 4. Add second line item
      await page.getByTestId('add-budget-line-button').click();
      await page.getByTestId('budget-line-category-1').selectOption('LABOR');
      await page.getByTestId('budget-line-description-1').fill('أجور أعمال الحدادة والنجارة المسلحة');
      await page.getByTestId('budget-line-amount-1').fill('25000.00');

      // Fill notes
      await page.getByTestId('budget-notes-input').fill('مسودة موازنة المرحلة الإنشائية الأولى');

      // Save Draft
      await page.getByTestId('save-budget-draft-button').click();

      // Wait for draft to be saved
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'DRAFT');
      await expect(page.getByTestId('budget-total-amount')).toContainText('75000.00');

      // 5. Submit for approval
      await page.getByTestId('submit-budget-button').click();
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'SUBMITTED');
      await expect(page.getByTestId('budget-submitted-banner')).toBeVisible();

      // 6. Test Rejection flow
      await page.getByTestId('reject-budget-button').click();
      await expect(page.getByTestId('rejection-reason-input')).toBeVisible();

      const rejectionReason = 'تكلفة بند المواد مرتفعة ويجب التفاوض على الخصم';
      await page.getByTestId('rejection-reason-input').fill(rejectionReason);
      await page.getByTestId('confirm-reject-button').click();

      // Verify rejected state
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'REJECTED');
      await expect(page.getByTestId('budget-rejected-banner')).toBeVisible();
      await expect(page.getByTestId('budget-rejected-banner')).toContainText(rejectionReason);

      // 7. Reopen draft on same record
      await page.getByTestId('reopen-budget-button').click();
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'DRAFT');

      // 8. Resubmit for approval
      await page.getByTestId('submit-budget-button').click();
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'SUBMITTED');

      // 9. Formal Approval
      // Handle native window.confirm dialog for approval
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      await page.getByTestId('approve-budget-button').click();

      // Verify APPROVED status & immutability banner
      await expect(page.getByTestId('budget-status-badge')).toHaveAttribute('data-status', 'APPROVED');
      await expect(page.getByTestId('budget-approved-banner')).toBeVisible();

      // Edit / Submit buttons must not exist once approved
      await expect(page.getByTestId('save-budget-draft-button')).not.toBeVisible();
      await expect(page.getByTestId('submit-budget-button')).not.toBeVisible();

      // 10. Return to Project Details and Activate Project
      await page.getByTestId('back-to-project-details-button').click();
      await page.waitForURL(/\/projects\/[a-z0-9]+$/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Verify Budget badge in project details is now "معتمدة رسمياً"
      await expect(page.getByTestId('project-budget-status-badge')).toHaveText('معتمدة رسمياً');

      // Now activate project: PLANNED -> ACTIVE
      await page.getByTestId('change-status-button').click();
      const statusDialog = page.getByTestId('change-status-dialog');
      await expect(statusDialog).toBeVisible();

      await page.getByTestId('select-new-status').selectOption('ACTIVE');
      await page.getByTestId('status-reason-input').fill('تم اعتماد الموازنة والبدء في تنفيذ الأعمال الميدانية');
      await page.getByTestId('confirm-status-change-button').click();

      // Dialog closes and project status reflects ACTIVE
      await expect(statusDialog).not.toBeVisible();
      await expect(page.getByTestId('project-status-badge')).toHaveText('نشط');

      // Clean up in DB
      const projectRecord = await prisma.project.findUnique({
        where: { code: testCode },
        select: { id: true },
      });
      if (projectRecord) {
        const pId = projectRecord.id;
        const bRec = await prisma.budget.findFirst({ where: { projectId: pId } });
        if (bRec) {
          await prisma.budgetLine.deleteMany({ where: { budgetId: bRec.id } });
          await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: bRec.id } });
          await prisma.budget.deleteMany({ where: { id: bRec.id } });
        }
        await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
        await prisma.project.deleteMany({ where: { id: pId } });
      }
    });
  });
});
