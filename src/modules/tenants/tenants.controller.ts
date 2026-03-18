// docs/api/endpoints.md — Tenant Settings endpoints
// GET /api/v1/settings 🔑👑
// PUT /api/v1/settings/branding 🔑👑⚡
// PUT /api/v1/settings/general 🔑👑⚡
// POST /api/v1/settings/logo 🔑👑⚡

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { TenantsService } from './tenants.service';
import {
  UpdateBrandingDto,
  UpdateGeneralSettingsDto,
  TenantResponseDto,
  AdminTenantSummaryDto,
  AdminTenantDetailDto,
} from './dto/tenants.dto';
import { Roles, CurrentTenant } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';

@ApiTags('Settings')
@Controller('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Get all tenant settings
   * docs/api/endpoints.md — GET /api/v1/settings 🔑👑
   */
  @Get()
  @Roles('master')
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update general settings' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async updateGeneralSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateGeneralSettingsDto,
  ) {
    return this.tenantsService.updateGeneralSettings(tenantId, dto);
  }

  /**
   * Upload tenant logo (max 5 MB, JPG / PNG / WebP)
   * docs/api/endpoints.md — POST /api/v1/settings/logo 🔑👑⚡
   */
  @Post('logo')
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload tenant logo' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, type: TenantResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/logos',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
          return cb(new BadRequestException('Only JPG, PNG, WebP files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @CurrentTenant() tenantId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tenantsService.uploadLogo(tenantId, file);
  }

  /**
   * Delete tenant logo
   * docs/api/endpoints.md — DELETE /api/v1/settings/logo 🔑👑⚡
   */
  @Delete('logo')
  @Roles('master')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tenant logo' })
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async deleteLogo(@CurrentTenant() tenantId: string) {
    return this.tenantsService.deleteLogo(tenantId);
  }
}

@ApiTags('Admin')
@Controller('admin/tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('platform_admin')
  @ApiOperation({ summary: 'List all tenants for platform admin' })
  @ApiResponse({ status: 200, type: AdminTenantSummaryDto, isArray: true })
  async listTenants() {
    return this.tenantsService.listAdminTenants();
  }

  @Get(':id')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Get tenant overview for platform admin' })
  @ApiResponse({ status: 200, type: AdminTenantDetailDto })
  async getTenant(@Param('id') tenantId: string) {
    return this.tenantsService.getAdminTenantById(tenantId);
  }
}
