// docs/backlog.md #52-#56 — Clients CRM module

import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TelegramModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
