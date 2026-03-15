// docs/api/endpoints.md — Bookings DTOs
// docs/database/schema.md — bookings table
// docs/backlog.md #44-#50 — Booking system DTOs

import { IsString, IsUUID, IsOptional, IsDateString, MaxLength, IsEnum } from 'class-validator';
import { BookingStatus } from '@prisma/client';

// ──────────────────────────────────────────────
// Query: GET /api/v1/bookings/slots
// ──────────────────────────────────────────────

export class SlotsQueryDto {
  @IsDateString()
  date!: string; // "2026-03-15"

  @IsUUID()
  serviceId!: string;
}

// ──────────────────────────────────────────────
// Response: Slot item
// ──────────────────────────────────────────────

export class SlotDto {
  startTime!: string; // "09:00"
  endTime!: string; // "10:00"
  available!: boolean;
}

export class SlotsResponseDto {
  date!: string;
  timezone!: string;
  slots!: SlotDto[];
}

// ──────────────────────────────────────────────
// Request: POST /api/v1/bookings
// ──────────────────────────────────────────────

export class CreateBookingDto {
  @IsUUID()
  serviceId!: string;

  @IsDateString()
  startTime!: string; // ISO 8601 "2026-03-15T09:00:00+02:00"

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  // Only when master creates booking for a client
  @IsUUID()
  @IsOptional()
  clientId?: string;
}

// ──────────────────────────────────────────────
// Request: POST /api/v1/bookings/:id/cancel
// ──────────────────────────────────────────────

export class CancelBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

// ──────────────────────────────────────────────
// Request: POST /api/v1/bookings/:id/reschedule
// ──────────────────────────────────────────────

export class RescheduleBookingDto {
  @IsDateString()
  startTime!: string; // new ISO 8601 start time

  @IsUUID()
  @IsOptional()
  clientId?: string; // optionally reassign to another client
}

// ──────────────────────────────────────────────
// Query: GET /api/v1/bookings
// ──────────────────────────────────────────────

export class BookingListQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string; // Will parse to number in service
}

// ──────────────────────────────────────────────
// Request: PATCH /api/v1/bookings/:id
// ──────────────────────────────────────────────

export class UpdateBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

// ──────────────────────────────────────────────
// Request: POST /api/v1/bookings/message
// ──────────────────────────────────────────────

export class SendMessageToMasterDto {
  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsUUID()
  @IsOptional()
  bookingId?: string;
}

// ──────────────────────────────────────────────
// Response: Booking item
// ──────────────────────────────────────────────

export class BookingResponseDto {
  id!: string;
  serviceNameSnapshot!: string;
  priceAtBooking!: number;
  durationAtBooking!: number;
  startTime!: string;
  endTime!: string;
  status!: string;
  notes?: string;
  createdBy!: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt!: string;
  client?: {
    id: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  };
}
