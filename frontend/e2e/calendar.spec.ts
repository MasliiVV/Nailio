import { test, expect, mockAuth, mockAPI } from './helpers';

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
    await page.goto('/master/calendar');
    await expect(page.getByText('Манікюр')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Педикюр')).toBeVisible();
  });

  test('complete button exists for confirmed bookings', async ({ tgPage: page }) => {
    await page.goto('/master/calendar');
    await expect(page.getByTitle('Complete').first()).toBeVisible({ timeout: 10_000 });
  });

  test('no-show button exists for confirmed bookings', async ({ tgPage: page }) => {
    await page.goto('/master/calendar');
    await expect(page.getByTitle('No show').first()).toBeVisible({ timeout: 10_000 });
  });

  test('completed booking shows success badge', async ({ tgPage: page }) => {
    await page.goto('/master/calendar');
    await expect(page.locator('.badge--success')).toBeVisible({ timeout: 10_000 });
  });
});
