import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

/**
 * Module trust — Avis, réputation, litiges
 * Logiques métier à coder ici (document, section 3) :
 *   3.12 Litiges
 *   3.13 Réputation
 */
@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/disputes — Liste des dossiers */
  async getAdminDisputes(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }

    const items = await this.prisma.dispute.findMany({
      where: {
        deletedAt: null,
        ...(query.status
          ? { status: query.status }
          : { decision: { equals: Prisma.DbNull } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { items, nextCursor: null };
  }

  /** POST /missions/{id}/review — Note et avis */
  async postMissionsByIdReview(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    const missionId = input.params?.id;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!missionId) throw new BadRequestException('Identifiant de mission manquant.');
    if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
      throw new BadRequestException('Le corps de l’avis doit être un objet.');
    }
    const body = input.body as Record<string, unknown>;
    if (!Number.isInteger(body.rating) || typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('rating doit être un entier entre 1 et 5.');
    }
    if (
      body.comment !== undefined &&
      body.comment !== null &&
      (typeof body.comment !== 'string' || body.comment.trim().length > 2000)
    ) {
      throw new BadRequestException('comment ne peut pas dépasser 2000 caractères.');
    }
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, deletedAt: null },
    });
    if (!mission || mission.status !== 'VALIDEE') {
      throw new NotFoundException('Mission validée introuvable.');
    }
    const role = await this.prisma.projectRole.findFirst({
      where: { id: mission.projectRoleId, deletedAt: null },
    });
    const project = role
      ? await this.prisma.project.findFirst({
          where: { id: role.projectId, clientId: principal.id, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (!project || !mission.providerId) throw new NotFoundException('Mission validée introuvable.');
    if (
      await this.prisma.review.findFirst({
        where: { missionId, authorId: principal.id, deletedAt: null },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Un avis a déjà été soumis pour cette mission.');
    }
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          missionId,
          authorId: principal.id,
          targetId: mission.providerId as string,
          rating: body.rating as number,
          comment: typeof body.comment === 'string' ? body.comment.trim() || null : null,
          status: 'PUBLIE',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'MISSION_REVIEW_CREATED',
          entity: 'Review',
          entityId: review.id,
          after: { missionId, targetId: mission.providerId, rating: review.rating },
          at: new Date(),
        },
      });
      return review;
    });
  }

  /** POST /disputes — Ouvre un litige */
  async postDisputes(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
      throw new BadRequestException('Le corps du litige doit être un objet.');
    }
    const body = input.body as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) {
      throw new BadRequestException('projectId est obligatoire.');
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.trim().length > 2000) {
      throw new BadRequestException('reason doit contenir entre 5 et 2000 caractères.');
    }
    if (body.milestoneId !== undefined && body.milestoneId !== null && typeof body.milestoneId !== 'string') {
      throw new BadRequestException('milestoneId est invalide.');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: body.projectId, deletedAt: null },
      select: { id: true, clientId: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');
    let participant = project.clientId === principal.id;
    if (!participant) {
      const provider = await this.prisma.provider.findFirst({
        where: { userId: principal.id, deletedAt: null },
        select: { id: true },
      });
      if (provider) {
        const roleIds = await this.prisma.projectRole.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: { id: true },
        });
        participant = Boolean(
          await this.prisma.mission.findFirst({
            where: {
              projectRoleId: { in: roleIds.map(({ id }) => id) },
              providerId: provider.id,
              deletedAt: null,
            },
            select: { id: true },
          }),
        );
      }
    }
    if (!participant) throw new NotFoundException('Projet introuvable.');
    if (body.milestoneId) {
      const milestone = await this.prisma.milestone.findFirst({
        where: { id: body.milestoneId as string, projectId: project.id, deletedAt: null },
        select: { id: true },
      });
      if (!milestone) throw new NotFoundException('Jalon introuvable.');
    }
    const open = await this.prisma.dispute.findFirst({
      where: { projectId: project.id, decision: { equals: Prisma.DbNull }, deletedAt: null },
      select: { id: true },
    });
    if (open) throw new ConflictException('Un litige est déjà ouvert pour ce projet.');
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          projectId: project.id,
          milestoneId: typeof body.milestoneId === 'string' ? body.milestoneId : null,
          openedBy: principal.id,
          status: 'OUVERT',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'DISPUTE_OPENED',
          entity: 'Dispute',
          entityId: dispute.id,
          after: {
            projectId: project.id,
            milestoneId: dispute.milestoneId,
            reason: (body.reason as string).trim(),
          },
          at: new Date(),
        },
      });
      return dispute;
    });
  }

  /** POST /disputes/{id}/evidence — Ajoute une preuve */
  async postDisputesByIdEvidence(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    const id = input.params?.id;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!id) throw new BadRequestException('Identifiant du litige manquant.');
    if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
      throw new BadRequestException('La preuve doit être un objet.');
    }
    const body = input.body as Record<string, unknown>;
    if (typeof body.fileId !== 'string' || !body.fileId) {
      throw new BadRequestException('fileId est obligatoire.');
    }
    if (body.note !== undefined && body.note !== null && (typeof body.note !== 'string' || body.note.trim().length > 2000)) {
      throw new BadRequestException('note ne peut pas dépasser 2000 caractères.');
    }
    const dispute = await this.prisma.dispute.findFirst({
      where: { id, deletedAt: null, decision: { equals: Prisma.DbNull } },
      select: { id: true, projectId: true },
    });
    if (!dispute) throw new NotFoundException('Litige introuvable.');
    const project = await this.prisma.project.findFirst({
      where: { id: dispute.projectId, deletedAt: null },
      select: { id: true, clientId: true },
    });
    let participant = project?.clientId === principal.id;
    if (project && !participant) {
      const provider = await this.prisma.provider.findFirst({
        where: { userId: principal.id, deletedAt: null },
        select: { id: true },
      });
      if (provider) {
        const roles = await this.prisma.projectRole.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: { id: true },
        });
        participant = Boolean(
          await this.prisma.mission.findFirst({
            where: {
              projectRoleId: { in: roles.map(({ id: roleId }) => roleId) },
              providerId: provider.id,
              deletedAt: null,
            },
            select: { id: true },
          }),
        );
      }
    }
    if (!participant) throw new NotFoundException('Litige introuvable.');
    const file = await this.prisma.file.findFirst({
      where: { id: body.fileId, ownerId: principal.id, scanStatus: 'CLEAN' },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('Preuve disponible introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.disputeEvidence.create({
        data: {
          disputeId: dispute.id,
          fileId: file.id,
          authorId: principal.id,
          note: typeof body.note === 'string' ? body.note.trim() || null : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'DISPUTE_EVIDENCE_ADDED',
          entity: 'Dispute',
          entityId: dispute.id,
          after: { evidenceId: evidence.id, fileId: file.id },
          at: new Date(),
        },
      });
      return evidence;
    });
  }

  /** POST /admin/disputes/{id}/decision — Rend une décision */
  async postAdminDisputesByIdDecision(input: RequestInput): Promise<unknown> {
    const id = input.params?.id;
    const body = input.body;
    if (!id) throw new BadRequestException('Identifiant du litige manquant.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('La décision doit être un objet.');
    }
    const decision = (body as Record<string, unknown>).decision;
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      throw new BadRequestException('decision doit contenir la résolution et son motif.');
    }
    const resolution = (decision as Record<string, unknown>).resolution;
    const reason = (decision as Record<string, unknown>).reason;
    if (typeof resolution !== 'string' || resolution.trim().length < 2 || resolution.trim().length > 120) {
      throw new BadRequestException('La résolution doit contenir entre 2 et 120 caractères.');
    }
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 2000) {
      throw new BadRequestException('Le motif doit contenir entre 5 et 2000 caractères.');
    }
    const dispute = await this.prisma.dispute.findFirst({ where: { id, deletedAt: null } });
    if (!dispute) throw new NotFoundException('Litige introuvable.');
    if (dispute.decision !== null) throw new ConflictException('Une décision a déjà été enregistrée.');
    const after: Prisma.InputJsonObject = { resolution: resolution.trim(), reason: reason.trim() };
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.dispute.updateMany({
        where: { id, version: dispute.version, decision: { equals: Prisma.DbNull }, deletedAt: null },
        data: { status: 'RESOLU', decision: after, decidedBy: input.principal?.id ?? null, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Le litige a été modifié. Rechargez la liste.');
      const updated = await tx.dispute.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('Litige introuvable.');
      await tx.auditLog.create({
        data: {
          actorId: input.principal?.id ?? null,
          action: 'DISPUTE_DECIDED',
          entity: 'Dispute',
          entityId: id,
          before: { status: dispute.status },
          after,
          at: new Date(),
        },
      });
      return updated;
    });
  }

}
