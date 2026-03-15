// docs/telegram/bot-architecture.md — Bot infrastructure
// docs/backlog.md #22-#28 — Bot CRUD, webhooks, commands

import { Module, forwardRef } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotCryptoService } from './bot-crypto.service';
import { WebhookController } from './webhook.controller';
import { BotController } from './bot.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramApiService } from './telegram-api.service';
import { ConversationStateService } from './conversation-state.service';

@Module({
  imports: [TenantsModule, forwardRef(() => NotificationsModule)],
  controllers: [BotController, WebhookController],
  providers: [BotService, BotCryptoService, TelegramApiService, ConversationStateService],
  exports: [BotService, BotCryptoService, TelegramApiService, ConversationStateService],
})
export class TelegramModule {}
