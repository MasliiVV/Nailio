import { test, expect, mockAuth, mockAPI, openMiniApp } from './helpers';

test.describe('Calendar Page', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    await mockAPI(page, '/bookings*', {
      items: [
        {
          id: 'b1',
          serviceNameSnapshot: 'Манікюр',
          startTime: `${today}T10:00:00Z`,
          endTime: `${today}T11:00:00Z`,
          status: 'confirmed',
          priceAtBooking: 50000,
          durationAtBooking: 60,
          client: { firstName: 'Олена', lastName: 'Коваль' },
        },
        {
          id: 'b2',
          serviceNameSnapshot: 'Педикюр',
          startTime: `${today}T14:00:00Z`,
          endTime: `${today}T15:30:00Z`,
          status: 'completed',
          priceAtBooking: 70000,
          durationAtBooking: 90,
          client: { firstName: 'Марія', lastName: 'Іванова' },
        },
      ],
      total: 2,
    });
  });

  test('displays bookings grouped by date', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/calendar');
    await expect(page.getByText('Манікюр')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Педикюр')).toBeVisible();
  });

  test('clicking booking opens detail sheet', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/calendar');
    await page.getByText('Манікюр').click();
    await expect(page.getByText('Деталі запису')).toBeVisible({ timeout: 10_000 });
  });

  test('detail sheet shows edit action for confirmed booking', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/calendar');
    await page.getByText('Манікюр').click();
    await expect(page.getByRole('button', { name: 'Редагувати', exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('completed booking shows success badge', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/calendar');
    await expect(page.getByText(/Завершено|Completed/i)).toBeVisible({ timeout: 10_000 });
  });
});
