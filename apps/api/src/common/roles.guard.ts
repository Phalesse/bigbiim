import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OidcTokenService } from './oidc-token.service';
import type { AuthenticatedPrincipal } from './oidc-token.service';
import { ROLES_KEY } from './roles.decorator';
import type { Role } from './roles';

interface AuthenticatedRequest {
  headers: { authorization?: string | string[] };
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly oidcTokenService: OidcTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const declared = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required: Role[] = declared ?? ['any'];
    if (required.length === 1 && required[0] === 'public') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const principal = await this.oidcTokenService.authenticate(
      Array.isArray(authorization) ? undefined : authorization,
    );
    request.user = principal;

    if (required.includes('any') || required.includes('authorized')) return true;
    if (required.some((role) => principal.roles.includes(role))) return true;
    throw new ForbiddenException('Rôle insuffisant');
  }
}
