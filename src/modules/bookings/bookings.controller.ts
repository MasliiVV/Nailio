// docs/api/endpoints.md — Booking endpoints
// docs/backlog.md #45, #47-#49 — Booking controller
// 🔑 = JWT required, 👑 = master only, ⚡ = active subscription

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BookingsService } from './bookings.service';
import {
  CreateBookingDto,
  CancelBookingDto,
  BookingListQueryDto,
  SlotsQueryDto,
} from './dto/bookings.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresActiveSubscription } from '../../common/decorators/requires-active-subscription.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('api/v1/bookings')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * GET /api/v1/bookings/slots — Available time slots 🔑
   * docs/api/endpoints.md — query: date, serviceId
   */
  @Get('slots')
  async getSlots(
    @CurrentTenant() tenantId: string,
    @Query() query: SlotsQueryDto,
  ) {
    return this.bookingsService.getAvailableSlots(tenantId, query);
  }

  /**
   * GET /api/v1/bookings — List bookings 🔑
   * Master sees all, client sees own only
   * docs/api/endpoints.md — query: dateFrom, dateTo, status, clientId, cursor, limit
   */
  @Get()
  async list(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: BookingListQueryDto,
  ) {
    return this.bookingsService.findAll(tenantId, user, query);
  }

  /**
   * POST /api/v1/bookings — Create booking 🔑⚡
   * docs/api/endpoints.md — client: serviceId + startTime, master: + clientId
   */
  @Post()
  @RequiresActiveSubscription()
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(tenantId, user, dto);
  }

  /**
   * GET /api/v1/bookings/:id — Booking detail 🔑
   */
  @Get(':id')
  async findById(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.findById(tenantId, id, user);
  }

  /**
   * POST /api/v1/bookings/:id/cancel — Cancel booking 🔑
   * docs/api/endpoints.md — 422 CANCELLATION_WINDOW
   */
  @Post(':id/cancel')
  async cancel(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(tenantId, id, user, dto);
  }

  /**
   * POST /api/v1/bookings/:id/confirm — Confirm booking 🔑👑
   * docs/database/schema.md — transition: pending → confirmed
   */
  @Post(':id/confirm')
  @Roles('master')
  async confirm(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.confirm(tenantId, id);
  }

  /**
   * POST /api/v1/bookings/:id/complete — Mark completed 🔑👑
   * docs/api/endpoints.md — master only
   */
  @Post(':id/complete')
  @Roles('master')
  async complete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.complete(tenantId, id);
  }

  /**
   * POST /api/v1/bookings/:id/no-show — Mark no-show 🔑👑
   * docs/api/endpoints.md — master only
   */
  @Post(':id/no-show')
  @Roles('master')
  async noShow(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.noShow(tenantId, id);
  }
}
