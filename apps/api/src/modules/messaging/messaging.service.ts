import { Injectable, NotImplementedException } from '@nestjs/common';
import { RequestInput } from '../../common/request-input';

/**
 * Module messaging — Messages, temps réel
 * Logiques métier à coder ici (document, section 3) :
 *   3.19 Anti-contournement et fraude
 */
@Injectable()
export class MessagingService {
  /** GET /projects/{id}/messages — Historique des messages */
  async getProjectsByIdMessages(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Messagerie indisponible : les règles d’accès aux pièces jointes et de modération anti-contournement ne sont pas définies.',
    );
  }

  /** POST /projects/{id}/messages — Envoie un message */
  async postProjectsByIdMessages(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Envoi indisponible : les règles anti-contournement/modération et le traitement des pièces jointes ne sont pas configurés.',
    );
  }

}
