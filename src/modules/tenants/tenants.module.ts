// docs/backlog.md #102 — Tenant settings API (GET/PUT)
// docs/api/endpoints.md — Tenant Settings endpoints

import { Module, forwardRef } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TenantsService } from './tenants.service';
import { TenantsController, AdminTenantsController } from './tenants.controller';

@Module({
  imports: [forwardRef(() => AdminModule), forwardRef(() => TelegramModule)],
  controllers: [TenantsController, AdminTenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
