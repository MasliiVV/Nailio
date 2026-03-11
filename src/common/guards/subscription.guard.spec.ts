// docs/backlog.md #115 — Unit tests: Subscription Guard
// Tests: SubscriptionGuard.canActivate() — subscription status checks

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionGuard } from './subscription.guard';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../decorators/requires-active-subscription.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let reflector: Reflector;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      subscription: {
        findUnique: jest.fn(),
      },
    };
    guard = new SubscriptionGuard(reflector, prisma);
  });

  function createMockContext(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: any = null,
    overrides: { isPublic?: boolean; requiresActive?: boolean } = {},
  ) {
    const handler = jest.fn();
    const cls = jest.fn();

    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) return overrides.isPublic ?? false;
      if (key === REQUIRES_ACTIVE_SUBSCRIPTION_KEY) return overrides.requiresActive ?? false;
      return false;
    });

    return {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  describe('canActivate()', () => {
    it('should allow @Public() endpoints', async () => {
      const ctx = createMockContext(null, { isPublic: true });
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow endpoints without @RequiresActiveSubscription', async () => {
      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: false },
      );
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow platform_admin regardless', async () => {
      const ctx = createMockContext(
        { sub: '1', role: 'platform_admin', tenantId: null },
        { requiresActive: true },
      );
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should throw SUBSCRIPTION_REQUIRED when no subscription exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_REQUIRED' },
      });
    });

    it('should allow trial subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'trial',
        tenantId: 'tenant-1',
      });

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow active subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'active',
        tenantId: 'tenant-1',
      });

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should allow past_due subscription (grace period)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'past_due',
        tenantId: 'tenant-1',
      });

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should throw SUBSCRIPTION_EXPIRED for expired subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'expired',
        tenantId: 'tenant-1',
      });

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_EXPIRED' },
      });
    });

    it('should throw SUBSCRIPTION_EXPIRED for cancelled subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'cancelled',
        tenantId: 'tenant-1',
      });

      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: 'tenant-1' },
        { requiresActive: true },
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should return false when user has no tenantId', async () => {
      const ctx = createMockContext(
        { sub: '1', role: 'master', tenantId: null },
        { requiresActive: true },
      );

      expect(await guard.canActivate(ctx)).toBe(false);
    });
  });
});
