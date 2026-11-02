import { Controller, Get, Patch, Post, Put, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { ProvidersService } from './providers.service';

/**
 * Module providers — Profils, KYC, disponibilités, zones
 * Logiques métier à coder ici (document, section 3) :
 *   3.14 Vérification des prestataires (KYC)
 *   3.13 Réputation
 */
@Controller()
export class ProvidersController {
  constructor(private readonly service: ProvidersService) {}

  /** Crée le profil prestataire — rôles : P */
  @Post('providers')
  @Roles('P')
  postProviders(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.postProviders({ body, principal });
  }

  /** Profil privé complet — rôles : P,A */
  @Get('providers/:id')
  @Roles('P', 'A')
  getProvidersById(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProvidersById({ params, query, principal });
  }

  /** Modifie le profil — rôles : P */
  @Patch('providers/:id')
  @Roles('P')
  patchProvidersById(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.patchProvidersById({ params, body, principal });
  }

  /** Profil public — rôles : public */
  @Get('providers/:id/public')
  @Roles('public')
  getProvidersByIdPublic(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getProvidersByIdPublic({ params, query });
  }

  /** Compétences déclarées — rôles : P */
  @Put('providers/:id/skills')
  @Roles('P')
  putProvidersByIdSkills(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.putProvidersByIdSkills({ params, body, principal });
  }

  /** Dépose un justificatif — rôles : P */
  @Post('providers/:id/documents')
  @Roles('P')
  postProvidersByIdDocuments(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postProvidersByIdDocuments({ params, body, principal });
  }

  /** Agenda et capacité — rôles : P */
  @Put('providers/:id/availability')
  @Roles('P')
  putProvidersByIdAvailability(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.putProvidersByIdAvailability({ params, body, principal });
  }

  /** Zones d’intervention — rôles : P */
  @Put('providers/:id/zones')
  @Roles('P')
  putProvidersByIdZones(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.putProvidersByIdZones({ params, body, principal });
  }

  /** Tarifs par compétence — rôles : P */
  @Put('providers/:id/rates')
  @Roles('P')
  putProvidersByIdRates(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.putProvidersByIdRates({ params, body, principal });
  }

  /** Avis reçus — rôles : public */
  @Get('providers/:id/reviews')
  @Roles('public')
  getProvidersByIdReviews(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getProvidersByIdReviews({ params, query });
  }

  /** File de validation (status) — rôles : A */
  @Get('admin/providers')
  @Roles('A')
  getAdminProviders(@Query() query: Record<string, string>) {
    return this.service.getAdminProviders({ query });
  }

  /** Valide — rôles : A */
  @Post('admin/providers/:id/verify')
  @Roles('A')
  postAdminProvidersByIdVerify(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postAdminProvidersByIdVerify({ params, body, principal });
  }

  /** Refuse avec motif — rôles : A */
  @Post('admin/providers/:id/reject')
  @Roles('A')
  postAdminProvidersByIdReject(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postAdminProvidersByIdReject({ params, body, principal });
  }

  /** Suspend — rôles : A */
  @Post('admin/providers/:id/suspend')
  @Roles('A')
  postAdminProvidersByIdSuspend(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postAdminProvidersByIdSuspend({ params, body, principal });
  }

}
