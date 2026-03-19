import { test, expect, mockAuth, mockAPI, getTelegramAlerts, openMiniApp } from './helpers';

test.describe('Manual booking flow', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);

    const today = new Date().toISOString().split('T')[0];

    await mockAPI(page, '/bookings?*', {
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    await mockAPI(page, `/schedule/date/${today}`, {
      date: today,
      isDayOff: false,
      source: 'template',
      slots: [
        { time: '10:00', isBooked: false, locked: false },
        { time: '11:30', isBooked: false, locked: false },
      ],
    });

    await mockAPI(page, '/services', [
      {
        id: 'service-1',
        name: 'Манікюр',
        description: null,
        durationMinutes: 60,
        price: 50000,
        currency: 'UAH',
        category: null,
        color: null,
        sortOrder: 0,
        isActive: true,
      },
    ]);

    await mockAPI(page, '/clients', {
      items: [
        {
          id: 'client-1',
          firstName: 'Анна',
          lastName: 'Коваль',
          phone: null,
          telegramId: '111',
          notes: null,
          tags: [],
          isBlocked: false,
          lastVisitAt: '2026-02-20T10:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    await mockAPI(page, '/bookings/slots*', {
      date: today,
      timezone: 'Europe/Kyiv',
      slots: [
        { startTime: '10:00', endTime: '11:00', available: true },
        { startTime: '11:30', endTime: '12:30', available: true },
      ],
    });
  });

  test('keeps confirm disabled until a client is selected', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master');
    const sheet = page.locator('div[class*="sheetVisible"]').last();

    await page.getByRole('button', { name: 'Записати' }).click();
    await sheet.locator('select').nth(0).selectOption('service-1');
    await sheet.getByRole('button', { name: '10:00', exact: true }).click();

    await expect(sheet.getByRole('button', { name: 'Підтвердити запис' })).toBeDisabled();
  });

  test('sends booking with clientId and shows success alert', async ({ tgPage: page }) => {
    const bookingBodies: unknown[] = [];

    await page.route('**/api/v1/bookings', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              items: [],
              nextCursor: null,
              hasMore: false,
            },
            meta: {},
          }),
        });
        return;
      }

      bookingBodies.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'booking-1',
            serviceNameSnapshot: 'Манікюр',
            priceAtBooking: 50000,
            durationAtBooking: 60,
            startTime: '2026-03-17T10:00:00.000Z',
            endTime: '2026-03-17T11:00:00.000Z',
            status: 'confirmed',
            notes: null,
            createdBy: 'master',
            createdAt: '2026-03-17T09:00:00.000Z',
            client: {
              id: 'client-1',
              firstName: 'Анна',
              lastName: 'Коваль',
              phone: null,
              telegramId: '111',
            },
            service: {
              id: 'service-1',
              name: 'Манікюр',
              color: null,
            },
          },
          meta: {},
        }),
      });
    });

    await openMiniApp(page, '/master');
    const sheet = page.locator('div[class*="sheetVisible"]').last();

    await page.getByRole('button', { name: 'Записати' }).click();
    await sheet.locator('select').nth(0).selectOption('service-1');
    await sheet.locator('select').nth(1).selectOption('client-1');
    await sheet.getByRole('button', { name: '10:00', exact: true }).click();
    await sheet.getByRole('button', { name: 'Підтвердити запис' }).click();

    await expect.poll(() => bookingBodies.length).toBe(1);
    expect(bookingBodies[0]).toMatchObject({
      serviceId: 'service-1',
      clientId: 'client-1',
      startTime: expect.stringContaining('T10:00:00'),
    });

    await expect.poll(async () => getTelegramAlerts(page)).toContain('Запис успішно створено.');
  });
});
