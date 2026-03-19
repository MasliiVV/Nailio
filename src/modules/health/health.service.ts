// docs/backlog.md #7 — Health check endpoint
// Checks: PostgreSQL, Redis, Worker status

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../../common/bullmq/tenant-context';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'ok' | 'down';
  latencyMs?: number;
  error?: string;
}

interface QueueMetric {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface HealthMetrics {
  timestamp: string;
  uptimeSeconds: number;
  process: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
  };
  checks: HealthStatus['checks'];
  redis: {
    usedMemoryBytes?: number;
    connectedClients?: number;
  };
  queues: {
    notifications: QueueMetric;
    subscriptions: QueueMetric;
  };
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly redis: Redis;
  private readonly startTime = Date.now();
  private readonly notificationsQueue: Queue;
  private readonly subscriptionsQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
    const queueConnection = this.buildQueueConnection(redisUrl);
    this.notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection: queueConnection,
    });
    this.subscriptionsQueue = new Queue(QUEUE_NAMES.SUBSCRIPTIONS, {
      connection: queueConnection,
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.redis.quit(),
      this.notificationsQueue.close(),
      this.subscriptionsQueue.close(),
    ]);
  }

  async check(): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const allOk = database.status === 'ok' && redis.status === 'ok';
    const allDown = database.status === 'down' && redis.status === 'down';

    return {
      status: allOk ? 'ok' : allDown ? 'down' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database,
        redis,
      },
    };
  }

  async metrics(): Promise<HealthMetrics> {
    const [health, redisInfo, notifications, subscriptions] = await Promise.all([
      this.check(),
      this.getRedisMetrics(),
      this.getQueueMetrics(this.notificationsQueue),
      this.getQueueMetrics(this.subscriptionsQueue),
    ]);

    const memoryUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      process: {
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        heapTotalBytes: memoryUsage.heapTotal,
        externalBytes: memoryUsage.external,
      },
      checks: health.checks,
      redis: redisInfo,
      queues: {
        notifications,
        subscriptions,
      },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async getRedisMetrics() {
    try {
      const info = await this.redis.info('memory');
      const clients = await this.redis.info('clients');

      return {
        usedMemoryBytes: this.extractRedisInfoNumber(info, 'used_memory'),
        connectedClients: this.extractRedisInfoNumber(clients, 'connected_clients'),
      };
    } catch (error) {
      this.logger.error('Redis metrics collection failed', error);
      return {};
    }
  }

  private async getQueueMetrics(queue: Queue): Promise<QueueMetric> {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      delayed: counts.delayed || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
    };
  }

  private extractRedisInfoNumber(info: string, key: string) {
    const line = info
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${key}:`));

    if (!line) {
      return undefined;
    }

    const value = Number(line.split(':')[1]);
    return Number.isFinite(value) ? value : undefined;
  }

  private buildQueueConnection(redisUrl: string) {
    const parsed = new URL(redisUrl);

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0,
    };
  }
}
