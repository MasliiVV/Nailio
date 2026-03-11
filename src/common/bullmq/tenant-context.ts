// docs/architecture/multi-tenancy.md — BullMQ Worker Tenant Context
// docs/backlog.md #14 — BullMQ worker tenant context handling
//
// Workers run outside HTTP request lifecycle.
// Must explicitly set tenant context via CLS before processing jobs.
//
// Usage:
//   Job data must include { tenantId: string, ... }
//   Worker processor sets CLS context → Prisma queries auto-filter by tenant_id

import { Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService, TENANT_ID_KEY } from '../../prisma/prisma.service';
import { Job } from 'bullmq';

/**
 * Base interface for all tenant-scoped job data.
 * Every BullMQ job must include tenantId.
 */
export interface TenantJobData {
  tenantId: string;
  [key: string]: unknown;
}

/**
 * Wraps a BullMQ job processor with tenant context injection.
 * Sets tenant_id in CLS (AsyncLocalStorage) before processing,
 * so all PrismaService queries are automatically tenant-scoped.
 *
 * docs/architecture/multi-tenancy.md — BullMQ Worker Tenant Context:
 *   Job data: { tenant_id, booking_id, ... }
 *   Worker picks up job → CLS.set('tenant_id', job.data.tenant_id)
 *   → Process job (Prisma queries auto-filter) → Clear context
 */
export function withTenantContext<T extends TenantJobData>(
  cls: ClsService,
  logger: Logger,
  handler: (job: Job<T>) => Promise<void>,
) {
  return async (job: Job<T>): Promise<void> => {
    const tenantId = job.data.tenantId;

    if (!tenantId) {
      logger.error(
        `Job ${job.id} (${job.name}) missing tenantId in job data`,
      );
      throw new Error('Job data must include tenantId');
    }

    // Run within CLS context so PrismaService.tenantClient auto-scopes queries
    return cls.run(async () => {
      cls.set(TENANT_ID_KEY, tenantId);
      logger.debug(
        `Processing job ${job.id} (${job.name}) for tenant ${tenantId}`,
      );

      try {
        await handler(job);
      } catch (error) {
        logger.error(
          `Job ${job.id} (${job.name}) failed for tenant ${tenantId}: ${error}`,
        );
        throw error;
      }
    });
  };
}

/**
 * Queue names used across the application.
 * Centralized to avoid typos.
 */
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  SUBSCRIPTIONS: 'subscriptions',
} as const;

/**
 * Notification job data interface.
 * Phase 3: Used by notification workers.
 */
export interface NotificationJobData extends TenantJobData {
  bookingId: string;
  clientId: string;
  type: 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'cancellation' | 'reschedule' | 'new_booking';
}

/**
 * Analytics aggregation job data interface.
 * Phase 4: Used by analytics workers.
 */
export interface AnalyticsJobData extends TenantJobData {
  date: string; // "YYYY-MM-DD"
}
