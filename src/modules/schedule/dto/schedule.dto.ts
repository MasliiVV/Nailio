// docs/api/endpoints.md — Schedule endpoints
// Slot-based schedule model stored in tenant settings

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
  IsUUID,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimeSlotEntryDto {
  @ApiProperty({ example: '09:00', description: 'Slot time HH:MM' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'time must be in HH:MM format',
  })
  time!: string;
}

export class ScheduleDaySlotsDto {
  @ApiProperty({ example: 0, description: '0=Monday, 6=Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isDayOff!: boolean;

  @ApiProperty({ type: [String], example: ['09:00', '11:15', '13:30'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    each: true,
    message: 'Each slot must be in HH:MM format',
  })
  slots!: string[];
}

export class UpdateWorkingHoursDto {
  @ApiPropertyOptional({ type: [ScheduleDaySlotsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDaySlotsDto)
  days!: ScheduleDaySlotsDto[];
}

export class BookingSlotReassignmentDto {
  @ApiProperty({ example: 'booking-uuid' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({ example: '10:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'newTime must be in HH:MM format',
  })
  newTime!: string;
}

export class CreateOverrideDto {
  @ApiProperty({ example: '2026-03-20' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: false, description: 'Is this a full day off?' })
  @IsBoolean()
  isDayOff!: boolean;

  @ApiProperty({ type: [String], example: ['10:00', '12:00', '16:30'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    each: true,
    message: 'Each slot must be in HH:MM format',
  })
  slots!: string[];

  @ApiPropertyOptional({ type: [BookingSlotReassignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingSlotReassignmentDto)
  reassignments?: BookingSlotReassignmentDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  cancelBookingIds?: string[];
}

export class ScheduleResponseDto {
  @ApiProperty({ type: [ScheduleDaySlotsDto] })
  weekly!: ScheduleDaySlotsDto[];

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

  @ApiProperty({ type: [String] })
  slots!: string[];
}

export class DayScheduleBookingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clientName!: string;

  @ApiProperty()
  serviceName!: string;

  @ApiProperty()
  status!: string;
}

export class DayScheduleSlotDto {
  @ApiProperty()
  time!: string;

  @ApiProperty()
  isBooked!: boolean;

  @ApiProperty()
  locked!: boolean;

  @ApiPropertyOptional({ type: DayScheduleBookingDto })
  booking?: DayScheduleBookingDto;
}

export class DayScheduleResponseDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  isDayOff!: boolean;

  @ApiProperty({ example: 'template' })
  source!: 'template' | 'override';

  @ApiProperty({ type: [DayScheduleSlotDto] })
  slots!: DayScheduleSlotDto[];
}
