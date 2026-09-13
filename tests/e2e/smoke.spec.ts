import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('should load the home or redirect to login', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    // Verify page loads without a 500 error
    expect(response?.status()).toBeLessThan(500);
  });
});
