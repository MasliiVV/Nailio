// docs/payments/overview.md — Client Payments (Optional)
// docs/backlog.md #70 — Client payment flow ("Pay Online")
// docs/api/endpoints.md — Client Payment API
//
// POST /api/v1/bookings/:id/pay              → Create payment for booking
// GET  /api/v1/bookings/:id/payment-status   → Check payment status
//
// Flow:
//   1. Client opens booking → "Pay Online" button
//   2. POST /bookings/:id/pay → Server creates invoice via master's merchant
//   3. Returns hosted payment page URL
//   4. Client pays on Monobank/LiqPay page
//   5. Webhook → update booking payment status + create transaction

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import {
  CreatePaymentParams,
  PaymentProvider,
  WebhookPayload,
} from '../subscription/providers/payment-provider.interface';
import { MonobankProvider } from '../subscription/providers/monobank.provider';
import { LiqPayProvider } from '../subscription/providers/liqpay.provider';
import { createHash, createVerify } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class ClientPaymentService {
  private readonly logger = new Logger(ClientPaymentService.name);
  private readonly apiBaseUrl: string;
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentSettingsService: PaymentSettingsService,
  ) {
    this.apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  /**
   * Create payment for a booking.
   * docs/api/endpoints.md — POST /api/v1/bookings/:id/pay
   * docs/payments/overview.md — Client Payment Flow
   */
  async createBookingPayment(tenantId: string, bookingId: string) {
    // Verify booking exists and belongs to tenant
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === 'cancelled') {
      throw new BadRequestException('Cannot pay for cancelled booking');
    }

    // Get master's payment settings
    const credentials = await this.paymentSettingsService.getDecryptedCredentials(tenantId);

    if (!credentials) {
      throw new BadRequestException('Online payment not configured for this master');
    }

    // Find tenant's bot for redirect URL
    const bot = await this.prisma.bot.findFirst({
      where: { tenantId, isActive: true },
    });

    const redirectUrl = bot
      ? `https://t.me/${bot.botUsername}/app`
      : this.configService.get<string>('PLATFORM_BOT_URL', 'https://t.me/GlowUpProBot');

    const orderId = `booking_${bookingId}_${Date.now()}`;

    // Create payment via master's provider using their credentials
    // We need to use provider-specific API with master's credentials
    const paymentResult = await this.createProviderPayment(
      credentials.provider,
      credentials.apiToken,
      credentials.apiSecret,
      {
        orderId,
        amountKopecks: booking.priceAtBooking,
        description: `Оплата: ${booking.serviceNameSnapshot}`,
        redirectUrl,
        webhookUrl: `${this.apiBaseUrl}/webhooks/client-payment/${credentials.provider}`,
      },
    );

    // Store payment reference in Redis for webhook handling
    await this.redis.setex(
      `client-payment:${orderId}`,
      86400, // 24h TTL
      JSON.stringify({
        tenantId,
        bookingId,
        clientId: booking.clientId,
        provider: credentials.provider,
      }),
    );

    this.logger.log(
      `Client payment created: booking=${bookingId}, provider=${credentials.provider}`,
    );

    return {
      paymentUrl: paymentResult.paymentUrl,
      orderId,
    };
  }

  /**
   * Get payment status for a booking.
   * docs/api/endpoints.md — GET /api/v1/bookings/:id/payment-status
   */
  async getPaymentStatus(tenantId: string, bookingId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        tenantId,
        bookingId,
        paymentMethod: 'online',
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      bookingId,
      paymentStatus: transaction?.status || 'unpaid',
      amount: transaction?.amount || null,
      paidAt: transaction?.createdAt || null,
    };
  }

  /**
   * Handle client payment webhook.
   * docs/payments/overview.md — Client Payment Webhook Flow
   */
  async handleClientPaymentWebhook(
    provider: 'monobank' | 'liqpay',
    orderId: string,
    status: 'success' | 'failure',
    externalId: string,
  ) {
    // Get stored payment reference
    const refStr = await this.redis.get(`client-payment:${orderId}`);
    if (!refStr) {
      this.logger.warn(`Client payment ref not found for order: ${orderId}`);
      return;
    }

    const ref = JSON.parse(refStr) as {
      tenantId: string;
      bookingId: string;
      clientId: string;
      provider: string;
    };

    if (status === 'success') {
      // Get booking to get amount
      const booking = await this.prisma.booking.findFirst({
        where: { id: ref.bookingId },
      });

      if (!booking) return;

      // Create transaction record
      await this.prisma.transaction.create({
        data: {
          tenantId: ref.tenantId,
          bookingId: ref.bookingId,
          clientId: ref.clientId,
          amount: booking.priceAtBooking,
          currency: 'UAH',
          paymentMethod: 'online',
          status: 'completed',
          externalTransactionId: externalId,
        },
      });

      // Clean up Redis ref
      await this.redis.del(`client-payment:${orderId}`);

      this.logger.log(
        `Client payment successful: booking=${ref.bookingId}, amount=${booking.priceAtBooking}`,
      );
    }
  }

  /**
   * Create payment using master's own provider credentials.
   */
  private async createProviderPayment(
    provider: 'monobank' | 'liqpay',
    apiToken: string,
    apiSecret: string | null,
    params: CreatePaymentParams,
  ) {
    if (provider === 'monobank') {
      // Monobank: POST /api/merchant/invoice/create with master's X-Token
      const response = await fetch(
        'https://api.monobank.ua/api/merchant/invoice/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Token': apiToken,
          },
          body: JSON.stringify({
            amount: params.amountKopecks,
            ccy: 980,
            merchantPaymInfo: {
              reference: params.orderId,
              destination: params.description,
            },
            redirectUrl: params.redirectUrl,
            webHookUrl: params.webhookUrl,
          }),
        },
      );

      if (!response.ok) {
        throw new BadRequestException('Failed to create Monobank payment');
      }

      const data = await response.json();
      return {
        paymentUrl: data.pageUrl,
        providerPaymentId: data.invoiceId,
      };
    } else {
      // LiqPay: construct checkout URL with master's keys
      const paymentData = {
        action: 'pay',
        version: 3,
        public_key: apiToken,
        amount: params.amountKopecks / 100,
        currency: 'UAH',
        description: params.description,
        order_id: params.orderId,
        server_url: params.webhookUrl,
        result_url: params.redirectUrl,
      };

      const data = Buffer.from(JSON.stringify(paymentData)).toString('base64');
      const signature = createHash('sha1')
        .update((apiSecret || '') + data + (apiSecret || ''))
        .digest('base64');

      return {
        paymentUrl: `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`,
        providerPaymentId: params.orderId,
      };
    }
  }
}
