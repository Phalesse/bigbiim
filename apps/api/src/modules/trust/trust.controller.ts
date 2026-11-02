import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { TrustService } from './trust.service';

/**
 * Module trust — Avis, réputation, litiges
 * Logiques métier à coder ici (document, section 3) :
 *   3.12 Litiges
 *   3.13 Réputation
 */
@Controller()
export class TrustController {
  constructor(private readonly service: TrustService) {}

  /** Liste des litiges — rôles : A */
  @Get('admin/disputes')
  @Roles('A')
  getAdminDisputes(@Query() query: Record<string, string>) {
    return this.service.getAdminDisputes({ query });
  }

  /** Note et avis — rôles : C */
  @Post('missions/:id/review')
  @Roles('C')
  postMissionsByIdReview(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postMissionsByIdReview({ params, body, principal });
  }

  /** Ouvre un litige — rôles : C,P */
  @Post('disputes')
  @Roles('C', 'P')
  postDisputes(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.postDisputes({ body, principal });
  }

  /** Ajoute une preuve — rôles : C,P */
  @Post('disputes/:id/evidence')
  @Roles('C', 'P')
  postDisputesByIdEvidence(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postDisputesByIdEvidence({ params, body, principal });
  }

  /** Rend une décision — rôles : A */
  @Post('admin/disputes/:id/decision')
  @Roles('A')
  postAdminDisputesByIdDecision(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postAdminDisputesByIdDecision({ params, body, principal });
  }

}
