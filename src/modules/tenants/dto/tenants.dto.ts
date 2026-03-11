// docs/database/schema.md — tenants table
// docs/api/endpoints.md — Tenant Settings

import { IsString, IsOptional, IsEmail, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * docs/database/schema.md — branding JSONB structure
 */
export class BrandingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accentColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  welcomeText?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  contacts?: Record<string, string>;
}

/**
 * docs/database/schema.md — settings JSONB structure
 */
export class GeneralSettingsDto {
  @ApiPropertyOptional({ example: 'Europe/Kyiv' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  locale?: string;

  @ApiPropertyOptional({ example: 'Манікюр Олена' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: '+380501234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'master@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  slotStepMinutes?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  cancellationWindowHours?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  allowClientReschedule?: boolean;
}

export class UpdateBrandingDto extends BrandingDto {}

export class UpdateGeneralSettingsDto extends GeneralSettingsDto {}

/**
 * Tenant response DTO
 */
export class TenantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  locale!: string;

  @ApiPropertyOptional()
  logoUrl?: string;

  @ApiProperty()
  branding!: Record<string, unknown>;

  @ApiProperty()
  settings!: Record<string, unknown>;

  @ApiProperty()
  onboardingStatus!: string;

  @ApiProperty()
  onboardingChecklist!: Record<string, unknown>;

  @ApiPropertyOptional()
  trialEndsAt?: Date;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}
