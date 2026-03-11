// docs/backlog.md #81-#82 — Analytics module
// docs/api/endpoints.md — GET /api/v1/analytics/dashboard, GET /api/v1/analytics/daily
// BullMQ daily aggregation + dashboard API

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dashboard data
   * docs/api/endpoints.md — GET /api/v1/analytics/dashboard
   * Returns today's stats + period stats
   */
  async getDashboard(tenantId: string, period: 'week' | 'month' | 'year' = 'month') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Period calculation
    const periodStart = new Date(todayStart);
    if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else if (period === 'month') {
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      periodStart.setFullYear(periodStart.getFullYear() - 1);
    }

    // Today's stats (real-time from bookings)
    const [todayBookings, todayCompleted, todayRevenue, nextBooking] = await Promise.all([
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: todayStart, lt: todayEnd },
          status: { notIn: ['cancelled'] },
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: todayStart, lt: todayEnd },
          status: 'completed',
        },
      }),
      this.prisma.tenantClient.booking.aggregate({
        where: {
          tenantId,
          startTime: { gte: todayStart, lt: todayEnd },
          status: 'completed',
        },
        _sum: { priceAtBooking: true },
      }),
      this.prisma.tenantClient.booking.findFirst({
        where: {
          tenantId,
          startTime: { gte: now },
          status: { in: ['pending', 'confirmed'] },
        },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          serviceNameSnapshot: true,
          startTime: true,
          endTime: true,
          client: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

    // Period stats (from analytics_daily if available, otherwise real-time)
    const periodStats = await this.getPeriodStats(tenantId, periodStart, todayEnd);

    // Popular services in period
    const popularServices = await this.getPopularServices(tenantId, periodStart, todayEnd);

    return {
      today: {
        bookings: todayBookings,
        completed: todayCompleted,
        revenue: todayRevenue._sum.priceAtBooking || 0,
        nextBooking: nextBooking
          ? {
              id: nextBooking.id,
              serviceName: nextBooking.serviceNameSnapshot,
              startTime: nextBooking.startTime.toISOString(),
              endTime: nextBooking.endTime.toISOString(),
              clientName:
                `${nextBooking.client.firstName} ${nextBooking.client.lastName || ''}`.trim(),
            }
          : null,
      },
      period: {
        ...periodStats,
        popularServices,
      },
    };
  }

  /**
   * Daily analytics for a date range.
   * docs/api/endpoints.md — GET /api/v1/analytics/daily
   */
  async getDailyStats(tenantId: string, dateFrom: string, dateTo: string) {
    const records = await this.prisma.tenantClient.analyticsDaily.findMany({
      where: {
        tenantId,
        date: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo),
        },
      },
      orderBy: { date: 'asc' },
    });

    return records.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      totalBookings: r.totalBookings,
      completed: r.completed,
      cancelled: r.cancelled,
      noShows: r.noShows,
      newClients: r.newClients,
      revenue: r.revenue,
    }));
  }

  /**
   * Aggregate daily stats for a tenant (called by BullMQ cron job).
   * docs/backlog.md #81 — Analytics daily aggregation
   */
  async aggregateDaily(tenantId: string, date: Date) {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [total, completed, cancelled, noShow, revenue, newClients] = await Promise.all([
      this.prisma.tenantClient.booking.count({
        where: { tenantId, startTime: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: dayStart, lt: dayEnd },
          status: 'completed',
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: dayStart, lt: dayEnd },
          status: 'cancelled',
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: dayStart, lt: dayEnd },
          status: 'no_show',
        },
      }),
      this.prisma.tenantClient.booking.aggregate({
        where: {
          tenantId,
          startTime: { gte: dayStart, lt: dayEnd },
          status: 'completed',
        },
        _sum: { priceAtBooking: true },
      }),
      this.prisma.tenantClient.client.count({
        where: {
          tenantId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),
    ]);

    // Upsert analytics record
    await this.prisma.tenantClient.analyticsDaily.upsert({
      where: {
        tenantId_date: { tenantId, date: dayStart },
      },
      update: {
        totalBookings: total,
        completed,
        cancelled,
        noShows: noShow,
        newClients,
        revenue: revenue._sum.priceAtBooking || 0,
      },
      create: {
        tenantId,
        date: dayStart,
        totalBookings: total,
        completed,
        cancelled,
        noShows: noShow,
        newClients,
        revenue: revenue._sum.priceAtBooking || 0,
      },
    });

    this.logger.log(
      `Analytics aggregated for tenant ${tenantId}, date ${dayStart.toISOString().split('T')[0]}`,
    );
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private async getPeriodStats(tenantId: string, from: Date, to: Date) {
    const [totalBookings, completed, cancelled, noShows, revenue, newClients] = await Promise.all([
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: from, lt: to },
          status: { notIn: ['cancelled'] },
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: from, lt: to },
          status: 'completed',
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: from, lt: to },
          status: 'cancelled',
        },
      }),
      this.prisma.tenantClient.booking.count({
        where: {
          tenantId,
          startTime: { gte: from, lt: to },
          status: 'no_show',
        },
      }),
      this.prisma.tenantClient.booking.aggregate({
        where: {
          tenantId,
          startTime: { gte: from, lt: to },
          status: 'completed',
        },
        _sum: { priceAtBooking: true },
      }),
      this.prisma.tenantClient.client.count({
        where: {
          tenantId,
          createdAt: { gte: from, lt: to },
        },
      }),
    ]);

    return {
      totalBookings,
      completed,
      cancelled,
      noShows,
      revenue: revenue._sum.priceAtBooking || 0,
      newClients,
    };
  }

  private async getPopularServices(tenantId: string, from: Date, to: Date) {
    const services = await this.prisma.tenantClient.booking.groupBy({
      by: ['serviceNameSnapshot'],
      where: {
        tenantId,
        startTime: { gte: from, lt: to },
        status: { notIn: ['cancelled'] },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    return services.map((s) => ({
      name: s.serviceNameSnapshot,
      count: s._count.id,
    }));
  }
}
