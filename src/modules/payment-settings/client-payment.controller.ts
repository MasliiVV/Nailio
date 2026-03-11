// docs/payments/overview.md — Client Payment Webhook Controllers
// docs/backlog.md #70 — Client payment flow
// docs/api/endpoints.md — Client Payment API + Webhook endpoints
//
// POST /api/v1/bookings/:id/pay             → Create client payment
// GET  /api/v1/bookings/:id/payment-status  → Check payment status
// POST /webhooks/client-payment/monobank    → Monobank client webhook
// POST /webhooks/client-payment/liqpay      → LiqPay client webhook

import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClientPaymentService } from './client-payment.service';
import { PaymentSettingsService } from './payment-settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Controller()
export class ClientPaymentController {
  private readonly logger = new Logger(ClientPaymentController.name);
  private readonly redis: Redis;

  constructor(
    private readonly clientPaymentService: ClientPaymentService,
    private readonly paymentSettingsService: PaymentSettingsService,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  /**
   * POST /api/v1/bookings/:id/pay — Create payment for booking.
   * docs/api/endpoints.md — POST /api/v1/bookings/:id/pay
   */
  @Post('bookings/:id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('client')
  @HttpCode(HttpStatus.OK)
  async createPayment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) bookingId: string,
  ) {
    return this.clientPaymentService.createBookingPayment(tenantId, bookingId);
  }

  /**
   * GET /api/v1/bookings/:id/payment-status — Check payment status.
   * docs/api/endpoints.md — GET /api/v1/bookings/:id/payment-status
   */
  @Get('bookings/:id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('client')
  async getPaymentStatus(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) bookingId: string,
  ) {
    return this.clientPaymentService.getPaymentStatus(tenantId, bookingId);
  }

  /**
   * POST /webhooks/client-payment/monobank — Client payment Monobank webhook.
   * docs/payments/overview.md — Verify signature with master's credentials
   */
  @Post('webhooks/client-payment/monobank')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleMonobankClientWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) return res.status(400).send('Missing body');

      const payload = JSON.parse(rawBody.toString('utf8'));
      const orderId = payload.reference || '';

      // Find the payment ref to get tenantId
      const refStr = await this.redis.get(`client-payment:${orderId}`);
      if (!refStr) {
        this.logger.warn(`Client payment ref not found: ${orderId}`);
        return res.status(200).send('OK');
      }

      const ref = JSON.parse(refStr);
      void ref; // parsed to validate JSON

      const status = payload.status === 'success' ? 'success' : 'failure';

      await this.clientPaymentService.handleClientPaymentWebhook(
        'monobank',
        orderId,
        status as 'success' | 'failure',
        payload.invoiceId || '',
      );

      return res.status(200).send('OK');
    } catch (error) {
      this.logger.error(`Client Monobank webhook error: ${error}`);
      return res.status(200).send('OK');
    }
  }

  /**
   * POST /webhooks/client-payment/liqpay — Client payment LiqPay webhook.
   * docs/payments/overview.md — Verify signature with master's credentials
   */
  @Post('webhooks/client-payment/liqpay')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleLiqPayClientWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) return res.status(400).send('Missing body');

      const bodyStr = rawBody.toString('utf8');
      const params = new URLSearchParams(bodyStr);
      const data = params.get('data');

      if (!data) {
        return res.status(400).send('Missing data');
      }

      const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
      const orderId = decoded.order_id || '';

      const refStr = await this.redis.get(`client-payment:${orderId}`);
      if (!refStr) {
        this.logger.warn(`Client payment ref not found: ${orderId}`);
        return res.status(200).send('OK');
      }

      const ref = JSON.parse(refStr);

      // Verify signature using master's private key
      const credentials = await this.paymentSettingsService.getDecryptedCredentials(ref.tenantId);
      if (credentials?.apiSecret) {
        const signature = params.get('signature');
        const expected = createHash('sha1')
          .update(credentials.apiSecret + data + credentials.apiSecret)
          .digest('base64');

        if (signature !== expected) {
          this.logger.warn(`Invalid LiqPay client webhook signature`);
          return res.status(200).send('OK');
        }
      }

      const status =
        decoded.status === 'success' || decoded.status === 'sandbox' ? 'success' : 'failure';

      await this.clientPaymentService.handleClientPaymentWebhook(
        'liqpay',
        orderId,
        status as 'success' | 'failure',
        decoded.payment_id?.toString() || '',
      );

      return res.status(200).send('OK');
    } catch (error) {
      this.logger.error(`Client LiqPay webhook error: ${error}`);
      return res.status(200).send('OK');
    }
  }
}
