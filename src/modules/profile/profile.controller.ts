// docs/api/endpoints.md — Profile endpoints
// GET /api/v1/profile 🔑 — Get current user profile
// PUT /api/v1/profile 🔑 — Update current user profile

import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/v1/profile')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.profileService.getProfile(user);
  }

  @Put()
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(user, dto);
  }
}
