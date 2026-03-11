// docs/backlog.md #31-#32 — Onboarding wizard API, checklist

import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { TenantsModule } from '../tenants/tenants.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ServicesModule } from '../services/services.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [TenantsModule, TelegramModule, ServicesModule, ScheduleModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
