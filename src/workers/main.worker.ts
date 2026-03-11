/**
 * BullMQ Worker entrypoint
 * Runs as a separate process for background job processing:
 * - Notifications (booking confirmations, reminders, cancellations)
 * - Subscription billing (charge, retry, expire)
 * - Analytics aggregation (daily stats)
 *
 * Usage: node dist/workers/main.worker.js
 * Docker: docker-compose service "worker"
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  logger.log('Nailio BullMQ Worker started', 'Worker');

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, shutting down worker...`, 'Worker');
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
