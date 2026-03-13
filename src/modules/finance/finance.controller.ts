// docs/api/endpoints.md — Finance endpoints
// 🔑👑 = JWT + Master only, ⚡ = Active subscription

import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FinanceService } from './finance.service';
import { CreateTransactionDto, TransactionListQueryDto } from './dto/finance.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresActiveSubscription } from '../../common/decorators/requires-active-subscription.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('master')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  /**
   * GET /api/v1/finance/transactions 🔑👑
   */
  @Get('transactions')
  async list(@CurrentTenant() tenantId: string, @Query() query: TransactionListQueryDto) {
    return this.financeService.findAll(tenantId, query);
  }

  /**
   * POST /api/v1/finance/transactions 🔑👑⚡
   */
  @Post('transactions')
  @RequiresActiveSubscription()
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateTransactionDto) {
    return this.financeService.create(tenantId, dto);
  }

  /**
   * GET /api/v1/finance/summary 🔑👑
   */
  @Get('summary')
  async summary(
    @CurrentTenant() tenantId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.financeService.getSummary(tenantId, dateFrom, dateTo);
  }
}
