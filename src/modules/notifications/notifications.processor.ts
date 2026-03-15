// docs/telegram/notifications.md — Job Processing
// docs/backlog.md #72-#80 — Notification processor
// docs/architecture/multi-tenancy.md — BullMQ Worker Tenant Context
//
// Worker picks up job:
//   1. Load booking from DB (with client + tenant + bot)
//   2. Check booking.status (skip if cancelled)
//   3. Check client.bot_blocked (skip if true)
//   4. Determine language (users.language_code)
//   5. Render template with variables
//   6. Decrypt bot_token
//   7. Call Telegram Bot API sendMessage
//   8. Handle response (200→sent, 403→bot_blocked, 429→retry)

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService, TENANT_ID_KEY } from '../../prisma/prisma.service';
import { BotCryptoService } from '../telegram/bot-crypto.service';
import { QUEUE_NAMES, NotificationJobData } from '../../common/bullmq/tenant-context';
import { renderTemplate, TemplateVariables } from './templates';
import { buildTelegramUserLink, formatBookingDateTime } from '../../common/utils/date-time.util';

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly botCrypto: BotCryptoService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  /**
   * Process a notification job.
   * docs/telegram/notifications.md — Job Processing flow
   */
  async process(job: Job<NotificationJobData>): Promise<void> {
    const { tenantId, bookingId, clientId, type } = job.data;

    // Set tenant context for CLS
    // docs/architecture/multi-tenancy.md — BullMQ Worker Tenant Context
    return this.cls.run(async () => {
      this.cls.set(TENANT_ID_KEY, tenantId);

      this.logger.debug(
        `Processing notification ${type} for booking ${bookingId} in tenant ${tenantId}`,
      );

      try {
        // 1. Load booking with related data
        const booking = await this.prisma.tenantClient.booking.findFirst({
          where: { id: bookingId, tenantId },
          include: {
            client: {
              include: { user: true },
            },
            service: true,
          },
        });

        if (!booking) {
          this.logger.warn(`Booking ${bookingId} not found, skipping`);
          await this.markNotification(job, 'cancelled');
          return;
        }

        // 2. Check booking status — skip reminders for terminal statuses
        const terminalStatuses = ['cancelled', 'completed', 'no_show'];
        const cancellationTypes = ['cancellation', 'cancellation_master'];
        if (terminalStatuses.includes(booking.status) && !cancellationTypes.includes(type)) {
          this.logger.debug(
            `Booking ${bookingId} is ${booking.status}, skipping ${type} notification`,
          );
          await this.markNotification(job, 'cancelled');
          return;
        }

        // 3. Check bot_blocked
        if (booking.client.botBlocked && type !== 'new_booking') {
          this.logger.debug(`Client ${clientId} blocked bot, skipping notification`);
          await this.markNotification(job, 'cancelled');
          return;
        }

        // 4. Get bot for this tenant
        const bot = await this.prisma.bot.findFirst({
          where: { tenantId, isActive: true },
        });

        if (!bot) {
          this.logger.warn(`No active bot for tenant ${tenantId}`);
          await this.markNotification(job, 'failed', 'No active bot');
          return;
        }

        // 5. Get tenant for timezone + settings
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
        });

        if (!tenant) {
          await this.markNotification(job, 'failed', 'Tenant not found');
          return;
        }

        const settings = (tenant.settings || {}) as Record<string, unknown>;

        // 6. Determine recipient and language
        let recipientTelegramId: bigint;
        let langCode: string;

        // Master-directed notification types
        const isMasterNotification = type === 'new_booking' || type === 'cancellation_master';

        if (isMasterNotification) {
          const master = await this.prisma.master.findFirst({
            where: { tenantId },
            include: { user: true },
          });
          if (!master) {
            await this.markNotification(job, 'failed', 'Master not found');
            return;
          }
          recipientTelegramId = master.user.telegramId;
          langCode = master.user.languageCode;
        } else {
          // All other types (confirmation, reminder, cancellation) → client
          recipientTelegramId = booking.client.user.telegramId;
          langCode = booking.client.user.languageCode;
        }

        // 7. Format date/time in tenant timezone
        const locale = langCode === 'en' ? 'en-US' : 'uk-UA';
        const { date, time } = formatBookingDateTime(
          booking.startTime,
          tenant.timezone || 'Europe/Kyiv',
          locale,
        );

        const templateVars: TemplateVariables = {
          serviceName: booking.serviceNameSnapshot,
          date,
          time,
          duration: booking.durationAtBooking,
          price: booking.priceAtBooking,
          cancellationWindow: (settings.cancellation_window_hours as number) || 24,
          clientName: `${booking.client.firstName} ${booking.client.lastName || ''}`.trim(),
          clientPhone: booking.client.phone || undefined,
          clientTelegramLink: buildTelegramUserLink(booking.client.user.telegramId),
          reason: booking.cancelReason || undefined,
        };

        // 8. Render template
        //    cancellation_master uses a dedicated template; other types map 1:1
        const templateType = type === 'cancellation_master' ? 'cancellation_master' : type;
        const messageText = renderTemplate(templateType, langCode, templateVars);

        // 9. Resolve bot token:
        //    - Master-directed notifications → platform bot (Nailio_App)
        //    - Client-directed notifications → tenant bot (Тест / tenant's own bot)
        let botToken: string;
        if (isMasterNotification) {
          botToken = this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
        } else {
          botToken = await this.botCrypto.decrypt(bot.botTokenEncrypted);
        }

        // 10. Send via Telegram Bot API
        //    Build reply_markup based on notification type
        let replyMarkup: Record<string, unknown> | undefined;

        if (type === 'new_booking') {
          // Master gets confirm / reject / suggest-another-time buttons
          replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: '✅ Підтвердити',
                  callback_data: `confirm:${bookingId}`,
                },
                {
                  text: '❌ Відхилити',
                  callback_data: `reject:${bookingId}`,
                },
              ],
              [
                {
                  text: '🕐 Запропонувати інший час',
                  callback_data: `suggest:${bookingId}`,
                },
              ],
            ],
          };
        } else if (type === 'reminder_1h') {
          // Client gets "on time" / "running late" / "write to master" buttons
          replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: '✅ Прийду вчасно',
                  callback_data: `ontime:${bookingId}`,
                },
                {
                  text: '⏰ Трохи запізнююсь',
                  callback_data: `late:${bookingId}`,
                },
              ],
              [
                {
                  text: '✍️ Написати майстру',
                  callback_data: `writem:${bookingId}`,
                },
              ],
            ],
          };
        } else if (type === 'reminder_24h') {
          // Client gets "write to master" button on 24h reminder
          replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: '✍️ Написати майстру',
                  callback_data: `writem:${bookingId}`,
                },
              ],
            ],
          };
        } else if (type === 'cancellation_master') {
          // Master gets restore button on cancellation
          replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: '♻️ Відновити запис',
                  callback_data: `restore:${bookingId}`,
                },
              ],
            ],
          };
        }
        // No button on 'confirmation' — booking is still pending, not yet confirmed

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: recipientTelegramId.toString(),
            text: messageText,
            parse_mode: 'HTML',
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
        });

        if (response.ok) {
          await this.markNotification(job, 'sent', undefined, messageText);
          this.logger.log(`Notification ${type} sent for booking ${bookingId}`);
        } else {
          const errorData = (await response.json()) as {
            description?: string;
            parameters?: { retry_after?: number };
          };
          const errorMsg = errorData.description || `HTTP ${response.status}`;

          if (response.status === 403) {
            // docs/telegram/notifications.md — Edge Case #2: Client blocked bot
            await this.prisma.tenantClient.client.update({
              where: { id: clientId },
              data: { botBlocked: true },
            });
            await this.markNotification(job, 'failed', errorMsg);
            this.logger.warn(`Client ${clientId} blocked bot, marking bot_blocked=true`);
            // Don't retry 403
            return;
          }

          if (response.status === 429) {
            // Rate limited — let BullMQ retry with backoff
            const retryAfter = errorData.parameters?.retry_after || 30;
            throw new Error(`Rate limited, retry after ${retryAfter}s`);
          }

          if (response.status === 400) {
            // Bad request — don't retry
            await this.markNotification(job, 'failed', errorMsg);
            return;
          }

          // Other errors — throw to trigger retry
          throw new Error(`Telegram API error: ${errorMsg}`);
        }
      } catch (error) {
        this.logger.error(`Notification ${type} failed for booking ${bookingId}: ${error}`);
        throw error; // BullMQ will retry based on job config
      }
    });
  }

  /**
   * Update notification record in DB.
   */
  private async markNotification(
    job: Job,
    status: 'sent' | 'failed' | 'cancelled',
    error?: string,
    messageText?: string,
  ) {
    // Extract notification ID from jobId: "notif-{notification.id}"
    const notifId = job.opts.jobId?.replace('notif-', '');
    if (!notifId) return;

    try {
      await this.prisma.notification.update({
        where: { id: notifId },
        data: {
          status,
          ...(status === 'sent' && { sentAt: new Date() }),
          ...(error && { error }),
          ...(messageText && { messageText }),
        },
      });
    } catch {
      // Notification record may not exist (e.g., race condition)
      this.logger.warn(`Failed to update notification ${notifId}`);
    }
  }
}
