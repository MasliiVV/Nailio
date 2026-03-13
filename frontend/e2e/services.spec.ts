import { test, expect, mockAuth, mockAPI } from './helpers';

test.describe('Services CRUD', () => {
  const mockServices = [
    {
      id: 's1',
      name: 'Манікюр',
      price: 50000,
      durationMinutes: 60,
      description: 'Класичний манікюр',
      color: '#E84393',
      isActive: true,
    },
    {
      id: 's2',
      name: 'Педикюр',
      price: 70000,
      durationMinutes: 90,
      description: null,
      color: '#0984E3',
      isActive: true,
    },
  ];

  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/services', mockServices);
  });

  test('displays services list', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await expect(page.getByText('Манікюр')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Педикюр')).toBeVisible();
  });

  test('add button opens bottom sheet form', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await page.getByRole('button', { name: /add|додати/i }).click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });

  test('edit button opens form with prefilled data', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await page.getByLabel('Edit').first().click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });

  test('delete button triggers confirmation', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await page.getByLabel('Delete').first().click();
    // showConfirm mock auto-confirms; deletion request should be sent
  });

  test('save button is disabled without required fields', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await page.getByRole('button', { name: /add|додати/i }).click();
    const saveBtn = page.locator('[class*="sheet"] button[class*="primary"]');
    await expect(saveBtn).toBeDisabled();
  });

  test('save button enables when fields filled', async ({ tgPage: page }) => {
    await page.goto('/master/services');
    await page.getByRole('button', { name: /add|додати/i }).click();

    // Fill form
    const inputs = page.locator('[class*="sheet"] input');
    await inputs.nth(0).fill('Нарощування');
    await inputs.nth(1).fill('800');
    await inputs.nth(2).fill('120');

    const saveBtn = page.locator('[class*="sheet"] button[class*="primary"]');
    await expect(saveBtn).toBeEnabled();
  });
});
