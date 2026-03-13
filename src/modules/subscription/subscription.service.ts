// docs/payments/subscription-lifecycle.md — Subscription Service + State Machine
// docs/payments/overview.md — Strategy Pattern, Checkout, Billing
// docs/backlog.md #57-#58, #65-#68 — Subscription module, trial, checkout, management
//
// State Machine:
//   trial → active (payment success)
//   trial → expired (trial ended, no payment)
//   active → past_due (payment failed)
//   active → cancelled (voluntary, access until period end)
//   past_due → active (retry success)
//   past_due → expired (grace ended)
//   expired → active (reactivation with new payment)
//   cancelled → expired (period end)

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRateService } from './exchange-rate.service';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { BotCryptoService } from '../telegram/bot-crypto.service';
import { QUEUE_NAMES } from '../../common/bullmq/tenant-context';
import { Decimal } from '@prisma/client/runtime/library';

// Subscription job data interfaces
export interface SubscriptionJobData {
  tenantId: string;
  subscriptionId: string;
}

export interface TrialReminderJobData extends SubscriptionJobData {
  daysLeft: number;
}

export interface RetryJobData extends SubscriptionJobData {
  attempt: number;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly platformSubscriptionPrice: number;
  private readonly platformBotUrl: string;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly botCrypto: BotCryptoService,
    @InjectQueue(QUEUE_NAMES.SUBSCRIPTIONS) private readonly subsQueue: Queue,
  ) {
    this.platformSubscriptionPrice = this.configService.get<number>(
      'PLATFORM_SUBSCRIPTION_PRICE_USD',
      10,
    );
    this.platformBotUrl = this.configService.get<string>(
      'PLATFORM_BOT_URL',
      'https://t.me/nailioapp_bot',
    );
    this.apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
  }

  /**
   * Get subscription status.
   * docs/api/endpoints.md — GET /api/v1/subscription
   */
  async getStatus(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { trialEndsAt: true },
    });

    return {
      id: subscription.id,
      status: subscription.status,
      provider: subscription.paymentProvider,
      cardLastFour: subscription.cardLastFour,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: tenant?.trialEndsAt,
      priceUsd: this.platformSubscriptionPrice,
      lastPayment: subscription.payments[0] || null,
    };
  }

  /**
   * Create subscription checkout (hosted payment page).
   * docs/payments/subscription-lifecycle.md — Flow 2: Trial → First Payment
   * docs/api/endpoints.md — POST /api/v1/subscription/checkout
   */
  async checkout(tenantId: string, provider: 'monobank' | 'liqpay') {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Only trial, expired, or cancelled-at-period-end can checkout
    if (!['trial', 'expired', 'cancelled'].includes(subscription.status)) {
      if (subscription.status === 'active') {
        throw new BadRequestException('Subscription already active');
      }
    }

    // docs/payments/overview.md — Exchange rate USD→UAH
    const { amountKopecks, rate } = await this.exchangeRate.convertUsdToUah(
      this.platformSubscriptionPrice,
    );

    const paymentProvider = this.providerFactory.getProvider(provider);
    const orderId = `sub_${subscription.id}_${Date.now()}`;
    const walletId = provider === 'monobank' ? `tenant_${tenantId}` : undefined;

    // docs/payments/overview.md — Create invoice via provider
    const result = await paymentProvider.createPayment({
      orderId,
      amountKopecks,
      description: 'Nailio — Місячна підписка',
      redirectUrl: this.platformBotUrl,
      webhookUrl: `${this.apiBaseUrl}/webhooks/${provider}`,
      saveCard: true,
      walletId,
    });

    // Create pending payment record
    await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        paymentProvider: provider,
        externalId: result.providerPaymentId,
        amount: amountKopecks,
        currency: 'UAH',
        exchangeRate: new Decimal(rate),
        status: 'pending',
      },
    });

    this.logger.log(
      `Checkout created for tenant ${tenantId}: provider=${provider}, orderId=${orderId}`,
    );

    return {
      paymentUrl: result.paymentUrl,
      invoiceId: result.providerPaymentId,
    };
  }

  /**
   * Handle successful payment webhook.
   * docs/payments/subscription-lifecycle.md — Webhook arrives (success)
   */
  async handlePaymentSuccess(
    providerPaymentId: string,
    provider: 'monobank' | 'liqpay',
    cardToken?: string,
    cardLastFour?: string,
  ) {
    // Find the pending payment (idempotent: skip if already success)
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: {
        externalId: providerPaymentId,
        paymentProvider: provider,
      },
      include: { subscription: true },
    });

    if (!payment) {
      this.logger.warn(`Payment not found: ${providerPaymentId}`);
      return;
    }

    // docs/payments/overview.md — Double webhook idempotency
    if (payment.status === 'success') {
      this.logger.warn(`Payment ${providerPaymentId} already processed`);
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Encrypt card token if provided
    let cardTokenEncrypted: Buffer | null = null;
    if (cardToken) {
      cardTokenEncrypted = this.botCrypto.encrypt(cardToken);
    }

    // Update payment + subscription in transaction
    await this.prisma.$transaction([
      this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: 'success',
          paidAt: now,
        },
      }),
      this.prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'active',
          paymentProvider: provider,
          cardTokenEncrypted: cardTokenEncrypted,
          cardLastFour: cardLastFour || null,
          walletId: provider === 'monobank' ? `tenant_${payment.subscription.tenantId}` : null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          retryCount: 0,
        },
      }),
    ]);

    // Cancel any pending trial-end or expire jobs
    await this.cancelPendingJobs(payment.subscription.tenantId);

    // Schedule next billing job (in 30 days)
    await this.scheduleChargeJob(payment.subscription.tenantId, payment.subscriptionId, periodEnd);

    this.logger.log(
      `Subscription activated: tenant=${payment.subscription.tenantId}, period_end=${periodEnd.toISOString()}`,
    );
  }

  /**
   * Handle failed payment webhook.
   * docs/payments/subscription-lifecycle.md — Webhook arrives (failed)
   */
  async handlePaymentFailure(
    providerPaymentId: string,
    provider: 'monobank' | 'liqpay',
    errorMessage?: string,
  ) {
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: {
        externalId: providerPaymentId,
        paymentProvider: provider,
      },
    });

    if (!payment || payment.status !== 'pending') return;

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        failureReason: errorMessage || 'Payment failed',
      },
    });

    this.logger.warn(`Payment failed: ${providerPaymentId} - ${errorMessage}`);
  }

  /**
   * Process monthly auto-charge (BullMQ job handler).
   * docs/payments/subscription-lifecycle.md — Flow 3: Monthly Renewal
   */
  async processCharge(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription || !subscription.paymentProvider || !subscription.cardTokenEncrypted) {
      this.logger.warn(`Cannot charge subscription ${subscriptionId}: missing provider or token`);
      return;
    }

    // Decrypt card token
    const cardToken = this.botCrypto.decrypt(subscription.cardTokenEncrypted);

    // Get exchange rate
    const { amountKopecks, rate } = await this.exchangeRate.convertUsdToUah(
      this.platformSubscriptionPrice,
    );

    const provider = this.providerFactory.getProvider(subscription.paymentProvider);
    const orderId = `sub_${subscriptionId}_${Date.now()}`;

    // Create payment record
    const paymentRecord = await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        paymentProvider: subscription.paymentProvider,
        externalId: orderId,
        amount: amountKopecks,
        currency: 'UAH',
        exchangeRate: new Decimal(rate),
        status: 'pending',
      },
    });

    // Attempt charge
    const result = await provider.chargeToken({
      cardToken,
      amountKopecks,
      orderId,
      description: 'Nailio — Місячна підписка',
    });

    if (result.status === 'success') {
      // docs/payments/subscription-lifecycle.md — Success
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await this.prisma.$transaction([
        this.prisma.subscriptionPayment.update({
          where: { id: paymentRecord.id },
          data: {
            status: 'success',
            externalId: result.providerPaymentId || orderId,
            paidAt: now,
          },
        }),
        this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            retryCount: 0,
          },
        }),
      ]);

      // Schedule next charge
      await this.scheduleChargeJob(subscription.tenantId, subscriptionId, periodEnd);

      this.logger.log(`Subscription renewed: ${subscriptionId}`);
    } else {
      // docs/payments/subscription-lifecycle.md — Failed → past_due

      await this.prisma.$transaction([
        this.prisma.subscriptionPayment.update({
          where: { id: paymentRecord.id },
          data: {
            status: 'failed',
            failureReason: result.errorMessage || 'Charge failed',
          },
        }),
        this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'past_due',
            retryCount: 1,
          },
        }),
      ]);

      // docs/payments/subscription-lifecycle.md — Schedule retry (attempt 2, delay: 24h)
      await this.scheduleRetryJob(subscription.tenantId, subscriptionId, 2, 24 * 60 * 60 * 1000);

      this.logger.warn(`Subscription charge failed, moved to past_due: ${subscriptionId}`);
    }
  }

  /**
   * Retry failed subscription payment.
   * docs/payments/subscription-lifecycle.md — Flow 4: Payment Retry (Grace Period)
   *   Day 0: First charge failed → past_due
   *   Day 1: Retry attempt 2
   *   Day 3: Retry attempt 3
   *   Day 7: Grace ended → expired
   */
  async processRetry(subscriptionId: string, attempt: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription || subscription.status !== 'past_due') {
      return;
    }

    if (!subscription.paymentProvider || !subscription.cardTokenEncrypted) {
      // No card token — schedule expiration
      await this.scheduleExpireJob(subscription.tenantId, subscriptionId, 0);
      return;
    }

    const cardToken = this.botCrypto.decrypt(subscription.cardTokenEncrypted);
    const { amountKopecks, rate } = await this.exchangeRate.convertUsdToUah(
      this.platformSubscriptionPrice,
    );

    const provider = this.providerFactory.getProvider(subscription.paymentProvider);
    const orderId = `sub_${subscriptionId}_retry${attempt}_${Date.now()}`;

    const paymentRecord = await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        paymentProvider: subscription.paymentProvider,
        externalId: orderId,
        amount: amountKopecks,
        currency: 'UAH',
        exchangeRate: new Decimal(rate),
        status: 'pending',
      },
    });

    const result = await provider.chargeToken({
      cardToken,
      amountKopecks,
      orderId,
      description: 'Nailio — Повторна оплата підписки',
    });

    if (result.status === 'success') {
      // docs/payments/subscription-lifecycle.md — Retry Success → active
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await this.prisma.$transaction([
        this.prisma.subscriptionPayment.update({
          where: { id: paymentRecord.id },
          data: {
            status: 'success',
            externalId: result.providerPaymentId || orderId,
            paidAt: now,
          },
        }),
        this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            retryCount: 0,
          },
        }),
      ]);

      await this.scheduleChargeJob(subscription.tenantId, subscriptionId, periodEnd);

      this.logger.log(`Subscription retry success: ${subscriptionId}, attempt=${attempt}`);
    } else {
      await this.prisma.$transaction([
        this.prisma.subscriptionPayment.update({
          where: { id: paymentRecord.id },
          data: {
            status: 'failed',
            failureReason: result.errorMessage || 'Retry charge failed',
          },
        }),
        this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: { retryCount: attempt },
        }),
      ]);

      if (attempt < 3) {
        // docs/payments/subscription-lifecycle.md — attempt < 3: schedule next retry
        const delayMs = attempt === 2 ? 48 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 48h or 24h
        await this.scheduleRetryJob(subscription.tenantId, subscriptionId, attempt + 1, delayMs);
      } else {
        // docs/payments/subscription-lifecycle.md — attempt = 3: schedule expiration
        const graceDelayMs = 3 * 24 * 60 * 60 * 1000; // remaining grace ~3 days
        await this.scheduleExpireJob(subscription.tenantId, subscriptionId, graceDelayMs);
      }

      this.logger.warn(`Subscription retry failed: ${subscriptionId}, attempt=${attempt}`);
    }
  }

  /**
   * Check trial end and expire if not subscribed.
   * docs/payments/subscription-lifecycle.md — BullMQ job: check-trial-end
   */
  async processTrialEnd(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription || subscription.status !== 'trial') {
      return; // Already changed state
    }

    // Trial ended — expire
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'expired',
        cardTokenEncrypted: null,
      },
    });

    this.logger.log(`Trial expired: subscription=${subscriptionId}`);
  }

  /**
   * Expire subscription (grace period ended).
   * docs/payments/subscription-lifecycle.md — Flow 5: Subscription Expiration
   */
  async processExpire(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) return;

    // Only expire if still past_due or cancelled
    if (!['past_due', 'cancelled'].includes(subscription.status)) {
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'expired',
        cardTokenEncrypted: null, // Clear token
      },
    });

    this.logger.log(`Subscription expired: ${subscriptionId}`);
  }

  /**
   * Cancel subscription voluntarily.
   * docs/payments/subscription-lifecycle.md — Flow 7: Voluntary Cancellation
   * docs/api/endpoints.md — POST /api/v1/subscription/cancel
   */
  async cancel(tenantId: string, reason?: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!['active', 'trial'].includes(subscription.status)) {
      throw new BadRequestException('Cannot cancel: subscription not active');
    }

    // docs/payments/subscription-lifecycle.md —
    //   cancelled_at = NOW()
    //   status remains 'active' until period end (if active)
    //   if trial → immediate expire
    if (subscription.status === 'trial') {
      await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          status: 'expired',
          cancelReason: reason || null,
        },
      });
      await this.cancelPendingJobs(tenantId);
    } else {
      // Active → cancelled (access until period end)
      await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          status: 'cancelled',
          cancelReason: reason || null,
        },
      });

      // Cancel next billing job
      await this.cancelPendingJobs(tenantId);

      // Schedule expiration at period end
      if (subscription.currentPeriodEnd) {
        const delay = subscription.currentPeriodEnd.getTime() - Date.now();
        if (delay > 0) {
          await this.scheduleExpireJob(tenantId, subscription.id, delay);
        }
      }
    }

    this.logger.log(`Subscription cancelled: tenant=${tenantId}, reason=${reason}`);

    return { status: subscription.status === 'trial' ? 'expired' : 'cancelled' };
  }

  /**
   * Get payment history.
   * docs/api/endpoints.md — GET /api/v1/subscription/payments
   */
  async getPaymentHistory(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Update card / change provider.
   * docs/api/endpoints.md — PUT /api/v1/subscription/card
   * Creates a new checkout for card update.
   */
  async updateCard(tenantId: string, provider: 'monobank' | 'liqpay') {
    return this.checkout(tenantId, provider);
  }

  /**
   * Schedule trial jobs on new registration.
   * docs/payments/subscription-lifecycle.md — Flow 1: New Registration → Trial
   * Called from AuthService when creating new master tenant.
   */
  async scheduleTrialJobs(tenantId: string, subscriptionId: string) {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;

    // Trial end check
    await this.subsQueue.add(
      'check-trial-end',
      { tenantId, subscriptionId } as SubscriptionJobData,
      {
        delay: SEVEN_DAYS,
        jobId: `trial-end:${tenantId}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 2592000 },
      },
    );

    // docs/payments/subscription-lifecycle.md — reminder at day 5 (2 days before end)
    await this.subsQueue.add(
      'trial-reminder',
      { tenantId, subscriptionId, daysLeft: 2 } as TrialReminderJobData,
      {
        delay: FIVE_DAYS,
        jobId: `trial-reminder-5d:${tenantId}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
      },
    );

    // docs/payments/subscription-lifecycle.md — reminder at day 6 (1 day before end)
    await this.subsQueue.add(
      'trial-reminder',
      { tenantId, subscriptionId, daysLeft: 1 } as TrialReminderJobData,
      {
        delay: SIX_DAYS,
        jobId: `trial-reminder-6d:${tenantId}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
      },
    );

    this.logger.log(`Trial jobs scheduled for tenant ${tenantId}`);
  }

  // ─── Private: Job Scheduling ───

  private async scheduleChargeJob(tenantId: string, subscriptionId: string, chargeAt: Date) {
    const delay = chargeAt.getTime() - Date.now();
    await this.subsQueue.add(
      'charge-subscription',
      { tenantId, subscriptionId } as SubscriptionJobData,
      {
        delay: Math.max(delay, 0),
        jobId: `charge:${tenantId}:${chargeAt.getTime()}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 2592000 },
      },
    );
  }

  private async scheduleRetryJob(
    tenantId: string,
    subscriptionId: string,
    attempt: number,
    delayMs: number,
  ) {
    await this.subsQueue.add(
      'retry-subscription-payment',
      { tenantId, subscriptionId, attempt } as RetryJobData,
      {
        delay: delayMs,
        jobId: `retry:${tenantId}:attempt${attempt}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 2592000 },
      },
    );
  }

  private async scheduleExpireJob(tenantId: string, subscriptionId: string, delayMs: number) {
    await this.subsQueue.add(
      'expire-subscription',
      { tenantId, subscriptionId } as SubscriptionJobData,
      {
        delay: Math.max(delayMs, 0),
        jobId: `expire:${tenantId}`,
        attempts: 1,
        removeOnComplete: { age: 604800 },
        removeOnFail: { age: 2592000 },
      },
    );
  }

  /**
   * Cancel all pending subscription jobs for a tenant.
   */
  private async cancelPendingJobs(tenantId: string) {
    const jobIds = [
      `trial-end:${tenantId}`,
      `trial-reminder-5d:${tenantId}`,
      `trial-reminder-6d:${tenantId}`,
      `charge:${tenantId}:*`,
      `retry:${tenantId}:*`,
      `expire:${tenantId}`,
    ];

    for (const jobId of jobIds) {
      try {
        if (jobId.includes('*')) {
          // For wildcard patterns, remove delayed jobs matching prefix
          const delayed = await this.subsQueue.getDelayed();
          for (const job of delayed) {
            if (job.id && job.id.startsWith(jobId.replace('*', ''))) {
              await job.remove();
            }
          }
        } else {
          const job = await this.subsQueue.getJob(jobId);
          if (job) {
            await job.remove();
          }
        }
      } catch {
        // Job might not exist, that's OK
      }
    }
  }
}
