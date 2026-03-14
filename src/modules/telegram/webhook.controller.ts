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

/**
 * State entry for tracking conversation flows (time suggestion, message to master).
 * Stored in-memory — suitable for single-instance deployment.
 */
interface ConversationState {
  action: 'awaiting_time' | 'awaiting_message';
  bookingId: string;
  tenantId: string;
  chatId: number;
  messageId?: number;
  expiresAt: number; // timestamp — auto-cleanup after 10 min
}

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

  /**
   * In-memory conversation state for multi-step flows:
   * - Master suggests another time (awaiting_time)
   * - Client writes message to master (awaiting_message)
   * Key: telegramUserId as string
   */
  private readonly conversationState = new Map<string, ConversationState>();

  constructor(
    private readonly botService: BotService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly botCrypto: BotCryptoService,
    private readonly notificationsService: NotificationsService,
  ) {
    // Cleanup expired conversation states every 5 minutes
    setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
  }

  private cleanupExpiredStates() {
    const now = Date.now();
    for (const [key, state] of this.conversationState.entries()) {
      if (state.expiresAt < now) {
        this.conversationState.delete(key);
      }
    }
  }

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

      // Platform bot also handles text messages from masters (time suggestions)
      if (update.message?.text && !update.message.text.startsWith('/')) {
        this.handlePlatformTextMessage(update).catch((error) => {
          this.logger.error('Platform bot text message error', error);
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
      await this.handleTenantCallbackQuery(botDbId, update);
      return;
    }
    if (update.message?.text) {
      // Check if client is in a conversation flow (awaiting message to master)
      const userId = update.message.from.id.toString();
      const state = this.conversationState.get(userId);
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
    if (!bookingId || !['confirm', 'reject', 'suggest'].includes(action)) return;

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
      serviceNameSnapshot: string;
      client: { firstName: string; lastName: string | null };
    },
  ): Promise<void> {
    const masterId = cbq.from.id.toString();

    // Set conversation state — expect time input from master
    this.conversationState.set(masterId, {
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
    const state = this.conversationState.get(userId);

    if (!state || state.action !== 'awaiting_time' || Date.now() >= state.expiresAt) {
      return; // Not in a conversation flow
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
    this.conversationState.delete(userId);

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
      await this.sendPlatformMessage(
        platformBotToken,
        message.chat.id,
        `✅ Клієнту ${booking.client.firstName} надіслано пропозицію часу: <b>${validTimes.join(', ')}</b>\n\nОчікуйте відповіді.`,
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
          const suggestedTime = parts[2]; // HH:MM
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
    this.conversationState.set(userId, {
      action: 'awaiting_message',
      bookingId: booking.id,
      tenantId: booking.tenantId,
      chatId: cbq.message?.chat.id || 0,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await this.answerCallbackQuery(botToken, cbq.id, '✍️ Напишіть повідомлення');

    // Send instruction message
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cbq.message?.chat.id,
        text: `✍️ Напишіть повідомлення для майстра.\n\n📋 Запис: ${booking.serviceNameSnapshot}\n\n<i>Просто напишіть текст і він буде надісланий майстру.</i>`,
        parse_mode: 'HTML',
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: 'Ваше повідомлення майстру...',
        },
      }),
    });

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
      const tz = booking.tenant?.timezone || 'Europe/Kyiv';
      const originalDateStr = booking.startTime
        .toLocaleDateString('en-CA', { timeZone: tz })
        .split('T')[0];

      const [hours, minutes] = suggestedTime.split(':').map(Number);

      // Build proper UTC time from local time
      const tempDate = new Date(
        `${originalDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
      );
      const utcOffset = this.getTimezoneOffset(tempDate, tz);
      const newStartTimeUtc = new Date(tempDate.getTime() + utcOffset);
      const newEndTimeUtc = new Date(
        newStartTimeUtc.getTime() + booking.durationAtBooking * 60 * 1000,
      );

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

      // Schedule new reminders for the updated time
      await this.notificationsService.scheduleBookingNotifications(
        booking.tenantId,
        bookingId,
        booking.clientId,
        newStartTimeUtc,
        'master',
      );

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
    const state = this.conversationState.get(userId);

    if (!state || state.action !== 'awaiting_message') return;

    // Remove conversation state
    this.conversationState.delete(userId);

    try {
      const botToken = await this.botService.getDecryptedToken(botDbId);

      const booking = await this.loadBookingForCallback(state.bookingId);
      if (!booking) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            text: '❌ Запис не знайдено',
          }),
        });
        return;
      }

      // Confirm to client
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: '✅ Ваше повідомлення надіслано майстру!',
          parse_mode: 'HTML',
        }),
      });

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
        await this.sendPlatformMessage(platformBotToken, Number(masterTelegramId), text);
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
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: clientTelegramId.toString(),
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
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
    return {
      dateStr: dateFmt.format(booking.startTime),
      timeStr: timeFmt.format(booking.startTime),
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
    return `<a href="tg://user?id=${telegramId}">Написати в ТГ</a>`;
  }

  /**
   * Calculate timezone offset in milliseconds for converting local→UTC
   */
  private getTimezoneOffset(date: Date, timezone: string): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(utcStr).getTime() - new Date(tzStr).getTime();
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
