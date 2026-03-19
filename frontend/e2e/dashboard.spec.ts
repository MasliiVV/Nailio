import { test, expect, mockAuth, mockAPI, openMiniApp } from './helpers';

test.describe('Master Landing', () => {
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

  test('opens calendar landing page', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    await expect(page.getByRole('heading', { name: 'Календар' })).toBeVisible({ timeout: 10_000 });
  });

  test('shows booking cards on landing page', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    await expect(page.getByText('Manікюр')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Олена/)).toBeVisible();
  });

  test('record action opens booking sheet', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    await page.getByRole('button', { name: 'Записати' }).click();
    await expect(page.locator('div[class*="sheetVisible"]').last()).toBeVisible();
  });

  test('clicking booking card opens details', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    await page.getByText('Manікюр').click();
    await expect(page.getByText('Деталі запису')).toBeVisible();
  });
});
