// docs/backlog.md #44 — Slot generation algorithm
// docs/backlog.md #46-#50 — Booking CRUD
// docs/database/schema.md — bookings table, exclusion constraint
// docs/api/endpoints.md — Booking endpoints

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Booking, Prisma } from '@prisma/client';
import {
  CreateBookingDto,
  CancelBookingDto,
  BookingListQueryDto,
  SlotsQueryDto,
  SlotsResponseDto,
  SlotDto,
} from './dto/bookings.dto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ──────────────────────────────────────────────
  // Slot Generation (#44, #45)
  // docs/api/endpoints.md — GET /api/v1/bookings/slots
  // ──────────────────────────────────────────────

  /**
   * Generate available time slots for a given date and service.
   *
   * Algorithm:
   * 1. Get working hours for the date (considering overrides)
   * 2. Get service duration + buffer
   * 3. Get existing non-cancelled bookings for the date
   * 4. Generate slots at slot_step_minutes intervals (from tenant settings, default 30)
   * 5. Mark each slot as available/unavailable
   */
  async getAvailableSlots(tenantId: string, query: SlotsQueryDto): Promise<SlotsResponseDto> {
    // 1. Get tenant settings (timezone, slot_step_minutes)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = tenant.settings as Record<string, unknown>;
    const timezone = tenant.timezone || 'Europe/Kyiv';
    const slotStepMinutes = (settings.slot_step_minutes as number) || 30;

    // 2. Get service
    const service = await this.prisma.tenantClient.service.findFirst({
      where: { id: query.serviceId, tenantId, isActive: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const totalDuration = service.durationMinutes + service.bufferMinutes;

    // 3. Get working hours for the date
    const dateObj = new Date(query.date + 'T00:00:00');
    const workingHours = await this.scheduleService.getWorkingHoursForDate(tenantId, dateObj);

    if (!workingHours) {
      // Day off — no slots
      return { date: query.date, timezone, slots: [] };
    }

    // 4. Get existing bookings for this date (non-cancelled)
    const dayStart = this.buildDateTimeInTz(query.date, workingHours.startTime, timezone);
    const dayEnd = this.buildDateTimeInTz(query.date, workingHours.endTime, timezone);

    const existingBookings = await this.prisma.tenantClient.booking.findMany({
      where: {
        tenantId,
        status: { notIn: ['cancelled'] },
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    // 5. Generate time slots
    const slots: SlotDto[] = [];
    const [startHour, startMin] = workingHours.startTime.split(':').map(Number);
    const [endHour, endMin] = workingHours.endTime.split(':').map(Number);
    const workStartMinutes = startHour * 60 + startMin;
    const workEndMinutes = endHour * 60 + endMin;

    const now = new Date();

    for (
      let slotStart = workStartMinutes;
      slotStart + totalDuration <= workEndMinutes;
      slotStart += slotStepMinutes
    ) {
      const slotEnd = slotStart + totalDuration;
      const slotStartStr = this.minutesToTime(slotStart);
      const slotEndStr = this.minutesToTime(slotStart + service.durationMinutes);

      const slotStartDt = this.buildDateTimeInTz(query.date, slotStartStr, timezone);
      const slotEndDt = this.buildDateTimeInTz(query.date, this.minutesToTime(slotEnd), timezone);

      // Check if slot is in the past
      if (slotStartDt <= now) {
        continue; // Skip past slots
      }

      // Check overlap with existing bookings
      const isOverlapping = existingBookings.some(
        (b: Booking) => slotStartDt < b.endTime && slotEndDt > b.startTime,
      );

      slots.push({
        startTime: slotStartStr,
        endTime: slotEndStr,
        available: !isOverlapping,
      });
    }

    return { date: query.date, timezone, slots };
  }

  // ──────────────────────────────────────────────
  // Create Booking (#46)
  // docs/api/endpoints.md — POST /api/v1/bookings
  // ──────────────────────────────────────────────

  /**
   * Create a new booking.
   *
   * - Client creates for themselves
   * - Master can create for any client (clientId required)
   * - Snapshots service data at creation time
   * - Double-booking protection: app-level check + DB exclusion constraint
   */
  async create(tenantId: string, user: JwtPayload, dto: CreateBookingDto) {
    // 1. Determine client
    let clientId: string;

    if (user.role === 'master') {
      if (!dto.clientId) {
        throw new BadRequestException('clientId is required when master creates a booking');
      }
      clientId = dto.clientId;
    } else {
      // Client creates for themselves
      if (!user.clientId) {
        throw new BadRequestException('Client profile not found');
      }
      clientId = user.clientId;
    }

    // 2. Validate client exists and not blocked
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (client.isBlocked) {
      throw new ForbiddenException('Client is blocked');
    }

    // 3. Get service (must be active)
    const service = await this.prisma.tenantClient.service.findFirst({
      where: { id: dto.serviceId, tenantId, isActive: true },
    });
    if (!service) throw new NotFoundException('Service not found or inactive');

    // 4. Calculate times
    const startTime = new Date(dto.startTime);
    const endMinutes = service.durationMinutes + service.bufferMinutes;
    const endTime = new Date(startTime.getTime() + endMinutes * 60 * 1000);

    // 5. Validate: not in the past
    if (startTime <= new Date()) {
      throw new BadRequestException('Cannot book in the past');
    }

    // 6. Validate: within working hours
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const dateStr = startTime.toISOString().split('T')[0];
    const dateObj = new Date(dateStr + 'T00:00:00');
    const workingHours = await this.scheduleService.getWorkingHoursForDate(tenantId, dateObj);

    if (!workingHours) {
      throw new BadRequestException('Selected date is a day off');
    }

    // 7. App-level double-booking check (DB exclusion constraint is the final guard)
    const overlapping = await this.prisma.tenantClient.booking.findFirst({
      where: {
        tenantId,
        status: { notIn: ['cancelled'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (overlapping) {
      throw new ConflictException('Time slot is already booked');
    }

    // 8. Create booking with service snapshot
    try {
      const booking = await this.prisma.tenantClient.booking.create({
        data: {
          tenantId,
          clientId,
          serviceId: service.id,
          serviceNameSnapshot: service.name,
          priceAtBooking: service.price,
          durationAtBooking: service.durationMinutes,
          startTime,
          endTime,
          status: 'pending',
          notes: dto.notes,
          createdBy: user.role === 'master' ? 'master' : 'client',
        },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      });

      this.logger.log(
        `Booking created: ${booking.id} by ${user.role} for client ${clientId} in tenant ${tenantId}`,
      );

      // Schedule notifications (confirmation + reminders)
      await this.notificationsService.scheduleBookingNotifications(
        tenantId,
        booking.id,
        clientId,
        startTime,
        user.role === 'master' ? 'master' : 'client',
      );

      return this.formatBookingResponse(booking);
    } catch (error: unknown) {
      // Handle DB exclusion constraint violation (concurrent booking)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Time slot is already booked');
      }
      throw error;
    }
  }

  // ──────────────────────────────────────────────
  // List Bookings (#49)
  // docs/api/endpoints.md — GET /api/v1/bookings
  // ──────────────────────────────────────────────

  /**
   * List bookings.
   * Master sees all bookings for tenant.
   * Client sees only their own bookings.
   */
  async findAll(tenantId: string, user: JwtPayload, query: BookingListQueryDto) {
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const where: Prisma.BookingWhereInput = { tenantId };

    // Client can only see their own bookings
    if (user.role === 'client' && user.clientId) {
      where.clientId = user.clientId;
    }

    // Master can filter by clientId
    if (user.role === 'master' && query.clientId) {
      where.clientId = query.clientId;
    }

    // Date range filter
    if (query.dateFrom) {
      where.startTime = {
        ...((where.startTime as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.dateFrom),
      };
    }
    if (query.dateTo) {
      where.startTime = {
        ...((where.startTime as Prisma.DateTimeFilter) || {}),
        lte: new Date(query.dateTo + 'T23:59:59.999Z'),
      };
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Cursor pagination
    const findArgs: Prisma.BookingFindManyArgs = {
      where,
      orderBy: { startTime: 'desc' },
      take: limit + 1, // Take one extra for cursor
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1; // Skip the cursor item itself
    }

    const bookings = await this.prisma.tenantClient.booking.findMany(findArgs);

    const hasMore = bookings.length > limit;
    const items = hasMore ? bookings.slice(0, limit) : bookings;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map(
        (
          b: Booking & {
            client?: {
              id: string;
              firstName: string;
              lastName: string | null;
              phone: string | null;
            };
          },
        ) => this.formatBookingResponse(b),
      ),
      nextCursor,
      hasMore,
    };
  }

  // ──────────────────────────────────────────────
  // Get Booking by ID
  // docs/api/endpoints.md — GET /api/v1/bookings/:id
  // ──────────────────────────────────────────────

  async findById(tenantId: string, bookingId: string, user: JwtPayload) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        service: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // Client can only see their own bookings
    if (user.role === 'client' && user.clientId && booking.clientId !== user.clientId) {
      throw new ForbiddenException('Access denied');
    }

    return this.formatBookingResponse(booking);
  }

  // ──────────────────────────────────────────────
  // Cancel Booking (#47)
  // docs/api/endpoints.md — POST /api/v1/bookings/:id/cancel
  // docs/database/schema.md — transition rules: pending/confirmed → cancelled
  // ──────────────────────────────────────────────

  /**
   * Cancel a booking.
   * Both master and client can cancel.
   * Client has cancellation_window_hours restriction (from tenant settings).
   * Master can cancel anytime.
   */
  async cancel(tenantId: string, bookingId: string, user: JwtPayload, dto: CancelBookingDto) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // Validate transition: only pending/confirmed can be cancelled
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel booking with status "${booking.status}"`);
    }

    // Client: check cancellation window
    if (user.role === 'client') {
      // Client can only cancel their own bookings
      if (user.clientId && booking.clientId !== user.clientId) {
        throw new ForbiddenException('Access denied');
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      const settings = (tenant?.settings || {}) as Record<string, unknown>;
      const cancellationWindowHours = (settings.cancellation_window_hours as number) || 24;

      const hoursUntilBooking = (booking.startTime.getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursUntilBooking < cancellationWindowHours) {
        throw new UnprocessableEntityException({
          error: 'CANCELLATION_WINDOW',
          message: `Cannot cancel booking less than ${cancellationWindowHours} hours before start time`,
          hoursUntilBooking: Math.round(hoursUntilBooking * 10) / 10,
          cancellationWindowHours,
        });
      }
    }

    const updated = await this.prisma.tenantClient.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });

    this.logger.log(`Booking cancelled: ${bookingId} by ${user.role} in tenant ${tenantId}`);

    // Cancel scheduled notifications + send cancellation notification
    await this.notificationsService.cancelBookingNotifications(
      tenantId,
      bookingId,
      booking.clientId,
      user.role === 'master' ? 'master' : 'client',
    );

    return this.formatBookingResponse(updated);
  }

  // ──────────────────────────────────────────────
  // Complete Booking (#48)
  // docs/api/endpoints.md — POST /api/v1/bookings/:id/complete
  // docs/database/schema.md — transition: confirmed → completed
  // ──────────────────────────────────────────────

  async complete(tenantId: string, bookingId: string) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // Transition: only pending/confirmed → completed
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new BadRequestException(`Cannot complete booking with status "${booking.status}"`);
    }

    const updated = await this.prisma.tenantClient.booking.update({
      where: { id: bookingId },
      data: { status: 'completed' },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Update client's lastVisitAt
    await this.prisma.tenantClient.client.update({
      where: { id: booking.clientId },
      data: { lastVisitAt: new Date() },
    });

    this.logger.log(`Booking completed: ${bookingId} in tenant ${tenantId}`);

    return this.formatBookingResponse(updated);
  }

  // ──────────────────────────────────────────────
  // No-show (#48)
  // docs/api/endpoints.md — POST /api/v1/bookings/:id/no-show
  // docs/database/schema.md — transition: confirmed → no_show
  // ──────────────────────────────────────────────

  async noShow(tenantId: string, bookingId: string) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // Transition: only confirmed → no_show
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new BadRequestException(
        `Cannot mark no-show for booking with status "${booking.status}"`,
      );
    }

    const updated = await this.prisma.tenantClient.booking.update({
      where: { id: bookingId },
      data: { status: 'no_show' },
    });

    this.logger.log(`Booking no-show: ${bookingId} in tenant ${tenantId}`);

    return this.formatBookingResponse(updated);
  }

  // ──────────────────────────────────────────────
  // Confirm Booking (master confirms pending booking)
  // docs/database/schema.md — transition: pending → confirmed
  // ──────────────────────────────────────────────

  async confirm(tenantId: string, bookingId: string) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status !== 'pending') {
      throw new BadRequestException(`Cannot confirm booking with status "${booking.status}"`);
    }

    const updated = await this.prisma.tenantClient.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' },
    });

    this.logger.log(`Booking confirmed: ${bookingId} in tenant ${tenantId}`);

    return this.formatBookingResponse(updated);
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /**
   * Build a Date object from date string + time string in a given timezone.
   * e.g. buildDateTimeInTz("2026-03-15", "09:00", "Europe/Kyiv")
   */
  private buildDateTimeInTz(dateStr: string, timeStr: string, timezone: string): Date {
    // Create a date string interpreted in the given timezone
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    // Use Intl to get the UTC offset for this timezone on this date
    const tempDate = new Date(dateTimeStr + 'Z');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(tempDate);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    const offset = tzPart?.value || '+00:00';

    // Parse offset like "GMT+02:00" → "+02:00"
    const offsetStr = offset.replace('GMT', '') || '+00:00';

    return new Date(`${dateStr}T${timeStr}:00${offsetStr}`);
  }

  /**
   * Convert minutes since midnight to "HH:mm" format
   */
  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Format booking for API response
   * docs/api/endpoints.md — Booking response format
   */
  private formatBookingResponse(booking: Record<string, unknown>): Record<string, unknown> {
    return {
      id: booking.id,
      serviceNameSnapshot: booking.serviceNameSnapshot,
      priceAtBooking: booking.priceAtBooking,
      durationAtBooking: booking.durationAtBooking,
      startTime: (booking.startTime as Date)?.toISOString?.() ?? booking.startTime,
      endTime: (booking.endTime as Date)?.toISOString?.() ?? booking.endTime,
      status: booking.status,
      notes: booking.notes || undefined,
      createdBy: booking.createdBy,
      cancelledAt: booking.cancelledAt
        ? ((booking.cancelledAt as Date)?.toISOString?.() ?? booking.cancelledAt)
        : undefined,
      cancelReason: booking.cancelReason || undefined,
      createdAt: (booking.createdAt as Date)?.toISOString?.() ?? booking.createdAt,
      ...(booking.client ? { client: booking.client } : {}),
      ...(booking.service ? { service: booking.service } : {}),
    };
  }
}
