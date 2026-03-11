// docs/api/endpoints.md — Subscription API Controller
// docs/backlog.md #67-#68 — Subscription checkout UI + management
//
// GET  /api/v1/subscription          → Status
// POST /api/v1/subscription/checkout  → Create payment (redirect URL)
// PUT  /api/v1/subscription/card      → Change card/provider
// POST /api/v1/subscription/cancel    → Cancel subscription
// GET  /api/v1/subscription/payments  → Payment history

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionCheckoutDto, SubscriptionCancelDto, UpdateCardDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('master')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * GET /api/v1/subscription — Subscription status.
   * docs/api/endpoints.md — GET /api/v1/subscription
   */
  @Get()
  async getStatus(@CurrentTenant() tenantId: string) {
    return this.subscriptionService.getStatus(tenantId);
  }

  /**
   * POST /api/v1/subscription/checkout — Create payment.
   * docs/api/endpoints.md — POST /api/v1/subscription/checkout
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(
    @CurrentTenant() tenantId: string,
    @Body() dto: SubscriptionCheckoutDto,
  ) {
    return this.subscriptionService.checkout(tenantId, dto.provider);
  }

  /**
   * PUT /api/v1/subscription/card — Change card/provider.
   * docs/api/endpoints.md — PUT /api/v1/subscription/card
   */
  @Put('card')
  async updateCard(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.subscriptionService.updateCard(tenantId, dto.provider);
  }

  /**
   * POST /api/v1/subscription/cancel — Cancel subscription.
   * docs/api/endpoints.md — POST /api/v1/subscription/cancel
   */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentTenant() tenantId: string,
    @Body() dto: SubscriptionCancelDto,
  ) {
    return this.subscriptionService.cancel(tenantId, dto.reason);
  }

  /**
   * GET /api/v1/subscription/payments — Payment history.
   * docs/api/endpoints.md — GET /api/v1/subscription/payments
   */
  @Get('payments')
  async getPayments(@CurrentTenant() tenantId: string) {
    return this.subscriptionService.getPaymentHistory(tenantId);
  }
}
