import { test, expect, mockAuth, mockAPI } from './helpers';

test.describe('Client Booking Flow', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    // Mock as client user
    await page.route('**/api/auth/telegram', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh',
            user: {
              id: 'user-2',
              telegramId: 12345,
              firstName: 'Клієнт',
              lastName: 'Тест',
              role: 'client',
              tenantId: 'tenant-1',
            },
            tenant: {
              id: 'tenant-1',
              displayName: 'Beauty Studio',
              branding: { primaryColor: '#E84393', welcomeMessage: 'Ласкаво просимо!' },
            },
            needsOnboarding: false,
          },
          meta: {},
        }),
      }),
    );

    await mockAPI(page, '/services', [
      {
        id: 's1',
        name: 'Манікюр класичний',
        price: 50000,
        durationMinutes: 60,
        description: 'Класичний манікюр з покриттям',
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
    ]);

    await mockAPI(page, '/services/s1', {
      id: 's1',
      name: 'Манікюр класичний',
      price: 50000,
      durationMinutes: 60,
      description: 'Класичний манікюр з покриттям',
      color: '#E84393',
    });
  });

  test('home page shows services list', async ({ tgPage: page }) => {
    await page.goto('/client');
    await expect(page.getByText('Манікюр класичний')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Педикюр')).toBeVisible();
  });

  test('clicking service navigates to booking page', async ({ tgPage: page }) => {
    await page.goto('/client');
    await page.getByText('Манікюр класичний').click();
    await expect(page).toHaveURL(/\/client\/book\/s1/);
  });

  test('booking page shows date picker', async ({ tgPage: page }) => {
    await mockAPI(page, '/bookings/slots*', {
      slots: [
        { startTime: '10:00', available: true },
        { startTime: '11:00', available: true },
        { startTime: '12:00', available: false },
        { startTime: '14:00', available: true },
      ],
    });

    await page.goto('/client/book/s1');
    await expect(page.locator('[class*="dateItem"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('time slots are selectable', async ({ tgPage: page }) => {
    await mockAPI(page, '/bookings/slots*', {
      slots: [
        { startTime: '10:00', available: true },
        { startTime: '11:00', available: true },
        { startTime: '14:00', available: true },
      ],
    });

    await page.goto('/client/book/s1');
    // Wait for slots to load
    await expect(page.getByText('10:00')).toBeVisible({ timeout: 10_000 });
    await page.getByText('10:00').click();
    // Check slot is selected
    await expect(page.locator('[class*="slotSelected"]')).toHaveCount(1);
  });
});
