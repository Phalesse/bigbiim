import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator';
import { CatalogService } from './catalog.service';

/**
 * Module catalog — Secteurs, compétences, activités, versions
 * Logiques métier à coder ici (document, section 3) :
 *   3.15 Versionnage des modèles d’activité
 */
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  /** Arborescence des secteurs — rôles : public */
  @Get('sectors')
  @Roles('public')
  getSectors(@Query() query: Record<string, string>) {
    return this.service.getSectors({ query });
  }

  /** Recherche (q, sector, city, page) — rôles : public */
  @Get('activities')
  @Roles('public')
  getActivities(@Query() query: Record<string, string>) {
    return this.service.getActivities({ query });
  }

  /** Fiche activité publiée — rôles : public */
  @Get('activities/:id')
  @Roles('public')
  getActivitiesById(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getActivitiesById({ params, query });
  }

  /** Questionnaire de la version publiée — rôles : public */
  @Get('activities/:id/questionnaire')
  @Roles('public')
  getActivitiesByIdQuestionnaire(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getActivitiesByIdQuestionnaire({ params, query });
  }

  /** Fourchette de prix indicative — rôles : public */
  @Get('activities/:id/estimate')
  @Roles('public')
  getActivitiesByIdEstimate(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getActivitiesByIdEstimate({ params, query });
  }

  /** Catalogue de compétences — rôles : public */
  @Get('skills')
  @Roles('public')
  getSkills(@Query() query: Record<string, string>) {
    return this.service.getSkills({ query });
  }

}
