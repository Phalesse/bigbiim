import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';

/**
 * Temps réel (WebSocket /ws) : messages et statuts (section 2.8).
 * À coder : authentification du jeton, salons par projet, diffusion des messages et des changements d'état.
 */
@WebSocketGateway({ path: '/ws' })
export class MessagingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(MessagingGateway.name);

  handleConnection() {
    this.logger.log('Client WebSocket connecté');
  }
}
