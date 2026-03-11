// docs/backlog.md #116 — Integration tests (API endpoints)
// Test helpers for creating NestJS test app with mocked dependencies

import { ConfigService } from '@nestjs/config';

/**
 * Mock PrismaService with tenant-scoped client.
 * Provides basic CRUD mocks for integration tests.
 */
export function createMockPrismaService() {
  const mockFindMany = jest.fn().mockResolvedValue([]);
  const mockFindFirst = jest.fn().mockResolvedValue(null);
  const mockFindUnique = jest.fn().mockResolvedValue(null);
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockCount = jest.fn().mockResolvedValue(0);
  const mockAggregate = jest.fn().mockResolvedValue({});
  const mockGroupBy = jest.fn().mockResolvedValue([]);

  const modelProxy = new Proxy(
    {},
    {
      get: (_target, _prop) => ({
        findMany: mockFindMany,
        findFirst: mockFindFirst,
        findUnique: mockFindUnique,
        create: mockCreate,
        update: mockUpdate,
        delete: mockDelete,
        count: mockCount,
        aggregate: mockAggregate,
        groupBy: mockGroupBy,
      }),
    },
  );

  return {
    service: {
      tenantClient: modelProxy,
      unscopedClient: modelProxy,
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: jest.fn((fn: (tx: any) => any) => fn(modelProxy)),
      setTenantId: jest.fn(),
      getTenantId: jest.fn().mockReturnValue('test-tenant-id'),
    },
    mocks: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      count: mockCount,
      aggregate: mockAggregate,
      groupBy: mockGroupBy,
    },
  };
}

/**
 * Mock ConfigService for testing.
 * Provides default env values.
 */
export function createMockConfigService(
  overrides: Record<string, unknown> = {},
): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'test-jwt-access-secret-32chars!!!',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-32chars!!',
    JWT_ACCESS_EXPIRES_IN: '1h',
    JWT_REFRESH_EXPIRES_IN: '30d',
    REDIS_URL: 'redis://localhost:6379',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    PLATFORM_BOT_URL: 'https://t.me/test_bot',
    'subscription.priceUsd': 10,
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => defaults[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in defaults)) throw new Error(`Missing config: ${key}`);
      return defaults[key];
    }),
  };
}

/**
 * Create a test JWT payload (simulates authenticated user).
 * docs/api/authentication.md — JWT claims
 */
export function createTestJwtPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'test-user-id',
    telegramId: 123456789,
    tenantId: 'test-tenant-id',
    role: 'master',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

/**
 * Create mock tenant data.
 * docs/database/schema.md — Tenant model
 */
export function createTestTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-tenant-id',
    ownerId: 'test-user-id',
    businessName: 'Test Beauty Studio',
    slug: 'test-studio',
    timezone: 'Europe/Kyiv',
    language: 'uk',
    currency: 'UAH',
    slotStepMinutes: 30,
    cancellationWindowHours: 2,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create mock user data.
 * docs/database/schema.md — User model
 */
export function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-user-id',
    telegramId: BigInt(123456789),
    firstName: 'Тест',
    lastName: 'Користувач',
    username: 'test_user',
    languageCode: 'uk',
    role: 'master',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create mock booking data.
 * docs/database/schema.md — Booking model
 */
export function createTestBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-001',
    tenantId: 'test-tenant-id',
    clientId: 'client-001',
    serviceId: 'service-001',
    date: new Date('2024-06-15'),
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    serviceName: 'Манікюр',
    servicePrice: 500,
    serviceDuration: 60,
    clientName: 'Клієнт Тестовий',
    clientPhone: '+380991234567',
    createdAt: new Date('2024-06-14T12:00:00Z'),
    updatedAt: new Date('2024-06-14T12:00:00Z'),
    ...overrides,
  };
}

/**
 * Create mock subscription data.
 * docs/database/schema.md — Subscription model
 */
export function createTestSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-001',
    tenantId: 'test-tenant-id',
    status: 'active',
    paymentProvider: 'monobank',
    currentPeriodStart: new Date('2024-06-01'),
    currentPeriodEnd: new Date('2024-07-01'),
    trialEndsAt: null,
    retryCount: 0,
    createdAt: new Date('2024-06-01T00:00:00Z'),
    updatedAt: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create mock service data.
 * docs/database/schema.md — Service model
 */
export function createTestService(overrides: Record<string, unknown> = {}) {
  return {
    id: 'service-001',
    tenantId: 'test-tenant-id',
    name: 'Манікюр класичний',
    duration: 60,
    bufferTime: 15,
    price: 500,
    currency: 'UAH',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}
