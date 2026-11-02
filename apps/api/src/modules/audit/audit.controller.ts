import { Controller, Get, Put, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { AuditService } from './audit.service';

/**
 * Module audit — Journal immuable
 */
@Controller()
export class AuditController {
  constructor(private readonly service: AuditService) {}

  /** Indicateurs — rôles : A */
  @Get('admin/kpis')
  @Roles('A')
  getAdminKpis(@Query() query: Record<string, string>) {
    return this.service.getAdminKpis({ query });
  }

  /** Journal d’audit — rôles : A */
  @Get('admin/audit-logs')
  @Roles('A')
  getAdminAuditLogs(@Query() query: Record<string, string>) {
    return this.service.getAdminAuditLogs({ query });
  }

  /** Paramètres de la plateforme — rôles : A */
  @Get('admin/settings')
  @Roles('A')
  getAdminSettings(@Query() query: Record<string, string>) {
    return this.service.getAdminSettings({ query });
  }

  /** Commissions, zones, drapeaux — rôles : A */
  @Put('admin/settings')
  @Roles('A')
  putAdminSettings(@Body() body: unknown, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.putAdminSettings({ body, principal });
  }

}
