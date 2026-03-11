// docs/backlog.md #22 — Bot CRUD controller
// docs/guides/master-onboarding.md — Bot connection flow

import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BotService } from './bot.service';
import { ConnectBotDto, ReconnectBotDto, BotResponseDto } from './dto/bot.dto';
import { Roles, RequiresActiveSubscription, CurrentTenant } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Bot')
@Controller('bot')
@ApiBearerAuth()
export class BotController {
  constructor(private readonly botService: BotService) {}

  /**
   * Connect bot (during onboarding)
   * docs/guides/master-onboarding.md — Step 3: Connect Bot
   */
  @Post('connect')
  @Roles('master')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Connect Telegram bot to tenant' })
  @ApiResponse({ status: 201, type: BotResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid bot token or already connected' })
  async connectBot(@CurrentTenant() tenantId: string, @Body() dto: ConnectBotDto) {
    return this.botService.connectBot(tenantId, dto);
  }

  /**
   * Get current bot info
   */
  @Get()
  @Roles('master')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get connected bot info' })
  @ApiResponse({ status: 200, type: BotResponseDto })
  async getBotInfo(@CurrentTenant() tenantId: string) {
    const bot = await this.botService.findByTenantId(tenantId);
    if (!bot) {
      return null;
    }
    return {
      id: bot.id,
      botUsername: bot.botUsername,
      botId: Number(bot.botId),
      isActive: bot.isActive,
    };
  }

  /**
   * Reconnect bot with new token
   * docs/telegram/bot-architecture.md — Перепідключення
   */
  @Post('reconnect')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconnect bot with new token' })
  @ApiResponse({ status: 200, type: BotResponseDto })
  async reconnectBot(@CurrentTenant() tenantId: string, @Body() dto: ReconnectBotDto) {
    return this.botService.reconnectBot(tenantId, dto.botToken);
  }
}
