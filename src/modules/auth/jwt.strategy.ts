// docs/api/authentication.md — JWT Strategy
// Passport JWT strategy — extracts Bearer token, validates payload

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport calls this after verifying the JWT signature.
   * Return value is attached to request.user
   * docs/api/authentication.md — JWT Payload Structure
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Verify user still exists
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Set tenant context for multi-tenancy (AsyncLocalStorage)
    if (payload.tenantId) {
      this.prisma.setTenantId(payload.tenantId);
    }

    return {
      sub: payload.sub,
      telegramId: payload.telegramId,
      role: payload.role,
      tenantId: payload.tenantId,
      clientId: payload.clientId,
    };
  }
}
