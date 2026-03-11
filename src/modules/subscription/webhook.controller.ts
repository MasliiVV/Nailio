// docs/payments/overview.md — Webhook Endpoints Summary
// docs/backlog.md #71 — Webhook handlers (Monobank ECDSA, LiqPay SHA1)
//
// POST /webhooks/monobank                   → Platform subscription (Monobank)
// POST /webhooks/liqpay                     → Platform subscription (LiqPay)
// POST /webhooks/client-payment/monobank    → Client payment (Monobank)
// POST /webhooks/client-payment/liqpay      → Client payment (LiqPay)

import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SubscriptionService } from './subscription.service';
import { PaymentProviderFactory } from './providers/payment-provider.factory';

@Controller('webhooks')
@Public()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  /**
   * POST /webhooks/monobank — Monobank subscription webhook.
   * docs/payments/overview.md — Webhook Verification: ECDSA with SHA256
   */
  @Post('monobank')
  @HttpCode(HttpStatus.OK)
  async handleMonobankWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        this.logger.warn('Monobank webhook: missing raw body');
        return res.status(400).send('Missing body');
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key.toLowerCase()] = value;
        }
      }

      const provider = this.providerFactory.getProvider('monobank');
      const payload = await provider.verifyWebhook(headers, rawBody);

      this.logger.log(
        `Monobank webhook: paymentId=${payload.providerPaymentId}, status=${payload.status}`,
      );

      if (payload.status === 'success') {
        await this.subscriptionService.handlePaymentSuccess(
          payload.providerPaymentId,
          'monobank',
          payload.cardToken,
          payload.cardLastFour,
        );
      } else if (payload.status === 'failure') {
        await this.subscriptionService.handlePaymentFailure(
          payload.providerPaymentId,
          'monobank',
          'Payment failed',
        );
      }

      return res.status(200).send('OK');
    } catch (error) {
      this.logger.error(`Monobank webhook error: ${error}`);
      return res.status(200).send('OK'); // Always 200 to prevent retries
    }
  }

  /**
   * POST /webhooks/liqpay — LiqPay subscription webhook.
   * docs/payments/overview.md — Webhook Verification: SHA1
   */
  @Post('liqpay')
  @HttpCode(HttpStatus.OK)
  async handleLiqPayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        this.logger.warn('LiqPay webhook: missing raw body');
        return res.status(400).send('Missing body');
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key.toLowerCase()] = value;
        }
      }

      const provider = this.providerFactory.getProvider('liqpay');
      const payload = await provider.verifyWebhook(headers, rawBody);

      this.logger.log(
        `LiqPay webhook: paymentId=${payload.providerPaymentId}, status=${payload.status}`,
      );

      if (payload.status === 'success') {
        await this.subscriptionService.handlePaymentSuccess(
          payload.providerPaymentId,
          'liqpay',
          payload.cardToken,
          payload.cardLastFour,
        );
      } else if (payload.status === 'failure') {
        await this.subscriptionService.handlePaymentFailure(
          payload.providerPaymentId,
          'liqpay',
          'Payment failed',
        );
      }

      return res.status(200).send('OK');
    } catch (error) {
      this.logger.error(`LiqPay webhook error: ${error}`);
      return res.status(200).send('OK');
    }
  }
}
