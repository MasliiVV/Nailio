// docs/telegram/bot-architecture.md — Webhook Routing
// docs/backlog.md #23 — Webhook routing POST /webhook/{botId}
// docs/backlog.md #24 — Webhook secret verification

import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { BotService } from './bot.service';
import { PrismaService } from '../../prisma/prisma.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string };
    data?: string;
  };
}

@ApiExcludeController()
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly botService: BotService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Receive webhook from Telegram
   * docs/telegram/bot-architecture.md — Webhook routing flow
   *
   * POST /webhook/:botId
   * Must respond < 1 sec to avoid Telegram retries
   */
  @Post(':botId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram webhook endpoint' })
  async handleWebhook(
    @Param('botId') botId: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: true }> {
    // Step 1: Verify webhook secret
    const isValid = await this.botService.verifyWebhookSecret(botId, secretToken);
    if (!isValid) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    // Step 2: Load bot info for tenant context
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      include: { tenant: true },
    });

    if (!bot || !bot.isActive) {
      return { ok: true }; // Silently ignore inactive bots
    }

    // Step 3: Process update asynchronously (respond quickly)
    // In production, this should be enqueued to BullMQ
    // For now, process inline (lightweight operations only)
    this.processUpdate(bot.id, bot.tenant.slug, update).catch((error) => {
      this.logger.error(
        `Webhook processing error: bot=${bot.botUsername}`,
        error,
      );
    });

    return { ok: true };
  }

  // ─── Private ───

  private async processUpdate(
    botDbId: string,
    tenantSlug: string,
    update: TelegramUpdate,
  ): Promise<void> {
    if (update.message?.text?.startsWith('/')) {
      await this.handleCommand(botDbId, tenantSlug, update);
    }
    // callback_query and other update types will be handled in future phases
  }

  /**
   * Handle bot commands
   * docs/telegram/bot-architecture.md — Команди бота
   */
  private async handleCommand(
    botDbId: string,
    tenantSlug: string,
    update: TelegramUpdate,
  ): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.chat) return;

    const command = message.text.split(' ')[0].toLowerCase();
    const chatId = message.chat.id;

    switch (command) {
      case '/start': {
        await this.botService.sendMessage(
          botDbId,
          chatId,
          `👋 Ласкаво просимо!\n\nНатисніть кнопку нижче, щоб записатися.`,
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: '📅 Записатися',
                    web_app: {
                      url: `${process.env.MINI_APP_URL || 'https://app.platform.com'}?startapp=${tenantSlug}`,
                    },
                  },
                ],
              ],
            },
          },
        );
        break;
      }

      case '/book': {
        await this.botService.sendMessage(
          botDbId,
          chatId,
          '📅 Натисніть кнопку нижче, щоб записатися:',
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: '📅 Записатися',
                    web_app: {
                      url: `${process.env.MINI_APP_URL || 'https://app.platform.com'}?startapp=${tenantSlug}`,
                    },
                  },
                ],
              ],
            },
          },
        );
        break;
      }

      case '/help': {
        await this.botService.sendMessage(
          botDbId,
          chatId,
          '📌 <b>Допомога</b>\n\n' +
            '/start — Відкрити додаток\n' +
            '/book — Записатися\n' +
            '/my_bookings — Мої записи\n' +
            '/help — Допомога\n\n' +
            'Натисніть кнопку "📅 Записатися" в меню для швидкого доступу.',
        );
        break;
      }

      case '/my_bookings': {
        // Will be implemented in Phase 2 with booking system
        await this.botService.sendMessage(
          botDbId,
          chatId,
          '📋 Для перегляду записів відкрийте додаток:',
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: '📅 Відкрити додаток',
                    web_app: {
                      url: `${process.env.MINI_APP_URL || 'https://app.platform.com'}?startapp=${tenantSlug}`,
                    },
                  },
                ],
              ],
            },
          },
        );
        break;
      }

      default:
        // Ignore unknown commands
        break;
    }
  }
}
