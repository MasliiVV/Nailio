import { test, expect, mockAuth, mockAPI } from './helpers';

test.describe('Master Dashboard', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    await mockAPI(page, '/analytics/dashboard*', {
      today: { bookings: 5, revenue: 250000 },
      period: { totalBookings: 42, completed: 38, revenue: 1200000, newClients: 7 },
    });
    await mockAPI(page, '/bookings*', {
      items: [
        {
          id: 'b1',
          serviceId: 's1',
          serviceNameSnapshot: 'Manікюр',
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
          status: 'confirmed',
          priceAtBooking: 50000,
          durationAtBooking: 60,
          client: { firstName: 'Олена', lastName: 'Коваль' },
        },
      ],
      total: 1,
    });
  });

  test('displays dashboard stats', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    await expect(page.locator('.stat-card__value').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.stat-card')).toHaveCount(4);
  });

  test('shows today bookings list', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    await expect(page.getByText('Manікюр')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Олена/)).toBeVisible();
  });

  test('"View All" button navigates to calendar', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    await page.getByText(/viewAll|Усі/i).click();
    await expect(page).toHaveURL(/\/master\/calendar/);
  });

  test('clicking booking card navigates to calendar', async ({ tgPage: page }) => {
    await page.goto('/master/dashboard');
    await page.getByText('Manікюр').click();
    await expect(page).toHaveURL(/\/master\/calendar/);
  });
});
