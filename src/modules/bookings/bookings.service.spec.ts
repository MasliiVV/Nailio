// docs/backlog.md #115 — Unit tests: Booking Service
// Tests: slot generation, booking creation validation, status transitions

import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FinanceService } from '../finance/finance.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SlotsQueryDto } from './dto/bookings.dto';
import { BookingStatus } from '@prisma/client';

describe('BookingsService', () => {
  let service: BookingsService;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let scheduleService: any;
  let notificationsService: any;
  let financeService: any;
  let configService: any;
  let fetchMock: jest.Mock;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const tenantId = 'tenant-uuid-1';

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, statusText: 'OK' });
    global.fetch = fetchMock as typeof fetch;

    prisma = {
      client: { findFirst: jest.fn() },
      master: { findFirst: jest.fn() },
      booking: { findUnique: jest.fn(), findFirst: jest.fn() },
      tenant: { findUnique: jest.fn() },
      tenantClient: {
        service: { findFirst: jest.fn() },
        booking: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        client: { findFirst: jest.fn(), update: jest.fn() },
      },
    };

    scheduleService = {
      getSlotTimesForDate: jest.fn(),
    };

    notificationsService = {
      scheduleBookingNotifications: jest.fn(),
      cancelBookingNotifications: jest.fn(),
    };

    financeService = {
      createBookingTransaction: jest.fn(),
    };

    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ScheduleService, useValue: scheduleService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: FinanceService, useValue: financeService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  // ──────────────────────────────────────────────
  // Slot Generation Tests
  // ──────────────────────────────────────────────

  describe('getAvailableSlots()', () => {
    const query: SlotsQueryDto = {
      date: '2026-12-15',
      serviceId: 'service-uuid-1',
    };

    it('should return empty slots for a day off', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'Europe/Kyiv',
        settings: {},
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
      });

      scheduleService.getSlotTimesForDate.mockResolvedValue([]);

      const result = await service.getAvailableSlots(tenantId, query);

      expect(result.date).toBe('2026-12-15');
      expect(result.slots).toEqual([]);
    });

    it('should return configured slot times', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: {},
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
      });

      scheduleService.getSlotTimesForDate.mockResolvedValue(['09:00', '11:00', '13:00']);

      prisma.tenantClient.booking.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(tenantId, query);

      expect(result.slots.length).toBe(3);
      expect(result.slots[0].startTime).toBe('09:00');
      expect(result.slots[0].endTime).toBe('10:00');
      expect(result.slots[0].available).toBe(true);
    });

    it('should mark overlapping slots as unavailable', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: {},
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
      });

      scheduleService.getSlotTimesForDate.mockResolvedValue(['09:00', '10:00', '11:00']);

      prisma.tenantClient.booking.findMany.mockResolvedValue([
        {
          startTime: new Date('2026-12-15T10:00:00Z'),
          endTime: new Date('2026-12-15T11:00:00Z'),
          status: 'confirmed',
        },
      ]);

      const result = await service.getAvailableSlots(tenantId, query);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slot1000 = result.slots.find((s: any) => s.startTime === '10:00');
      expect(slot1000?.available).toBe(false);
    });

    it('should throw if service not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: {},
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue(null);

      await expect(service.getAvailableSlots(tenantId, query)).rejects.toThrow(NotFoundException);
    });

    it('should account for buffer time between bookings', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: {},
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 15,
        isActive: true,
      });

      scheduleService.getSlotTimesForDate.mockResolvedValue(['09:00', '09:30', '11:00']);

      prisma.tenantClient.booking.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(tenantId, query);

      expect(result.slots.length).toBe(3);
      expect(result.slots[0].endTime).toBe('10:00'); // Show service duration, not buffer
    });
  });

  // ──────────────────────────────────────────────
  // Status Transition Tests
  // ──────────────────────────────────────────────

  describe('complete()', () => {
    it('should request only upcoming active bookings when upcoming=true', async () => {
      const user: JwtPayload = {
        sub: 'user-1',
        telegramId: 123456,
        role: 'master',
        tenantId,
      };

      prisma.tenantClient.booking.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, user, { upcoming: true, limit: '10' });

      expect(prisma.tenantClient.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            AND: expect.arrayContaining([
              expect.objectContaining({
                startTime: expect.objectContaining({ gte: expect.any(Date) }),
                status: { in: [BookingStatus.pending, BookingStatus.confirmed] },
              }),
            ]),
          }),
        }),
      );
    });

    it('should complete a confirmed booking', async () => {
      const booking = {
        id: 'booking-1',
        tenantId,
        status: 'confirmed',
        clientId: 'client-1',
        startTime: new Date(),
        endTime: new Date(),
      };

      prisma.tenantClient.booking.findFirst.mockResolvedValue(booking);
      prisma.tenantClient.booking.update.mockResolvedValue({
        ...booking,
        status: 'completed',
      });
      prisma.tenantClient.client.update.mockResolvedValue({});

      const result = await service.complete(tenantId, 'booking-1');
      expect(result.status).toBe('completed');
    });

    it('should reject completing a cancelled booking', async () => {
      prisma.tenantClient.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        tenantId,
        status: 'cancelled',
      });

      await expect(service.complete(tenantId, 'booking-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw if booking not found', async () => {
      prisma.tenantClient.booking.findFirst.mockResolvedValue(null);

      await expect(service.complete(tenantId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('noShow()', () => {
    it('should mark a confirmed booking as no-show', async () => {
      const booking = {
        id: 'booking-1',
        tenantId,
        status: 'confirmed',
        startTime: new Date(),
        endTime: new Date(),
      };

      prisma.tenantClient.booking.findFirst.mockResolvedValue(booking);
      prisma.tenantClient.booking.update.mockResolvedValue({
        ...booking,
        status: 'no_show',
      });

      const result = await service.noShow(tenantId, 'booking-1');
      expect(result.status).toBe('no_show');
    });
  });

  describe('confirm()', () => {
    it('should confirm a pending booking', async () => {
      const booking = {
        id: 'booking-1',
        tenantId,
        status: 'pending',
        startTime: new Date(),
        endTime: new Date(),
      };

      prisma.tenantClient.booking.findFirst.mockResolvedValue(booking);
      prisma.tenantClient.booking.update.mockResolvedValue({
        ...booking,
        status: 'confirmed',
      });

      const result = await service.confirm(tenantId, 'booking-1');
      expect(result.status).toBe('confirmed');
    });

    it('should reject confirming a completed booking', async () => {
      prisma.tenantClient.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        tenantId,
        status: 'completed',
      });

      await expect(service.confirm(tenantId, 'booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendMessageToMaster()', () => {
    it('should include a reply button for general client messages', async () => {
      const user: JwtPayload = {
        sub: 'user-1',
        telegramId: 123456,
        role: 'client',
        tenantId,
      };

      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        tenantId,
        userId: 'user-1',
        firstName: 'Іра',
        lastName: 'К.',
        phone: '+380501112233',
        user: {
          telegramId: BigInt(777000111),
        },
      });

      prisma.master.findFirst.mockResolvedValue({
        id: 'master-1',
        tenantId,
        user: {
          telegramId: BigInt(999888777),
        },
      });

      await service.sendMessageToMaster(tenantId, user, {
        message: 'Підкажіть, будь ласка, по догляду після процедури',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(payload).toMatchObject({
        chat_id: '999888777',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💬 Відповісти клієнту',
                url: 'tg://user?id=777000111',
              },
            ],
          ],
        },
      });
    });

    it('should include nearest booking date and time in general client messages', async () => {
      const user: JwtPayload = {
        sub: 'user-1',
        telegramId: 123456,
        role: 'client',
        tenantId,
      };

      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        tenantId,
        userId: 'user-1',
        firstName: 'Іра',
        lastName: 'К.',
        phone: '+380501112233',
        user: {
          telegramId: BigInt(777000111),
        },
      });

      prisma.master.findFirst.mockResolvedValue({
        id: 'master-1',
        tenantId,
        user: {
          telegramId: BigInt(999888777),
        },
      });

      prisma.booking.findFirst.mockResolvedValue({
        id: 'booking-1',
        tenantId,
        clientId: 'client-1',
        serviceNameSnapshot: 'Манікюр',
        startTime: new Date('2026-03-18T09:30:00.000Z'),
        tenant: {
          timezone: 'UTC',
        },
      });

      await service.sendMessageToMaster(tenantId, user, {
        message: 'Підкажіть, будь ласка, по догляду після процедури',
      });

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(payload.text).toContain('📋 Найближчий запис: Манікюр');
      expect(payload.text).toContain('📅 18 березня о 09:30');
    });
  });
});
