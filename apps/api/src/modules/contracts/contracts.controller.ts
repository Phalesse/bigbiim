import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { ContractsService } from './contracts.service';

/**
 * Module contracts — Modèles, génération PDF, signatures
 * Logiques métier à coder ici (document, section 3) :
 *   3.9 Contrat et signature
 */
@Controller()
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  /** Liste des modèles de contrat — rôles : A */
  @Get('admin/contract-templates')
  @Roles('A')
  getAdminContractTemplates(@Query() query: Record<string, string>) {
    return this.service.getAdminContractTemplates({ query });
  }

  /** Contrat courant — rôles : C,P,A */
  @Get('projects/:id/contract')
  @Roles('C', 'P', 'A')
  getProjectsByIdContract(
    @Param() params: Record<string, string>,
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getProjectsByIdContract({ params, query, principal });
  }

  /** Signature (OTP) — rôles : C,P */
  @Post('contracts/:id/sign')
  @Roles('C', 'P')
  postContractsByIdSign(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postContractsByIdSign({ params, body });
  }

  /** Document signé — rôles : C,P,A */
  @Get('contracts/:id/pdf')
  @Roles('C', 'P', 'A')
  getContractsByIdPdf(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getContractsByIdPdf({ params, query });
  }

}
