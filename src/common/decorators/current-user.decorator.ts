// docs/api/authentication.md — JWT payload → current user
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;       // user.id (UUID)
  telegramId: number;
  role: 'master' | 'client' | 'platform_admin';
  tenantId: string | null;
  clientId?: string; // only for role=client
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? user?.[data] : user;
  },
);
