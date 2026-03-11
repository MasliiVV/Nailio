// docs/backlog.md #40-#42 — Working hours CRUD + overrides + slot config
// docs/database/schema.md — working_hours, working_hour_overrides

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkingHour, WorkingHourOverride } from '@prisma/client';
import {
  UpdateWorkingHoursDto,
  CreateOverrideDto,
} from './dto/schedule.dto';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get full schedule (working hours + overrides)
   * docs/api/endpoints.md — GET /api/v1/schedule
   */
  async getSchedule(tenantId: string) {
    const [hours, overrides] = await Promise.all([
      this.prisma.tenantClient.workingHour.findMany({
        where: { tenantId },
        orderBy: { dayOfWeek: 'asc' },
      }),
      this.prisma.tenantClient.workingHourOverride.findMany({
        where: {
          tenantId,
          date: { gte: new Date() }, // Only future overrides
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      hours: hours.map((h: WorkingHour) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      overrides: overrides.map((o: WorkingHourOverride) => ({
        id: o.id,
        date: o.date.toISOString().split('T')[0],
        isDayOff: o.isDayOff,
        startTime: o.startTime || undefined,
        endTime: o.endTime || undefined,
      })),
    };
  }

  /**
   * Update weekly schedule (full replace)
   * docs/api/endpoints.md — PUT /api/v1/schedule/hours
   * Deletes all existing working_hours for tenant, replaces with new
   */
  async updateWorkingHours(tenantId: string, dto: UpdateWorkingHoursDto) {
    // Validate: endTime > startTime
    for (const entry of dto.hours) {
      if (entry.endTime <= entry.startTime) {
        throw new BadRequestException(
          `End time (${entry.endTime}) must be after start time (${entry.startTime}) for day ${entry.dayOfWeek}`,
        );
      }
    }

    // Validate: no duplicate days
    const days = dto.hours.map((h) => h.dayOfWeek);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException('Duplicate days of week');
    }

    // Transaction: delete old + create new
    await this.prisma.$transaction(async (tx) => {
      // Delete all existing working hours for this tenant
      await tx.workingHour.deleteMany({
        where: { tenantId },
      });

      // Create new entries
      if (dto.hours.length > 0) {
        await tx.workingHour.createMany({
          data: dto.hours.map((entry) => ({
            tenantId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
          })),
        });
      }
    });

    this.logger.log(
      `Working hours updated: ${dto.hours.length} days for tenant ${tenantId}`,
    );

    return this.getSchedule(tenantId);
  }

  /**
   * Create schedule override
   * docs/api/endpoints.md — POST /api/v1/schedule/overrides
   */
  async createOverride(tenantId: string, dto: CreateOverrideDto) {
    // Validate: if not day off, must have start/end time
    if (!dto.isDayOff && (!dto.startTime || !dto.endTime)) {
      throw new BadRequestException(
        'Start time and end time are required when isDayOff is false',
      );
    }

    // Validate: endTime > startTime (when not day off)
    if (!dto.isDayOff && dto.startTime && dto.endTime && dto.endTime <= dto.startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check if override already exists for this date
    const existing = await this.prisma.tenantClient.workingHourOverride.findFirst({
      where: { tenantId, date: new Date(dto.date) },
    });

    if (existing) {
      // Update existing override
      return this.prisma.tenantClient.workingHourOverride.update({
        where: { id: existing.id },
        data: {
          isDayOff: dto.isDayOff,
          startTime: dto.isDayOff ? null : dto.startTime,
          endTime: dto.isDayOff ? null : dto.endTime,
        },
      });
    }

    return this.prisma.tenantClient.workingHourOverride.create({
      data: {
        tenantId,
        date: new Date(dto.date),
        isDayOff: dto.isDayOff,
        startTime: dto.isDayOff ? null : dto.startTime,
        endTime: dto.isDayOff ? null : dto.endTime,
      },
    });
  }

  /**
   * Delete schedule override
   * docs/api/endpoints.md — DELETE /api/v1/schedule/overrides/:id
   */
  async deleteOverride(tenantId: string, overrideId: string) {
    const override = await this.prisma.tenantClient.workingHourOverride.findFirst({
      where: { id: overrideId, tenantId },
    });

    if (!override) {
      throw new NotFoundException('Schedule override not found');
    }

    await this.prisma.tenantClient.workingHourOverride.delete({
      where: { id: overrideId },
    });
  }

  /**
   * Get working hours for a specific date (considering overrides)
   * Used by booking slot generation (Phase 2)
   */
  async getWorkingHoursForDate(
    tenantId: string,
    date: Date,
  ): Promise<{ startTime: string; endTime: string } | null> {
    // Check override first (has priority)
    const override = await this.prisma.tenantClient.workingHourOverride.findFirst({
      where: { tenantId, date },
    });

    if (override) {
      if (override.isDayOff) return null; // Day off
      return {
        startTime: override.startTime!,
        endTime: override.endTime!,
      };
    }

    // Fall back to regular working hours
    const dayOfWeek = (date.getDay() + 6) % 7; // Convert JS Sunday=0 → Monday=0
    const workingHour = await this.prisma.tenantClient.workingHour.findFirst({
      where: { tenantId, dayOfWeek },
    });

    if (!workingHour) return null; // Day not in schedule = day off

    return {
      startTime: workingHour.startTime,
      endTime: workingHour.endTime,
    };
  }
}
