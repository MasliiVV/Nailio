// docs/api/endpoints.md — Profile DTOs
// GET /api/v1/profile, PUT /api/v1/profile

import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+380\d{9}$/, { message: 'Phone must be in format +380XXXXXXXXX' })
  phone?: string;
}
