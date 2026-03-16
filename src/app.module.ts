import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { ServicesModule } from './modules/services/services.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { HealthModule } from './modules/health/health.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ClientsModule } from './modules/clients/clients.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RebookingModule } from './modules/rebooking/rebooking.module';
import { FinanceModule } from './modules/finance/finance.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { PaymentSettingsModule } from './modules/payment-settings/payment-settings.module';
import configuration from './config/configuration';
import { validate } from './config/env.validation';

const nodeEnv = (process.env as Record<string, string | undefined>).NODE_ENV;

@Module({
  imports: [
    // ─── Configuration (docs/backlog.md #5) ───
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),

    // ─── Structured Logging (docs/architecture/overview.md — Pino) ───
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          nodeEnv !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        level: nodeEnv !== 'production' ? 'debug' : 'info',
        autoLogging: true,
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
          }),
        },
      },
    }),

    // ─── AsyncLocalStorage (docs/backlog.md #10, docs/architecture/multi-tenancy.md) ───
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),

    // ─── Rate Limiting (docs/security/overview.md — @nestjs/throttler) ───
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 30,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ─── BullMQ (docs/architecture/overview.md — Redis + BullMQ) ───
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.getOrThrow<string>('REDIS_URL')).hostname,
          port: parseInt(new URL(config.getOrThrow<string>('REDIS_URL')).port || '6379'),
          password: new URL(config.getOrThrow<string>('REDIS_URL')).password || undefined,
        },
      }),
    }),

    // ─── Modules ───
    PrismaModule,
    AuthModule,
    TenantsModule,
    TelegramModule,
    ServicesModule,
    ScheduleModule,
    HealthModule,
    OnboardingModule,
    BookingsModule,
    ProfileModule,
    ClientsModule,
    NotificationsModule,
    AnalyticsModule,
    RebookingModule,
    FinanceModule,
    SubscriptionModule,
    PaymentSettingsModule,
  ],
})
export class AppModule {}
