// docs/payments/overview.md — Payment Settings (per tenant, for client payments)
// docs/backlog.md #69 — Payment settings (master's own Mono/LiqPay)
// docs/api/endpoints.md — Payment Settings API
//
// Master connects their own Monobank or LiqPay merchant account
// Credentials encrypted with BOT_TOKEN_ENCRYPTION_KEY (same AES-256-GCM)
// Platform NEVER touches client money — all goes directly to master's account

import { IsIn, IsString, IsOptional } from 'class-validator';

export class ConnectPaymentSettingsDto {
  @IsIn(['monobank', 'liqpay'])
  provider!: 'monobank' | 'liqpay';

  /** Monobank: X-Token, LiqPay: public_key */
  @IsString()
  apiToken!: string;

  /** LiqPay: private_key (not needed for Monobank) */
  @IsOptional()
  @IsString()
  apiSecret?: string;
}
