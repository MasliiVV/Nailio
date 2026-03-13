import { test, expect, mockAuth, mockAPI } from './helpers';

test.describe('Subscription Page', () => {
  test('active subscription shows status and cancel button', async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/subscription', {
      status: 'active',
      plan: 'pro',
      pricePerMonth: 29900,
      currentPeriodEnd: '2026-12-31T00:00:00Z',
    });
    await mockAPI(page, '/subscription/payments', []);

    await page.goto('/master/subscription');
    await expect(page.locator('[class*="statusText"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[class*="destructive"]')).toBeVisible();
  });

  test('expired subscription shows subscribe button', async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/subscription', {
      status: 'expired',
      plan: 'pro',
      pricePerMonth: 29900,
      currentPeriodEnd: '2025-01-01T00:00:00Z',
    });
    await mockAPI(page, '/subscription/payments', []);

    await page.goto('/master/subscription');
    await expect(page.locator('button[class*="primary"]')).toBeVisible({ timeout: 10_000 });
  });

  test('no subscription shows empty state with CTA', async ({ tgPage: page }) => {
    await mockAuth(page);
    await page.route('**/api/subscription', (r) =>
      r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }),
    );
    await mockAPI(page, '/subscription/payments', []);

    await page.goto('/master/subscription');
    await expect(page.locator('[class*="container"]')).toBeVisible({ timeout: 10_000 });
  });

  test('payment history displays', async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/subscription', {
      status: 'active',
      plan: 'pro',
      pricePerMonth: 29900,
      currentPeriodEnd: '2026-12-31T00:00:00Z',
    });
    await mockAPI(page, '/subscription/payments', [
      { id: 'p1', amount: 29900, status: 'success', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'p2', amount: 29900, status: 'success', createdAt: '2026-02-01T00:00:00Z' },
    ]);

    await page.goto('/master/subscription');
    await expect(page.locator('.badge--success')).toHaveCount(2, { timeout: 10_000 });
  });
});

test.describe('Clients Page', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/clients*', {
      items: [
        {
          id: 'c1',
          firstName: 'Олена',
          lastName: 'Коваль',
          phone: '+380991234567',
          isBlocked: false,
          stats: { totalBookings: 15, totalSpent: 750000 },
        },
        {
          id: 'c2',
          firstName: 'Марія',
          lastName: 'Іванова',
          phone: '+380997654321',
          isBlocked: true,
          stats: { totalBookings: 3, totalSpent: 150000 },
        },
      ],
      total: 2,
    });
  });

  test('displays clients list with avatars', async ({ tgPage: page }) => {
    await page.goto('/master/clients');
    await expect(page.getByText('Олена Коваль')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Марія Іванова')).toBeVisible();
  });

  test('blocked client shows badge', async ({ tgPage: page }) => {
    await page.goto('/master/clients');
    await expect(page.locator('.badge--destructive')).toBeVisible({ timeout: 10_000 });
  });

  test('search input filters clients', async ({ tgPage: page }) => {
    await page.goto('/master/clients');
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="пошук" i]');
    await searchInput.fill('Олена');
    // Search triggers API call with new param
  });

  test('clicking client navigates to detail', async ({ tgPage: page }) => {
    await page.goto('/master/clients');
    await page.getByText('Олена Коваль').click();
    await expect(page).toHaveURL(/\/master\/clients\/c1/);
  });
});

test.describe('My Bookings (Client)', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await page.route('**/api/auth/telegram', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh',
            user: { id: 'u2', telegramId: 12345, firstName: 'Client', role: 'client', tenantId: 't1' },
            tenant: { id: 't1', displayName: 'Salon', branding: {} },
            needsOnboarding: false,
          },
          meta: {},
        }),
      }),
    );

    await mockAPI(page, '/bookings*', {
      items: [
        {
          id: 'b1',
          serviceNameSnapshot: 'Манікюр',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          status: 'confirmed',
          priceAtBooking: 50000,
          durationAtBooking: 60,
        },
        {
          id: 'b2',
          serviceNameSnapshot: 'Педикюр',
          startTime: new Date(Date.now() - 86400000).toISOString(),
          endTime: new Date(Date.now() - 86400000 + 5400000).toISOString(),
          status: 'completed',
          priceAtBooking: 70000,
          durationAtBooking: 90,
        },
      ],
      total: 2,
    });
  });

  test('shows upcoming/history tabs', async ({ tgPage: page }) => {
    await page.goto('/client/bookings');
    await expect(page.locator('[class*="tabs"]')).toBeVisible({ timeout: 10_000 });
  });

  test('clicking booking opens detail sheet', async ({ tgPage: page }) => {
    await page.goto('/client/bookings');
    await page.getByText('Манікюр').click();
    await expect(page.locator('[class*="sheet"]')).toBeVisible({ timeout: 5_000 });
  });

  test('cancel button shows in detail sheet for pending/confirmed', async ({ tgPage: page }) => {
    await page.goto('/client/bookings');
    await page.getByText('Манікюр').click();
    await expect(page.locator('[class*="sheet"] button[class*="destructive"]')).toBeVisible({ timeout: 5_000 });
  });
});
