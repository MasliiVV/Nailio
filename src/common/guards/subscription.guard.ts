// docs/security/permissions.md — SubscriptionGuard
// docs/backlog.md #59 — @RequiresActiveSubscription guard

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../decorators/requires-active-subscription.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip if @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Check if endpoint requires active subscription
    const requiresActive = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresActive) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    // Admin: no subscription concept
    if (!user || user.role === 'platform_admin') return true;

    // Must have tenantId
    if (!user.tenantId) return false;

    // Check subscription status
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!subscription) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Active subscription required',
      });
    }

    // docs/payments/subscription-lifecycle.md — allowed statuses
    const activeStatuses = ['trial', 'active', 'past_due'];
    if (!activeStatuses.includes(subscription.status)) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Subscription expired. Read-only mode.',
      });
    }

    return true;
  }
}
