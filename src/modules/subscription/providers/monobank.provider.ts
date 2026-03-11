// docs/payments/overview.md — Monobank Provider
// docs/backlog.md #62 — MonobankProvider implementation
//
// API:
//   POST /api/merchant/invoice/create → hosted page
//   GET  /api/merchant/invoice/status?invoiceId=X → status
//   POST /api/merchant/wallet/payment → charge saved token (recurring)
//   GET  /api/merchant/pubkey → ECDSA public key for webhook verification
//
// Auth: Header X-Token: {merchant_token}
// Webhook: X-Sign header → ECDSA SHA256 verification

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createVerify } from 'crypto';
import Redis from 'ioredis';
import {
  PaymentProvider,
  CreatePaymentParams,
  PaymentResult,
  WebhookPayload,
  ChargeTokenParams,
  ChargeResult,
} from './payment-provider.interface';

@Injectable()
export class MonobankProvider implements PaymentProvider {
  readonly name = 'monobank' as const;
  private readonly logger = new Logger(MonobankProvider.name);
  private readonly merchantToken: string;
  private readonly baseUrl = 'https://api.monobank.ua';
  private readonly redis: Redis;

  // docs/payments/overview.md — Public key cached 24h
  private readonly PUBKEY_CACHE_KEY = 'monobank:pubkey';
  private readonly PUBKEY_CACHE_TTL = 86400; // 24h

  constructor(private readonly configService: ConfigService) {
    this.merchantToken = this.configService.get<string>('MONOBANK_MERCHANT_TOKEN', '');
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  /**
   * Create payment via Monobank hosted page.
   * docs/payments/overview.md — POST /api/merchant/invoice/create
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const body: Record<string, unknown> = {
      amount: params.amountKopecks,
      ccy: 980, // UAH (ISO 4217)
      merchantPaymInfo: {
        reference: params.orderId,
        destination: params.description,
      },
      redirectUrl: params.redirectUrl,
      webHookUrl: params.webhookUrl,
    };

    // docs/payments/overview.md — Card Tokenization Flow
    if (params.saveCard && params.walletId) {
      body.saveCardData = {
        saveCard: true,
        walletId: params.walletId,
      };
    }

    const response = await fetch(`${this.baseUrl}/api/merchant/invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': this.merchantToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Monobank create payment failed: ${response.status} ${errorText}`);
      throw new Error(`Monobank API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      paymentUrl: data.pageUrl,
      providerPaymentId: data.invoiceId,
    };
  }

  /**
   * Verify Monobank webhook signature (ECDSA with SHA256).
   * docs/payments/overview.md — Webhook Verification:
   *   Header: X-Sign: {ECDSA signature of body}
   *   Verify with public key (GET /api/merchant/pubkey, cached 24h)
   */
  async verifyWebhook(headers: Record<string, string>, body: Buffer): Promise<WebhookPayload> {
    const signature = headers['x-sign'];
    if (!signature) {
      throw new Error('Missing X-Sign header');
    }

    // Get public key (cached)
    const publicKey = await this.getPublicKey();

    // Verify ECDSA signature
    const verify = createVerify('SHA256');
    verify.update(body);
    verify.end();

    const isValid = verify.verify(
      {
        key: publicKey,
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(signature, 'base64'),
    );

    if (!isValid) {
      throw new Error('Invalid Monobank webhook signature');
    }

    const payload = JSON.parse(body.toString('utf8'));

    // Map Monobank status to our format
    let status: 'success' | 'failure' | 'processing';
    switch (payload.status) {
      case 'success':
        status = 'success';
        break;
      case 'failure':
      case 'reversed':
        status = 'failure';
        break;
      default:
        status = 'processing';
    }

    return {
      providerPaymentId: payload.invoiceId,
      status,
      orderId: payload.reference || '',
      amountKopecks: payload.amount,
      cardToken: payload.walletId || undefined,
      cardLastFour: payload.pan ? payload.pan.slice(-4) : undefined,
    };
  }

  /**
   * Charge a saved card token (recurring payment).
   * docs/payments/overview.md — POST /api/merchant/wallet/payment
   */
  async chargeToken(params: ChargeTokenParams): Promise<ChargeResult> {
    const response = await fetch(`${this.baseUrl}/api/merchant/wallet/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': this.merchantToken,
      },
      body: JSON.stringify({
        walletId: params.cardToken,
        amount: params.amountKopecks,
        ccy: 980,
        merchantPaymInfo: {
          reference: params.orderId,
          destination: params.description,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Monobank charge token failed: ${response.status} ${errorText}`);
      return {
        providerPaymentId: '',
        status: 'failure',
        errorMessage: `Monobank API error: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();

    return {
      providerPaymentId: data.invoiceId || data.trnId || '',
      status: data.status === 'success' ? 'success' : 'failure',
      errorMessage: data.status !== 'success' ? data.errText : undefined,
    };
  }

  /**
   * Get Monobank public key for webhook verification.
   * docs/payments/overview.md — GET /api/merchant/pubkey (cached 24h)
   */
  private async getPublicKey(): Promise<string> {
    const cached = await this.redis.get(this.PUBKEY_CACHE_KEY);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/api/merchant/pubkey`, {
      headers: { 'X-Token': this.merchantToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Monobank public key: ${response.status}`);
    }

    const data = await response.json();
    const pubKey = data.key;

    await this.redis.setex(this.PUBKEY_CACHE_KEY, this.PUBKEY_CACHE_TTL, pubKey);

    return pubKey;
  }
}
