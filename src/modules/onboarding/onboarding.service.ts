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
    const [servicesCount, hoursCount] = await Promise.all([
      this.prisma.tenantClient.service.count({ where: { tenantId, isActive: true } }),
      this.prisma.tenantClient.workingHour.count({ where: { tenantId } }),
    ]);

    const hasBranding = !!(
      (tenant.branding as Record<string, unknown>)?.primary_color || tenant.logoUrl
    );

    return {
      status: tenant.onboardingStatus,
      checklist: {
        hasBot: !!bot,
        hasServices: servicesCount > 0,
        hasSchedule: hoursCount > 0,
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
    const [servicesCount, hoursCount] = await Promise.all([
      this.prisma.tenantClient.service.count({ where: { tenantId, isActive: true } }),
      this.prisma.tenantClient.workingHour.count({ where: { tenantId } }),
    ]);

    const updates: Record<string, boolean> = {};

    if (servicesCount > 0) updates.has_services = true;
    if (hoursCount > 0) updates.has_schedule = true;

    if (Object.keys(updates).length > 0) {
      await this.tenantsService.updateOnboardingChecklist(tenantId, updates);
    }
  }
}
