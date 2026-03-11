// docs/payments/overview.md — LiqPay Provider
// docs/backlog.md #63 — LiqPayProvider implementation
//
// API:
//   POST /api/3/checkout → hosted page (form post to liqpay.ua/api/3/checkout)
//   POST /api/request → server-to-server charge (recurring)
//
// Auth:
//   data = Base64(JSON payload)
//   signature = Base64(SHA1(private_key + data + private_key))
//
// Webhook:
//   POST body: data=...&signature=...
//   expected = Base64(SHA1(private_key + data + private_key))

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  PaymentProvider,
  CreatePaymentParams,
  PaymentResult,
  WebhookPayload,
  ChargeTokenParams,
  ChargeResult,
} from './payment-provider.interface';

@Injectable()
export class LiqPayProvider implements PaymentProvider {
  readonly name = 'liqpay' as const;
  private readonly logger = new Logger(LiqPayProvider.name);
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly baseUrl = 'https://www.liqpay.ua';

  constructor(private readonly configService: ConfigService) {
    this.publicKey = this.configService.get<string>('LIQPAY_PUBLIC_KEY', '');
    this.privateKey = this.configService.get<string>('LIQPAY_PRIVATE_KEY', '');
  }

  /**
   * Create payment via LiqPay checkout page.
   * docs/payments/overview.md — LiqPay Card Tokenization Flow
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const paymentData: Record<string, unknown> = {
      action: params.saveCard ? 'auth' : 'pay',
      version: 3,
      public_key: this.publicKey,
      amount: params.amountKopecks / 100, // LiqPay uses UAH, not kopecks
      currency: 'UAH',
      description: params.description,
      order_id: params.orderId,
      server_url: params.webhookUrl,
      result_url: params.redirectUrl,
    };

    // docs/payments/overview.md — Card tokenization
    if (params.saveCard) {
      paymentData.recurringbytoken = '1';
    }

    const data = this.encodeData(paymentData);
    const signature = this.sign(data);

    // LiqPay uses a form POST, we construct the checkout URL
    // Client-side will redirect to this URL
    const paymentUrl = `${this.baseUrl}/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`;

    return {
      paymentUrl,
      providerPaymentId: params.orderId,
    };
  }

  /**
   * Verify LiqPay webhook signature (SHA1).
   * docs/payments/overview.md — Webhook Verification:
   *   POST body: data=...&signature=...
   *   expected = Base64(SHA1(private_key + data + private_key))
   */
  async verifyWebhook(headers: Record<string, string>, body: Buffer): Promise<WebhookPayload> {
    // Parse URL-encoded body: data=...&signature=...
    const bodyStr = body.toString('utf8');
    const params = new URLSearchParams(bodyStr);
    const data = params.get('data');
    const signature = params.get('signature');

    if (!data || !signature) {
      throw new Error('Missing data or signature in LiqPay webhook');
    }

    // Verify signature
    const expectedSignature = this.sign(data);
    if (signature !== expectedSignature) {
      throw new Error('Invalid LiqPay webhook signature');
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));

    // Map LiqPay status to our format
    let status: 'success' | 'failure' | 'processing';
    switch (payload.status) {
      case 'success':
      case 'sandbox':
        status = 'success';
        break;
      case 'failure':
      case 'error':
      case 'reversed':
        status = 'failure';
        break;
      default:
        status = 'processing';
    }

    return {
      providerPaymentId: payload.payment_id?.toString() || payload.order_id,
      status,
      orderId: payload.order_id || '',
      amountKopecks: Math.round((payload.amount || 0) * 100),
      cardToken: payload.card_token || undefined,
      cardLastFour: payload.sender_card_mask2 ? payload.sender_card_mask2.slice(-4) : undefined,
    };
  }

  /**
   * Charge a saved card token (recurring payment).
   * docs/payments/overview.md — POST /api/request { action: 'pay', card_token }
   */
  async chargeToken(params: ChargeTokenParams): Promise<ChargeResult> {
    const paymentData = {
      action: 'pay',
      version: 3,
      public_key: this.publicKey,
      amount: params.amountKopecks / 100,
      currency: 'UAH',
      description: params.description,
      order_id: params.orderId,
      card_token: params.cardToken,
    };

    const data = this.encodeData(paymentData);
    const signature = this.sign(data);

    const response = await fetch(`${this.baseUrl}/api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`LiqPay charge token failed: ${response.status} ${errorText}`);
      return {
        providerPaymentId: '',
        status: 'failure',
        errorMessage: `LiqPay API error: ${response.status}`,
      };
    }

    const result = await response.json();

    return {
      providerPaymentId: result.payment_id?.toString() || '',
      status: result.status === 'success' || result.status === 'sandbox' ? 'success' : 'failure',
      errorMessage:
        result.status !== 'success' && result.status !== 'sandbox'
          ? result.err_description || result.status
          : undefined,
    };
  }

  // ─── Private Helpers ───

  /**
   * Encode data as Base64 JSON.
   * docs/payments/overview.md — data = Base64(JSON payload)
   */
  private encodeData(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Sign data with SHA1.
   * docs/payments/overview.md — signature = Base64(SHA1(private_key + data + private_key))
   */
  private sign(data: string): string {
    return createHash('sha1')
      .update(this.privateKey + data + this.privateKey)
      .digest('base64');
  }
}
