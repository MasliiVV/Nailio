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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import {
  UpdateWorkingHoursDto,
  CreateOverrideDto,
  ScheduleResponseDto,
  DayScheduleResponseDto,
} from './dto/schedule.dto';
import { Roles, RequiresActiveSubscription, CurrentTenant } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';

@ApiTags('Schedule')
@Controller('schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  @ApiOperation({ summary: 'Get slot schedule template with future date overrides' })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async getSchedule(@CurrentTenant() tenantId: string): Promise<ScheduleResponseDto> {
    return this.scheduleService.getSchedule(tenantId);
  }

  @Put('hours')
  @Roles('master')
  @RequiresActiveSubscription()
  @ApiOperation({ summary: 'Update weekly slot template' })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  async updateHours(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateWorkingHoursDto,
  ): Promise<ScheduleResponseDto> {
    return this.scheduleService.updateWorkingHours(tenantId, dto);
  }

  @Post('overrides')
  @Roles('master')
  @RequiresActiveSubscription()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or replace slot override for a specific date' })
  async createOverride(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateOverrideDto,
  ): Promise<DayScheduleResponseDto> {
    return this.scheduleService.createOverride(tenantId, dto);
  }

  @Get('date/:date')
  @Roles('master')
  @RequiresActiveSubscription()
  @ApiOperation({ summary: 'Get effective slots for a specific date with booking occupancy' })
  @ApiResponse({ status: 200, type: DayScheduleResponseDto })
  async getDateSchedule(
    @CurrentTenant() tenantId: string,
    @Param('date') date: string,
  ): Promise<DayScheduleResponseDto> {
    return this.scheduleService.getDateSchedule(tenantId, date);
  }

  @Put('date/:date')
  @Roles('master')
  @RequiresActiveSubscription()
  @ApiOperation({ summary: 'Create or replace slot override for a specific date' })
  @ApiResponse({ status: 200, type: DayScheduleResponseDto })
  async upsertDateSchedule(
    @CurrentTenant() tenantId: string,
    @Param('date') date: string,
    @Body() dto: CreateOverrideDto,
  ): Promise<DayScheduleResponseDto> {
    return this.scheduleService.upsertDateOverride(tenantId, date, dto);
  }

  @Delete('overrides/:id')
  @Roles('master')
  @RequiresActiveSubscription()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete schedule override' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Override not found' })
  async deleteOverride(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.scheduleService.deleteOverride(tenantId, id);
  }
}
