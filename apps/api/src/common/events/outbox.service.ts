import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { DomainEventType } from './domain-events';

/**
 * Publication fiable des événements : on écrit dans OutboxEvent dans la même transaction
 * que le changement métier ; le worker (outbox-publisher) publie ensuite sur NATS JetStream.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  add(type: DomainEventType, payload: Prisma.InputJsonValue) {
    return this.prisma.outboxEvent.create({ data: { type, payload } });
  }
}
