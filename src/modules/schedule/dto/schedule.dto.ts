// docs/api/endpoints.md — Schedule endpoints
// docs/database/schema.md — working_hours, working_hour_overrides tables

import {
  IsInt,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
  Matches,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Single working hour entry
 */
export class WorkingHourEntryDto {
  @ApiProperty({ example: 0, description: '0=Monday, 6=Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00', description: 'Start time HH:MM' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime!: string;

  @ApiProperty({ example: '18:00', description: 'End time HH:MM' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime!: string;
}

/**
 * Update weekly schedule (full replace)
 * docs/api/endpoints.md — PUT /api/v1/schedule/hours
 */
export class UpdateWorkingHoursDto {
  @ApiPropertyOptional({ type: [WorkingHourEntryDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourEntryDto)
  hours!: WorkingHourEntryDto[];

  @ApiPropertyOptional({ example: 0, description: 'Single day update: 0=Monday, 6=Sunday' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Single day update: whether the day is working',
  })
  @IsOptional()
  @IsBoolean()
  isWorking?: boolean;

  @ApiPropertyOptional({ example: '09:00', description: 'Single day update: start time HH:MM' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime?: string;

  @ApiPropertyOptional({ example: '18:00', description: 'Single day update: end time HH:MM' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime?: string;
}

/**
 * Create schedule override
 * docs/api/endpoints.md — POST /api/v1/schedule/overrides
 */
export class CreateOverrideDto {
  @ApiProperty({ example: '2026-03-20' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: true, description: 'Is this a day off?' })
  @IsBoolean()
  isDayOff!: boolean;

  @ApiPropertyOptional({ example: '10:00', description: 'Custom start time (if not day off)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime?: string;

  @ApiPropertyOptional({ example: '15:00', description: 'Custom end time (if not day off)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime?: string;
}

/**
 * Schedule response (working hours + overrides)
 */
export class ScheduleResponseDto {
  @ApiProperty({ type: [WorkingHourEntryDto] })
  hours!: WorkingHourEntryDto[];

  @ApiProperty()
  overrides!: OverrideResponseDto[];
}

export class OverrideResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty()
  isDayOff!: boolean;

  @ApiPropertyOptional()
  startTime?: string;

  @ApiPropertyOptional()
  endTime?: string;
}
