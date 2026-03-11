// docs/api/endpoints.md — Tenant Settings endpoints
// GET /api/v1/settings 🔑👑
// PUT /api/v1/settings/branding 🔑👑⚡
// PUT /api/v1/settings/general 🔑👑⚡
// POST /api/v1/settings/logo 🔑👑⚡

import { Controller, Get, Put, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateBrandingDto, UpdateGeneralSettingsDto, TenantResponseDto } from './dto/tenants.dto';
import { Roles, RequiresActiveSubscription, CurrentTenant } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Settings')
@Controller('settings')
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Get all tenant settings
   * docs/api/endpoints.md — GET /api/v1/settings 🔑👑
   */
  @Get()
  @Roles('master')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get tenant settings' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async getSettings(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getSettings(tenantId);
  }

  /**
   * Update branding (colors, text, contacts)
   * docs/api/endpoints.md — PUT /api/v1/settings/branding 🔑👑⚡
   */
  @Put('branding')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update branding settings' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async updateBranding(@CurrentTenant() tenantId: string, @Body() dto: UpdateBrandingDto) {
    return this.tenantsService.updateBranding(tenantId, dto);
  }

  /**
   * Update general settings (timezone, locale, cancellation policy)
   * docs/api/endpoints.md — PUT /api/v1/settings/general 🔑👑⚡
   */
  @Put('general')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update general settings' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async updateGeneralSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateGeneralSettingsDto,
  ) {
    return this.tenantsService.updateGeneralSettings(tenantId, dto);
  }
}
