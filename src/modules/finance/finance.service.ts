// docs/backlog.md #84-#85 — Transactions module
// docs/api/endpoints.md — Finance endpoints

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
        type: t.type || 'income',
        amount: t.amount,
        description:
          t.description ||
          (t.booking as { serviceNameSnapshot?: string } | null)?.serviceNameSnapshot ||
          '',
        currency: t.currency,
        category: t.paymentMethod || null,
        paymentMethod: t.paymentMethod,
        status: t.status,
        bookingId: t.bookingId || null,
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
    // Verify client exists if provided
    if (dto.clientId) {
      const client = await this.prisma.tenantClient.client.findFirst({
        where: { id: dto.clientId, tenantId },
      });
      if (!client) throw new NotFoundException('Client not found');
    }

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
        type: dto.type || 'income',
        bookingId: dto.bookingId || undefined,
        clientId: dto.clientId || undefined,
        amount: dto.amount,
        description: dto.description || null,
        currency: dto.currency || 'UAH',
        paymentMethod: dto.paymentMethod || 'cash',
        status: 'completed', // Manual transactions are immediately completed
      },
    });

    this.logger.log(
      `Transaction created: ${transaction.id} for ${dto.amount} in tenant ${tenantId}`,
    );

    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description || '',
      category: transaction.paymentMethod,
      bookingId: transaction.bookingId,
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  /**
   * Finance summary for a period
   * docs/api/endpoints.md — GET /api/v1/finance/summary
   */
  async getSummary(tenantId: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : new Date();

    const baseWhere = {
      tenantId,
      status: 'completed' as const,
      createdAt: { gte: from, lte: to },
    };

    const [incomeResult, expenseResult] = await Promise.all([
      this.prisma.tenantClient.transaction.aggregate({
        where: { ...baseWhere, type: 'income' },
        _sum: { amount: true },
      }),
      this.prisma.tenantClient.transaction.aggregate({
        where: { ...baseWhere, type: 'expense' },
        _sum: { amount: true },
      }),
    ]);

    const income = incomeResult._sum?.amount || 0;
    const expense = expenseResult._sum?.amount || 0;

    return {
      income,
      expense,
      net: income - expense,
    };
  }

  /**
   * Auto-create income transaction when booking is completed
   */
  async createBookingTransaction(
    tenantId: string,
    bookingId: string,
    clientId: string,
    amount: number,
    description: string,
  ) {
    // Avoid duplicate transaction for same booking
    const existing = await this.prisma.tenantClient.transaction.findFirst({
      where: { tenantId, bookingId },
    });
    if (existing) {
      this.logger.warn(`Transaction already exists for booking ${bookingId}`);
      return existing;
    }

    const transaction = await this.prisma.tenantClient.transaction.create({
      data: {
        tenantId,
        type: 'income',
        bookingId,
        clientId,
        amount,
        description,
        currency: 'UAH',
        paymentMethod: 'cash',
        status: 'completed',
      },
    });

    this.logger.log(
      `Auto-transaction created: ${transaction.id} for booking ${bookingId} (${amount} kopiykas)`,
    );

    return transaction;
  }
}
