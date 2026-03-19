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
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FinanceService } from '../finance/finance.service';
import { RebookingService } from '../rebooking/rebooking.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { renderTemplate } from '../notifications/templates';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import {
  buildDateTimeInTimezone,
  formatBookingDateTime,
  formatTimeInTimezone,
} from '../../common/utils/date-time.util';
import {
  CreateBookingDto,
  CancelBookingDto,
  RescheduleBookingDto,
  UpdateBookingDto,
  BookingListQueryDto,
  SlotsQueryDto,
  SlotsResponseDto,
  SlotDto,
  SendMessageToMasterDto,
} from './dto/bookings.dto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly notificationsService: NotificationsService,
    private readonly financeService: FinanceService,
    private readonly configService: ConfigService,
    private readonly rebookingService: RebookingService,
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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const timezone = tenant.timezone || 'Europe/Kyiv';

    const service = await this.prisma.tenantClient.service.findFirst({
      where: { id: query.serviceId, tenantId, isActive: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const configuredSlots = await this.scheduleService.getSlotTimesForDate(tenantId, query.date);
    if (configuredSlots.length === 0) {
      return { date: query.date, timezone, slots: [] };
    }

    const dayStart = buildDateTimeInTimezone(query.date, '00:00', timezone);
    const dayEnd = buildDateTimeInTimezone(query.date, '23:59', timezone);

    const existingBookings = await this.prisma.tenantClient.booking.findMany({
      where: {
        tenantId,
        status: { notIn: ['cancelled'] },
        startTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();

    const slots = configuredSlots
      .map((slotStartStr) => {
        const slotStartDt = buildDateTimeInTimezone(query.date, slotStartStr, timezone);
        if (slotStartDt <= now) {
          return null;
        }

        const slotEndDt = new Date(slotStartDt.getTime() + service.durationMinutes * 60 * 1000);
        const isOverlapping = this.hasOverlappingInterval(slotStartDt, slotEndDt, existingBookings);

        return {
          startTime: slotStartStr,
          endTime: formatTimeInTimezone(slotEndDt, timezone),
          available: !isOverlapping,
        } satisfies SlotDto;
      })
      .filter((slot): slot is SlotDto => Boolean(slot));

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

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const timezone = tenant.timezone || 'Europe/Kyiv';
    const startTime = this.parseBookingDateTime(dto.startTime, timezone);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid start time');
    }

    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

    if (startTime <= new Date()) {
      throw new BadRequestException('Cannot book in the past');
    }

    const localDateStr = startTime
      .toLocaleDateString('en-CA', { timeZone: timezone })
      .split('T')[0];
    const localTimeStr = startTime.toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const allowedSlots = await this.scheduleService.getSlotTimesForDate(tenantId, localDateStr);
    if (!allowedSlots.includes(localTimeStr)) {
      throw new BadRequestException('Selected time is not available in the slot schedule');
    }

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.booking.findFirst({
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

          return tx.booking.create({
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
                  user: {
                    select: {
                      telegramId: true,
                    },
                  },
                },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

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

      if (user.role === 'client' && dto.promoCampaignId) {
        void this.rebookingService
          .handleCampaignBooking(tenantId, clientId, dto.promoCampaignId, service.id)
          .catch((rebookingError: unknown) => {
            this.logger.error(
              `Failed to finalize rebooking campaign ${dto.promoCampaignId}: ${String(rebookingError)}`,
            );
          });
      }

      return this.formatBookingResponse(booking);
    } catch (error: unknown) {
      // Re-throw our own exceptions
      if (error instanceof ConflictException) throw error;
      if (this.isTimeSlotConflictError(error)) {
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
    const andConditions: Prisma.BookingWhereInput[] = [];

    // Client can only see their own bookings
    if (user.role === 'client' && user.clientId) {
      where.clientId = user.clientId;
    }

    // Master can filter by clientId
    if (user.role === 'master' && query.clientId) {
      where.clientId = query.clientId;
    }

    // Date range filter
    const startTimeFilter: Prisma.DateTimeFilter = {};

    if (query.dateFrom) {
      startTimeFilter.gte = new Date(query.dateFrom);
    }
    if (query.dateTo) {
      startTimeFilter.lte = new Date(query.dateTo + 'T23:59:59.999Z');
    }
    if (Object.keys(startTimeFilter).length > 0) {
      andConditions.push({ startTime: startTimeFilter });
    }

    // Status filter
    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.upcoming === true) {
      andConditions.push({
        startTime: { gte: new Date() },
        status: { in: [BookingStatus.pending, BookingStatus.confirmed] },
      });
    }

    if (query.upcoming === false) {
      andConditions.push({
        OR: [
          { startTime: { lt: new Date() } },
          {
            status: {
              in: [BookingStatus.completed, BookingStatus.cancelled, BookingStatus.no_show],
            },
          },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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
            user: {
              select: {
                telegramId: true,
              },
            },
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
              user?: {
                telegramId?: bigint | null;
              };
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
            user: {
              select: {
                telegramId: true,
              },
            },
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

    // Validate transition: clients can only cancel pending/confirmed bookings
    if (user.role !== 'master' && !['pending', 'confirmed'].includes(booking.status)) {
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
  // Hard-delete Booking (master only)
  // DELETE /api/v1/bookings/:id
  // ──────────────────────────────────────────────

  async remove(tenantId: string, bookingId: string) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // Silently remove pending BullMQ jobs (no notification to client)
    await this.notificationsService.silentlyRemoveBookingJobs(tenantId, bookingId);

    // Delete booking (notifications cascade-deleted via FK)
    await this.prisma.tenantClient.booking.delete({
      where: { id: bookingId },
    });

    this.logger.log(`Booking hard-deleted: ${bookingId} in tenant ${tenantId}`);

    return { success: true };
  }

  // ──────────────────────────────────────────────
  // Update Booking (notes, service)
  // PATCH /api/v1/bookings/:id
  // ──────────────────────────────────────────────

  async updateBooking(tenantId: string, bookingId: string, dto: UpdateBookingDto) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { service: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const updateData: Prisma.BookingUpdateInput = {};

    // Update status
    if (dto.status && dto.status !== booking.status) {
      const allowedStatuses = ['completed', 'cancelled'];
      if (!allowedStatuses.includes(dto.status)) {
        throw new BadRequestException(`Status can only be set to: ${allowedStatuses.join(', ')}`);
      }
      updateData.status = dto.status;

      if (dto.status === 'cancelled') {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = 'Changed by master';
      }
    }

    // Update notes
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes || null;
    }

    // Change service
    if (dto.serviceId && dto.serviceId !== booking.serviceId) {
      const service = await this.prisma.tenantClient.service.findFirst({
        where: { id: dto.serviceId, tenantId, isActive: true },
      });
      if (!service) throw new NotFoundException('Service not found');

      const newEndTime = new Date(
        booking.startTime.getTime() + service.durationMinutes * 60 * 1000,
      );

      const conflicting = await this.prisma.tenantClient.booking.findFirst({
        where: {
          tenantId,
          id: { not: bookingId },
          status: { notIn: ['cancelled'] },
          startTime: { lt: newEndTime },
          endTime: { gt: booking.startTime },
        },
      });

      if (conflicting) {
        throw new ConflictException('New service duration conflicts with another booking');
      }

      updateData.service = { connect: { id: dto.serviceId } };
      updateData.serviceNameSnapshot = service.name;
      updateData.priceAtBooking = service.price;
      updateData.durationAtBooking = service.durationMinutes;
      updateData.endTime = newEndTime;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const savedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: updateData,
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          service: {
            select: { id: true, name: true, color: true },
          },
        },
      });

      if (dto.status === 'completed' && booking.status !== 'completed') {
        await tx.client.update({
          where: { id: booking.clientId },
          data: { lastVisitAt: new Date() },
        });

        await this.financeService.createBookingTransaction(
          tenantId,
          bookingId,
          booking.clientId,
          booking.priceAtBooking,
          booking.serviceNameSnapshot,
          tx,
        );
      }

      return savedBooking;
    });

    this.logger.log(`Booking updated: ${bookingId} in tenant ${tenantId}`);

    return this.formatBookingResponse(updated);
  }

  // ──────────────────────────────────────────────
  // Reschedule Booking
  // POST /api/v1/bookings/:id/reschedule
  // Change time and/or reassign to another client
  // ──────────────────────────────────────────────

  async reschedule(tenantId: string, bookingId: string, dto: RescheduleBookingDto) {
    const booking = await this.prisma.tenantClient.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { service: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (['completed', 'no_show'].includes(booking.status)) {
      throw new BadRequestException(`Cannot reschedule booking with status "${booking.status}"`);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const timezone = tenant.timezone || 'Europe/Kyiv';
    const newStartTime = this.parseBookingDateTime(dto.startTime, timezone);
    if (isNaN(newStartTime.getTime())) {
      throw new BadRequestException('Invalid start time');
    }

    if (newStartTime <= new Date()) {
      throw new BadRequestException('Cannot reschedule to a past time');
    }

    const localDateStr = newStartTime.toLocaleDateString('en-CA', { timeZone: timezone });
    const localTimeStr = formatTimeInTimezone(newStartTime, timezone);
    const allowedSlots = await this.scheduleService.getSlotTimesForDate(tenantId, localDateStr);

    if (!allowedSlots.includes(localTimeStr)) {
      throw new BadRequestException('Selected time is not available in the slot schedule');
    }

    const newEndTime = new Date(newStartTime.getTime() + booking.durationAtBooking * 60 * 1000);

    const conflicting = await this.prisma.tenantClient.booking.findFirst({
      where: {
        tenantId,
        id: { not: bookingId },
        status: { notIn: ['cancelled'] },
        startTime: { lt: newEndTime },
        endTime: { gt: newStartTime },
      },
    });

    if (conflicting) {
      throw new ConflictException('Time slot is already booked');
    }

    // Build update data
    const updateData: Prisma.BookingUpdateInput = {
      startTime: newStartTime,
      endTime: newEndTime,
      status: booking.status === 'cancelled' ? 'confirmed' : booking.status,
    };

    // If cancelled, clear cancellation fields
    if (booking.status === 'cancelled') {
      updateData.cancelledAt = null;
      updateData.cancelReason = null;
    }

    // Reassign to another client if specified
    if (dto.clientId && dto.clientId !== booking.clientId) {
      const client = await this.prisma.tenantClient.client.findFirst({
        where: { id: dto.clientId, tenantId },
      });
      if (!client) throw new NotFoundException('Client not found');
      updateData.client = { connect: { id: dto.clientId } };
    }

    const updated = await this.prisma.tenantClient.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        service: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    this.logger.log(
      `Booking rescheduled: ${bookingId} to ${newStartTime.toISOString()} in tenant ${tenantId}`,
    );

    await this.notificationsService.rescheduleBookingNotifications(
      tenantId,
      bookingId,
      updated.clientId,
      newStartTime,
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

    const completedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.booking.updateMany({
        where: {
          id: bookingId,
          tenantId,
          status: { in: ['pending', 'confirmed'] },
        },
        data: { status: 'completed' },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(`Cannot complete booking with status "${booking.status}"`);
      }

      await tx.client.update({
        where: { id: booking.clientId },
        data: { lastVisitAt: completedAt },
      });

      await this.financeService.createBookingTransaction(
        tenantId,
        bookingId,
        booking.clientId,
        booking.priceAtBooking,
        booking.serviceNameSnapshot,
        tx,
      );

      return tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
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

  private formatBookingDateTimeForTimezone(startTime: Date, timezone: string) {
    return formatBookingDateTime(startTime, timezone);
  }

  private parseBookingDateTime(value: string, timezone: string) {
    const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
    if (hasExplicitTimezone) {
      return new Date(value);
    }

    const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/);
    if (match) {
      return buildDateTimeInTimezone(match[1], match[2], timezone);
    }

    return new Date(value);
  }

  private hasOverlappingInterval(slotStart: Date, slotEnd: Date, bookings: Booking[]): boolean {
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotEnd.getTime();
    let activeInterval: { start: number; end: number } | null = null;

    for (const booking of bookings) {
      const interval = {
        start: booking.startTime.getTime(),
        end: booking.endTime.getTime(),
      };

      if (interval.end <= slotStartMs) {
        continue;
      }

      if (!activeInterval) {
        activeInterval = interval;
      } else if (interval.start <= activeInterval.end) {
        activeInterval.end = Math.max(activeInterval.end, interval.end);
      } else {
        activeInterval = interval;
      }

      if (activeInterval.start < slotEndMs && activeInterval.end > slotStartMs) {
        return true;
      }

      if (activeInterval.start >= slotEndMs) {
        return false;
      }
    }

    return false;
  }

  private isTimeSlotConflictError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const prismaError = error as Error & {
      code?: string;
      meta?: { target?: unknown; constraint?: string };
    };

    if (
      prismaError.code === 'P2002' ||
      prismaError.code === 'P2004' ||
      prismaError.code === 'P2034'
    ) {
      return true;
    }

    const message = error.message.toLowerCase();

    return (
      message.includes('bookings_no_overlap') ||
      message.includes('exclusion constraint') ||
      message.includes('time slot is already booked') ||
      message.includes('could not serialize access')
    );
  }

  // ──────────────────────────────────────────────
  // Client → Master messaging
  // ──────────────────────────────────────────────

  /**
   * Send a message from client to master via Telegram platform bot.
   * If bookingId is provided, includes booking context in the message.
   */
  async sendMessageToMaster(
    tenantId: string,
    user: JwtPayload,
    dto: SendMessageToMasterDto,
  ): Promise<{ success: boolean }> {
    // Get client info
    const client = await this.prisma.client.findFirst({
      where: { userId: user.sub, tenantId },
      include: { user: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Get master's Telegram ID
    const master = await this.prisma.master.findFirst({
      where: { tenantId },
      include: { user: true },
    });
    if (!master?.user?.telegramId) {
      throw new NotFoundException('Master not found');
    }

    const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
    const clientName = `${client.firstName} ${client.lastName || ''}`.trim();
    const clientTelegramLink = `<a href="tg://user?id=${client.user.telegramId}">Зв’язатися в Telegram</a>`;

    let text: string;
    let replyMarkup: Record<string, unknown> | undefined;

    if (dto.bookingId) {
      // Message with booking context
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId, tenantId },
        include: { tenant: true },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const tz = booking.tenant?.timezone || 'Europe/Kyiv';
      const { date, time } = this.formatBookingDateTimeForTimezone(booking.startTime, tz);

      text = renderTemplate('client_message', 'uk', {
        serviceName: booking.serviceNameSnapshot,
        date,
        time,
        duration: booking.durationAtBooking,
        price: booking.priceAtBooking,
        clientName,
        clientPhone: client.phone || undefined,
        clientTelegramLink,
        reason: dto.message,
      });

      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '💬 Відповісти клієнту',
              callback_data: `reply:${dto.bookingId}`,
            },
          ],
        ],
      };
    } else {
      const nearestBooking = await this.prisma.booking.findFirst({
        where: {
          tenantId,
          clientId: client.id,
          status: { in: [BookingStatus.pending, BookingStatus.confirmed] },
          startTime: { gte: new Date() },
        },
        include: { tenant: true },
        orderBy: { startTime: 'asc' },
      });

      const bookingContext = nearestBooking
        ? (() => {
            const timezone = nearestBooking.tenant?.timezone || 'Europe/Kyiv';
            const { date, time } = this.formatBookingDateTimeForTimezone(
              nearestBooking.startTime,
              timezone,
            );

            return `\n\n📋 Найближчий запис: ${nearestBooking.serviceNameSnapshot}\n📅 ${date} о ${time}`;
          })()
        : '';

      // General message without booking context
      text =
        `💬 Повідомлення від клієнта <b>${clientName}</b> (${clientTelegramLink})\n` +
        `📱 ${client.phone || 'Не вказано'}${bookingContext}\n\n` +
        `📝 ${dto.message}`;

      if (client.user.telegramId) {
        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '💬 Відповісти клієнту',
                url: `tg://user?id=${client.user.telegramId.toString()}`,
              },
            ],
          ],
        };
      }
    }

    // Send to master via platform bot
    const response = await fetch(`https://api.telegram.org/bot${platformBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: master.user.telegramId.toString(),
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      this.logger.error(`Failed to send message to master: ${response.statusText}`);
      throw new BadRequestException('Failed to send message');
    }

    this.logger.log(`Client ${client.firstName} sent message to master (tenant: ${tenantId})`);

    return { success: true };
  }

  /**
   * Format booking for API response
   * docs/api/endpoints.md — Booking response format
   */
  private formatBookingResponse(booking: Record<string, unknown>): Record<string, unknown> {
    const rawClient = booking.client as
      | {
          id: string;
          firstName: string;
          lastName: string | null;
          phone: string | null;
          user?: { telegramId?: bigint | null };
        }
      | undefined;

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
      ...(rawClient
        ? {
            client: {
              id: rawClient.id,
              firstName: rawClient.firstName,
              lastName: rawClient.lastName,
              phone: rawClient.phone,
              telegramId: rawClient.user?.telegramId?.toString() || null,
            },
          }
        : {}),
      ...(booking.service ? { service: booking.service } : {}),
    };
  }
}
