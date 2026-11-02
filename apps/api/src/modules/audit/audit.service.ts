import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

/**
 * Module audit — Journal immuable
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/kpis — Indicateurs */
  async getAdminKpis(input: RequestInput): Promise<unknown> {
    void input;
    const activeProjectStatuses = ['CONFIRME', 'EN_COURS', 'EN_LITIGE'];
    const [projectCount, activeProjectCount, verifiedProviderCount, openDisputeCount, activeProjectAmounts] =
      await Promise.all([
        this.prisma.project.count({ where: { deletedAt: null } }),
        this.prisma.project.count({
          where: { deletedAt: null, status: { in: activeProjectStatuses } },
        }),
        this.prisma.provider.count({
          where: { deletedAt: null, kycLevel: { gte: 1 } },
        }),
        this.prisma.dispute.count({
          where: { deletedAt: null, decision: { equals: Prisma.DbNull } },
        }),
        this.prisma.project.groupBy({
          by: ['currency'],
          where: {
            deletedAt: null,
            status: { in: activeProjectStatuses },
            totalAmount: { not: null },
          },
          _sum: { totalAmount: true },
        }),
      ]);

    return {
      projects: {
        total: projectCount,
        active: activeProjectCount,
        activeAmounts: activeProjectAmounts.map((entry) => ({
          currency: entry.currency,
          amount: entry._sum.totalAmount?.toString() ?? '0',
        })),
      },
      providers: { verified: verifiedProviderCount },
      disputes: { open: openDisputeCount },
      asOf: new Date().toISOString(),
    };
  }

  /** GET /admin/audit-logs — Journal d’audit */
  async getAdminAuditLogs(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    const cursor = query.cursor?.trim();
    if (query.cursor !== undefined && (!cursor || cursor.length > 200)) {
      throw new BadRequestException('cursor est invalide');
    }
    if (cursor) {
      const cursorExists = await this.prisma.auditLog.findUnique({
        where: { id: cursor },
        select: { id: true },
      });
      if (!cursorExists) throw new BadRequestException('cursor ne correspond à aucun événement d’audit');
    }
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
    };
    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ at: 'desc' }, { id: 'asc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  /** GET /admin/settings — Paramètres */
  async getAdminSettings(input: RequestInput): Promise<unknown> {
    void input;
    const items = await this.prisma.setting.findMany({
      where: { deletedAt: null },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return { items };
  }

  /** PUT /admin/settings — Commissions, zones, drapeaux */
  async putAdminSettings(input: RequestInput): Promise<unknown> {
    if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
      throw new BadRequestException('Le corps doit contenir un objet JSON.');
    }
    const body = input.body as Record<string, unknown>;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items doit contenir au moins un paramètre.');
    }

    if (body.items.length > 100) throw new BadRequestException('Au maximum 100 paramètres peuvent être enregistrés à la fois.');
    const updates = body.items.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestException(`items[${index}] doit être un objet.`);
      }
      const item = entry as Record<string, unknown>;
      if (typeof item.key !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(item.key)) {
        throw new BadRequestException(`items[${index}].key est invalide.`);
      }
      if (item.value === undefined) throw new BadRequestException(`items[${index}].value est obligatoire.`);
      const scope = typeof item.scope === 'string' && item.scope.trim() ? item.scope.trim() : 'global';
      const value = item.value === null
        ? Prisma.JsonNull
        : JSON.parse(JSON.stringify(item.value)) as Prisma.InputJsonValue;
      return { key: item.key, scope, value };
    });
    if (new Set(updates.map((item) => item.key)).size !== updates.length) {
      throw new BadRequestException('Chaque clé de paramètre doit être unique dans la requête.');
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = [];
      for (const setting of updates) {
        const previous = await tx.setting.findUnique({ where: { key: setting.key } });
        const next = await tx.setting.upsert({
          where: { key: setting.key },
          create: setting,
          update: { scope: setting.scope, value: setting.value, version: { increment: 1 }, deletedAt: null },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.principal?.id ?? null,
            action: previous ? 'SETTING_UPDATED' : 'SETTING_CREATED',
            entity: 'Setting',
            entityId: next.id,
            before: previous ? previous.value as Prisma.InputJsonValue : Prisma.JsonNull,
            after: setting.value,
            at: new Date(),
          },
        });
        saved.push(next);
      }
      return { items: saved };
    });
  }

}
