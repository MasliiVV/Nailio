// docs/backlog.md #102 — Tenant settings API
// docs/architecture/multi-tenancy.md — Tenant management

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateBrandingDto,
  UpdateGeneralSettingsDto,
} from './dto/tenants.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get tenant by ID
   */
  async findById(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  /**
   * Get tenant by slug (for auth flow — startParam resolution)
   * docs/api/authentication.md — Tenant Resolution
   */
  async findBySlug(slug: string) {
    return this.prisma.tenant.findUnique({
      where: { slug },
    });
  }

  /**
   * Get full tenant settings (for master dashboard)
   * docs/api/endpoints.md — GET /api/v1/settings
   */
  async getSettings(tenantId: string) {
    const tenant = await this.findById(tenantId);
    return {
      id: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      phone: tenant.phone,
      email: tenant.email,
      timezone: tenant.timezone,
      locale: tenant.locale,
      logoUrl: tenant.logoUrl,
      branding: tenant.branding,
      settings: tenant.settings,
      onboardingStatus: tenant.onboardingStatus,
      onboardingChecklist: tenant.onboardingChecklist,
      trialEndsAt: tenant.trialEndsAt,
      isActive: tenant.isActive,
    };
  }

  /**
   * Update branding settings
   * docs/api/endpoints.md — PUT /api/v1/settings/branding
   */
  async updateBranding(tenantId: string, dto: UpdateBrandingDto) {
    const tenant = await this.findById(tenantId);

    // Merge with existing branding
    const existingBranding = (tenant.branding as Record<string, unknown>) || {};
    const updatedBranding = { ...existingBranding };

    if (dto.primaryColor !== undefined) updatedBranding.primary_color = dto.primaryColor;
    if (dto.secondaryColor !== undefined) updatedBranding.secondary_color = dto.secondaryColor;
    if (dto.accentColor !== undefined) updatedBranding.accent_color = dto.accentColor;
    if (dto.backgroundColor !== undefined) updatedBranding.background_color = dto.backgroundColor;
    if (dto.welcomeText !== undefined) updatedBranding.welcome_text = dto.welcomeText;
    if (dto.description !== undefined) updatedBranding.description = dto.description;
    if (dto.contacts !== undefined) updatedBranding.contacts = dto.contacts;

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { branding: updatedBranding as Prisma.InputJsonValue },
    });
  }

  /**
   * Update general settings
   * docs/api/endpoints.md — PUT /api/v1/settings/general
   */
  async updateGeneralSettings(tenantId: string, dto: UpdateGeneralSettingsDto) {
    const tenant = await this.findById(tenantId);

    // Update tenant fields
    const updateData: Record<string, unknown> = {};

    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.locale !== undefined) updateData.locale = dto.locale;

    // Update settings JSONB (merge)
    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = { ...existingSettings };

    if (dto.slotStepMinutes !== undefined) updatedSettings.slot_step_minutes = dto.slotStepMinutes;
    if (dto.cancellationWindowHours !== undefined) updatedSettings.cancellation_window_hours = dto.cancellationWindowHours;
    if (dto.allowClientReschedule !== undefined) updatedSettings.allow_client_reschedule = dto.allowClientReschedule;

    updateData.settings = updatedSettings as Prisma.InputJsonValue;

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: updateData as Prisma.TenantUpdateInput,
    });
  }

  /**
   * Update onboarding checklist
   * docs/backlog.md #32 — Onboarding checklist (JSONB in tenants)
   */
  async updateOnboardingChecklist(
    tenantId: string,
    checklist: Record<string, boolean>,
  ) {
    const tenant = await this.findById(tenantId);
    const existing = (tenant.onboardingChecklist as Record<string, boolean>) || {};
    const updated = { ...existing, ...checklist };

    // Check if all steps complete → update onboarding_status
    const allComplete =
      updated.has_services &&
      updated.has_schedule &&
      updated.has_branding &&
      updated.has_shared_link;

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        onboardingChecklist: updated as Prisma.InputJsonValue,
        ...(allComplete ? { onboardingStatus: 'setup_complete' } : {}),
      },
    });
  }

  /**
   * Update onboarding status
   * docs/guides/master-onboarding.md
   */
  async updateOnboardingStatus(
    tenantId: string,
    status: 'pending_bot' | 'bot_connected' | 'setup_complete',
  ) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingStatus: status },
    });
  }

  /**
   * Generate unique slug from name
   * Used during master registration (auth flow)
   */
  async generateUniqueSlug(name: string): Promise<string> {
    // Transliterate Ukrainian to Latin
    const transliterated = this.transliterate(name).toLowerCase();
    // Remove non-alphanumeric, replace spaces with dashes
    let slug = transliterated
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 40);

    if (!slug) {
      slug = 'master';
    }

    // Check uniqueness, add suffix if needed
    let candidate = slug;
    let counter = 1;

    while (await this.prisma.tenant.findUnique({ where: { slug: candidate } })) {
      candidate = `${slug}-${counter}`;
      counter++;
    }

    return candidate;
  }

  /**
   * Basic Ukrainian → Latin transliteration
   * Follows Ukrainian transliteration standard (simplified)
   */
  private transliterate(text: string): string {
    const map: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g',
      'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
      'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k',
      'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
      'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
      'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
      'ь': '', 'ю': 'yu', 'я': 'ya',
    };

    return text
      .split('')
      .map((char) => {
        const lower = char.toLowerCase();
        if (map[lower] !== undefined) {
          const result = map[lower];
          return char === lower ? result : result.charAt(0).toUpperCase() + result.slice(1);
        }
        return char;
      })
      .join('');
  }
}
