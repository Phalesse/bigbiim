import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { BuilderService } from './builder.service';

/**
 * Module builder — Activity Builder : validation, simulation, publication
 * Logiques métier à coder ici (document, section 3) :
 *   3.3 Moteur de questionnaire dynamique
 *   3.4 Moteur de règles et de formules
 *   3.15 Versionnage des modèles d’activité
 */
@Controller()
export class BuilderController {
  constructor(private readonly service: BuilderService) {}

  /** Crée une activité en brouillon — rôles : A */
  @Post('admin/activities')
  @Roles('A')
  postAdminActivities(@Body() body: unknown) {
    return this.service.postAdminActivities({ body });
  }

  /** Liste avec statuts — rôles : A */
  @Get('admin/activities')
  @Roles('A')
  getAdminActivities(@Query() query: Record<string, string>) {
    return this.service.getAdminActivities({ query });
  }

  /** Document complet du brouillon — rôles : A */
  @Get('admin/activities/:id/draft')
  @Roles('A')
  getAdminActivitiesByIdDraft(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getAdminActivitiesByIdDraft({ params, query });
  }

  /** Enregistre le brouillon — rôles : A */
  @Put('admin/activities/:id/draft')
  @Roles('A')
  putAdminActivitiesByIdDraft(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.putAdminActivitiesByIdDraft({ params, body });
  }

  /** Contrôle de cohérence (rôles, graphe sans cycle, formules valides) — rôles : A */
  @Post('admin/activities/:id/validate')
  @Roles('A')
  postAdminActivitiesByIdValidate(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postAdminActivitiesByIdValidate({ params, body });
  }

  /** Exécute un faux projet — rôles : A */
  @Post('admin/activities/:id/simulate')
  @Roles('A')
  postAdminActivitiesByIdSimulate(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postAdminActivitiesByIdSimulate({ params, body });
  }

  /** Publie la version n — rôles : A */
  @Post('admin/activities/:id/publish')
  @Roles('A')
  postAdminActivitiesByIdPublish(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postAdminActivitiesByIdPublish({ params, body, principal });
  }

  /** Historique des versions — rôles : A */
  @Get('admin/activities/:id/versions')
  @Roles('A')
  getAdminActivitiesByIdVersions(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getAdminActivitiesByIdVersions({ params, query });
  }

  /** Retire du catalogue (projets en cours conservés) — rôles : A */
  @Post('admin/activities/:id/retire')
  @Roles('A')
  postAdminActivitiesByIdRetire(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postAdminActivitiesByIdRetire({ params, body });
  }

  /** Crée ou modifie une compétence — rôles : A */
  @Post('admin/skills')
  @Roles('A')
  postAdminSkills(@Body() body: unknown) {
    return this.service.postAdminSkills({ body });
  }

  /** Crée ou modifie un secteur — rôles : A */
  @Post('admin/sectors')
  @Roles('A')
  postAdminSectors(@Body() body: unknown) {
    return this.service.postAdminSectors({ body });
  }

}
