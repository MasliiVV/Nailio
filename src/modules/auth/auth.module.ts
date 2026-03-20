// docs/api/authentication.md — Telegram initData → HMAC-SHA256 → JWT
// docs/backlog.md #15-#19

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TelegramAuthService } from './telegram-auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TenantsModule } from '../tenants/tenants.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>('JWT_ACCESS_TTL', 3600),
        },
      }),
    }),
    TenantsModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, TelegramAuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
