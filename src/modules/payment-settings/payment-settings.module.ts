// docs/backlog.md #69-#70 — Payment Settings + Client Payment Module
import { Module } from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentSettingsController } from './payment-settings.controller';
import { ClientPaymentService } from './client-payment.service';
import { ClientPaymentController } from './client-payment.controller';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [PaymentSettingsController, ClientPaymentController],
  providers: [PaymentSettingsService, ClientPaymentService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
