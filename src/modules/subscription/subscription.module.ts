// docs/payments/overview.md — Subscription Module
// docs/backlog.md #57-#71 — Subscription & Payments

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionProcessor } from './subscription.processor';
import { WebhookController } from './webhook.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { PaymentProviderFactory } from './providers/payment-provider.factory';
import { MonobankProvider } from './providers/monobank.provider';
import { LiqPayProvider } from './providers/liqpay.provider';
import { TelegramModule } from '../telegram/telegram.module';
import { QUEUE_NAMES } from '../../common/bullmq/tenant-context';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SUBSCRIPTIONS }),
    TelegramModule,
  ],
  controllers: [SubscriptionController, WebhookController],
  providers: [
    SubscriptionService,
    SubscriptionProcessor,
    ExchangeRateService,
    PaymentProviderFactory,
    MonobankProvider,
    LiqPayProvider,
  ],
  exports: [SubscriptionService, ExchangeRateService],
})
export class SubscriptionModule {}
