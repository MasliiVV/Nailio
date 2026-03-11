// docs/architecture/multi-tenancy.md — PrismaService + tenant extension
// docs/architecture/decisions/003-no-rls.md — Prisma Client Extension instead of RLS
// docs/backlog.md #11 — Prisma Client Extension (auto tenant_id filter)

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

// Tenant context key for AsyncLocalStorage
export const TENANT_ID_KEY = 'tenantId';

// Models that have tenant_id column (all except 'users')
const TENANT_SCOPED_MODELS: string[] = [
  'tenant',
  'master',
  'bot',
  'client',
  'service',
  'workingHour',
  'workingHourOverride',
  'booking',
  'transaction',
  'notification',
  'subscription',
  'subscriptionPayment',
  'paymentSetting',
  'analyticsDaily',
  'auditLog',
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly cls: ClsService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Get tenant-scoped Prisma client.
   * Automatically adds WHERE tenant_id = X to all queries on tenant-scoped models.
   *
   * docs/architecture/multi-tenancy.md — Prisma Client Extension + AsyncLocalStorage
   */
  get tenantClient(): PrismaClient {
    const tenantId = this.cls.get<string>(TENANT_ID_KEY);

    if (!tenantId) {
      return this; // No tenant context — return unscoped client (for global operations)
    }

    return this.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }: { model: string; args: any; query: any }) {
            if (TENANT_SCOPED_MODELS.includes(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async findFirst({ model, args, query }: { model: string; args: any; query: any }) {
            if (TENANT_SCOPED_MODELS.includes(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async findUnique({ model, args, query }: { model: string; args: any; query: any }) {
            // findUnique doesn't support arbitrary where, so use as-is
            // Tenant check happens at service/guard level for unique queries
            return query(args);
          },
          async create({ model, args, query }: { model: string; args: any; query: any }) {
            if (TENANT_SCOPED_MODELS.includes(model)) {
              (args.data as Record<string, unknown>).tenantId = tenantId;
            }
            return query(args);
          },
          async update({ model, args, query }: { model: string; args: any; query: any }) {
            // Verify ownership is done at service/guard level
            return query(args);
          },
          async delete({ model, args, query }: { model: string; args: any; query: any }) {
            return query(args);
          },
          async count({ model, args, query }: { model: string; args: any; query: any }) {
            if (TENANT_SCOPED_MODELS.includes(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async aggregate({ model, args, query }: { model: string; args: any; query: any }) {
            if (TENANT_SCOPED_MODELS.includes(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  /**
   * Set tenant context in AsyncLocalStorage
   */
  setTenantId(tenantId: string) {
    this.cls.set(TENANT_ID_KEY, tenantId);
  }

  /**
   * Get current tenant ID from AsyncLocalStorage
   */
  getTenantId(): string | undefined {
    return this.cls.get<string>(TENANT_ID_KEY);
  }
}
