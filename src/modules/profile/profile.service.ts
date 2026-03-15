// docs/api/endpoints.md — GET /api/v1/profile, PUT /api/v1/profile
// Returns profile data depending on role (master or client)

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get profile for current user.
   * Master: returns master profile + tenant info.
   * Client: returns client profile.
   */
  async getProfile(user: JwtPayload) {
    if (user.role === 'master' && user.tenantId) {
      const master = await this.prisma.master.findFirst({
        where: { userId: user.sub, tenantId: user.tenantId },
        include: {
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });
      if (!master) throw new NotFoundException('Master profile not found');

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });

      return {
        id: master.id,
        role: 'master',
        firstName: master.firstName,
        lastName: master.lastName,
        phone: master.phone,
        telegramId: master.user?.telegramId?.toString() || null,
        tenant: tenant
          ? {
              id: tenant.id,
              displayName: tenant.displayName,
              slug: tenant.slug,
              logoUrl: tenant.logoUrl,
            }
          : undefined,
      };
    }

    if (user.role === 'client' && user.clientId && user.tenantId) {
      const client = await this.prisma.tenantClient.client.findFirst({
        where: { id: user.clientId, tenantId: user.tenantId },
        include: {
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });
      if (!client) throw new NotFoundException('Client profile not found');

      return {
        id: client.id,
        role: 'client',
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        telegramId: client.user?.telegramId?.toString() || null,
        lastVisitAt: client.lastVisitAt?.toISOString(),
      };
    }

    throw new NotFoundException('Profile not found');
  }

  /**
   * Update profile for current user.
   */
  async updateProfile(user: JwtPayload, dto: UpdateProfileDto) {
    if (user.role === 'master' && user.tenantId) {
      const master = await this.prisma.master.findFirst({
        where: { userId: user.sub, tenantId: user.tenantId },
        include: {
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });
      if (!master) throw new NotFoundException('Master profile not found');

      const updated = await this.prisma.master.update({
        where: { id: master.id },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
      });

      this.logger.log(`Master profile updated: ${updated.id}`);

      return {
        id: updated.id,
        role: 'master',
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        telegramId: master.user?.telegramId?.toString() || null,
      };
    }

    if (user.role === 'client' && user.clientId && user.tenantId) {
      const existingClient = await this.prisma.tenantClient.client.findFirst({
        where: { id: user.clientId, tenantId: user.tenantId },
        include: {
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });
      if (!existingClient) throw new NotFoundException('Client profile not found');

      const updated = await this.prisma.tenantClient.client.update({
        where: { id: user.clientId },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
        },
      });

      this.logger.log(`Client profile updated: ${updated.id}`);

      return {
        id: updated.id,
        role: 'client',
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        telegramId: existingClient.user?.telegramId?.toString() || null,
      };
    }

    throw new NotFoundException('Profile not found');
  }
}
