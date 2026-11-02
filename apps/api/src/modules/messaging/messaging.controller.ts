import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator';
import { MessagingService } from './messaging.service';

/**
 * Module messaging — Messages, temps réel
 * Logiques métier à coder ici (document, section 3) :
 *   3.19 Anti-contournement et fraude
 */
@Controller()
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  /** Historique des messages — rôles : C,P,A */
  @Get('projects/:id/messages')
  @Roles('C', 'P', 'A')
  getProjectsByIdMessages(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getProjectsByIdMessages({ params, query });
  }

  /** Envoie un message — rôles : C,P,A */
  @Post('projects/:id/messages')
  @Roles('C', 'P', 'A')
  postProjectsByIdMessages(@Param() params: Record<string, string>, @Body() body: unknown) {
    return this.service.postProjectsByIdMessages({ params, body });
  }

}
