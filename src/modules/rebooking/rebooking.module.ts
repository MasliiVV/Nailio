import { Module } from '@nestjs/common';
import { RebookingController } from './rebooking.controller';
import { RebookingService } from './rebooking.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ScheduleModule, TelegramModule],
  controllers: [RebookingController],
  providers: [RebookingService],
  exports: [RebookingService],
})
export class RebookingModule {}
