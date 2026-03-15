// docs/backlog.md #115 — Unit tests: Booking Service
// Tests: slot generation, booking creation validation, status transitions

import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FinanceService } from '../finance/finance.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SlotsQueryDto } from './dto/bookings.dto';

describe('BookingsService', () => {
  let service: BookingsService;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let scheduleService: any;
  let notificationsService: any;
  let financeService: any;
  let configService: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const tenantId = 'tenant-uuid-1';

  beforeEach(async () => {
    prisma = {
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
      getWorkingHoursForDate: jest.fn(),
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

      scheduleService.getWorkingHoursForDate.mockResolvedValue(null); // Day off

      const result = await service.getAvailableSlots(tenantId, query);

      expect(result.date).toBe('2026-12-15');
      expect(result.slots).toEqual([]);
    });

    it('should generate slots based on working hours', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: { slot_step_minutes: 60 },
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
      });

      scheduleService.getWorkingHoursForDate.mockResolvedValue({
        startTime: '09:00',
        endTime: '13:00',
      });

      prisma.tenantClient.booking.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(tenantId, query);

      // 09:00-10:00, 10:00-11:00, 11:00-12:00, 12:00-13:00 = 4 slots
      expect(result.slots.length).toBe(4);
      expect(result.slots[0].startTime).toBe('09:00');
      expect(result.slots[0].endTime).toBe('10:00');
      expect(result.slots[0].available).toBe(true);
    });

    it('should mark overlapping slots as unavailable', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        timezone: 'UTC',
        settings: { slot_step_minutes: 60 },
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
      });

      scheduleService.getWorkingHoursForDate.mockResolvedValue({
        startTime: '09:00',
        endTime: '13:00',
      });

      // Existing booking 10:00-11:00
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
        settings: { slot_step_minutes: 30 },
      });

      prisma.tenantClient.service.findFirst.mockResolvedValue({
        id: 'service-uuid-1',
        durationMinutes: 60,
        bufferMinutes: 15,
        isActive: true,
      });

      scheduleService.getWorkingHoursForDate.mockResolvedValue({
        startTime: '09:00',
        endTime: '18:00',
      });

      prisma.tenantClient.booking.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(tenantId, query);

      // With 60min + 15min buffer = 75min total, step 30min
      // So slots: 09:00, 09:30, 10:00, ... up to where 75min fits in 18:00
      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.slots[0].endTime).toBe('10:00'); // Show service duration, not buffer
    });
  });

  // ──────────────────────────────────────────────
  // Status Transition Tests
  // ──────────────────────────────────────────────

  describe('complete()', () => {
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
});
