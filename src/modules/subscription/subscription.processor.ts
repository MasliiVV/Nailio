// docs/payments/subscription-lifecycle.md — BullMQ Subscription Jobs Processor
// docs/backlog.md #66 — BullMQ billing jobs (charge, retry, expire)
//
// Jobs:
//   check-trial-end            → SubscriptionService.processTrialEnd()
//   trial-reminder             → Send trial expiry reminder via Telegram
//   charge-subscription        → SubscriptionService.processCharge()
//   retry-subscription-payment → SubscriptionService.processRetry()
//   expire-subscription        → SubscriptionService.processExpire()
//
// docs/payments/subscription-lifecycle.md — Job Options:
//   attempts: 1 (billing jobs should NOT auto-retry)
//   removeOnComplete: { age: 604800 } (7 days)
//   removeOnFail: { age: 2592000 } (30 days)

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import {
  SubscriptionService,
  SubscriptionJobData,
  TrialReminderJobData,
  RetryJobData,
} from './subscription.service';
import { QUEUE_NAMES, withTenantContext, TenantJobData } from '../../common/bullmq/tenant-context';
import { PrismaService } from '../../prisma/prisma.service';
import { BotCryptoService } from '../telegram/bot-crypto.service';

@Processor(QUEUE_NAMES.SUBSCRIPTIONS)
export class SubscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionProcessor.name);

  constructor(
    private readonly cls: ClsService,
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
    private readonly botCrypto: BotCryptoService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // Wrap with tenant context for Prisma auto-scoping
    const handler = withTenantContext<TenantJobData>(this.cls, this.logger, async (j) => {
      const data = j.data;
      switch (j.name) {
        case 'check-trial-end':
          await this.handleTrialEnd(data as unknown as SubscriptionJobData);
          break;
        case 'trial-reminder':
          await this.handleTrialReminder(data as unknown as TrialReminderJobData);
          break;
        case 'charge-subscription':
          await this.handleCharge(data as unknown as SubscriptionJobData);
          break;
        case 'retry-subscription-payment':
          await this.handleRetry(data as unknown as RetryJobData);
          break;
        case 'expire-subscription':
          await this.handleExpire(data as unknown as SubscriptionJobData);
          break;
        default:
          this.logger.warn(`Unknown job name: ${j.name}`);
      }
    });

    await handler(job as Job<TenantJobData>);
  }

  /**
   * docs/payments/subscription-lifecycle.md — Flow 1: Trial end check
   */
  private async handleTrialEnd(data: SubscriptionJobData) {
    this.logger.log(`Processing trial end: subscription=${data.subscriptionId}`);
    await this.subscriptionService.processTrialEnd(data.subscriptionId);

    // Send notification to master
    await this.sendSubscriptionNotification(
      data.tenantId,
      '🔴 Пробний період закінчився. Оформіть підписку для продовження роботи.\n\n🔴 Trial ended. Subscribe to continue.',
    );
  }

  /**
   * docs/payments/subscription-lifecycle.md — Trial reminders (day 5, day 6)
   */
  private async handleTrialReminder(data: TrialReminderJobData) {
    this.logger.log(
      `Trial reminder: subscription=${data.subscriptionId}, daysLeft=${data.daysLeft}`,
    );

    let message: string;
    if (data.daysLeft === 2) {
      message =
        '🔔 Ваш пробний період закінчується через 2 дні. Оформіть підписку!\n\n🔔 Your trial ends in 2 days. Subscribe now!';
    } else {
      message =
        '⚠️ Завтра закінчується пробний період. Після цього бот перейде в режим перегляду.\n\n⚠️ Trial ends tomorrow. Bot will switch to read-only mode.';
    }

    await this.sendSubscriptionNotification(data.tenantId, message);
  }

  /**
   * docs/payments/subscription-lifecycle.md — Flow 3: Monthly Renewal
   */
  private async handleCharge(data: SubscriptionJobData) {
    this.logger.log(`Processing charge: subscription=${data.subscriptionId}`);
    await this.subscriptionService.processCharge(data.subscriptionId);
  }

  /**
   * docs/payments/subscription-lifecycle.md — Flow 4: Payment Retry
   */
  private async handleRetry(data: RetryJobData) {
    this.logger.log(
      `Processing retry: subscription=${data.subscriptionId}, attempt=${data.attempt}`,
    );
    await this.subscriptionService.processRetry(data.subscriptionId, data.attempt);
  }

  /**
   * docs/payments/subscription-lifecycle.md — Flow 5: Expiration
   */
  private async handleExpire(data: SubscriptionJobData) {
    this.logger.log(`Processing expire: subscription=${data.subscriptionId}`);
    await this.subscriptionService.processExpire(data.subscriptionId);

    await this.sendSubscriptionNotification(
      data.tenantId,
      '🔴 Підписка закінчилась. Бот працює в режимі перегляду. Оновіть підписку для повного доступу.\n\n🔴 Subscription expired. Bot in read-only mode.',
    );
  }

  /**
   * Send subscription notification to master via their Telegram bot.
   * Uses same pattern as notifications processor.
   */
  private async sendSubscriptionNotification(tenantId: string, message: string) {
    try {
      // Find master's telegram user
      const master = await this.prisma.master.findFirst({
        where: { tenantId },
        include: { user: true },
      });

      if (!master) return;

      // Find bot for this tenant
      const bot = await this.prisma.bot.findFirst({
        where: { tenantId, isActive: true },
      });

      if (!bot) return;

      // Decrypt bot token and send message
      const botToken = await this.botCrypto.getCachedToken(bot.id, bot.botTokenEncrypted);

      const telegramId = master.user.telegramId.toString();

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        this.logger.warn(
          `Failed to send subscription notification to ${telegramId}: ${JSON.stringify(errData)}`,
        );
      }
    } catch (error) {
      this.logger.error(`Subscription notification error: ${error}`);
    }
  }
}
