import { BadRequestException, Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

/**
 * Module payments — Grand livre, séquestre, paiements, retraits
 * Logiques métier à coder ici (document, section 3) :
 *   3.10 Paiement, séquestre et commissions
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /payments/intents — Crée un paiement (acompte ou solde) */
  async postPaymentsIntents(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Création de paiement indisponible : aucun agrégateur n’est sélectionné (ADR 0006/DECISIONS À CONFIRMER); aucune transaction financière locale ne sera simulée.',
    );
  }

  /** POST /payments/webhooks/{operator} — Confirmation Mobile Money ou carte */
  async postPaymentsWebhooksByOperator(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Webhook indisponible : intégration opérateur et vérification de signature non configurées.',
    );
  }

  /** GET /payments — Historique */
  async getPayments(input: RequestInput): Promise<unknown> {
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
    const results = await this.prisma.paymentIntent.findMany({
      where: {
        deletedAt: null,
        ...(principal.roles.includes('A') ? {} : { payerId: principal.id }),
        ...(query.status ? { status: query.status } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = results.length > limit;
    const items = results.slice(0, limit);
    return {
      items: items.map((item) => ({ ...item, amount: item.amount.toString() })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  /** GET /wallets/me — Solde et mouvements */
  async getWalletsMe(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Solde indisponible : les types de comptes disponibles et la politique de rapprochement du grand livre ne sont pas définis.',
    );
  }

  /** POST /wallets/me/payouts — Demande de retrait */
  async postWalletsMePayouts(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Retrait indisponible : les coordonnées opérateur et le partenaire de paiement agréé ne sont pas configurés.',
    );
  }

  /** GET /invoices — Factures et reçus */
  async getInvoices(input: RequestInput): Promise<unknown> {
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
    const projectAccess: { clientId?: string; id?: { in: string[] } }[] = [];
    if (principal.roles.includes('C')) projectAccess.push({ clientId: principal.id });
    if (principal.roles.includes('P')) {
      const provider = await this.prisma.provider.findFirst({
        where: { userId: principal.id, deletedAt: null },
        select: { id: true },
      });
      if (provider) {
        const missions = await this.prisma.mission.findMany({
          where: { providerId: provider.id, deletedAt: null },
          select: { projectRoleId: true },
        });
        const roles = missions.length
          ? await this.prisma.projectRole.findMany({
              where: {
                id: { in: missions.map(({ projectRoleId }) => projectRoleId) },
                deletedAt: null,
              },
              select: { projectId: true },
            })
          : [];
        const projectIds = [...new Set(roles.map(({ projectId }) => projectId))];
        if (projectIds.length) projectAccess.push({ id: { in: projectIds } });
      }
    }
    if (projectAccess.length === 0) return { items: [], nextCursor: null };
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, OR: projectAccess },
      select: { id: true },
    });
    const projectIds = projects.map(({ id }) => id);
    if (!projectIds.length) return { items: [], nextCursor: null };
    if (query.projectId && !projectIds.includes(query.projectId)) {
      return { items: [], nextCursor: null };
    }
    const invoiceProjectIds = query.projectId ? [query.projectId] : projectIds;
    const invoices = await this.prisma.invoice.findMany({
      where: {
        projectId: { in: invoiceProjectIds },
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = invoices.length > limit;
    const items = invoices.slice(0, limit).map((invoice) => ({
      ...invoice,
      total: invoice.total.toString(),
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  /** POST /admin/refunds — Remboursement */
  async postAdminRefunds(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Remboursement indisponible : opérateur de paiement et procédure de rapprochement absents; aucun débit/crédit manuel ne sera créé.',
    );
  }

  /** POST /admin/payouts/{id}/approve — Valide un retrait sensible */
  async postAdminPayoutsByIdApprove(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Validation de retrait indisponible : l’intégration opérateur et les écritures séquestre/réconciliation ne sont pas configurées.',
    );
  }

}
