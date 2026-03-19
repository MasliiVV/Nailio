// docs/backlog.md #7 — Health check endpoint
// GET /health 🔓 — no auth required

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthMetrics, HealthService, HealthStatus } from './health.service';
import { Public } from '../../common/decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — DB + Redis status' })
  @ApiResponse({ status: 200, description: 'System health status' })
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  @Get('metrics')
  @Public()
  @ApiOperation({ summary: 'Operational metrics — process, Redis, BullMQ snapshot' })
  @ApiResponse({ status: 200, description: 'Operational metrics snapshot' })
  async metrics(): Promise<HealthMetrics> {
    return this.healthService.metrics();
  }
}
