import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from './oidc-token.service';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedPrincipal }>();
    if (!request.user) throw new UnauthorizedException('Utilisateur authentifié absent');
    return request.user;
  },
);
