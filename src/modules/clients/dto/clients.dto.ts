// docs/api/endpoints.md — Clients CRM DTOs
// docs/database/schema.md — clients table

import { IsString, IsOptional, IsArray, MaxLength, Matches } from 'class-validator';

// ──────────────────────────────────────────────
// Query: GET /api/v1/clients
// ──────────────────────────────────────────────

export class ClientListQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // Search by name/phone

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string; // default 20, max 100
}

// ──────────────────────────────────────────────
// Request: PUT /api/v1/clients/:id
// ──────────────────────────────────────────────

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+380\d{9}$/, { message: 'Phone must be in format +380XXXXXXXXX' })
  phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ──────────────────────────────────────────────
// Request: POST /api/v1/clients/onboarding
// docs/api/endpoints.md — Client Onboarding
// ──────────────────────────────────────────────

export class ClientOnboardingDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+380\d{9}$/, { message: 'Phone must be in format +380XXXXXXXXX' })
  phone?: string;
}
