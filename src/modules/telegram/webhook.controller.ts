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
import { ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { BotService } from './bot.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BotCryptoService } from './bot-crypto.service';

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
    message?: { message_id: number; chat: { id: number } };
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
    private readonly configService: ConfigService,
    private readonly botCrypto: BotCryptoService,
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
    // ── Platform bot (Nailio_App) ──
    // Handles callback_query from master confirmation buttons
    if (botId === 'platform') {
      const expectedSecret = this.configService.get<string>('PLATFORM_WEBHOOK_SECRET');
      if (expectedSecret && secretToken !== expectedSecret) {
        throw new ForbiddenException('Invalid webhook secret');
      }

      // Platform bot only processes callback_query (confirm/reject bookings)
      if (update.callback_query) {
        this.handleCallbackQuery('platform', update).catch((error) => {
          this.logger.error('Platform bot callback error', error);
        });
      }
      return { ok: true };
    }

    // ── Tenant bots ──
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
    this.processUpdate(bot.id, bot.tenant.slug, update).catch((error) => {
      this.logger.error(`Webhook processing error: bot=${bot.botUsername}`, error);
    });

    return { ok: true };
  }

  // ─── Private ───

  private async processUpdate(
    botDbId: string,
    tenantSlug: string,
    update: TelegramUpdate,
  ): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(botDbId, update);
      return;
    }
    if (update.message?.text?.startsWith('/')) {
      await this.handleCommand(botDbId, tenantSlug, update);
    }
  }

  /**
   * Handle callback_query from inline keyboard buttons
   * Supports: confirm:{bookingId}, reject:{bookingId}
   */
  private async handleCallbackQuery(botDbId: string, update: TelegramUpdate): Promise<void> {
    const cbq = update.callback_query;
    if (!cbq?.data) return;

    const [action, bookingId] = cbq.data.split(':');
    if (!bookingId || (action !== 'confirm' && action !== 'reject')) return;

    // Determine the bot (could be platform bot or tenant bot)
    // The callback comes to the platform bot since new_booking goes via PLATFORM_BOT_TOKEN
    const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');

    try {
      // Load booking
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          client: { include: { user: true } },
          tenant: true,
        },
      });

      if (!booking) {
        await this.answerCallbackQuery(platformBotToken, cbq.id, '❌ Запис не знайдено');
        return;
      }

      if (booking.status !== 'pending') {
        const statusText =
          booking.status === 'confirmed' ? '✅ Вже підтверджено' : `Статус: ${booking.status}`;
        await this.answerCallbackQuery(platformBotToken, cbq.id, statusText);
        // Remove buttons from original message
        if (cbq.message) {
          await this.editMessageReplyMarkup(
            platformBotToken,
            cbq.message.chat.id,
            cbq.message.message_id,
          );
        }
        return;
      }

      // Format date/time for notification text
      const tz = booking.tenant.timezone || 'Europe/Kyiv';
      const dateFmt = new Intl.DateTimeFormat('uk-UA', {
        timeZone: tz,
        day: 'numeric',
        month: 'long',
      });
      const timeFmt = new Intl.DateTimeFormat('uk-UA', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const dateStr = dateFmt.format(booking.startTime);
      const timeStr = timeFmt.format(booking.startTime);

      if (action === 'confirm') {
        // Confirm booking
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'confirmed' },
        });

        await this.answerCallbackQuery(platformBotToken, cbq.id, '✅ Запис підтверджено!');

        // Edit original message — add confirmation status
        if (cbq.message) {
          await this.editMessageText(
            platformBotToken,
            cbq.message.chat.id,
            cbq.message.message_id,
            `✅ <b>Запис підтверджено</b>\n\n👤 ${booking.client.firstName} ${booking.client.lastName || ''}\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}`,
          );
        }

        // Notify client about confirmation via tenant bot
        await this.notifyClient(
          booking.tenantId,
          booking.client.user.telegramId,
          `✅ Ваш запис підтверджено!\n\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}\n⏱ ${booking.durationAtBooking} хв\n💰 ${(booking.priceAtBooking / 100).toFixed(0)} грн`,
        );

        this.logger.log(`Booking ${bookingId} confirmed via bot by master`);
      } else {
        // Reject booking (cancel)
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: 'Відхилено майстром',
          },
        });

        await this.answerCallbackQuery(platformBotToken, cbq.id, '❌ Запис відхилено');

        // Edit original message
        if (cbq.message) {
          await this.editMessageText(
            platformBotToken,
            cbq.message.chat.id,
            cbq.message.message_id,
            `❌ <b>Запис відхилено</b>\n\n👤 ${booking.client.firstName} ${booking.client.lastName || ''}\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}`,
          );
        }

        // Notify client about rejection via tenant bot
        await this.notifyClient(
          booking.tenantId,
          booking.client.user.telegramId,
          `❌ На жаль, майстер не може прийняти вас у цей час.\n\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}\n\nСпробуйте обрати інший час.`,
        );

        this.logger.log(`Booking ${bookingId} rejected via bot by master`);
      }
    } catch (error) {
      this.logger.error(`Callback query processing error: ${error}`);
      await this.answerCallbackQuery(platformBotToken, cbq.id, '⚠️ Помилка обробки').catch(
        () => {},
      );
    }
  }

  /**
   * Send notification to client via tenant's own bot
   */
  private async notifyClient(
    tenantId: string,
    clientTelegramId: bigint,
    text: string,
  ): Promise<void> {
    try {
      const bot = await this.prisma.bot.findFirst({
        where: { tenantId, isActive: true },
      });
      if (!bot) return;

      const botToken = await this.botCrypto.decrypt(bot.botTokenEncrypted);
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: clientTelegramId.toString(),
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to notify client ${clientTelegramId}: ${error}`);
    }
  }

  /**
   * Answer callback query (acknowledges the button click)
   */
  private async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text: string,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: true,
      }),
    });
  }

  /**
   * Edit message to remove inline keyboard (replace with updated text)
   */
  private async editMessageText(
    botToken: string,
    chatId: number,
    messageId: number,
    text: string,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
      }),
    });
  }

  /**
   * Remove inline keyboard from message
   */
  private async editMessageReplyMarkup(
    botToken: string,
    chatId: number,
    messageId: number,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
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
