// docs/backlog.md #84-#85 — Transactions module
// docs/api/endpoints.md — Finance endpoints

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Transaction } from '@prisma/client';
import { CreateTransactionDto, TransactionListQueryDto } from './dto/finance.dto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List transactions
   * docs/api/endpoints.md — GET /api/v1/finance/transactions
   */
  async findAll(tenantId: string, query: TransactionListQueryDto) {
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const where: Prisma.TransactionWhereInput = { tenantId };

    if (query.dateFrom) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.dateFrom),
      };
    }
    if (query.dateTo) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        lte: new Date(query.dateTo + 'T23:59:59.999Z'),
      };
    }

    const findArgs: Prisma.TransactionFindManyArgs = {
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true },
        },
        booking: {
          select: { id: true, serviceNameSnapshot: true },
        },
      },
    };

    if (query.cursor) {
      findArgs.cursor = { id: query.cursor };
      findArgs.skip = 1;
    }

    const transactions = await this.prisma.tenantClient.transaction.findMany(findArgs);

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map((t: Transaction & Record<string, unknown>) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        paymentMethod: t.paymentMethod,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        client: t.client || undefined,
        booking: t.booking || undefined,
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Create manual transaction
   * docs/api/endpoints.md — POST /api/v1/finance/transactions
   */
  async create(tenantId: string, dto: CreateTransactionDto) {
    // Verify client exists
    const client = await this.prisma.tenantClient.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    // Verify booking if provided
    if (dto.bookingId) {
      const booking = await this.prisma.tenantClient.booking.findFirst({
        where: { id: dto.bookingId, tenantId },
      });
      if (!booking) throw new NotFoundException('Booking not found');
    }

    const transaction = await this.prisma.tenantClient.transaction.create({
      data: {
        tenantId,
        bookingId: dto.bookingId,
        clientId: dto.clientId,
        amount: dto.amount,
        currency: dto.currency || 'UAH',
        paymentMethod: dto.paymentMethod,
        status: 'completed', // Manual transactions are immediately completed
      },
    });

    this.logger.log(
      `Transaction created: ${transaction.id} for ${dto.amount} in tenant ${tenantId}`,
    );

    return transaction;
  }

  /**
   * Finance summary for a period
   * docs/api/endpoints.md — GET /api/v1/finance/summary
   */
  async getSummary(tenantId: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : new Date();

    const [totalIncome, transactionCount, byMethod] = await Promise.all([
      this.prisma.tenantClient.transaction.aggregate({
        where: {
          tenantId,
          status: 'completed',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.tenantClient.transaction.count({
        where: {
          tenantId,
          status: 'completed',
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.tenantClient.transaction.groupBy({
        by: ['paymentMethod'],
        where: {
          tenantId,
          status: 'completed',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalIncome: totalIncome._sum.amount || 0,
      transactionCount,
      byMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        total: m._sum.amount || 0,
        count: m._count.id,
      })),
      period: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
    };
  }
}
