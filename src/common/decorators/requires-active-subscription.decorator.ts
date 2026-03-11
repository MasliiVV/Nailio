// docs/security/permissions.md — @RequiresActiveSubscription() decorator
import { SetMetadata } from '@nestjs/common';

export const REQUIRES_ACTIVE_SUBSCRIPTION_KEY = 'requiresActiveSubscription';
export const RequiresActiveSubscription = () => SetMetadata(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, true);
