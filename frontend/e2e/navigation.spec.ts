import { test, expect, mockAuth, mockAPI } from './helpers';

test.describe('Settings & Navigation', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/analytics/dashboard*', {
      today: { bookings: 0, revenue: 0 },
      period: { totalBookings: 0, completed: 0, revenue: 0, newClients: 0 },
    });
    await mockAPI(page, '/bookings*', { items: [], total: 0 });
  });

  test('settings page renders all nav items', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await expect(page.locator('[class*="rowTitle"]')).toHaveCount(6, { timeout: 10_000 });
  });

  test('analytics card navigates to analytics', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await page.locator('[class*="row"]').filter({ hasText: /analytics|Аналітика/i }).click();
    await expect(page).toHaveURL(/\/master\/analytics/);
  });

  test('finance card navigates to finance', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await page.locator('[class*="row"]').filter({ hasText: /finance|Фінанси/i }).click();
    await expect(page).toHaveURL(/\/master\/finance/);
  });

  test('subscription card navigates to subscription', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await page.locator('[class*="row"]').filter({ hasText: /subscription|Підписка/i }).click();
    await expect(page).toHaveURL(/\/master\/subscription/);
  });

  test('branding card opens bottom sheet', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await page.locator('[class*="row"]').filter({ hasText: /branding|Брендинг/i }).click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });

  test('branding form has color presets', async ({ tgPage: page }) => {
    await page.goto('/master/settings');
    await page.locator('[class*="row"]').filter({ hasText: /branding|Брендинг/i }).click();
    // 12 color preset buttons
    const presets = page.locator('[class*="sheet"] button[style*="background"]');
    await expect(presets).toHaveCount(12, { timeout: 5_000 });
  });
});

test.describe('Bottom Navigation', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/analytics/dashboard*', {
      today: { bookings: 0, revenue: 0 },
      period: { totalBookings: 0, completed: 0, revenue: 0, newClients: 0 },
    });
    await mockAPI(page, '/bookings*', { items: [], total: 0 });
    await mockAPI(page, '/services', []);
    await mockAPI(page, '/clients*', { items: [], total: 0 });
    await mockAPI(page, '/schedule*', { hours: [], overrides: [] });
  });

  test('master layout has bottom nav bar', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    await expect(page.locator('[class*="nav"]')).toBeVisible({ timeout: 10_000 });
  });

  test('nav items navigate between pages', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    // Click on Calendar nav item
    const navItems = page.locator('[class*="navItem"]');
    await navItems.nth(1).click();
    await expect(page).toHaveURL(/\/master\/calendar/);
  });

  test('active nav item is highlighted', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    const activeItem = page.locator('[class*="active"]').first();
    await expect(activeItem).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Finance Page', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/finance/transactions*', {
      items: [
        {
          id: 't1',
          type: 'income',
          amount: 50000,
          description: 'Манікюр',
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });
    await mockAPI(page, '/finance/summary*', {
      income: 150000,
      expense: 30000,
      net: 120000,
    });
  });

  test('shows income/expense/net summary', async ({ tgPage: page }) => {
    await page.goto('/master/finance');
    await expect(page.locator('[class*="summaryCard"]')).toHaveCount(3, { timeout: 10_000 });
  });

  test('add button opens transaction form', async ({ tgPage: page }) => {
    await page.goto('/master/finance');
    await page.getByRole('button', { name: /add|додати/i }).click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });

  test('transaction form has income/expense tabs', async ({ tgPage: page }) => {
    await page.goto('/master/finance');
    await page.getByRole('button', { name: /add|додати/i }).click();
    await expect(page.locator('[class*="tabs"]')).toBeVisible();
  });
});

test.describe('Schedule Page', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/schedule*', {
      hours: [
        { dayOfWeek: 0, isWorking: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 1, isWorking: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 2, isWorking: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 3, isWorking: false, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 4, isWorking: true, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 5, isWorking: false, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 6, isWorking: false, startTime: '09:00', endTime: '18:00' },
      ],
      overrides: [],
    });
  });

  test('displays 7 day rows', async ({ tgPage: page }) => {
    await page.goto('/master/schedule');
    await expect(page.locator('[class*="dayRow"]')).toHaveCount(7, { timeout: 10_000 });
  });

  test('toggle switches day on/off', async ({ tgPage: page }) => {
    await page.goto('/master/schedule');
    const toggles = page.locator('[class*="toggle"] input');
    await expect(toggles).toHaveCount(7, { timeout: 10_000 });
  });

  test('add override button opens form', async ({ tgPage: page }) => {
    await page.goto('/master/schedule');
    await page.getByRole('button', { name: /add|додати/i }).click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });
});
