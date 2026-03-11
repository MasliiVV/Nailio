// docs/payments/overview.md — Provider Resolution (PaymentProviderFactory)
// docs/backlog.md #61 — Strategy Pattern abstraction

import { Injectable } from '@nestjs/common';
import { PaymentProvider } from './payment-provider.interface';
import { MonobankProvider } from './monobank.provider';
import { LiqPayProvider } from './liqpay.provider';

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly monobankProvider: MonobankProvider,
    private readonly liqpayProvider: LiqPayProvider,
  ) {}

  /**
   * Get payment provider by type.
   * docs/payments/overview.md — Provider Resolution
   */
  getProvider(providerType: 'monobank' | 'liqpay'): PaymentProvider {
    switch (providerType) {
      case 'monobank':
        return this.monobankProvider;
      case 'liqpay':
        return this.liqpayProvider;
      default:
        throw new Error(`Unknown payment provider: ${providerType}`);
    }
  }
}
