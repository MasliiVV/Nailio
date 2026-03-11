// docs/guides/master-onboarding.md — Onboarding DTOs

import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Validate bot token (Step 3)
 * docs/guides/master-onboarding.md — POST /onboarding/validate-token
 */
export class ValidateTokenDto {
  @ApiProperty({
    description: 'Bot token from @BotFather',
    example: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(30)
  @MaxLength(100)
  botToken!: string;
}

/**
 * Onboarding status response
 */
export class OnboardingStatusDto {
  @ApiProperty({ enum: ['pending_bot', 'bot_connected', 'setup_complete'] })
  status!: string;

  @ApiProperty()
  checklist!: {
    hasBot: boolean;
    hasServices: boolean;
    hasSchedule: boolean;
    hasBranding: boolean;
    hasSharedLink: boolean;
  };

  @ApiProperty()
  botUsername?: string;

  @ApiProperty()
  shareLink?: string;
}
