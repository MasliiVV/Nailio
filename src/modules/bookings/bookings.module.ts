// docs/backlog.md #44-#50 — Booking system module

import { Module, forwardRef } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { ScheduleModule } from '../schedule/schedule.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceModule } from '../finance/finance.module';
import { RebookingModule } from '../rebooking/rebooking.module';

@Module({
  imports: [ScheduleModule, NotificationsModule, forwardRef(() => FinanceModule), RebookingModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
