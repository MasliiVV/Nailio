// docs/api/endpoints.md — Auth endpoints
// POST /api/v1/auth/telegram 🔓
// POST /api/v1/auth/refresh 🔓
// POST /api/v1/auth/logout 🔑

import {
  Controller,
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
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TelegramAuthDto, RefreshTokenDto, AuthResponseDto } from './dto/auth.dto';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Telegram Mini App authentication
   * docs/api/authentication.md — Auth Flow
   * docs/security/overview.md — Rate limiting: 10 req/min per IP
   */
  @Post('telegram')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } }) // 10 req/min per IP
  @ApiOperation({ summary: 'Authenticate via Telegram initData' })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid initData or bot not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async authenticateTelegram(
    @Body() dto: TelegramAuthDto,
  ): Promise<AuthResponseDto> {
    return this.authService.authenticateTelegram(dto);
  }

  /**
   * Refresh access token (single-use rotation)
   * docs/api/authentication.md — Token Refresh Flow
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /**
   * Logout — revoke refresh token
   * docs/api/endpoints.md — POST /api/v1/auth/logout 🔑
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revoke refresh token' })
  @ApiResponse({ status: 204, description: 'Token revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<void> {
    await this.authService.revokeRefreshToken(dto.refreshToken);
  }
}
