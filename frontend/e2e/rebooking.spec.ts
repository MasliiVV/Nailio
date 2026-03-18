import { test, expect, mockAuth, mockAPI, openMiniApp } from './helpers';

test.describe('Rebooking Page', () => {
  test.beforeEach(async ({ tgPage: page }) => {
    await mockAuth(page);

    await mockAPI(page, '/rebooking/overview*', {
      selectedDate: '2026-03-17',
      defaultCycleDays: 21,
      bestSendTime: '18:00',
      heatmap: [
        {
          date: '2026-03-17',
          totalSlots: 10,
          bookedSlots: 7,
          freeSlots: 3,
          occupancyRate: 70,
        },
      ],
      emptySlots: [
        {
          date: '2026-03-17',
          startTime: '10:00',
          endTime: '11:00',
          freeSlotCount: 2,
          isMorning: true,
        },
        {
          date: '2026-03-18',
          startTime: '13:00',
          endTime: '14:00',
          freeSlotCount: 2,
          isMorning: false,
        },
      ],
      recommendations: [
        {
          clientId: 'client-1',
          firstName: 'Анна',
          lastName: 'Коваль',
          telegramId: '111',
          lastVisitAt: '2026-02-20T10:00:00.000Z',
          expectedReturnDate: '2026-03-17T10:00:00.000Z',
          averageCycleDays: 21,
          visitCount: 4,
          ltv: 400000,
          priority: 'high',
          priorityScore: 90,
          reason: 'Пора нагадати',
          segments: ['due_soon', 'visits_3_plus'],
          favoriteService: { id: 'service-1', name: 'Манікюр' },
        },
        {
          clientId: 'client-2',
          firstName: 'Оля',
          lastName: null,
          telegramId: '222',
          lastVisitAt: '2026-02-21T10:00:00.000Z',
          expectedReturnDate: '2026-03-18T10:00:00.000Z',
          averageCycleDays: 22,
          visitCount: 3,
          ltv: 220000,
          priority: 'medium',
          priorityScore: 65,
          reason: 'Час написати',
          segments: ['due_soon'],
          favoriteService: { id: 'service-2', name: 'Покриття' },
        },
      ],
      kpis: {
        repeatClientRate: 55,
        occupancyRate: 70,
        averageLtv: 280000,
      },
      sendLog: [
        {
          id: 'log-1',
          type: 'slot_fill',
          date: '2026-03-16',
          startTime: '15:00',
          endTime: '16:00',
          createdAt: '2026-03-15T10:00:00.000Z',
          status: 'active',
          sentCount: 4,
          bookedCount: 1,
          closedCount: 0,
        },
      ],
    });

    await mockAPI(page, '/clients*', {
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
        {
          id: 'client-2',
          firstName: 'Оля',
          lastName: null,
          phone: null,
          telegramId: '222',
          notes: null,
          tags: [],
          isBlocked: false,
          lastVisitAt: '2026-02-21T10:00:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
  });

  test('renders redesigned Rebooking layout', async ({ tgPage: page }) => {
    await openMiniApp(page, '/master/rebooking?date=2026-03-17&slot=10:00');

    await expect(page.getByRole('heading', { name: 'Повернення клієнтів' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Заповнити вікно')).toBeVisible();
    await expect(page.getByText('Нагадати клієнтам')).toBeVisible();
    await expect(page.getByText('Показати історію та аналітику')).toBeVisible();
    await expect(page.getByRole('button', { name: '10:00 — 11:00' })).toBeVisible();
    await expect(page.getByText('2. Кому надіслати')).toBeVisible();
    await expect(page.getByText('3. Перевір повідомлення')).toBeVisible();
    await expect(page.getByText('Heatmap по днях')).toHaveCount(0);
  });

  test('sends generate and campaign requests for slot and cycle flows', async ({
    tgPage: page,
  }) => {
    const generateBodies: unknown[] = [];
    const campaignBodies: unknown[] = [];

    await page.route('**/api/v1/rebooking/generate-message', async (route) => {
      generateBodies.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { message: 'Generated message', meta: { tone: 'friendly', recipients: 2 } },
          meta: {},
        }),
      });
    });

    await page.route('**/api/v1/rebooking/campaigns', async (route) => {
      campaignBodies.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true, sentCount: 2 }, meta: {} }),
      });
    });

    await openMiniApp(page, '/master/rebooking?date=2026-03-17&slot=10:00');

    await page.getByRole('button', { name: 'Покращити текст' }).click();
    await page.getByRole('button', { name: 'Розіслати промо по слоту' }).click();
    await page.getByText('Нагадати клієнтам').click();
    await page.getByRole('button', { name: 'Покращити текст' }).click();

    await expect.poll(() => generateBodies.length).toBe(2);
    expect(generateBodies[0]).toMatchObject({
      campaignType: 'slot_fill',
      date: '2026-03-17',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(generateBodies[1]).toMatchObject({
      campaignType: 'cycle_followup',
      slotOptions: expect.arrayContaining([
        expect.objectContaining({ date: '2026-03-17', startTime: '10:00' }),
      ]),
    });

    await page.getByRole('button', { name: 'Надіслати нагадування' }).click();

    await expect.poll(() => campaignBodies.length).toBe(2);
    expect(campaignBodies[0]).toMatchObject({
      campaignType: 'slot_fill',
      date: '2026-03-17',
      startTime: '10:00',
      clientIds: expect.arrayContaining(['client-1', 'client-2']),
    });
    expect(campaignBodies[1]).toMatchObject({
      campaignType: 'cycle_followup',
      slotOptions: expect.arrayContaining([
        expect.objectContaining({ date: '2026-03-17', startTime: '10:00' }),
      ]),
    });
  });
});
