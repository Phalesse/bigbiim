import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Section 2 : en-tête `Idempotency-Key` obligatoire sur tous les POST qui touchent l'argent.
 * Ici : contrôle de présence seulement.
 * À coder : mémoriser la clé (Redis / LedgerTransaction.idempotencyKey) et rejouer la réponse.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!req.headers['idempotency-key']) {
      throw new BadRequestException('En-tête Idempotency-Key obligatoire');
    }
    return next.handle();
  }
}

export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);
