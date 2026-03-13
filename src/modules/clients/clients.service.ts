// docs/backlog.md #52-#56 — Clients CRM
// docs/api/endpoints.md — Clients endpoints
// docs/database/schema.md — clients table

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Client } from '@prisma/client';
import { UpdateClientDto, ClientListQueryDto, ClientOnboardingDto } from './dto/clients.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Client list (#53)
  // docs/api/endpoints.md — GET /api/v1/clients (search, sort, pagination)
  // ──────────────────────────────────────────────

  async findAll(tenantId: string, query: ClientListQueryDto) {
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const where: Prisma.ClientWhereInput = { tenantId };

    // Search by name or phone
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const findArgs: Prisma.ClientFindManyArgs = {
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        _count: { select: { bookings: true } },
      },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1;
    }

    const clients = await this.prisma.tenantClient.client.findMany(findArgs);

    const hasMore = clients.length > limit;
    const items = hasMore ? clients.slice(0, limit) : clients;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map((c: Client & { _count?: { bookings: number } }) => ({
        ...this.formatClientListItem(c),
        stats: {
          totalBookings: c._count?.bookings ?? 0,
        },
      })),
      nextCursor,
      hasMore,
    };
  }

  // ──────────────────────────────────────────────
  // Client profile (#54, #55)
  // docs/api/endpoints.md — GET /api/v1/clients/:id (with stats + recent bookings)
  // ──────────────────────────────────────────────

  async findById(tenantId: string, clientId: string) {
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) throw new NotFoundException('Client not found');

    // Booking stats
    const [totalBookings, completed, cancelled, noShows, totalSpent] = await Promise.all([
      this.prisma.tenantClient.booking.count({
        where: { tenantId, clientId },
      }),
      this.prisma.tenantClient.booking.count({
        where: { tenantId, clientId, status: 'completed' },
      }),
      this.prisma.tenantClient.booking.count({
        where: { tenantId, clientId, status: 'cancelled' },
      }),
      this.prisma.tenantClient.booking.count({
        where: { tenantId, clientId, status: 'no_show' },
      }),
      this.prisma.tenantClient.booking.aggregate({
        where: { tenantId, clientId, status: 'completed' },
        _sum: { priceAtBooking: true },
      }),
    ]);

    // Recent bookings (#55)
    const recentBookings = await this.prisma.tenantClient.booking.findMany({
      where: { tenantId, clientId },
      orderBy: { startTime: 'desc' },
      take: 10,
      select: {
        id: true,
        serviceNameSnapshot: true,
        priceAtBooking: true,
        startTime: true,
        endTime: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      notes: client.notes,
      tags: client.tags,
      isBlocked: client.isBlocked,
      lastVisitAt: client.lastVisitAt?.toISOString(),
      createdAt: client.createdAt.toISOString(),
      stats: {
        totalBookings,
        completed,
        cancelled,
        noShows,
        totalSpent: totalSpent._sum.priceAtBooking || 0,
      },
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        serviceNameSnapshot: b.serviceNameSnapshot,
        priceAtBooking: b.priceAtBooking,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        status: b.status,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  // ──────────────────────────────────────────────
  // Update client (#56 — notes, tags)
  // docs/api/endpoints.md — PUT /api/v1/clients/:id
  // ──────────────────────────────────────────────

  async update(tenantId: string, clientId: string, dto: UpdateClientDto) {
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    const updated = await this.prisma.tenantClient.client.update({
      where: { id: clientId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.tags !== undefined && {
          tags: dto.tags as unknown as Prisma.InputJsonValue,
        }),
      },
    });

    this.logger.log(`Client updated: ${clientId} in tenant ${tenantId}`);
    return this.formatClientListItem(updated);
  }

  // ──────────────────────────────────────────────
  // Block / Unblock client
  // docs/api/endpoints.md — POST /api/v1/clients/:id/block, /unblock
  // ──────────────────────────────────────────────

  async block(tenantId: string, clientId: string) {
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.prisma.tenantClient.client.update({
      where: { id: clientId },
      data: { isBlocked: true },
    });

    this.logger.log(`Client blocked: ${clientId} in tenant ${tenantId}`);
    return { id: clientId, isBlocked: true };
  }

  async unblock(tenantId: string, clientId: string) {
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    await this.prisma.tenantClient.client.update({
      where: { id: clientId },
      data: { isBlocked: false },
    });

    this.logger.log(`Client unblocked: ${clientId} in tenant ${tenantId}`);
    return { id: clientId, isBlocked: false };
  }

  // ──────────────────────────────────────────────
  // Client onboarding (#52)
  // docs/api/endpoints.md — POST /api/v1/clients/onboarding
  // Auto-creates client record on first interaction
  // ──────────────────────────────────────────────

  async onboarding(tenantId: string, user: JwtPayload, dto: ClientOnboardingDto) {
    if (!user.clientId) {
      throw new BadRequestException('Client context required');
    }

    const existing = await this.prisma.tenantClient.client.findFirst({
      where: { id: user.clientId, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Client record not found');
    }

    const updated = await this.prisma.tenantClient.client.update({
      where: { id: user.clientId },
      data: {
        firstName: dto.firstName,
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.phone && { phone: dto.phone }),
      },
    });

    this.logger.log(`Client onboarding completed: ${updated.id} in tenant ${tenantId}`);

    return {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
    };
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private formatClientListItem(client: Client) {
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      notes: client.notes,
      tags: client.tags,
      isBlocked: client.isBlocked,
      botBlocked: client.botBlocked,
      lastVisitAt: client.lastVisitAt?.toISOString(),
      createdAt: client.createdAt.toISOString(),
    };
  }
}
