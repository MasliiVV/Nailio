// docs/api/endpoints.md — Clients CRM endpoints
// 🔑👑 = JWT + Master only, ⚡ = Active subscription

import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ClientsService } from './clients.service';
import { ClientListQueryDto, UpdateClientDto, ClientOnboardingDto } from './dto/clients.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresActiveSubscription } from '../../common/decorators/requires-active-subscription.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  /**
   * GET /api/v1/clients — Client list 🔑👑
   * docs/api/endpoints.md — search, cursor, limit
   */
  @Get()
  @Roles('master')
  async list(@CurrentTenant() tenantId: string, @Query() query: ClientListQueryDto) {
    return this.clientsService.findAll(tenantId, query);
  }

  /**
   * GET /api/v1/clients/:id — Client profile 🔑👑
   * docs/api/endpoints.md — with stats + recent bookings
   */
  @Get(':id')
  @Roles('master')
  async findById(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findById(tenantId, id);
  }

  /**
   * PUT /api/v1/clients/:id — Update client 🔑👑⚡
   * docs/api/endpoints.md — notes, tags
   */
  @Put(':id')
  @Roles('master')
  @RequiresActiveSubscription()
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(tenantId, id, dto);
  }

  /**
   * POST /api/v1/clients/:id/block — Block client 🔑👑⚡
   */
  @Post(':id/block')
  @Roles('master')
  @RequiresActiveSubscription()
  async block(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.block(tenantId, id);
  }

  /**
   * POST /api/v1/clients/:id/unblock — Unblock client 🔑👑⚡
   */
  @Post(':id/unblock')
  @Roles('master')
  @RequiresActiveSubscription()
  async unblock(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.unblock(tenantId, id);
  }

  /**
   * POST /api/v1/clients/onboarding — Client self-registration 🔑👤
   * docs/api/endpoints.md — Client Onboarding
   */
  @Post('onboarding')
  @Roles('client')
  async onboarding(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ClientOnboardingDto,
  ) {
    return this.clientsService.onboarding(tenantId, user, dto);
  }
}
