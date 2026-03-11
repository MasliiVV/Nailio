// docs/telegram/bot-architecture.md — Bot infrastructure
// docs/backlog.md #22-#28 — Bot CRUD, webhooks, commands

import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotCryptoService } from './bot-crypto.service';
import { WebhookController } from './webhook.controller';
import { BotController } from './bot.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [BotController, WebhookController],
  providers: [BotService, BotCryptoService],
  exports: [BotService, BotCryptoService],
})
export class TelegramModule {}
