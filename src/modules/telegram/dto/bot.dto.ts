// docs/telegram/bot-architecture.md — Bot DTOs

import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Connect bot — master provides bot token from @BotFather
 */
export class ConnectBotDto {
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
 * Reconnect bot with new token
 */
export class ReconnectBotDto {
  @ApiProperty({
    description: 'New bot token from @BotFather',
    example: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(30)
  @MaxLength(100)
  botToken!: string;
}

/**
 * Bot response
 */
export class BotResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  botUsername!: string;

  @ApiProperty()
  botId!: number;

  @ApiProperty()
  isActive!: boolean;
}
