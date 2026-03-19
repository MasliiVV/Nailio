import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const tenantId = 'tenant-1';

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-19T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createService = () => {
    const prisma = {
      tenantClient: {
        booking: {
          count: jest.fn(),
          aggregate: jest.fn(),
          findFirst: jest.fn(),
          groupBy: jest.fn(),
        },
        analyticsDaily: {
          count: jest.fn(),
          aggregate: jest.fn(),
          findMany: jest.fn(),
          upsert: jest.fn(),
        },
        client: {
          count: jest.fn(),
        },
      },
    };

    return {
      prisma,
      service: new AnalyticsService(prisma as never),
    };
  };

  it('uses analytics_daily for the covered historical part of the period', async () => {
    const { prisma, service } = createService();

    prisma.tenantClient.booking.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.tenantClient.booking.aggregate
      .mockResolvedValueOnce({ _sum: { priceAtBooking: 5000 } })
      .mockResolvedValueOnce({ _sum: { priceAtBooking: 5000 } });
    prisma.tenantClient.booking.findFirst.mockResolvedValue(null);
    prisma.tenantClient.booking.groupBy.mockResolvedValue([]);
    prisma.tenantClient.client.count.mockResolvedValue(1);
    prisma.tenantClient.analyticsDaily.count.mockResolvedValue(30);
    prisma.tenantClient.analyticsDaily.aggregate.mockResolvedValue({
      _sum: {
        totalBookings: 40,
        completed: 35,
        cancelled: 3,
        noShows: 2,
        revenue: 120000,
        newClients: 6,
      },
    });

    const result = await service.getDashboard(tenantId, 'month');

    expect(prisma.tenantClient.analyticsDaily.aggregate).toHaveBeenCalled();
    expect(result.period).toMatchObject({
      totalBookings: 42,
      completed: 36,
      cancelled: 3,
      noShows: 2,
      revenue: 125000,
      newClients: 7,
    });
  });

  it('falls back to realtime period stats when analytics_daily coverage is incomplete', async () => {
    const { prisma, service } = createService();

    prisma.tenantClient.booking.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.tenantClient.booking.aggregate
      .mockResolvedValueOnce({ _sum: { priceAtBooking: 2000 } })
      .mockResolvedValueOnce({ _sum: { priceAtBooking: 80000 } })
      .mockResolvedValueOnce({ _sum: { priceAtBooking: 2000 } });
    prisma.tenantClient.booking.findFirst.mockResolvedValue(null);
    prisma.tenantClient.booking.groupBy.mockResolvedValue([]);
    prisma.tenantClient.client.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    prisma.tenantClient.analyticsDaily.count.mockResolvedValue(0);

    const result = await service.getDashboard(tenantId, 'month');

    expect(prisma.tenantClient.analyticsDaily.aggregate).not.toHaveBeenCalled();
    expect(result.period).toMatchObject({
      totalBookings: 11,
      completed: 9,
      cancelled: 1,
      noShows: 1,
      revenue: 82000,
      newClients: 5,
    });
  });
});
