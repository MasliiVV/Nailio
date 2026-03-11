// docs/payments/overview.md — Subscription DTOs
// docs/api/endpoints.md — Subscription API

import { IsIn, IsOptional, IsString } from 'class-validator';

export class SubscriptionCheckoutDto {
  @IsIn(['monobank', 'liqpay'])
  provider!: 'monobank' | 'liqpay';
}

export class SubscriptionCancelDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateCardDto {
  @IsIn(['monobank', 'liqpay'])
  provider!: 'monobank' | 'liqpay';
}
