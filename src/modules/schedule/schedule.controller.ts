// docs/api/endpoints.md — Schedule endpoints
// GET /api/v1/schedule 🔑
// PUT /api/v1/schedule/hours 🔑👑⚡
// POST /api/v1/schedule/overrides 🔑👑⚡
// DELETE /api/v1/schedule/overrides/:id 🔑👑⚡

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { UpdateWorkingHoursDto, CreateOverrideDto, ScheduleResponseDto } from './dto/schedule.dto';
import { Roles, RequiresActiveSubscription, CurrentTenant } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Schedule')
@Controller('schedule')
@ApiBearerAuth()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * Get schedule (working hours + overrides)
   * docs/api/endpoints.md — GET /api/v1/schedule 🔑
   */
  @Get()
  @ApiOperation({ summary: 'Get working schedule with overrides' })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async getSchedule(@CurrentTenant() tenantId: string) {
    return this.scheduleService.getSchedule(tenantId);
  }

  /**
   * Update weekly working hours (full replace)
   * docs/api/endpoints.md — PUT /api/v1/schedule/hours 🔑👑⚡
   */
  @Put('hours')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update weekly working hours' })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async updateHours(@CurrentTenant() tenantId: string, @Body() dto: UpdateWorkingHoursDto) {
    return this.scheduleService.updateWorkingHours(tenantId, dto);
  }

  /**
   * Add schedule override (day off or custom hours)
   * docs/api/endpoints.md — POST /api/v1/schedule/overrides 🔑👑⚡
   */
  @Post('overrides')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add schedule override' })
  async createOverride(@CurrentTenant() tenantId: string, @Body() dto: CreateOverrideDto) {
    return this.scheduleService.createOverride(tenantId, dto);
  }

  /**
   * Delete schedule override
   * docs/api/endpoints.md — DELETE /api/v1/schedule/overrides/:id 🔑👑⚡
   */
  @Delete('overrides/:id')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete schedule override' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Override not found' })
  async deleteOverride(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduleService.deleteOverride(tenantId, id);
  }
}
