import { test, expect, mockAuth, mockAPI, openMiniApp } from './helpers';

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
    await openMiniApp(page, '/master/settings');
    await expect(page.locator('[class*="rowTitle"]')).toHaveCount(6, { timeout: 10_000 });
  });

  test('analytics card navigates to analytics', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/settings');
    await page.getByRole('button', { name: /Аналітика|Analytics/i }).click();
    await expect(page).toHaveURL(/\/master\/analytics/);
  });

  test('finance card navigates to finance', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/settings');
    await page.getByRole('button', { name: /Фінанси|Finance/i }).click();
    await expect(page).toHaveURL(/\/master\/finance/);
  });

  test('subscription card navigates to subscription', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/settings');
    await page.getByRole('button', { name: /Підписка|Subscription/i }).click();
    await expect(page).toHaveURL(/\/master\/subscription/);
  });

  test('branding card navigates to branding page', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/settings');
    await page.getByRole('button', { name: /Брендінг|Branding/i }).click();
    await expect(page).toHaveURL(/\/master\/branding/);
  });

  test('branding page shows editable fields', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/settings');
    await page.getByRole('button', { name: /Брендінг|Branding/i }).click();
    await expect(page.getByPlaceholder(/Назва вашого салону|Your business name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Зберегти|Save/i })).toBeVisible();
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
    await openMiniApp(page, '/master');
    await expect(page.locator('nav').last()).toBeVisible({ timeout: 10_000 });
  });

  test('nav items navigate between pages', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    const navItems = page.locator('[class*="navItem"]');
    await navItems.nth(1).click();
    await expect(page).toHaveURL(/\/master\/clients/);
  });

  test('bottom nav hides analytics entry', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    await expect(page.locator('[class*="navItem"]')).toHaveCount(4, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: /analytics|аналітика/i })).toHaveCount(0);
  });

  test('active nav item is highlighted', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
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
    await openMiniApp(page, '/master/finance');
    await expect(page.locator('[class*="summaryCard"]')).toHaveCount(4, { timeout: 10_000 });
  });

  test('add button opens transaction form', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/finance');
    await page.getByRole('button', { name: /add|додати/i }).click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible();
  });

  test('transaction form has income/expense tabs', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/finance');
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
    await openMiniApp(page, '/master/schedule');
    await expect(page.locator('[class*="dayRow"]')).toHaveCount(7, { timeout: 10_000 });
  });

  test('toggle switches day on/off', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/schedule');
    const toggles = page.locator('[class*="toggle"] input');
    await expect(toggles).toHaveCount(7, { timeout: 10_000 });
  });

  test('schedule page shows save action', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/schedule');
    await expect(page.getByRole('button', { name: /Зберегти|Save/i })).toBeVisible();
  });
});
