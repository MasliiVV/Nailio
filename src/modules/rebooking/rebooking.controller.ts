import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  GenerateRebookingMessageDto,
  RebookingOverviewQueryDto,
  SendRebookingCampaignDto,
} from './dto/rebooking.dto';
import { RebookingService } from './rebooking.service';

@Controller('rebooking')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('master')
export class RebookingController {
  constructor(private readonly rebookingService: RebookingService) {}

  @Get('overview')
  async getOverview(
    @CurrentTenant() tenantId: string,
    @Query() query: RebookingOverviewQueryDto,
  ) {
    return this.rebookingService.getOverview(tenantId, query.date);
  }

  @Post('generate-message')
  async generateMessage(
    @CurrentTenant() tenantId: string,
    @Body() dto: GenerateRebookingMessageDto,
  ) {
    return this.rebookingService.generateMessage(tenantId, dto);
  }

  @Post('campaigns')
  async sendCampaign(@CurrentTenant() tenantId: string, @Body() dto: SendRebookingCampaignDto) {
    return this.rebookingService.sendCampaign(tenantId, dto);
  }
}
