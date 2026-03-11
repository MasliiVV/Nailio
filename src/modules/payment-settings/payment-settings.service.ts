// docs/payments/overview.md — Payment Settings (per tenant)
// docs/backlog.md #69 — Payment settings (master's own Mono/LiqPay)
// docs/api/endpoints.md — Payment Settings API
//
// GET    /api/v1/payment-settings → Current settings
// POST   /api/v1/payment-settings → Connect Mono/LiqPay
// DELETE /api/v1/payment-settings → Disconnect

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BotCryptoService } from '../telegram/bot-crypto.service';
import { ConnectPaymentSettingsDto } from './dto/payment-settings.dto';

@Injectable()
export class PaymentSettingsService {
  private readonly logger = new Logger(PaymentSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botCrypto: BotCryptoService,
  ) {}

  /**
   * Get current payment settings for tenant.
   * docs/api/endpoints.md — GET /api/v1/payment-settings
   */
  async getSettings(tenantId: string) {
    const settings = await this.prisma.paymentSetting.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      return null;
    }

    return {
      id: settings.id,
      provider: settings.provider,
      isActive: settings.isActive,
      hasApiToken: !!settings.apiTokenEncrypted,
      hasApiSecret: !!settings.apiSecretEncrypted,
      createdAt: settings.createdAt,
    };
  }

  /**
   * Connect payment provider (encrypt + store credentials).
   * docs/payments/overview.md — Security Note:
   *   Credentials encrypted with separate key
   *   Decrypted only at payment creation time
   *   Platform NEVER touches client money
   */
  async connect(tenantId: string, dto: ConnectPaymentSettingsDto) {
    const apiTokenEncrypted = this.botCrypto.encrypt(dto.apiToken);
    const apiSecretEncrypted = dto.apiSecret ? this.botCrypto.encrypt(dto.apiSecret) : null;

    const settings = await this.prisma.paymentSetting.upsert({
      where: { tenantId },
      update: {
        provider: dto.provider,
        apiTokenEncrypted,
        apiSecretEncrypted,
        isActive: true,
      },
      create: {
        tenantId,
        provider: dto.provider,
        apiTokenEncrypted,
        apiSecretEncrypted,
        isActive: true,
      },
    });

    this.logger.log(`Payment settings connected: tenant=${tenantId}, provider=${dto.provider}`);

    return {
      id: settings.id,
      provider: settings.provider,
      isActive: settings.isActive,
    };
  }

  /**
   * Disconnect payment provider (delete settings).
   * docs/api/endpoints.md — DELETE /api/v1/payment-settings
   */
  async disconnect(tenantId: string) {
    const settings = await this.prisma.paymentSetting.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      throw new NotFoundException('Payment settings not found');
    }

    await this.prisma.paymentSetting.delete({
      where: { tenantId },
    });

    this.logger.log(`Payment settings disconnected: tenant=${tenantId}`);
  }

  /**
   * Get decrypted credentials for creating client payments.
   * Called internally by ClientPaymentService.
   */
  async getDecryptedCredentials(tenantId: string) {
    const settings = await this.prisma.paymentSetting.findUnique({
      where: { tenantId },
    });

    if (!settings || !settings.isActive) {
      return null;
    }

    return {
      provider: settings.provider,
      apiToken: this.botCrypto.decrypt(settings.apiTokenEncrypted),
      apiSecret: settings.apiSecretEncrypted
        ? this.botCrypto.decrypt(settings.apiSecretEncrypted)
        : null,
    };
  }
}
