// docs/backlog.md #31 — Onboarding wizard API endpoints
// docs/guides/master-onboarding.md — Onboarding flow

import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import {
  ValidateTokenDto,
  OnboardingStatusDto,
} from './dto/onboarding.dto';
import { Roles, CurrentTenant } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@ApiTags('Onboarding')
@Controller('onboarding')
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Get onboarding status
   * docs/guides/master-onboarding.md — Step tracking
   */
  @Get('status')
  @Roles('master')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get onboarding progress' })
  @ApiResponse({ status: 200, type: OnboardingStatusDto })
  async getStatus(@CurrentTenant() tenantId: string) {
    return this.onboardingService.getStatus(tenantId);
  }

  /**
   * Connect bot token (Step 3)
   * docs/guides/master-onboarding.md — POST /onboarding/validate-token
   */
  @Post('connect-bot')
  @Roles('master')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Validate and connect bot token' })
  @ApiResponse({ status: 201, description: 'Bot connected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or bot already registered' })
  async connectBot(
    @CurrentTenant() tenantId: string,
    @Body() dto: ValidateTokenDto,
  ) {
    return this.onboardingService.connectBot(tenantId, dto.botToken);
  }

  /**
   * Mark link sharing step as complete
   */
  @Post('shared-link')
  @Roles('master')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark bot link as shared' })
  @ApiResponse({ status: 200, type: OnboardingStatusDto })
  async markSharedLink(@CurrentTenant() tenantId: string) {
    return this.onboardingService.markSharedLink(tenantId);
  }
}
