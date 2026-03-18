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
import { NotificationsService } from '../notifications/notifications.service';
import { renderTemplate, TemplateVariables } from '../notifications/templates';
import { ConversationState, ConversationStateService } from './conversation-state.service';
import { TelegramApiService } from './telegram-api.service';
import { buildTelegramUserLink, formatBookingDateTime } from '../../common/utils/date-time.util';

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
    private readonly notificationsService: NotificationsService,
    private readonly conversationStateService: ConversationStateService,
    private readonly telegramApiService: TelegramApiService,
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

      if (update.message?.text?.startsWith('/')) {
        this.handlePlatformCommand(update).catch((error) => {
          this.logger.error('Platform bot command error', error);
        });
      }

      // Platform bot also handles text messages from masters (time suggestions)
      if (update.message?.text && !update.message.text.startsWith('/')) {
        this.handlePlatformTextMessage(update).catch((error) => {
          this.logger.error('Platform bot text message error', error);
        });
      }

      return { ok: true };
    }

    // ── Tenant bots ──
    // Step 1: Look up bot by tenantId (webhook URL is /webhook/{tenantId})
    const bot = await this.prisma.bot.findUnique({
      where: { tenantId: botId },
      include: { tenant: true },
    });

    if (!bot || !bot.isActive) {
      return { ok: true }; // Silently ignore unknown/inactive bots
    }

    // Step 2: Verify webhook secret
    if (bot.webhookSecret !== secretToken) {
      throw new ForbiddenException('Invalid webhook secret');
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
      await this.handleTenantCallbackQuery(botDbId, update);
      return;
    }
    if (update.message?.text) {
      // Check if client is in a conversation flow (awaiting message to master)
      const userId = update.message.from.id.toString();
      const state = this.conversationStateService.get(userId);
      if (state && state.action === 'awaiting_message' && Date.now() < state.expiresAt) {
        await this.handleClientMessageToMaster(botDbId, update);
        return;
      }

      if (update.message.text.startsWith('/')) {
        await this.handleCommand(botDbId, tenantSlug, update);
      }
    }
  }

  /**
   * Handle callback_query from inline keyboard buttons (platform bot)
   * Supports: confirm:{bookingId}, reject:{bookingId}, suggest:{bookingId}
   */
  private async handleCallbackQuery(botDbId: string, update: TelegramUpdate): Promise<void> {
    const cbq = update.callback_query;
    if (!cbq?.data) return;

    const [action, bookingId] = cbq.data.split(':');
    const allowedActions = ['confirm', 'reject', 'suggest', 'restore', 'reply'];
    if (!bookingId || !allowedActions.includes(action)) return;

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

      if (booking.status !== 'pending' && !['restore', 'reply'].includes(action)) {
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

        // Notify client about confirmation via tenant bot with "Write to Master" button
        const confirmText = renderTemplate('booking_confirmed', 'uk', {
          serviceName: booking.serviceNameSnapshot,
          date: dateStr,
          time: timeStr,
          duration: booking.durationAtBooking,
          price: booking.priceAtBooking,
        });
        await this.notifyClientWithKeyboard(
          booking.tenantId,
          booking.client.user.telegramId,
          confirmText,
          {
            inline_keyboard: [
              [
                {
                  text: '✍️ Написати майстру',
                  callback_data: `writem:${bookingId}`,
                },
              ],
            ],
          },
        );

        this.logger.log(`Booking ${bookingId} confirmed via bot by master`);
      } else if (action === 'suggest') {
        // Master wants to suggest another time
        await this.handleSuggestCallback(platformBotToken, cbq, booking);
      } else if (action === 'reject') {
        // Reject booking (cancel)
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: 'Відхилено майстром',
          },
        });

        // Cancel pending notification jobs (reminders etc.)
        await this.notificationsService.cancelBookingNotifications(
          booking.tenantId,
          bookingId,
          booking.clientId,
          'master',
        );

        await this.answerCallbackQuery(platformBotToken, cbq.id, '❌ Запис відхилено');

        // Edit original message with restore button
        if (cbq.message) {
          await this.editMessageTextWithKeyboard(
            platformBotToken,
            cbq.message.chat.id,
            cbq.message.message_id,
            `❌ <b>Запис скасовано</b>\n\n👤 ${booking.client.firstName} ${booking.client.lastName || ''}\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}`,
            {
              inline_keyboard: [
                [{ text: '♻️ Відновити запис', callback_data: `restore:${bookingId}` }],
              ],
            },
          );
        }

        this.logger.log(`Booking ${bookingId} rejected via bot by master`);
      } else if (action === 'restore') {
        await this.handleRestoreCallback(platformBotToken, cbq, bookingId);
      } else if (action === 'reply') {
        await this.handleReplyToClientCallback(platformBotToken, cbq, bookingId);
      }
    } catch (error) {
      this.logger.error(`Callback query processing error: ${error}`);
      await this.answerCallbackQuery(platformBotToken, cbq.id, '⚠️ Помилка обробки').catch(
        () => {},
      );
    }
  }

  // ──────────────────────────────────────────────
  // Suggest Another Time (platform bot → master flow)
  // ──────────────────────────────────────────────

  /**
   * Handle "suggest" callback: master wants to propose a different time.
   * Sets conversation state and asks master to type time(s).
   */
  private async handleSuggestCallback(
    platformBotToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    booking: {
      id: string;
      tenantId: string;
      status: string;
      startTime: Date;
      serviceNameSnapshot: string;
      tenant: { timezone: string | null };
      client: { firstName: string; lastName: string | null };
    },
  ): Promise<void> {
    const masterId = cbq.from.id.toString();
    const { timeStr } = this.formatBookingDateTime(booking);

    // Set conversation state — expect time input from master
    this.conversationStateService.set(masterId, {
      action: 'awaiting_time',
      bookingId: booking.id,
      tenantId: booking.tenantId,
      chatId: cbq.message?.chat.id || 0,
      messageId: cbq.message?.message_id,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    await this.answerCallbackQuery(platformBotToken, cbq.id, '🕐 Введіть час нижче');

    // Edit original message to remove buttons and show instructions
    if (cbq.message) {
      await this.editMessageText(
        platformBotToken,
        cbq.message.chat.id,
        cbq.message.message_id,
        `🕐 <b>Пропозиція іншого часу</b>\n\n` +
          `👤 ${booking.client.firstName} ${booking.client.lastName || ''}\n` +
          `📋 ${booking.serviceNameSnapshot}\n\n` +
          `Введіть один або кілька варіантів часу через кому:\n` +
          `<i>Наприклад: 14:30, 15:00, 16:30</i>`,
      );

      await this.sendPlatformMessageWithKeyboard(
        platformBotToken,
        cbq.message.chat.id,
        'Швидкий вибір часу нижче 👇\nАбо просто введіть свій варіант вручну.',
        this.buildPopularTimeReplyMarkup(timeStr),
      );
    }

    this.logger.log(`Master ${masterId} initiated time suggestion for booking ${booking.id}`);
  }

  /**
   * Handle text message from master on platform bot.
   * Processes time suggestions if master is in "awaiting_time" state.
   */
  private async handlePlatformTextMessage(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.from) return;

    const userId = message.from.id.toString();
    const state = this.conversationStateService.get(userId);

    if (!state || Date.now() >= state.expiresAt) {
      return; // Not in a conversation flow
    }

    if (state.action === 'awaiting_reply') {
      await this.handleMasterReplyToClient(update, state);
      return;
    }

    if (state.action !== 'awaiting_time') {
      return;
    }

    const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
    const text = message.text.trim();

    // Parse times: expect "HH:MM" or "HH:MM, HH:MM, ..."
    const timeRegex = /\d{1,2}:\d{2}/g;
    const times = text.match(timeRegex);

    if (!times || times.length === 0) {
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        '❌ Невірний формат. Введіть час у форматі ГГ:ХХ\nНаприклад: <b>14:30</b> або <b>14:30, 15:00, 16:30</b>',
      );
      return;
    }

    // Validate times (0-23 hours, 0-59 minutes)
    const validTimes = times.filter((t) => {
      const [h, m] = t.split(':').map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    });

    if (validTimes.length === 0) {
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        '❌ Невірний час. Перевірте формат (00:00 - 23:59)',
      );
      return;
    }

    // Remove conversation state
    this.conversationStateService.delete(userId);

    try {
      // Load booking with full details
      const booking = await this.prisma.booking.findUnique({
        where: { id: state.bookingId },
        include: {
          client: { include: { user: true } },
          tenant: true,
        },
      });

      if (!booking) {
        await this.sendPlatformMessage(platformBotToken, message.chat.id, '❌ Запис не знайдено');
        return;
      }

      // Format date for the time suggestions
      const tz = booking.tenant.timezone || 'Europe/Kyiv';
      const dateFmt = new Intl.DateTimeFormat('uk-UA', {
        timeZone: tz,
        day: 'numeric',
        month: 'long',
      });
      const dateStr = dateFmt.format(booking.startTime);

      // Build inline keyboard with time options for client
      const timeButtons = validTimes.map((time) => ({
        text: `🕐 ${time}`,
        callback_data: `accept:${booking.id}:${time}`,
      }));

      // Chunk into rows of 3
      const keyboard: { text: string; callback_data: string }[][] = [];
      for (let i = 0; i < timeButtons.length; i += 3) {
        keyboard.push(timeButtons.slice(i, i + 3));
      }
      // Add decline button
      keyboard.push([{ text: '❌ Відмовитись', callback_data: `decline:${booking.id}` }]);

      // Get template text
      const langCode = booking.client.user.languageCode;
      const templateVars: TemplateVariables = {
        serviceName: booking.serviceNameSnapshot,
        date: dateStr,
        time: validTimes.join(', '),
        duration: booking.durationAtBooking,
        price: booking.priceAtBooking,
      };
      const messageText = renderTemplate('time_suggestion', langCode, templateVars);

      // Send to client via tenant bot
      await this.notifyClientWithKeyboard(
        booking.tenantId,
        booking.client.user.telegramId,
        messageText,
        { inline_keyboard: keyboard },
      );

      // Confirm to master
      await this.sendPlatformMessageWithKeyboard(
        platformBotToken,
        message.chat.id,
        `✅ Клієнту ${booking.client.firstName} надіслано пропозицію часу: <b>${validTimes.join(', ')}</b>\n\nОчікуйте відповіді.`,
        { remove_keyboard: true },
      );

      this.logger.log(
        `Master suggested times [${validTimes.join(', ')}] for booking ${booking.id}`,
      );
    } catch (error) {
      this.logger.error(`Time suggestion processing error: ${error}`);
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        '⚠️ Помилка обробки. Спробуйте ще раз.',
      );
    }
  }

  // ──────────────────────────────────────────────
  // Tenant Bot Callbacks (ontime, late, writem, accept, decline)
  // ──────────────────────────────────────────────

  /**
   * Handle callback_query from tenant bot inline keyboards.
   * Supports: ontime, late, writem, accept, decline
   */
  private async handleTenantCallbackQuery(botDbId: string, update: TelegramUpdate): Promise<void> {
    const cbq = update.callback_query;
    if (!cbq?.data) return;

    const parts = cbq.data.split(':');
    const action = parts[0];
    const bookingId = parts[1];

    if (!bookingId) return;

    try {
      const botToken = await this.botService.getDecryptedToken(botDbId);

      switch (action) {
        case 'ontime':
          await this.handleOnTimeCallback(botToken, cbq, bookingId);
          break;
        case 'late':
          await this.handleLateCallback(botToken, cbq, bookingId);
          break;
        case 'writem':
          await this.handleWriteToMasterCallback(botToken, cbq, bookingId);
          break;
        case 'accept': {
          const suggestedTime = parts.slice(2).join(':'); // "12:45" from ["accept","id","12","45"]
          if (suggestedTime) {
            await this.handleAcceptTimeCallback(botToken, cbq, bookingId, suggestedTime);
          }
          break;
        }
        case 'decline':
          await this.handleDeclineTimeCallback(botToken, cbq, bookingId);
          break;
        default:
          // Unknown callback — ignore
          break;
      }
    } catch (error) {
      this.logger.error(`Tenant callback query error: ${error}`);
    }
  }

  /**
   * Client confirms "I'll be on time" — notify master
   */
  private async handleOnTimeCallback(
    botToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.loadBookingForCallback(bookingId);
    if (!booking) {
      await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис не знайдено');
      return;
    }

    await this.answerCallbackQuery(botToken, cbq.id, '✅ Дякуємо! Майстер повідомлений');

    // Edit message to show confirmation
    if (cbq.message) {
      await this.editMessageText(
        botToken,
        cbq.message.chat.id,
        cbq.message.message_id,
        `✅ Ви підтвердили, що прийдете вчасно\n\n📋 ${booking.serviceNameSnapshot}\n📅 Сьогодні`,
      );
    }

    // Notify master via platform bot
    const { dateStr, timeStr } = this.formatBookingDateTime(booking);
    const masterTelegramId = await this.getMasterTelegramId(booking.tenantId);
    if (masterTelegramId) {
      const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
      const text = renderTemplate('client_ontime', 'uk', {
        serviceName: booking.serviceNameSnapshot,
        date: dateStr,
        time: timeStr,
        duration: booking.durationAtBooking,
        price: booking.priceAtBooking,
        clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
        clientTelegramLink: this.buildTelegramLink(booking.client.user.telegramId),
      });
      await this.sendPlatformMessage(platformBotToken, Number(masterTelegramId), text);
    }

    this.logger.log(`Client confirmed on-time for booking ${bookingId}`);
  }

  /**
   * Client says "running a bit late" — notify master
   */
  private async handleLateCallback(
    botToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.loadBookingForCallback(bookingId);
    if (!booking) {
      await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис не знайдено');
      return;
    }

    await this.answerCallbackQuery(botToken, cbq.id, '⏰ Дякуємо! Майстер повідомлений');

    // Edit message to show status
    if (cbq.message) {
      await this.editMessageText(
        botToken,
        cbq.message.chat.id,
        cbq.message.message_id,
        `⏰ Ви повідомили, що трохи запізнитесь\n\n📋 ${booking.serviceNameSnapshot}\n📅 Сьогодні`,
      );
    }

    // Notify master via platform bot
    const { dateStr, timeStr } = this.formatBookingDateTime(booking);
    const masterTelegramId = await this.getMasterTelegramId(booking.tenantId);
    if (masterTelegramId) {
      const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
      const text = renderTemplate('client_late', 'uk', {
        serviceName: booking.serviceNameSnapshot,
        date: dateStr,
        time: timeStr,
        duration: booking.durationAtBooking,
        price: booking.priceAtBooking,
        clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
        clientTelegramLink: this.buildTelegramLink(booking.client.user.telegramId),
      });
      await this.sendPlatformMessage(platformBotToken, Number(masterTelegramId), text);
    }

    this.logger.log(`Client informed running late for booking ${bookingId}`);
  }

  /**
   * Client clicks "Write to Master" — set conversation state
   */
  private async handleWriteToMasterCallback(
    botToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.loadBookingForCallback(bookingId);
    if (!booking) {
      await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис не знайдено');
      return;
    }

    const userId = cbq.from.id.toString();

    // Set conversation state
    this.conversationStateService.set(userId, {
      action: 'awaiting_message',
      bookingId: booking.id,
      tenantId: booking.tenantId,
      chatId: cbq.message?.chat.id || 0,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await this.answerCallbackQuery(botToken, cbq.id, '✍️ Напишіть повідомлення');

    // Send instruction message
    await this.telegramApiService.sendMessage(
      botToken,
      cbq.message?.chat.id || cbq.from.id,
      `✍️ Напишіть повідомлення для майстра.\n\n📋 Запис: ${booking.serviceNameSnapshot}\n\n<i>Просто напишіть текст і він буде надісланий майстру.</i>`,
      {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'Ваше повідомлення майстру...',
      },
    );

    this.logger.log(`Client ${userId} initiated message to master for booking ${bookingId}`);
  }

  /**
   * Client accepts the suggested time — update booking, notify master
   */
  private async handleAcceptTimeCallback(
    botToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
    suggestedTime: string,
  ): Promise<void> {
    const booking = await this.loadBookingForCallback(bookingId);
    if (!booking) {
      await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис не знайдено');
      return;
    }

    try {
      // Calculate new start/end times based on the suggested time
      // Use the same date as the original booking, but with the new time
      const tz = booking.tenant?.timezone || 'Europe/Kyiv';

      // Get the local date string from the original booking (YYYY-MM-DD)
      const originalDateStr = booking.startTime.toLocaleDateString('en-CA', { timeZone: tz });

      const [hours, minutes] = suggestedTime.split(':').map(Number);
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');

      // Build an ISO string with explicit timezone offset
      // Create a formatter that gives us the UTC offset for this timezone
      const offsetParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).formatToParts(booking.startTime);
      const gmtPart = offsetParts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+2';
      // Parse "GMT+2" or "GMT+2:30" or "GMT-5" into offset string like "+02:00"
      const offsetMatch = gmtPart.match(/GMT([+-]?)(\d{1,2}):?(\d{2})?/);
      let tzOffset = '+00:00';
      if (offsetMatch) {
        const sign = offsetMatch[1] || '+';
        const oh = String(offsetMatch[2]).padStart(2, '0');
        const om = String(offsetMatch[3] || '0').padStart(2, '0');
        tzOffset = `${sign}${oh}:${om}`;
      }

      // Build ISO 8601 string: "2026-03-14T14:30:00+02:00"
      const isoStr = `${originalDateStr}T${hh}:${mm}:00${tzOffset}`;
      const newStartTimeUtc = new Date(isoStr);
      const newEndTimeUtc = new Date(
        newStartTimeUtc.getTime() + booking.durationAtBooking * 60 * 1000,
      );

      // Validate the dates are valid
      if (isNaN(newStartTimeUtc.getTime()) || isNaN(newEndTimeUtc.getTime())) {
        this.logger.error(`Invalid date calculation: isoStr=${isoStr}, tz=${tz}`);
        await this.answerCallbackQuery(botToken, cbq.id, '⚠️ Помилка з часом. Спробуйте ще.');
        return;
      }

      // Update booking with new time and confirm it
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          startTime: newStartTimeUtc,
          endTime: newEndTimeUtc,
          status: 'confirmed',
        },
      });

      // Cancel old pending notifications (reminders etc.)
      const pendingNotifs = await this.prisma.notification.findMany({
        where: { bookingId, status: 'pending' },
      });
      for (const notif of pendingNotifs) {
        await this.prisma.notification.update({
          where: { id: notif.id },
          data: { status: 'cancelled' },
        });
      }

      // Schedule new reminders for the updated time (non-blocking)
      this.notificationsService
        .scheduleBookingNotifications(
          booking.tenantId,
          bookingId,
          booking.clientId,
          newStartTimeUtc,
          'master',
        )
        .catch((err) => {
          this.logger.error(
            `Failed to schedule reminders for rescheduled booking ${bookingId}: ${err}`,
          );
        });

      await this.answerCallbackQuery(botToken, cbq.id, '✅ Час підтверджено!');

      // Edit client message
      if (cbq.message) {
        await this.editMessageText(
          botToken,
          cbq.message.chat.id,
          cbq.message.message_id,
          `✅ <b>Ви обрали новий час: ${suggestedTime}</b>\n\n📋 ${booking.serviceNameSnapshot}\n📅 Запис підтверджено!`,
        );
      }

      // Notify master
      const { dateStr } = this.formatBookingDateTime(booking);
      const masterTelegramId = await this.getMasterTelegramId(booking.tenantId);
      if (masterTelegramId) {
        const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
        const text = renderTemplate('time_accepted', 'uk', {
          serviceName: booking.serviceNameSnapshot,
          date: dateStr,
          time: suggestedTime,
          duration: booking.durationAtBooking,
          price: booking.priceAtBooking,
          clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
          clientTelegramLink: this.buildTelegramLink(booking.client.user.telegramId),
        });
        await this.sendPlatformMessage(platformBotToken, Number(masterTelegramId), text);
      }

      this.logger.log(`Client accepted suggested time ${suggestedTime} for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Accept time error: ${error}`);
      await this.answerCallbackQuery(botToken, cbq.id, '⚠️ Помилка обробки');
    }
  }

  /**
   * Client declines the suggested time(s)
   */
  private async handleDeclineTimeCallback(
    botToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.loadBookingForCallback(bookingId);
    if (!booking) {
      await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис не знайдено');
      return;
    }

    // Cancel the booking
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Клієнт відхилив запропонований час',
      },
    });

    await this.answerCallbackQuery(botToken, cbq.id, '❌ Запис скасовано');

    if (cbq.message) {
      await this.editMessageText(
        botToken,
        cbq.message.chat.id,
        cbq.message.message_id,
        `❌ Ви відхилили запропонований час.\n\n📋 ${booking.serviceNameSnapshot}\n\nЩоб записатися знову, натисніть кнопку "📅 Записатися" в меню.`,
      );
    }

    // Notify master
    const masterTelegramId = await this.getMasterTelegramId(booking.tenantId);
    if (masterTelegramId) {
      const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
      const text = renderTemplate('time_declined', 'uk', {
        serviceName: booking.serviceNameSnapshot,
        date: '',
        time: '',
        duration: booking.durationAtBooking,
        price: booking.priceAtBooking,
        clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
        clientTelegramLink: this.buildTelegramLink(booking.client.user.telegramId),
      });
      await this.sendPlatformMessage(platformBotToken, Number(masterTelegramId), text);
    }

    this.logger.log(`Client declined suggested time for booking ${bookingId}`);
  }

  // ──────────────────────────────────────────────
  // Restore Cancelled Booking (platform bot → master)
  // ──────────────────────────────────────────────

  /**
   * Handle "restore" callback: master wants to restore a cancelled booking.
   * Sets booking back to "confirmed" and re-schedules notifications.
   */
  private async handleRestoreCallback(
    platformBotToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
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

    if (booking.status !== 'cancelled') {
      await this.answerCallbackQuery(
        platformBotToken,
        cbq.id,
        `Запис вже у статусі: ${booking.status}`,
      );
      return;
    }

    // Check if the time slot is still in the future
    if (booking.startTime.getTime() < Date.now()) {
      await this.answerCallbackQuery(platformBotToken, cbq.id, '⚠️ Час запису вже минув');
      return;
    }

    // Restore booking to confirmed
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'confirmed',
        cancelledAt: null,
        cancelReason: null,
      },
    });

    // Re-schedule notifications (reminders)
    await this.notificationsService.scheduleBookingNotifications(
      booking.tenantId,
      bookingId,
      booking.clientId,
      booking.startTime,
      'master',
    );

    await this.answerCallbackQuery(platformBotToken, cbq.id, '✅ Запис відновлено!');

    // Format date/time
    const tz = booking.tenant?.timezone || 'Europe/Kyiv';
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

    // Edit master's message to show restored status
    if (cbq.message) {
      await this.editMessageText(
        platformBotToken,
        cbq.message.chat.id,
        cbq.message.message_id,
        `✅ <b>Запис відновлено</b>\n\n👤 ${booking.client.firstName} ${booking.client.lastName || ''}\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}`,
      );
    }

    // Notify client that booking is restored
    const restoreText = `✅ <b>Ваш запис відновлено!</b>\n\n📋 ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}\n⏱ ${booking.durationAtBooking} хв\n💰 ${(booking.priceAtBooking / 100).toFixed(0)} грн\n\nДо зустрічі! 💅`;
    await this.notifyClientWithKeyboard(
      booking.tenantId,
      booking.client.user.telegramId,
      restoreText,
      {
        inline_keyboard: [
          [
            {
              text: '✍️ Написати майстру',
              callback_data: `writem:${bookingId}`,
            },
          ],
        ],
      },
    );

    this.logger.log(`Booking ${bookingId} restored by master`);
  }

  // ──────────────────────────────────────────────
  // Master → Client reply
  // ──────────────────────────────────────────────

  /**
   * Handle "reply" callback: master wants to reply to a client message.
   * Sets conversation state to "awaiting_reply" and prompts master to type.
   */
  private async handleReplyToClientCallback(
    platformBotToken: string,
    cbq: NonNullable<TelegramUpdate['callback_query']>,
    bookingId: string,
  ): Promise<void> {
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

    const userId = cbq.from.id.toString();

    // Set conversation state
    this.conversationStateService.set(userId, {
      action: 'awaiting_reply',
      bookingId,
      tenantId: booking.tenantId,
      chatId: cbq.message?.chat.id || 0,
      clientTelegramId: booking.client.user.telegramId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await this.answerCallbackQuery(platformBotToken, cbq.id, '✍️ Напишіть відповідь');

    await this.sendPlatformMessage(
      platformBotToken,
      cbq.message?.chat.id || cbq.from.id,
      `✍️ Напишіть відповідь для <b>${booking.client.firstName} ${booking.client.lastName || ''}</b>:`,
    );
  }

  /**
   * Handle master's reply text — forward to client via tenant bot.
   */
  private async handleMasterReplyToClient(
    update: TelegramUpdate,
    state: ConversationState,
  ): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.from) return;

    const userId = message.from.id.toString();

    // Remove conversation state
    this.conversationStateService.delete(userId);

    const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');

    try {
      const booking = await this.loadBookingForCallback(state.bookingId);
      if (!booking) {
        await this.sendPlatformMessage(platformBotToken, message.chat.id, '❌ Запис не знайдено');
        return;
      }

      // Confirm to master
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        '✅ Відповідь надіслано клієнту!',
      );

      // Format date/time for context
      const { dateStr, timeStr } = this.formatBookingDateTime(booking);

      // Send to client via tenant bot
      const replyText = `💬 <b>Відповідь від майстра</b>\n\n📋 Запис: ${booking.serviceNameSnapshot}\n📅 ${dateStr} о ${timeStr}\n\n📝 ${message.text}`;

      if (state.clientTelegramId) {
        await this.notifyClientWithKeyboard(booking.tenantId, state.clientTelegramId, replyText, {
          inline_keyboard: [
            [{ text: '✍️ Написати майстру', callback_data: `writem:${state.bookingId}` }],
          ],
        });
      }

      this.logger.log(`Master replied to client for booking ${state.bookingId}`);
    } catch (error) {
      this.logger.error(`Master reply error: ${error}`);
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        '⚠️ Помилка надсилання. Спробуйте ще.',
      );
    }
  }

  // ──────────────────────────────────────────────
  // Client → Master messaging
  // ──────────────────────────────────────────────

  /**
   * Handle text message from client meant for master.
   * Client is in "awaiting_message" conversation state.
   */
  private async handleClientMessageToMaster(
    botDbId: string,
    update: TelegramUpdate,
  ): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.from) return;

    const userId = message.from.id.toString();
    const state = this.conversationStateService.get(userId);

    if (!state || state.action !== 'awaiting_message') return;

    // Remove conversation state
    this.conversationStateService.delete(userId);

    try {
      const botToken = await this.botService.getDecryptedToken(botDbId);

      const booking = await this.loadBookingForCallback(state.bookingId);
      if (!booking) {
        await this.telegramApiService.sendMessage(
          botToken,
          message.chat.id,
          '❌ Запис не знайдено',
        );
        return;
      }

      // Confirm to client
      await this.telegramApiService.sendMessage(
        botToken,
        message.chat.id,
        '✅ Ваше повідомлення надіслано майстру!',
      );

      // Forward to master via platform bot
      const { dateStr, timeStr } = this.formatBookingDateTime(booking);
      const masterTelegramId = await this.getMasterTelegramId(booking.tenantId);
      if (masterTelegramId) {
        const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
        const text = renderTemplate('client_message', 'uk', {
          serviceName: booking.serviceNameSnapshot,
          date: dateStr,
          time: timeStr,
          duration: booking.durationAtBooking,
          price: booking.priceAtBooking,
          clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
          clientPhone: booking.client.phone || undefined,
          clientTelegramLink: this.buildTelegramLink(booking.client.user.telegramId),
          reason: message.text,
        });
        await this.sendPlatformMessageWithKeyboard(
          platformBotToken,
          Number(masterTelegramId),
          text,
          {
            inline_keyboard: [
              [{ text: '💬 Відповісти клієнту', callback_data: `reply:${state.bookingId}` }],
            ],
          },
        );
      }

      this.logger.log(`Client message forwarded to master for booking ${state.bookingId}`);
    } catch (error) {
      this.logger.error(`Client message forwarding error: ${error}`);
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
      await this.telegramApiService.sendMessage(botToken, clientTelegramId, text);
    } catch (error) {
      this.logger.error(`Failed to notify client ${clientTelegramId}: ${error}`);
    }
  }

  /**
   * Send notification to client via tenant's bot WITH inline keyboard
   */
  private async notifyClientWithKeyboard(
    tenantId: string,
    clientTelegramId: bigint,
    text: string,
    replyMarkup: Record<string, unknown>,
  ): Promise<void> {
    try {
      const bot = await this.prisma.bot.findFirst({
        where: { tenantId, isActive: true },
      });
      if (!bot) return;

      const botToken = await this.botCrypto.decrypt(bot.botTokenEncrypted);
      await this.telegramApiService.sendMessage(botToken, clientTelegramId, text, replyMarkup);
    } catch (error) {
      this.logger.error(`Failed to notify client with keyboard ${clientTelegramId}: ${error}`);
    }
  }

  /**
   * Send a message via the platform bot
   */
  private async sendPlatformMessage(
    botToken: string,
    chatId: number | bigint,
    text: string,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: 'HTML',
      }),
    });
  }

  /**
   * Send a message via the platform bot WITH inline keyboard
   */
  private async sendPlatformMessageWithKeyboard(
    botToken: string,
    chatId: number | bigint,
    text: string,
    replyMarkup: Record<string, unknown>,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
  }

  private buildPopularTimeReplyMarkup(referenceTime: string): Record<string, unknown> {
    const [hours, minutes] = referenceTime.split(':').map(Number);
    const baseMinutes =
      (Number.isFinite(hours) ? hours : 12) * 60 + (Number.isFinite(minutes) ? minutes : 0);
    const offsets = [-60, -30, 0, 30, 60, 90];
    const suggestions = [
      ...new Set(
        offsets
          .map((offset) => baseMinutes + offset)
          .filter((total) => total >= 8 * 60 && total <= 21 * 60 + 30)
          .map((total) => {
            const nextHours = Math.floor(total / 60);
            const nextMinutes = total % 60;
            return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
          }),
      ),
    ];

    const keyboard: Array<Array<{ text: string }>> = [];
    for (let index = 0; index < suggestions.length; index += 3) {
      keyboard.push(suggestions.slice(index, index + 3).map((time) => ({ text: time })));
    }

    return {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Наприклад: 14:30, 15:00',
    };
  }

  /**
   * Load booking with client + user + tenant for callback processing
   */
  private async loadBookingForCallback(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { include: { user: true } },
        tenant: true,
      },
    });
  }

  /**
   * Format booking date/time in tenant timezone
   */
  private formatBookingDateTime(booking: {
    startTime: Date;
    tenant?: { timezone: string | null } | null;
  }): { dateStr: string; timeStr: string } {
    const tz = booking.tenant?.timezone || 'Europe/Kyiv';
    const formatted = formatBookingDateTime(booking.startTime, tz);
    return {
      dateStr: formatted.date,
      timeStr: formatted.time,
    };
  }

  /**
   * Get master's Telegram ID for a given tenant
   */
  private async getMasterTelegramId(tenantId: string): Promise<bigint | null> {
    const master = await this.prisma.master.findFirst({
      where: { tenantId },
      include: { user: true },
    });
    return master?.user?.telegramId || null;
  }

  /**
   * Build a clickable Telegram link for a user.
   * Uses tg://user?id=... which opens a DM with the user in TG.
   */
  private buildTelegramLink(telegramId: bigint): string {
    return buildTelegramUserLink(telegramId);
  }

  /**
   * Answer callback query (acknowledges the button click)
   */
  private async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text: string,
  ): Promise<void> {
    await this.telegramApiService.answerCallbackQuery(botToken, callbackQueryId, text);
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
    await this.telegramApiService.editMessageText(botToken, chatId, messageId, text);
  }

  /**
   * Edit message text WITH inline keyboard
   */
  private async editMessageTextWithKeyboard(
    botToken: string,
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup: Record<string, unknown>,
  ): Promise<void> {
    await this.telegramApiService.editMessageText(botToken, chatId, messageId, text, replyMarkup);
  }

  /**
   * Remove inline keyboard from message
   */
  private async editMessageReplyMarkup(
    botToken: string,
    chatId: number,
    messageId: number,
  ): Promise<void> {
    await this.telegramApiService.editMessageReplyMarkup(botToken, chatId, messageId);
  }

  /**
   * Handle platform bot commands for master onboarding.
   */
  private async handlePlatformCommand(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    const command = message.text.split(' ')[0].toLowerCase();
    const platformBotToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
    const miniAppUrl = this.configService.get<string>('MINI_APP_URL', 'https://app.platform.com');

    switch (command) {
      case '/start':
        await this.sendPlatformMessageWithKeyboard(
          platformBotToken,
          message.chat.id,
          '👋 Вітаю!\n\nВідкрийте міні-додаток, щоб зареєструватися як майстер, налаштувати бота та керувати записами.',
          {
            inline_keyboard: [
              [
                {
                  text: '🚀 Відкрити кабінет майстра',
                  web_app: {
                    url: miniAppUrl,
                  },
                },
              ],
            ],
          },
        );
        break;

      case '/help':
        await this.sendPlatformMessage(
          platformBotToken,
          message.chat.id,
          '📌 <b>Платформний бот Nailio</b>\n\n/start — відкрити кабінет майстра\n/help — показати підказку\n\nЯкщо ви новий майстер, натисніть кнопку з міні-додатком і пройдіть онбординг.',
        );
        break;

      default:
        await this.sendPlatformMessage(
          platformBotToken,
          message.chat.id,
          'Використайте /start, щоб відкрити кабінет майстра.',
        );
        break;
    }
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
