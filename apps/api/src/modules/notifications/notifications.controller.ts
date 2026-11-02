import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { Roles } from '../../common/roles.decorator';
import { NotificationsService } from './notifications.service';

/**
 * Module notifications — Canaux, modèles, repli
 * Logiques métier à coder ici (document, section 3) :
 *   3.18 Notifications
 */
@Controller()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /** Liste — rôles : any */
  @Get('notifications')
  @Roles('any')
  getNotifications(
    @Query() query: Record<string, string>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.getNotifications({ query, principal });
  }

  /** Marque comme lue — rôles : any */
  @Post('notifications/:id/read')
  @Roles('any')
  postNotificationsByIdRead(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.service.postNotificationsByIdRead({ params, body, principal });
  }

}
