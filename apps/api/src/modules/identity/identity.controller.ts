import { Controller, Delete, Get, Patch, Post, Put, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { IdentityService } from './identity.service';

/**
 * Module identity — Comptes, sessions, rôles, consentements
 * Logiques métier à coder ici (document, section 3) :
 *   3.20 Permissions (RBAC)
 */
@Controller()
export class IdentityController {
  constructor(private readonly service: IdentityService) {}

  /** Envoie un code par SMS/WhatsApp — rôles : public */
  @Post('auth/otp/request')
  @Roles('public')
  postAuthOtpRequest(@Body() body: unknown) {
    return this.service.postAuthOtpRequest({ body });
  }

  /** Vérifie le code, renvoie les jetons — rôles : public */
  @Post('auth/otp/verify')
  @Roles('public')
  postAuthOtpVerify(@Body() body: unknown) {
    return this.service.postAuthOtpVerify({ body });
  }

  /** Crée un compte (client ou prestataire) — rôles : public */
  @Post('auth/register')
  @Roles('public')
  postAuthRegister(@Body() body: unknown) {
    return this.service.postAuthRegister({ body });
  }

  /** Connexion par e-mail et mot de passe — rôles : public */
  @Post('auth/login')
  @Roles('public')
  postAuthLogin(@Body() body: unknown) {
    return this.service.postAuthLogin({ body });
  }

  /** Renouvelle le jeton — rôles : any */
  @Post('auth/refresh')
  @Roles('any')
  postAuthRefresh(@Body() body: unknown) {
    return this.service.postAuthRefresh({ body });
  }

  /** Révoque la session — rôles : any */
  @Post('auth/logout')
  @Roles('any')
  postAuthLogout(@Body() body: unknown) {
    return this.service.postAuthLogout({ body });
  }

  /** Profil courant — rôles : any */
  @Get('me')
  @Roles('any')
  getMe(@Query() query: Record<string, string>, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.getMe({ query, principal });
  }

  /** Modifie le profil — rôles : any */
  @Patch('me')
  @Roles('any')
  patchMe(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.patchMe({ body, principal });
  }

  /** Canaux et langues — rôles : any */
  @Put('me/notification-preferences')
  @Roles('any')
  putMeNotificationPreferences(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.putMeNotificationPreferences({ body, principal });
  }

  /** Demande de suppression (droit à l’effacement) — rôles : any */
  @Delete('me')
  @Roles('any')
  deleteMe(@Query() query: Record<string, string>, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.deleteMe({ query, principal });
  }

  /** Liste des comptes et des rôles — rôles : A */
  @Get('admin/users')
  @Roles('A')
  getAdminUsers(@Query() query: Record<string, string>) {
    return this.service.getAdminUsers({ query });
  }
}
