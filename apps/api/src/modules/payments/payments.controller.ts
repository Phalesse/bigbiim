import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { Idempotent } from '../../common/idempotency';
import { PaymentsService } from './payments.service';

/**
 * Module payments — Grand livre, séquestre, paiements, retraits
 * Logiques métier à coder ici (document, section 3) :
 *   3.10 Paiement, séquestre et commissions
 */
@Controller()
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  /** Crée un paiement (acompte ou solde) — rôles : C */
  @Post('payments/intents')
  @Roles('C')
  @Idempotent()
  postPaymentsIntents(@Body() body: unknown) {
    return this.service.postPaymentsIntents({ body });
  }

  /** Confirmation Mobile Money ou carte — rôles : operator */
  @Post('payments/webhooks/:operator')
  @Roles('operator')
  postPaymentsWebhooksByOperator(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postPaymentsWebhooksByOperator({ params, body });
  }

  /** Historique — rôles : C,A */
  @Get('payments')
  @Roles('C', 'A')
  getPayments(@Query() query: Record<string, string>, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.getPayments({ query, principal });
  }

  /** Solde et mouvements — rôles : P */
  @Get('wallets/me')
  @Roles('P')
  getWalletsMe(@Query() query: Record<string, string>) {
    return this.service.getWalletsMe({ query });
  }

  /** Demande de retrait — rôles : P */
  @Post('wallets/me/payouts')
  @Roles('P')
  @Idempotent()
  postWalletsMePayouts(@Body() body: unknown) {
    return this.service.postWalletsMePayouts({ body });
  }

  /** Factures et reçus — rôles : C,P */
  @Get('invoices')
  @Roles('C', 'P')
  getInvoices(
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getInvoices({ query, principal });
  }

  /** Remboursement — rôles : A */
  @Post('admin/refunds')
  @Roles('A')
  @Idempotent()
  postAdminRefunds(@Body() body: unknown) {
    return this.service.postAdminRefunds({ body });
  }

  /** Valide un retrait sensible — rôles : A */
  @Post('admin/payouts/:id/approve')
  @Roles('A')
  @Idempotent()
  postAdminPayoutsByIdApprove(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postAdminPayoutsByIdApprove({ params, body });
  }

}
