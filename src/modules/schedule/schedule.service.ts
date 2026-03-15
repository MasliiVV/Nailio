// docs/backlog.md #40-#42 — Slot template + date overrides

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOverrideDto, UpdateWorkingHoursDto } from './dto/schedule.dto';

interface SlotDayConfig {
  dayOfWeek: number;
  isDayOff: boolean;
  slots: string[];
}

interface SlotDateOverride {
  id: string;
  date: string;
  isDayOff: boolean;
  slots: string[];
}

interface SlotScheduleSettings {
  weekly: SlotDayConfig[];
  overrides: SlotDateOverride[];
}

interface DateBookingRecord {
  id: string;
  clientId: string;
  serviceNameSnapshot: string;
  durationAtBooking: number;
  status: string;
  startTime: Date;
  client: {
    firstName: string;
    lastName: string | null;
  };
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private readonly settingsKey = 'slot_schedule';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getSchedule(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, timezone: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const schedule = this.extractSlotSchedule(tenant.settings);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tenant.timezone });

    return {
      weekly: schedule.weekly,
      overrides: schedule.overrides.filter((override) => override.date >= today),
    };
  }

  async updateWorkingHours(tenantId: string, dto: UpdateWorkingHoursDto) {
    const normalizedDays = this.normalizeWeeklyDays(dto.days || []);
    const dayIds = normalizedDays.map((day) => day.dayOfWeek);
    if (new Set(dayIds).size !== normalizedDays.length) {
      throw new BadRequestException('Duplicate days of week');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const current = this.extractSlotSchedule(tenant.settings);
    const nextSettings = this.withSlotSchedule(tenant.settings, {
      weekly: normalizedDays,
      overrides: current.overrides,
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: nextSettings },
    });

    this.logger.log(`Weekly slots updated for tenant ${tenantId}`);

    return this.getSchedule(tenantId);
  }

  async createOverride(tenantId: string, dto: CreateOverrideDto) {
    return this.upsertDateOverride(tenantId, dto.date, dto);
  }

  async deleteOverride(tenantId: string, overrideId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const schedule = this.extractSlotSchedule(tenant.settings);
    if (!schedule.overrides.some((override) => override.id === overrideId)) {
      throw new NotFoundException('Schedule override not found');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: this.withSlotSchedule(tenant.settings, {
          weekly: schedule.weekly,
          overrides: schedule.overrides.filter((override) => override.id !== overrideId),
        }),
      },
    });
  }

  async getSlotTimesForDate(tenantId: string, date: string | Date): Promise<string[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const dateKey = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.resolveEffectiveSlots(this.extractSlotSchedule(tenant.settings), dateKey).slots;
  }

  async getDateSchedule(tenantId: string, date: string) {
    this.validateDateKey(date);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, timezone: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const schedule = this.extractSlotSchedule(tenant.settings);
    const effective = this.resolveEffectiveSlots(schedule, date);
    const bookings = await this.getBookingsForDate(tenantId, date, tenant.timezone);

    const bookingByTime = new Map<string, DateBookingRecord>();
    for (const booking of bookings) {
      bookingByTime.set(this.formatTimeInTimezone(booking.startTime, tenant.timezone), booking);
    }

    const times = this.sortTimes([...new Set([...effective.slots, ...bookingByTime.keys()])]);

    return {
      date,
      isDayOff: effective.isDayOff,
      source: effective.source,
      slots: times.map((time) => {
        const booking = bookingByTime.get(time);
        return {
          time,
          isBooked: Boolean(booking),
          locked: Boolean(booking) && !effective.slots.includes(time),
          booking: booking
            ? {
                id: booking.id,
                clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
                serviceName: booking.serviceNameSnapshot,
                status: booking.status,
              }
            : undefined,
        };
      }),
    };
  }

  async upsertDateOverride(tenantId: string, date: string, dto: CreateOverrideDto) {
    this.validateDateKey(date);

    if (dto.date && dto.date !== date) {
      throw new BadRequestException('Path date must match payload date');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, timezone: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const schedule = this.extractSlotSchedule(tenant.settings);
    const nextSlots = dto.isDayOff ? [] : this.normalizeSlots(dto.slots || []);
    const bookings = await this.getBookingsForDate(tenantId, date, tenant.timezone);

    const activeBookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
    const impactedBookings = bookings.filter((booking) => {
      const localTime = this.formatTimeInTimezone(booking.startTime, tenant.timezone);
      return !nextSlots.includes(localTime);
    });

    const reassignments = dto.reassignments || [];
    const cancelBookingIds = new Set(dto.cancelBookingIds || []);
    const resolvedIds = new Set<string>([
      ...reassignments.map((entry) => entry.bookingId),
      ...cancelBookingIds.values(),
    ]);

    const unresolved = impactedBookings.filter((booking) => !resolvedIds.has(booking.id));
    if (unresolved.length > 0) {
      throw new ConflictException({
        message: 'Resolve affected bookings before saving date slots',
        affectedBookings: unresolved.map((booking) => ({
          id: booking.id,
          clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
          currentTime: this.formatTimeInTimezone(booking.startTime, tenant.timezone),
        })),
      });
    }

    for (const reassignment of reassignments) {
      const booking = activeBookingsById.get(reassignment.bookingId);
      if (!booking) {
        throw new NotFoundException(`Booking ${reassignment.bookingId} not found for date ${date}`);
      }
      if (!nextSlots.includes(reassignment.newTime)) {
        throw new BadRequestException(
          `Reassignment target ${reassignment.newTime} is not in day slots`,
        );
      }
    }

    const retainedBookings = bookings.filter((booking) => !resolvedIds.has(booking.id));
    const occupiedTimes = new Set(
      retainedBookings.map((booking) =>
        this.formatTimeInTimezone(booking.startTime, tenant.timezone),
      ),
    );

    for (const reassignment of reassignments) {
      if (occupiedTimes.has(reassignment.newTime)) {
        throw new ConflictException(`Slot ${reassignment.newTime} is already occupied`);
      }
      occupiedTimes.add(reassignment.newTime);
    }

    const existingOverrides = schedule.overrides.filter((override) => override.date !== date);
    const nextOverride: SlotDateOverride = {
      id: date,
      date,
      isDayOff: dto.isDayOff,
      slots: nextSlots,
    };

    const movedBookings = reassignments.map((entry) => {
      const booking = activeBookingsById.get(entry.bookingId)!;
      const nextStartTime = this.buildDateTimeInTz(date, entry.newTime, tenant.timezone);
      const nextEndTime = new Date(nextStartTime.getTime() + booking.durationAtBooking * 60 * 1000);
      return {
        bookingId: booking.id,
        clientId: booking.clientId,
        nextStartTime,
        nextEndTime,
      };
    });

    const bookingsToCancel = Array.from(cancelBookingIds)
      .map((id) => activeBookingsById.get(id))
      .filter((booking): booking is DateBookingRecord => Boolean(booking));

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          settings: this.withSlotSchedule(tenant.settings, {
            weekly: schedule.weekly,
            overrides: [...existingOverrides, nextOverride],
          }),
        },
      });

      for (const moved of movedBookings) {
        await tx.booking.update({
          where: { id: moved.bookingId },
          data: {
            startTime: moved.nextStartTime,
            endTime: moved.nextEndTime,
          },
        });
      }

      for (const booking of bookingsToCancel) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: 'Slot removed by master',
          },
        });
      }
    });

    for (const moved of movedBookings) {
      await this.notificationsService.rescheduleBookingNotifications(
        tenantId,
        moved.bookingId,
        moved.clientId,
        moved.nextStartTime,
      );
    }

    for (const booking of bookingsToCancel) {
      await this.notificationsService.cancelBookingNotifications(
        tenantId,
        booking.id,
        booking.clientId,
        'master',
      );
    }

    this.logger.log(`Date slots updated for ${date} in tenant ${tenantId}`);

    return this.getDateSchedule(tenantId, date);
  }

  private async getBookingsForDate(tenantId: string, date: string, timezone: string) {
    const dayStart = this.buildDateTimeInTz(date, '00:00', timezone);
    const dayEnd = this.buildDateTimeInTz(date, '23:59', timezone);

    return this.prisma.booking.findMany({
      where: {
        tenantId,
        status: { not: 'cancelled' },
        startTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startTime: 'asc' },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    }) as Promise<DateBookingRecord[]>;
  }

  private extractSlotSchedule(settings: Prisma.JsonValue | null): SlotScheduleSettings {
    const root = this.asRecord(settings);
    const rawSchedule = this.asRecord(root[this.settingsKey]);

    return {
      weekly: this.normalizeWeeklyDays(rawSchedule.weekly),
      overrides: this.normalizeOverrides(rawSchedule.overrides),
    };
  }

  private withSlotSchedule(
    settings: Prisma.JsonValue | null,
    schedule: SlotScheduleSettings,
  ): Prisma.InputJsonValue {
    const root = this.asRecord(settings);
    return {
      ...root,
      [this.settingsKey]: {
        weekly: schedule.weekly,
        overrides: schedule.overrides,
      },
    } as unknown as Prisma.InputJsonValue;
  }

  private normalizeWeeklyDays(rawDays: unknown): SlotDayConfig[] {
    const defaults = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isDayOff: true,
      slots: [] as string[],
    }));

    if (!Array.isArray(rawDays)) {
      return defaults;
    }

    for (const entry of rawDays) {
      const record = this.asRecord(entry);
      const dayOfWeek = typeof record.dayOfWeek === 'number' ? record.dayOfWeek : -1;
      if (dayOfWeek < 0 || dayOfWeek > 6) continue;

      const slots = this.normalizeSlots(record.slots);
      defaults[dayOfWeek] = {
        dayOfWeek,
        isDayOff: Boolean(record.isDayOff) || slots.length === 0,
        slots,
      };
    }

    return defaults;
  }

  private normalizeOverrides(rawOverrides: unknown): SlotDateOverride[] {
    if (!Array.isArray(rawOverrides)) {
      return [];
    }

    return rawOverrides
      .map((entry) => {
        const record = this.asRecord(entry);
        const date = typeof record.date === 'string' ? record.date : '';
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return null;
        }

        const slots = this.normalizeSlots(record.slots);
        return {
          id: typeof record.id === 'string' ? record.id : date,
          date,
          isDayOff: Boolean(record.isDayOff) || slots.length === 0,
          slots,
        } satisfies SlotDateOverride;
      })
      .filter((entry): entry is SlotDateOverride => Boolean(entry))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private normalizeSlots(rawSlots: unknown): string[] {
    if (!Array.isArray(rawSlots)) {
      return [];
    }

    const valid = rawSlots.filter(
      (slot): slot is string =>
        typeof slot === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(slot),
    );

    return this.sortTimes([...new Set(valid)]);
  }

  private sortTimes(times: string[]): string[] {
    return [...times].sort((left, right) => left.localeCompare(right));
  }

  private resolveEffectiveSlots(schedule: SlotScheduleSettings, date: string) {
    const override = schedule.overrides.find((entry) => entry.date === date);
    if (override) {
      return {
        source: 'override' as const,
        isDayOff: override.isDayOff,
        slots: override.slots,
      };
    }

    const dayOfWeek = this.getDayOfWeek(date);
    const template = schedule.weekly.find((entry) => entry.dayOfWeek === dayOfWeek);
    return {
      source: 'template' as const,
      isDayOff: template?.isDayOff ?? true,
      slots: template?.slots || [],
    };
  }

  private getDayOfWeek(date: string): number {
    const jsDay = new Date(`${date}T12:00:00Z`).getUTCDay();
    return (jsDay + 6) % 7;
  }

  private validateDateKey(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date must be in YYYY-MM-DD format');
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private buildDateTimeInTz(dateStr: string, timeStr: string, timezone: string): Date {
    const tempDate = new Date(`${dateStr}T${timeStr}:00Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const offset =
      formatter.formatToParts(tempDate).find((part) => part.type === 'timeZoneName')?.value ||
      'GMT+00:00';

    return new Date(`${dateStr}T${timeStr}:00${offset.replace('GMT', '') || '+00:00'}`);
  }

  private formatTimeInTimezone(date: Date, timezone: string): string {
    return date.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
