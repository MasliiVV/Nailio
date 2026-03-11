// docs/api/endpoints.md — Analytics endpoints
// 🔑👑 = JWT + Master only

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('master')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/v1/analytics/dashboard 🔑👑
   * docs/api/endpoints.md — period: week/month/year
   */
  @Get('dashboard')
  async dashboard(
    @CurrentTenant() tenantId: string,
    @Query('period') period?: 'week' | 'month' | 'year',
  ) {
    return this.analyticsService.getDashboard(tenantId, period);
  }

  /**
   * GET /api/v1/analytics/daily 🔑👑
   * docs/api/endpoints.md — dateFrom, dateTo
   */
  @Get('daily')
  async daily(
    @CurrentTenant() tenantId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from =
      dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = dateTo || new Date().toISOString().split('T')[0];
    return this.analyticsService.getDailyStats(tenantId, from, to);
  }
}
