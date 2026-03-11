// docs/api/authentication.md — Full auth flow
// docs/backlog.md #15-#18 — Auth service
// docs/security/overview.md — JWT Security

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramAuthService, ValidatedInitData } from './telegram-auth.service';
import { TenantsService } from '../tenants/tenants.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { TelegramAuthDto, AuthResponseDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;
  private readonly refreshTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly telegramAuth: TelegramAuthService,
    private readonly tenantsService: TenantsService,
  ) {
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
    this.refreshTtl = this.configService.get<number>('JWT_REFRESH_TTL', 2592000); // 30 days
  }

  /**
   * Authenticate via Telegram initData
   * docs/api/authentication.md — Auth Flow Diagram
   */
  async authenticateTelegram(dto: TelegramAuthDto): Promise<AuthResponseDto> {
    // Step 1: Determine bot token for validation
    const botToken = await this.resolveBotToken(dto.botId);

    // Step 2: Validate initData (HMAC-SHA256)
    const validatedData = this.telegramAuth.validate(dto.initData, botToken);

    // Step 3: Find or create user
    const user = await this.findOrCreateUser(validatedData);

    // Step 4: Resolve role and tenant
    const { role, tenantId, clientId } = await this.resolveRoleAndTenant(
      user.id,
      validatedData,
      dto.botId,
      dto.startParam,
    );

    // Step 5: Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      telegramId: Number(user.telegramId),
      role,
      tenantId,
      clientId,
    };

    return this.generateTokens(payload, validatedData);
  }

  /**
   * Refresh access token
   * docs/security/overview.md — Refresh rotation: single-use
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    // Check if refresh token exists in Redis
    const payloadStr = await this.redis.get(`refresh:${refreshToken}`);
    if (!payloadStr) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete used refresh token (single-use rotation)
    await this.redis.del(`refresh:${refreshToken}`);

    const payload = JSON.parse(payloadStr) as JwtPayload;

    // Generate new token pair
    return this.generateTokens(payload);
  }

  /**
   * Revoke refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.redis.del(`refresh:${refreshToken}`);
  }

  // ─── Private Methods ───

  private async resolveBotToken(botId?: string): Promise<string> {
    if (!botId) {
      // Platform bot
      return this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN');
    }

    // Tenant bot — find by bot_id
    const bot = await this.prisma.bot.findFirst({
      where: { botId: BigInt(botId) },
    });

    if (!bot) {
      throw new UnauthorizedException('Bot not found');
    }

    // Decrypt bot token (delegated to TelegramModule in the future)
    // For now, we need to decrypt from bot.botTokenEncrypted
    // This will be properly handled by BotService.decryptToken()
    throw new UnauthorizedException('Bot token resolution requires BotService');
  }

  private async findOrCreateUser(data: ValidatedInitData) {
    const { user: tgUser } = data;

    let user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId: BigInt(tgUser.id),
          languageCode: tgUser.language_code || 'uk',
        },
      });
      this.logger.log(`New user created: telegram_id=${tgUser.id}`);
    }

    return user;
  }

  /**
   * docs/api/authentication.md — Role Resolution Flow
   * docs/security/permissions.md — Role Resolution Flow
   */
  private async resolveRoleAndTenant(
    userId: string,
    data: ValidatedInitData,
    botId?: string,
    _startParam?: string,
  ): Promise<{ role: 'master' | 'client'; tenantId: string | null; clientId?: string }> {
    // Platform bot → user is master (or becoming one)
    if (!botId) {
      const master = await this.prisma.master.findFirst({
        where: { userId },
      });

      if (master) {
        return { role: 'master', tenantId: master.tenantId };
      }

      // New master — create tenant + master record
      const slug = await this.tenantsService.generateUniqueSlug(data.user.first_name);

      const tenant = await this.prisma.tenant.create({
        data: {
          slug,
          displayName: `${data.user.first_name}${data.user.last_name ? ' ' + data.user.last_name : ''}`,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days trial
        },
      });

      await this.prisma.master.create({
        data: {
          tenantId: tenant.id,
          userId,
          firstName: data.user.first_name,
          lastName: data.user.last_name || null,
        },
      });

      // Create trial subscription (docs/payments/subscription-lifecycle.md)
      await this.prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          status: 'trial',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      this.logger.log(`New master tenant created: slug=${slug}`);
      return { role: 'master', tenantId: tenant.id };
    }

    // Tenant bot → user is client
    const bot = await this.prisma.bot.findFirst({
      where: { botId: BigInt(botId) },
    });

    if (!bot) {
      throw new UnauthorizedException('Bot not found');
    }

    // Find or create client record
    let client = await this.prisma.client.findFirst({
      where: { tenantId: bot.tenantId, userId },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          tenantId: bot.tenantId,
          userId,
          firstName: data.user.first_name,
          lastName: data.user.last_name || null,
        },
      });
      this.logger.log(`New client created: tenant=${bot.tenantId}, telegram_id=${data.user.id}`);
    }

    return { role: 'client', tenantId: bot.tenantId, clientId: client.id };
  }

  private async generateTokens(
    payload: JwtPayload,
    _validatedData?: ValidatedInitData,
  ): Promise<AuthResponseDto> {
    // Access token (1h)
    const accessToken = this.jwtService.sign({
      sub: payload.sub,
      telegramId: payload.telegramId,
      role: payload.role,
      tenantId: payload.tenantId,
      clientId: payload.clientId,
    });

    // Refresh token (30d, stored in Redis)
    const refreshToken = uuidv4();
    await this.redis.setex(`refresh:${refreshToken}`, this.refreshTtl, JSON.stringify(payload));

    // Fetch user info for response
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    const master =
      payload.role === 'master' && payload.tenantId
        ? await this.prisma.master.findFirst({ where: { userId: payload.sub } })
        : null;

    const client =
      payload.role === 'client' && payload.clientId
        ? await this.prisma.client.findUnique({ where: { id: payload.clientId } })
        : null;

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<number>('JWT_ACCESS_TTL', 3600),
      user: {
        id: payload.sub,
        telegramId: payload.telegramId,
        role: payload.role,
        tenantId: payload.tenantId,
        firstName: master?.firstName || client?.firstName || user?.languageCode,
        lastName: master?.lastName || client?.lastName || undefined,
      },
    };
  }
}
