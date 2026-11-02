import { Controller, Get, Patch, Post, Put, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { Idempotent } from '../../common/idempotency';
import { ProjectsService } from './projects.service';

/**
 * Module projects — Machine à états, devis, plan, missions, jalons
 * Logiques métier à coder ici (document, section 3) :
 *   3.1 Cycle de vie d’un projet
 *   3.2 Cycle de vie d’une mission
 *   3.5 Génération du plan de projet
 *   3.6 Calcul du devis
 *   3.8 Offres de mission
 *   3.11 Jalons et preuves
 *   3.16 Modification d’un projet en cours
 */
@Controller()
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  /** Crée un projet depuis une version d’activité — rôles : C */
  @Post('projects')
  @Roles('C')
  postProjects(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.postProjects({ body, principal });
  }

  /** Enregistre les réponses du questionnaire — rôles : C */
  @Patch('projects/:id/answers')
  @Roles('C')
  patchProjectsByIdAnswers(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.patchProjectsByIdAnswers({ params, body, principal });
  }

  /** Calcule le devis — rôles : C */
  @Post('projects/:id/quote')
  @Roles('C')
  postProjectsByIdQuote(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postProjectsByIdQuote({ params, body, principal });
  }

  /** Lit le devis courant — rôles : C */
  @Get('projects/:id/quote')
  @Roles('C')
  getProjectsByIdQuote(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjectsByIdQuote({ params, query, principal });
  }

  /** Lance le matching — rôles : C */
  @Post('projects/:id/team/suggest')
  @Roles('C')
  postProjectsByIdTeamSuggest(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postProjectsByIdTeamSuggest({ params, body, principal });
  }

  /** Choisit un prestataire pour un rôle — rôles : C */
  @Put('projects/:id/team/:role')
  @Roles('C')
  putProjectsByIdTeamByRole(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.putProjectsByIdTeamByRole({ params, body, principal });
  }

  /** Remplace un prestataire — rôles : C,A */
  @Post('projects/:id/team/:role/replace')
  @Roles('C', 'A')
  postProjectsByIdTeamByRoleReplace(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postProjectsByIdTeamByRoleReplace({ params, body, principal });
  }

  /** Génère le contrat et ouvre la réservation — rôles : C */
  @Post('projects/:id/confirm')
  @Roles('C')
  postProjectsByIdConfirm(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postProjectsByIdConfirm({ params, body });
  }

  /** Liste des projets — rôles : C,A */
  @Get('projects')
  @Roles('C', 'A')
  getProjects(
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjects({ query, principal });
  }

  /** Détail — rôles : C,P,A */
  @Get('projects/:id')
  @Roles('C', 'P', 'A')
  getProjectsById(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjectsById({ params, query, principal });
  }

  /** Chronologie et phases — rôles : C,P,A */
  @Get('projects/:id/timeline')
  @Roles('C', 'P', 'A')
  getProjectsByIdTimeline(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjectsByIdTimeline({ params, query, principal });
  }

  /** Annule selon les règles — rôles : C,A */
  @Post('projects/:id/cancel')
  @Roles('C', 'A')
  postProjectsByIdCancel(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postProjectsByIdCancel({ params, body, principal });
  }

  /** Offres et missions du prestataire — rôles : P */
  @Get('missions')
  @Roles('P')
  getMissions(
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getMissions({ query, principal });
  }

  /** Accepte — rôles : P */
  @Post('missions/:id/accept')
  @Roles('P')
  postMissionsByIdAccept(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdAccept({ params, body, principal });
  }

  /** Refuse avec motif — rôles : P */
  @Post('missions/:id/decline')
  @Roles('P')
  postMissionsByIdDecline(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdDecline({ params, body, principal });
  }

  /** Contre-proposition (prix, date) — rôles : P */
  @Post('missions/:id/counter')
  @Roles('P')
  postMissionsByIdCounter(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdCounter({ params, body, principal });
  }

  /** Répond à une contre-proposition — rôles : C,A */
  @Post('missions/:id/counter/resolve')
  @Roles('C', 'A')
  postMissionsByIdCounterResolve(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdCounterResolve({ params, body, principal });
  }

  /** Démarre — rôles : P */
  @Post('missions/:id/start')
  @Roles('P')
  postMissionsByIdStart(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdStart({ params, body, principal });
  }

  /** Déclare l’avancement — rôles : P */
  @Post('missions/:id/progress')
  @Roles('P')
  postMissionsByIdProgress(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdProgress({ params, body, principal });
  }

  /** Dépose un livrable — rôles : P */
  @Post('missions/:id/deliverables')
  @Roles('P')
  postMissionsByIdDeliverables(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdDeliverables({ params, body, principal });
  }

  /** Déclare la mission terminée — rôles : P */
  @Post('missions/:id/complete')
  @Roles('P')
  postMissionsByIdComplete(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdComplete({ params, body, principal });
  }

  /** Jalons du projet — rôles : C,P,A */
  @Get('projects/:id/milestones')
  @Roles('C', 'P', 'A')
  getProjectsByIdMilestones(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjectsByIdMilestones({ params, query, principal });
  }

  /** Soumet les preuves — rôles : P */
  @Post('milestones/:id/submit-proof')
  @Roles('P')
  postMilestonesByIdSubmitProof(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMilestonesByIdSubmitProof({ params, body, principal });
  }

  /** Valide, libère le paiement — rôles : C */
  @Post('milestones/:id/approve')
  @Roles('C')
  @Idempotent()
  postMilestonesByIdApprove(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMilestonesByIdApprove({ params, body, principal });
  }

  /** Conteste, ouvre un litige — rôles : C */
  @Post('milestones/:id/contest')
  @Roles('C')
  postMilestonesByIdContest(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMilestonesByIdContest({ params, body, principal });
  }

}
