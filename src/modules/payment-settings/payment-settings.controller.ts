// docs/api/endpoints.md — Payment Settings Controller
// docs/backlog.md #69 — Payment settings (master's own Mono/LiqPay)
//
// GET    /api/v1/payment-settings → Current settings
// POST   /api/v1/payment-settings → Connect Mono/LiqPay
// DELETE /api/v1/payment-settings → Disconnect

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { ConnectPaymentSettingsDto } from './dto/payment-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresActiveSubscription } from '../../common/decorators/requires-active-subscription.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('payment-settings')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles('master')
export class PaymentSettingsController {
  constructor(private readonly paymentSettingsService: PaymentSettingsService) {}

  /**
   * GET /api/v1/payment-settings — Current payment settings.
   */
  @Get()
  async getSettings(@CurrentTenant() tenantId: string) {
    return this.paymentSettingsService.getSettings(tenantId);
  }

  /**
   * POST /api/v1/payment-settings — Connect Mono/LiqPay.
   */
  @Post()
  @RequiresActiveSubscription()
  @HttpCode(HttpStatus.CREATED)
  async connect(@CurrentTenant() tenantId: string, @Body() dto: ConnectPaymentSettingsDto) {
    return this.paymentSettingsService.connect(tenantId, dto);
  }

  /**
   * DELETE /api/v1/payment-settings — Disconnect payment provider.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentTenant() tenantId: string) {
    await this.paymentSettingsService.disconnect(tenantId);
  }
}
