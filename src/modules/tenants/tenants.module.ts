// docs/backlog.md #102 — Tenant settings API (GET/PUT)
// docs/api/endpoints.md — Tenant Settings endpoints

import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
