// docs/backlog.md #31 — Onboarding wizard API
// docs/guides/master-onboarding.md — Full onboarding flow

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { BotService } from '../telegram/bot.service';
import { OnboardingStatusDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly botService: BotService,
  ) {}

  /**
   * Get onboarding status
   * docs/guides/master-onboarding.md — Step tracking
   */
  async getStatus(tenantId: string): Promise<OnboardingStatusDto> {
    const tenant = await this.tenantsService.findById(tenantId);
    const bot = await this.botService.findByTenantId(tenantId);
    const checklist = (tenant.onboardingChecklist as Record<string, boolean>) || {};

    // Auto-calculate checklist based on actual data
    const [servicesCount] = await Promise.all([
      this.prisma.tenantClient.service.count({ where: { tenantId, isActive: true } }),
    ]);

    const hasSchedule = this.hasConfiguredSlots(tenant.settings);

    const hasBranding = !!(
      (tenant.branding as Record<string, unknown>)?.primary_color || tenant.logoUrl
    );

    return {
      status: tenant.onboardingStatus,
      checklist: {
        hasBot: !!bot,
        hasServices: servicesCount > 0,
        hasSchedule,
        hasBranding,
        hasSharedLink: checklist.has_shared_link || false,
      },
      botUsername: bot?.botUsername,
      shareLink: bot ? `https://t.me/${bot.botUsername}` : undefined,
    };
  }

  /**
   * Connect bot (delegates to BotService)
   * docs/guides/master-onboarding.md — Step 3: Enter Bot Token
   */
  async connectBot(tenantId: string, botToken: string) {
    const result = await this.botService.connectBot(tenantId, { botToken });

    // Update onboarding checklist
    await this.tenantsService.updateOnboardingChecklist(tenantId, {
      has_bot: true,
    });

    const master = await this.prisma.master.findUnique({
      where: { tenantId },
      include: {
        user: {
          select: {
            telegramId: true,
          },
        },
      },
    });

    if (master?.user?.telegramId) {
      const messageSent = await this.botService
        .sendMessage(
          result.id,
          master.user.telegramId,
          [
            `✅ Бот @${result.botUsername} підключено до Nailio.`,
            'Це тестове повідомлення, щоб ви швидко знайшли чат бота.',
            `Посилання на бота: https://t.me/${result.botUsername}`,
          ].join('\n'),
        )
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to send post-connect test message for tenant ${tenantId}: ${String(error)}`,
          );
          return false;
        });

      if (!messageSent) {
        this.logger.warn(
          `Post-connect test message was not delivered for tenant ${tenantId} (bot may not be started yet)`,
        );
      }
    }

    return result;
  }

  /**
   * Mark "shared link" step as complete
   */
  async markSharedLink(tenantId: string) {
    await this.tenantsService.updateOnboardingChecklist(tenantId, {
      has_shared_link: true,
    });
    return this.getStatus(tenantId);
  }

  /**
   * Auto-update checklist after service/schedule changes
   */
  async refreshChecklist(tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId);
    const [servicesCount] = await Promise.all([
      this.prisma.tenantClient.service.count({ where: { tenantId, isActive: true } }),
    ]);

    const updates: Record<string, boolean> = {};

    if (servicesCount > 0) updates.has_services = true;
    if (this.hasConfiguredSlots(tenant.settings)) updates.has_schedule = true;

    if (Object.keys(updates).length > 0) {
      await this.tenantsService.updateOnboardingChecklist(tenantId, updates);
    }
  }

  private hasConfiguredSlots(settings: unknown): boolean {
    const schedule = (settings as { slot_schedule?: { weekly?: Array<{ slots?: string[] }> } })
      ?.slot_schedule;

    return (
      schedule?.weekly?.some((day) => Array.isArray(day.slots) && day.slots.length > 0) || false
    );
  }
}
