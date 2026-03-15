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
import { BotCryptoService } from '../telegram/bot-crypto.service';

type AuthRole = 'master' | 'client' | 'platform_admin';

interface RefreshSessionProfile {
  firstName: string;
  lastName: string | null;
}

interface RefreshSessionPayload extends JwtPayload {
  profile?: RefreshSessionProfile;
}

interface BotValidationCandidate {
  token: string;
  botId?: string;
  startParam?: string;
}

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
    private readonly botCrypto: BotCryptoService,
  ) {
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
    this.refreshTtl = this.configService.get<number>('JWT_REFRESH_TTL', 2592000); // 30 days
  }

  /**
   * Authenticate via Telegram initData
   * docs/api/authentication.md — Auth Flow Diagram
   */
  async authenticateTelegram(dto: TelegramAuthDto): Promise<AuthResponseDto> {
    const candidates = await this.resolveBotValidationCandidates(dto.botId, dto.startParam);

    let validatedData: ValidatedInitData | null = null;
    let matchedCandidate: BotValidationCandidate | null = null;

    for (const candidate of candidates) {
      try {
        validatedData = this.telegramAuth.validate(dto.initData, candidate.token);
        matchedCandidate = candidate;
        break;
      } catch (error) {
        if (
          error instanceof UnauthorizedException &&
          error.message === 'Invalid initData signature'
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!validatedData) {
      throw new UnauthorizedException('Invalid initData signature');
    }

    // Step 3: Find or create user
    const user = await this.findOrCreateUser(validatedData);

    // Step 4: Resolve role and tenant
    const { role, tenantId, clientId } = await this.resolveRoleAndTenant(
      user.id,
      validatedData,
      dto.botId || matchedCandidate?.botId,
      dto.startParam || matchedCandidate?.startParam,
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

    const payload = JSON.parse(payloadStr) as RefreshSessionPayload;

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

  private async resolveBotValidationCandidates(
    botId?: string,
    startParam?: string,
  ): Promise<BotValidationCandidate[]> {
    if (botId) {
      const bot = await this.prisma.bot.findFirst({
        where: { botId: BigInt(botId) },
      });

      if (!bot) {
        throw new UnauthorizedException('Bot not found');
      }

      return [
        {
          botId,
          token: await this.botCrypto.getCachedToken(bot.id, Buffer.from(bot.botTokenEncrypted)),
        },
      ];
    }

    if (startParam) {
      const tenant = await this.tenantsService.findBySlug(startParam);
      if (tenant) {
        const tenantBot = await this.prisma.bot.findFirst({
          where: { tenantId: tenant.id, isActive: true },
        });

        if (!tenantBot) {
          throw new UnauthorizedException('Bot not found');
        }

        return [
          {
            botId: tenantBot.botId.toString(),
            startParam,
            token: await this.botCrypto.getCachedToken(
              tenantBot.id,
              Buffer.from(tenantBot.botTokenEncrypted),
            ),
          },
        ];
      }
    }

    const candidates: BotValidationCandidate[] = [
      { token: this.configService.getOrThrow<string>('PLATFORM_BOT_TOKEN') },
    ];

    const bots = await this.prisma.bot.findMany({
      where: { isActive: true },
      include: { tenant: true },
    });

    for (const bot of bots) {
      candidates.push({
        botId: bot.botId.toString(),
        startParam: bot.tenant.slug,
        token: await this.botCrypto.getCachedToken(bot.id, Buffer.from(bot.botTokenEncrypted)),
      });
    }

    return candidates;
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
    startParam?: string,
  ): Promise<{ role: AuthRole; tenantId: string | null; clientId?: string }> {
    if (botId || startParam) {
      const bot = botId
        ? await this.prisma.bot.findFirst({
            where: { botId: BigInt(botId) },
          })
        : await this.prisma.bot.findFirst({
            where: {
              tenant: {
                slug: startParam,
              },
              isActive: true,
            },
          });

      if (bot) {
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
          this.logger.log(
            `New client created: tenant=${bot.tenantId}, telegram_id=${data.user.id}`,
          );
        }

        return { role: 'client', tenantId: bot.tenantId, clientId: client.id };
      }
    }

    // Platform bot → platform admin or master onboarding flow
    if (!botId) {
      if (this.isPlatformAdmin(data)) {
        return { role: 'platform_admin', tenantId: null };
      }

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

    throw new UnauthorizedException('Bot not found');
  }

  private async generateTokens(
    payload: RefreshSessionPayload,
    validatedData?: ValidatedInitData,
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
    const sessionPayload: RefreshSessionPayload = {
      ...payload,
      profile: validatedData?.user
        ? {
            firstName: validatedData.user.first_name,
            lastName: validatedData.user.last_name || null,
          }
        : payload.profile,
    };
    await this.redis.setex(
      `refresh:${refreshToken}`,
      this.refreshTtl,
      JSON.stringify(sessionPayload),
    );

    const responseContext = await this.buildResponseContext(sessionPayload, validatedData);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<number>('JWT_ACCESS_TTL', 3600),
      role: responseContext.role,
      needsOnboarding: responseContext.needsOnboarding,
      profile: responseContext.profile,
      tenant: responseContext.tenant,
      user: {
        id: payload.sub,
        telegramId: payload.telegramId,
        role: payload.role,
        tenantId: payload.tenantId,
        firstName: responseContext.profile.firstName,
        lastName: responseContext.profile.lastName || undefined,
      },
    };
  }

  private async buildResponseContext(
    payload: RefreshSessionPayload,
    validatedData?: ValidatedInitData,
  ): Promise<{
    role: AuthRole;
    needsOnboarding: boolean;
    profile: {
      id: string;
      firstName: string;
      lastName: string | null;
      phone: string | null;
      avatarUrl: string | null;
      telegramId?: string | null;
    };
    tenant: {
      id: string;
      displayName: string;
      slug: string;
      logoUrl: string | null;
      branding: {
        primaryColor?: string;
        secondaryColor?: string;
        welcomeMessage?: string;
      } | null;
      botUsername?: string | null;
    } | null;
  }> {
    if (payload.role === 'master' && payload.tenantId) {
      const master = await this.prisma.master.findFirst({
        where: { userId: payload.sub, tenantId: payload.tenantId },
        include: {
          tenant: true,
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });

      if (master) {
        // Determine onboarding status: check actual data, not just the flag.
        // If the flag is stale (e.g. services/schedule added outside onboarding wizard),
        // auto-complete onboarding when all prerequisites are met.
        let needsOnboarding = master.tenant.onboardingStatus !== 'setup_complete';

        if (needsOnboarding) {
          const [botCount, servicesCount, hoursCount] = await Promise.all([
            this.prisma.bot.count({ where: { tenantId: payload.tenantId, isActive: true } }),
            this.prisma.service.count({ where: { tenantId: payload.tenantId, isActive: true } }),
            this.prisma.workingHour.count({ where: { tenantId: payload.tenantId } }),
          ]);

          if (botCount > 0 && servicesCount > 0 && hoursCount > 0) {
            // All prerequisites met — auto-complete onboarding
            needsOnboarding = false;
            await this.prisma.tenant
              .update({
                where: { id: payload.tenantId },
                data: {
                  onboardingStatus: 'setup_complete',
                  onboardingChecklist: {
                    has_bot: true,
                    has_services: true,
                    has_schedule: true,
                    has_branding: true,
                    has_shared_link: true,
                  },
                },
              })
              .catch(() => {
                // Non-critical — don't fail auth if checklist update fails
              });
            this.logger.log(`Auto-completed onboarding for tenant ${payload.tenantId}`);
          }
        }

        return {
          role: 'master',
          needsOnboarding,
          profile: {
            id: master.id,
            firstName: master.firstName,
            lastName: master.lastName,
            phone: master.phone,
            avatarUrl: null,
            telegramId: master.user?.telegramId?.toString() || null,
          },
          tenant: {
            id: master.tenant.id,
            displayName: master.tenant.displayName,
            slug: master.tenant.slug,
            logoUrl: master.tenant.logoUrl,
            branding: this.mapTenantBranding(master.tenant.branding),
          },
        };
      }
    }

    if (payload.role === 'client' && payload.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: payload.clientId },
        include: {
          user: {
            select: {
              telegramId: true,
            },
          },
          tenant: { include: { bot: { select: { botUsername: true } } } },
        },
      });

      if (client) {
        return {
          role: 'client',
          needsOnboarding: !client.phone,
          profile: {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            phone: client.phone,
            avatarUrl: null,
            telegramId: client.user?.telegramId?.toString() || null,
          },
          tenant: {
            id: client.tenant.id,
            displayName: client.tenant.displayName,
            slug: client.tenant.slug,
            logoUrl: client.tenant.logoUrl,
            branding: this.mapTenantBranding(client.tenant.branding),
            botUsername: client.tenant.bot?.botUsername || null,
          },
        };
      }
    }

    return {
      role: 'platform_admin',
      needsOnboarding: false,
      profile: {
        id: payload.sub,
        firstName: validatedData?.user.first_name || payload.profile?.firstName || 'Platform',
        lastName: validatedData?.user.last_name || payload.profile?.lastName || 'Admin',
        phone: null,
        avatarUrl: null,
        telegramId: payload.telegramId ? String(payload.telegramId) : null,
      },
      tenant: null,
    };
  }

  private mapTenantBranding(branding: unknown) {
    if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
      return null;
    }

    const source = branding as Record<string, unknown>;

    return {
      primaryColor:
        typeof source.primary_color === 'string'
          ? source.primary_color
          : typeof source.primaryColor === 'string'
            ? source.primaryColor
            : undefined,
      secondaryColor:
        typeof source.secondary_color === 'string'
          ? source.secondary_color
          : typeof source.secondaryColor === 'string'
            ? source.secondaryColor
            : undefined,
      welcomeMessage:
        typeof source.welcomeMessage === 'string'
          ? source.welcomeMessage
          : typeof source.welcome_text === 'string'
            ? source.welcome_text
            : undefined,
    };
  }

  private isPlatformAdmin(data: ValidatedInitData): boolean {
    const adminIds = this.configService
      .get<string>('PLATFORM_ADMIN_TELEGRAM_IDS', '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const adminUsernames = this.configService
      .get<string>('PLATFORM_ADMIN_USERNAMES', '')
      .split(',')
      .map((value) => value.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);

    const telegramId = String(data.user.id);
    const username = data.user.username?.toLowerCase();

    return adminIds.includes(telegramId) || (!!username && adminUsernames.includes(username));
  }
}
