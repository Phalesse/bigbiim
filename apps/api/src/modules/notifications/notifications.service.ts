import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /notifications — Liste personnelle */
  async getNotifications(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && !query.cursor.trim()) {
      throw new BadRequestException('cursor ne peut pas être vide.');
    }
    const results = await this.prisma.notification.findMany({
      where: {
        userId: principal.id,
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = results.length > limit;
    const items = results.slice(0, limit);
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  /** POST /notifications/{id}/read — Marque comme lue */
  async postNotificationsByIdRead(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    const id = input.params?.id;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!id) throw new BadRequestException('Identifiant de notification manquant.');
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: principal.id, deletedAt: null },
    });
    if (!notification) throw new NotFoundException('Notification introuvable.');
    if (notification.status === 'LU') return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'LU', version: { increment: 1 } },
    });
  }
}
