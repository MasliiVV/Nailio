// docs/api/endpoints.md — Services endpoints
// docs/database/schema.md — services table

import { IsString, IsInt, IsOptional, Min, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

/**
 * Create service
 * docs/api/endpoints.md — POST /api/v1/services
 */
export class CreateServiceDto {
  @ApiProperty({ example: 'Класичний манікюр' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Манікюр з покриттям гель-лаком' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 60, description: 'Duration in minutes' })
  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @ApiProperty({ example: 80000, description: 'Price in smallest units (kopiyky)' })
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'UAH' })
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiPropertyOptional({ example: 15, description: 'Buffer time after service (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMinutes?: number;

  @ApiPropertyOptional({ example: 'Манікюр' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: '#E91E63' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (#RRGGBB)' })
  color?: string;
}

/**
 * Update service (all fields optional)
 */
export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * Service response
 */
export class ServiceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  currency!: string;

  @ApiPropertyOptional()
  bufferMinutes?: number;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  color?: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}
