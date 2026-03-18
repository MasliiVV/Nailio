import { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { BotCryptoService } from '../telegram/bot-crypto.service';

describe('NotificationsProcessor', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let cls: any;
  let botCrypto: any;
  let configService: any;
  let processor: NotificationsProcessor;
  let fetchMock: jest.Mock;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true }),
    });
    global.fetch = fetchMock as typeof fetch;

    prisma = {
      tenantClient: {
        booking: { findFirst: jest.fn() },
        client: { update: jest.fn() },
      },
      bot: { findFirst: jest.fn() },
      tenant: { findUnique: jest.fn() },
      master: { findFirst: jest.fn() },
      notification: { update: jest.fn() },
    };

    cls = {
      run: jest.fn(async (callback: () => Promise<void>) => callback()),
      set: jest.fn(),
    };

    botCrypto = {
      decrypt: jest.fn().mockResolvedValue('tenant-bot-token'),
    };

    configService = {
      getOrThrow: jest.fn().mockReturnValue('platform-bot-token'),
    };

    processor = new NotificationsProcessor(
      prisma as unknown as PrismaService,
      cls as unknown as ClsService,
      botCrypto as unknown as BotCryptoService,
      configService as unknown as ConfigService,
    );
  });

  it('adds write-to-master button to client cancellation notification', async () => {
    prisma.tenantClient.booking.findFirst.mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      status: 'cancelled',
      serviceNameSnapshot: 'Гель лак',
      startTime: new Date('2026-03-25T07:00:00.000Z'),
      durationAtBooking: 60,
      priceAtBooking: 80000,
      cancelReason: null,
      client: {
        id: 'client-1',
        firstName: 'Анна',
        lastName: null,
        phone: null,
        botBlocked: false,
        user: {
          telegramId: BigInt(422552831),
          languageCode: 'uk',
        },
      },
      service: { id: 'service-1' },
    });
    prisma.bot.findFirst.mockResolvedValue({ botTokenEncrypted: 'encrypted', isActive: true });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      timezone: 'Europe/Kyiv',
      settings: {},
    });
    prisma.notification.update.mockResolvedValue(undefined);

    const job = {
      data: {
        tenantId: 'tenant-1',
        bookingId: 'booking-1',
        clientId: 'client-1',
        type: 'cancellation',
      },
      opts: {
        jobId: 'notif-1',
      },
    } as Job;

    await processor.process(job);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.text).toContain('❌ Запис скасовано');
    expect(payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: '✍️ Написати майстру', callback_data: 'writem:booking-1' }]],
    });
  });
});