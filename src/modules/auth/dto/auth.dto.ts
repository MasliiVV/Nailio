// docs/api/authentication.md — Auth DTOs

import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TelegramAuthDto {
  @ApiProperty({ description: 'Raw Telegram initData string' })
  @IsString()
  @IsNotEmpty()
  initData!: string;

  @ApiPropertyOptional({ description: 'Bot ID for role resolution (null = platform bot)' })
  @IsString()
  @IsOptional()
  botId?: string;

  @ApiPropertyOptional({ description: 'start_param from Mini App URL for tenant resolution' })
  @IsString()
  @IsOptional()
  startParam?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  needsOnboarding!: boolean;

  @ApiProperty()
  profile!: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    telegramId?: string | null;
  };

  @ApiProperty({ nullable: true })
  tenant!: {
    id: string;
    displayName: string;
    slug: string;
    logoUrl: string | null;
    branding: {
      primaryColor?: string;
      secondaryColor?: string;
      welcomeMessage?: string;
    } | null;
    botUsername?: string | null;
  } | null;

  @ApiProperty()
  user!: {
    id: string;
    telegramId: number;
    role: string;
    tenantId: string | null;
    firstName?: string;
    lastName?: string;
  };
}
