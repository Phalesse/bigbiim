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
 * Module providers — Profils, KYC, disponibilités, zones
 * Logiques métier à coder ici (document, section 3) :
 *   3.14 Vérification des prestataires (KYC)
 *   3.13 Réputation
 */
@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /providers — Crée le profil prestataire */
  async postProviders(input: RequestInput): Promise<unknown> {
    const userId = this.requirePrincipalId(input);
    const body = this.body(input.body);
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const legalName = typeof body.legalName === 'string' ? body.legalName.trim() : '';
    if (!type || type.length > 40) throw new BadRequestException('type est obligatoire (40 caractères max).');
    if (!legalName || legalName.length > 200) {
      throw new BadRequestException('legalName est obligatoire (200 caractères max).');
    }
    if (body.bio !== undefined && body.bio !== null && (typeof body.bio !== 'string' || body.bio.length > 5000)) {
      throw new BadRequestException('bio ne peut pas dépasser 5000 caractères.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Compte indisponible.');
    if (
      await this.prisma.provider.findFirst({
        where: { userId, deletedAt: null },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Un profil prestataire existe déjà.');
    }
    return this.prisma.provider.create({
      data: {
        userId,
        type,
        legalName,
        bio: typeof body.bio === 'string' ? body.bio.trim() || null : null,
        kycLevel: 0,
        status: 'EN_ATTENTE',
      },
    });
  }

  /** GET /providers/{id} — Profil privé complet */
  async getProvidersById(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, true);
    const [skills, zones, availability, documents, portfolio, badges] = await Promise.all([
      this.prisma.providerSkill.findMany({ where: { providerId: provider.id, deletedAt: null } }),
      this.prisma.providerZone.findMany({ where: { providerId: provider.id, deletedAt: null } }),
      this.prisma.providerAvailability.findMany({
        where: { providerId: provider.id, deletedAt: null },
        orderBy: { fromAt: 'asc' },
      }),
      this.prisma.providerDocument.findMany({
        where: { providerId: provider.id, deletedAt: null },
        select: { id: true, type: true, fileId: true, status: true, expiresAt: true, createdAt: true },
      }),
      this.prisma.portfolioItem.findMany({ where: { providerId: provider.id, deletedAt: null } }),
      this.prisma.badge.findMany({ where: { providerId: provider.id, deletedAt: null } }),
    ]);
    return { ...provider, skills, zones, availability, documents, portfolio, badges };
  }

  /** PATCH /providers/{id} — Modifie le profil */
  async patchProvidersById(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const body = this.body(input.body);
    const allowed = new Set(['type', 'legalName', 'bio']);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new BadRequestException('Champs de modification du profil invalides.');
    }
    const data: { type?: string; legalName?: string; bio?: string | null } = {};
    if (body.type !== undefined) {
      if (typeof body.type !== 'string' || !body.type.trim() || body.type.trim().length > 40) {
        throw new BadRequestException('type est invalide.');
      }
      data.type = body.type.trim();
    }
    if (body.legalName !== undefined) {
      if (typeof body.legalName !== 'string' || !body.legalName.trim() || body.legalName.trim().length > 200) {
        throw new BadRequestException('legalName est invalide.');
      }
      data.legalName = body.legalName.trim();
    }
    if (body.bio !== undefined) {
      if (body.bio !== null && (typeof body.bio !== 'string' || body.bio.length > 5000)) {
        throw new BadRequestException('bio ne peut pas dépasser 5000 caractères.');
      }
      data.bio = typeof body.bio === 'string' ? body.bio.trim() || null : null;
    }
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.provider.updateMany({
        where: { id: provider.id, version: provider.version, deletedAt: null },
        data: { ...data, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Le profil a été modifié simultanément.');
      return tx.provider.findUnique({ where: { id: provider.id } });
    });
  }

  /** GET /providers/{id}/public — Profil public */
  async getProvidersByIdPublic(input: RequestInput): Promise<unknown> {
    const id = input.params?.id;
    if (!id) throw new BadRequestException('Identifiant prestataire manquant.');
    const provider = await this.prisma.provider.findFirst({
      where: { id, deletedAt: null, kycLevel: { gte: 1 }, status: { notIn: ['REFUSE', 'SUSPENDU'] } },
      select: {
        id: true,
        type: true,
        bio: true,
        ratingBayes: true,
        reliabilityScore: true,
        status: true,
      },
    });
    if (!provider) throw new NotFoundException('Prestataire vérifié introuvable.');
    const [skills, portfolio, badges, reviews] = await Promise.all([
      this.prisma.providerSkill.findMany({
        where: { providerId: id, deletedAt: null },
        select: { skillId: true, years: true, verified: true, rateUnit: true },
      }),
      this.prisma.portfolioItem.findMany({
        where: { providerId: id, deletedAt: null },
        select: { id: true, title: true, media: true, activityId: true },
      }),
      this.prisma.badge.findMany({
        where: { providerId: id, deletedAt: null },
        select: { type: true, grantedAt: true },
      }),
      this.prisma.review.findMany({
        where: { targetId: id, status: 'PUBLIE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, rating: true, comment: true, createdAt: true },
      }),
    ]);
    return { ...provider, skills, portfolio, badges, reviews };
  }

  /** PUT /providers/{id}/skills — Compétences déclarées */
  async putProvidersByIdSkills(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const items = this.listInput(input.body, 'items');
    if (items.length > 200) throw new BadRequestException('Au maximum 200 compétences.');
    const skills = items.map((item, index) => {
      if (typeof item.skillId !== 'string' || !item.skillId) {
        throw new BadRequestException(`items[${index}].skillId est obligatoire.`);
      }
      if (item.years !== undefined && (!Number.isInteger(item.years) || (item.years as number) < 0 || (item.years as number) > 80)) {
        throw new BadRequestException(`items[${index}].years est invalide.`);
      }
      return { skillId: item.skillId, years: item.years as number | undefined };
    });
    if (new Set(skills.map((item) => item.skillId)).size !== skills.length) {
      throw new BadRequestException('Une compétence ne peut apparaître qu’une fois.');
    }
    const validSkills = await this.prisma.skill.findMany({
      where: { id: { in: skills.map((item) => item.skillId) }, deletedAt: null },
      select: { id: true },
    });
    if (validSkills.length !== skills.length) throw new BadRequestException('Une compétence est inconnue ou inactive.');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.providerSkill.findMany({
        where: { providerId: provider.id, deletedAt: null },
      });
      await tx.providerSkill.updateMany({
        where: { providerId: provider.id, deletedAt: null, skillId: { notIn: skills.map((item) => item.skillId) } },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      for (const item of skills) {
        const old = existing.find((candidate) => candidate.skillId === item.skillId);
        if (old) {
          await tx.providerSkill.update({
            where: { id: old.id },
            data: { years: item.years ?? null, deletedAt: null, version: { increment: 1 } },
          });
        } else {
          await tx.providerSkill.create({
            data: { providerId: provider.id, skillId: item.skillId, years: item.years ?? null, verified: false },
          });
        }
      }
      return { items: skills };
    });
  }

  /** POST /providers/{id}/documents — Dépose un justificatif */
  async postProvidersByIdDocuments(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const body = this.body(input.body);
    if (typeof body.type !== 'string' || !/^[A-Z0-9_.-]{1,80}$/i.test(body.type)) {
      throw new BadRequestException('type de document invalide.');
    }
    if (typeof body.fileId !== 'string' || !body.fileId) {
      throw new BadRequestException('fileId est obligatoire.');
    }
    let expiresAt: Date | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null) {
      if (typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) {
        throw new BadRequestException('expiresAt doit être une date valide.');
      }
      expiresAt = new Date(body.expiresAt);
    }
    const file = await this.prisma.file.findFirst({
      where: { id: body.fileId, ownerId: provider.userId, scanStatus: 'CLEAN' },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('Document téléversé et analysé introuvable.');
    return this.prisma.providerDocument.create({
      data: {
        providerId: provider.id,
        type: body.type,
        fileId: file.id,
        status: 'EN_ATTENTE',
        expiresAt,
      },
    });
  }

  /** PUT /providers/{id}/availability — Agenda et capacité */
  async putProvidersByIdAvailability(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const items = this.listInput(input.body, 'items');
    if (items.length > 200) throw new BadRequestException('Au maximum 200 créneaux.');
    const slots = items.map((item, index) => {
      const fromAt = typeof item.fromAt === 'string' ? new Date(item.fromAt) : new Date(Number.NaN);
      const toAt = typeof item.toAt === 'string' ? new Date(item.toAt) : new Date(Number.NaN);
      if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime()) || toAt <= fromAt) {
        throw new BadRequestException(`items[${index}] contient une plage de dates invalide.`);
      }
      if (!Number.isInteger(item.capacity) || (item.capacity as number) < 1 || (item.capacity as number) > 1000) {
        throw new BadRequestException(`items[${index}].capacity doit être un entier positif.`);
      }
      if (typeof item.type !== 'string' || !item.type.trim() || item.type.trim().length > 40) {
        throw new BadRequestException(`items[${index}].type est invalide.`);
      }
      return { fromAt, toAt, capacity: item.capacity as number, type: item.type.trim() };
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.providerAvailability.updateMany({
        where: { providerId: provider.id, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (slots.length) await tx.providerAvailability.createMany({ data: slots.map((slot) => ({ ...slot, providerId: provider.id })) });
      return { items: slots };
    });
  }

  /** PUT /providers/{id}/zones — Zones d’intervention */
  async putProvidersByIdZones(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const items = this.listInput(input.body, 'items');
    if (items.length > 100) throw new BadRequestException('Au maximum 100 zones.');
    const zones = items.map((item, index) => {
      const city = item.city === undefined || item.city === null ? null : item.city;
      if (city !== null && (typeof city !== 'string' || !city.trim() || city.length > 120)) {
        throw new BadRequestException(`items[${index}].city est invalide.`);
      }
      const radiusKm = item.radiusKm === undefined || item.radiusKm === null ? null : item.radiusKm;
      if (radiusKm !== null && (typeof radiusKm !== 'number' || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 1000)) {
        throw new BadRequestException(`items[${index}].radiusKm est invalide.`);
      }
      if (city === null && item.geometry === undefined) {
        throw new BadRequestException(`items[${index}] doit définir city ou geometry.`);
      }
      return {
        city: typeof city === 'string' ? city.trim() : null,
        radiusKm: radiusKm as number | null,
        geometry: item.geometry === undefined || item.geometry === null
          ? Prisma.JsonNull
          : this.jsonValue(item.geometry, `items[${index}].geometry`),
      };
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.providerZone.updateMany({
        where: { providerId: provider.id, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      for (const zone of zones) {
        await tx.providerZone.create({ data: { ...zone, providerId: provider.id } });
      }
      return { items: zones };
    });
  }

  /** PUT /providers/{id}/rates — Tarifs par compétence */
  async putProvidersByIdRates(input: RequestInput): Promise<unknown> {
    const provider = await this.getOwnedProvider(input, false);
    const items = this.listInput(input.body, 'items');
    if (items.length > 200) throw new BadRequestException('Au maximum 200 tarifs.');
    const rates = items.map((item, index) => {
      if (typeof item.skillId !== 'string' || !item.skillId) {
        throw new BadRequestException(`items[${index}].skillId est obligatoire.`);
      }
      const rawAmount = item.rateMin;
      if (
        !(typeof rawAmount === 'string' && /^\d+$/.test(rawAmount)) &&
        !(typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount) && rawAmount >= 0)
      ) {
        throw new BadRequestException(`items[${index}].rateMin doit être un entier en unités mineures.`);
      }
      const amount = BigInt(rawAmount);
      if (amount > 9_223_372_036_854_775_807n) throw new BadRequestException(`items[${index}].rateMin est trop élevé.`);
      if (typeof item.rateUnit !== 'string' || !item.rateUnit.trim() || item.rateUnit.length > 40) {
        throw new BadRequestException(`items[${index}].rateUnit est invalide.`);
      }
      return { skillId: item.skillId, rateMin: amount, rateUnit: item.rateUnit.trim() };
    });
    if (new Set(rates.map((item) => item.skillId)).size !== rates.length) {
      throw new BadRequestException('Un tarif par compétence au maximum.');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const rate of rates) {
        const skill = await tx.providerSkill.findFirst({
          where: { providerId: provider.id, skillId: rate.skillId, deletedAt: null },
        });
        if (!skill) throw new BadRequestException(`La compétence ${rate.skillId} n’est pas déclarée.`);
        await tx.providerSkill.update({
          where: { id: skill.id },
          data: { rateMin: rate.rateMin, rateUnit: rate.rateUnit, version: { increment: 1 } },
        });
      }
      return { items: rates.map((rate) => ({ ...rate, rateMin: rate.rateMin.toString() })) };
    });
  }

  /** GET /providers/{id}/reviews — Avis reçus */
  async getProvidersByIdReviews(input: RequestInput): Promise<unknown> {
    const id = input.params?.id;
    if (!id) throw new BadRequestException('Identifiant prestataire manquant.');
    const provider = await this.prisma.provider.findFirst({
      where: { id, deletedAt: null, kycLevel: { gte: 1 }, status: { notIn: ['REFUSE', 'SUSPENDU'] } },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Prestataire vérifié introuvable.');
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && !query.cursor.trim()) {
      throw new BadRequestException('cursor ne peut pas être vide.');
    }
    const results = await this.prisma.review.findMany({
      where: {
        targetId: id,
        status: 'PUBLIE',
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    const hasMore = results.length > limit;
    const items = results.slice(0, limit);
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  /** GET /admin/providers — File de validation (status) */
  async getAdminProviders(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && !query.cursor.trim()) {
      throw new BadRequestException('cursor ne peut pas être vide.');
    }
    const items = await this.prisma.provider.findMany({
      where: {
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  /** POST /admin/providers/{id}/verify — Valide */
  async postAdminProvidersByIdVerify(input: RequestInput): Promise<unknown> {
    const id = input.params?.id;
    const body = input.body;
    if (!id) throw new BadRequestException('Identifiant prestataire manquant.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Le corps doit contenir un niveau KYC.');
    }
    const kycLevel = (body as Record<string, unknown>).kycLevel;
    if (!Number.isInteger(kycLevel) || typeof kycLevel !== 'number' || kycLevel < 1 || kycLevel > 3) {
      throw new BadRequestException('kycLevel doit être un entier entre 1 et 3.');
    }
    const provider = await this.prisma.provider.findFirst({ where: { id, deletedAt: null } });
    if (!provider) throw new NotFoundException('Prestataire introuvable.');
    if (kycLevel < provider.kycLevel) throw new BadRequestException('Le niveau KYC ne peut pas diminuer.');
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.provider.updateMany({
        where: { id, version: provider.version, deletedAt: null },
        data: { kycLevel, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Le prestataire a été modifié. Rechargez la liste.');
      const updated = await tx.provider.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('Prestataire introuvable.');
      await tx.auditLog.create({
        data: {
          actorId: input.principal?.id ?? null,
          action: 'PROVIDER_KYC_VERIFIED',
          entity: 'Provider',
          entityId: id,
          before: { kycLevel: provider.kycLevel },
          after: { kycLevel },
          at: new Date(),
        },
      });
      return updated;
    });
  }

  /** POST /admin/providers/{id}/reject — Refuse avec motif */
  async postAdminProvidersByIdReject(input: RequestInput): Promise<unknown> {
    return this.updateAdminProviderStatus(input, 'REFUSE', 'PROVIDER_REJECTED');
  }

  /** POST /admin/providers/{id}/suspend — Suspend */
  async postAdminProvidersByIdSuspend(input: RequestInput): Promise<unknown> {
    return this.updateAdminProviderStatus(input, 'SUSPENDU', 'PROVIDER_SUSPENDED');
  }

  private async updateAdminProviderStatus(input: RequestInput, status: string, action: string) {
    const id = input.params?.id;
    const body = input.body;
    if (!id) throw new BadRequestException('Identifiant prestataire manquant.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Un motif est obligatoire.');
    }
    const reason = (body as Record<string, unknown>).reason;
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 1000) {
      throw new BadRequestException('Le motif doit contenir entre 5 et 1000 caractères.');
    }
    const provider = await this.prisma.provider.findFirst({ where: { id, deletedAt: null } });
    if (!provider) throw new NotFoundException('Prestataire introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.provider.updateMany({
        where: { id, version: provider.version, deletedAt: null },
        data: { status, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Le prestataire a été modifié. Rechargez la liste.');
      const updated = await tx.provider.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('Prestataire introuvable.');
      await tx.auditLog.create({
        data: {
          actorId: input.principal?.id ?? null,
          action,
          entity: 'Provider',
          entityId: id,
          before: { status: provider.status },
          after: { status, reason: reason.trim() } as Prisma.InputJsonObject,
          at: new Date(),
        },
      });
      return updated;
    });
  }

  private requirePrincipalId(input: RequestInput): string {
    if (!input.principal) throw new UnauthorizedException('Authentification requise.');
    return input.principal.id;
  }

  private body(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Le corps doit être un objet.');
    }
    return value as Record<string, unknown>;
  }

  private listInput(value: unknown, key: string): Record<string, unknown>[] {
    const body = this.body(value);
    const items = body[key];
    if (!Array.isArray(items)) throw new BadRequestException(`${key} doit être une liste.`);
    return items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(`${key}[${index}] doit être un objet.`);
      }
      return item as Record<string, unknown>;
    });
  }

  private jsonValue(value: unknown, field: string): Prisma.InputJsonValue {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined || serialized.length > 65_536) {
        throw new BadRequestException(`${field} invalide ou trop volumineux.`);
      }
      return JSON.parse(serialized) as Prisma.InputJsonValue;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`${field} doit être un JSON valide.`);
    }
  }

  private async getOwnedProvider(input: RequestInput, allowAdmin: boolean) {
    const principal = input.principal;
    const id = input.params?.id;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!id) throw new BadRequestException('Identifiant prestataire manquant.');
    const provider = await this.prisma.provider.findFirst({ where: { id, deletedAt: null } });
    if (!provider) throw new NotFoundException('Prestataire introuvable.');
    if (provider.userId !== principal.id && !(allowAdmin && principal.roles.includes('A'))) {
      throw new NotFoundException('Prestataire introuvable.');
    }
    return provider;
  }

}
