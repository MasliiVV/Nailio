// docs/backlog.md #72-#80 — Notifications module
// BullMQ queue registration + service + processor

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { TelegramModule } from '../telegram/telegram.module';
import { QUEUE_NAMES } from '../../common/bullmq/tenant-context';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.NOTIFICATIONS,
    }),
    TelegramModule, // For BotCryptoService
  ],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
