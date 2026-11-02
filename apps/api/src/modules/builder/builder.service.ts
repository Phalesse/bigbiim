import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RequestInput } from '../../common/request-input';

type JsonObject = Record<string, unknown>;

const EMPTY_DEFINITION: JsonObject = {
  name: '',
  description: '',
  coverImageUrl: '',
  cities: [],
  questionnaire: [],
  roles: [],
  steps: [],
  pricing: { currency: 'XOF' },
  milestones: [],
  contract_template_id: null,
  compliance: {},
  cancellation_policy: {},
  matching_mode: 'AUTOMATIQUE',
};

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function jsonObject(value: unknown, fieldName: string): Prisma.InputJsonObject {
  if (!isRecord(value) || !isJsonValue(value)) {
    throw new BadRequestException(`${fieldName} doit être un objet JSON valide`);
  }
  return value as Prisma.InputJsonObject;
}

function bodyRecord(value: unknown): JsonObject {
  if (!isRecord(value)) throw new BadRequestException('Le corps de la requête doit être un objet JSON');
  return value;
}

function activityId(input: RequestInput): string {
  const id = input.params?.id;
  if (!id) throw new BadRequestException('Identifiant d’activité manquant');
  return id;
}

function validateDefinition(activity: { slug: string; sectorId: string }, value: unknown) {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['La définition doit être un objet JSON'] };

  if (!value.name || typeof value.name !== 'string' || !value.name.trim()) {
    errors.push('Le nom de l’activité est obligatoire.');
  }
  if (!activity.slug.trim()) errors.push('Le slug de l’activité est obligatoire.');
  if (!activity.sectorId.trim()) errors.push('Un secteur doit être sélectionné.');

  for (const key of ['questionnaire', 'roles', 'steps', 'milestones']) {
    if (!Array.isArray(value[key])) errors.push(`La section « ${key} » doit être une liste JSON.`);
  }
  if (Array.isArray(value.roles)) {
    const roleKeys = new Set<string>();
    value.roles.forEach((role, index) => {
      if (!isRecord(role)) {
        errors.push(`Le rôle ${index + 1} doit être un objet.`);
        return;
      }
      const key = role.key ?? role.roleKey;
      const skillId = role.skillId ?? role.skill_id;
      if (typeof key !== 'string' || !key.trim()) {
        errors.push(`La clé du rôle ${index + 1} est obligatoire.`);
      } else if (roleKeys.has(key.trim())) {
        errors.push(`La clé de rôle « ${key.trim()} » est dupliquée.`);
      } else {
        roleKeys.add(key.trim());
      }
      if (typeof skillId !== 'string' || !skillId.trim()) {
        errors.push(`Une compétence doit être sélectionnée pour le rôle ${index + 1}.`);
      }
    });
  }
  if (!isRecord(value.pricing)) {
    errors.push('La configuration des prix doit être un objet JSON.');
  } else if (typeof value.pricing.currency !== 'string' || !/^[A-Z]{3}$/.test(value.pricing.currency)) {
    errors.push('La devise doit être un code ISO 4217 de trois lettres majuscules.');
  }
  if (Array.isArray(value.steps)) {
    const ids = new Set<string>();
    const dependencies = new Map<string, string[]>();
    value.steps.forEach((step, index) => {
      if (!isRecord(step)) {
        errors.push(`L’étape ${index + 1} doit être un objet.`);
        return;
      }
      if (typeof step.id !== 'string' || !step.id.trim()) {
        errors.push(`L’identifiant de l’étape ${index + 1} est obligatoire.`);
      } else {
        if (ids.has(step.id)) errors.push(`L’identifiant d’étape « ${step.id} » est dupliqué.`);
        ids.add(step.id);
        const values = Array.isArray(step.dependsOn)
          ? step.dependsOn
          : Array.isArray(step.depends_on)
            ? step.depends_on
            : [];
        if (values.some((item) => typeof item !== 'string')) {
          errors.push(`Les dépendances de l’étape « ${step.id} » doivent être des identifiants.`);
        }
        dependencies.set(step.id, values.filter((item): item is string => typeof item === 'string'));
      }
    });
    for (const [stepId, requiredIds] of dependencies) {
      for (const requiredId of requiredIds) {
        if (!ids.has(requiredId)) {
          errors.push(`L’étape « ${stepId} » dépend d’une étape inconnue « ${requiredId} ».`);
        }
      }
    }

    const dependencyCount = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const stepId of ids) {
      const requiredIds = (dependencies.get(stepId) ?? []).filter((dependency) => ids.has(dependency));
      dependencyCount.set(stepId, requiredIds.length);
      for (const dependency of requiredIds) {
        dependents.set(dependency, [...(dependents.get(dependency) ?? []), stepId]);
      }
    }
    const ready = [...ids].filter((stepId) => dependencyCount.get(stepId) === 0);
    let visitedCount = 0;
    for (let index = 0; index < ready.length; index += 1) {
      const stepId = ready[index];
      visitedCount += 1;
      for (const dependent of dependents.get(stepId) ?? []) {
        const remaining = (dependencyCount.get(dependent) ?? 0) - 1;
        dependencyCount.set(dependent, remaining);
        if (remaining === 0) ready.push(dependent);
      }
    }
    if (visitedCount !== ids.size) errors.push('Le graphe des étapes contient un cycle.');
  }

  return { valid: errors.length === 0, errors };
}

@Injectable()
export class BuilderService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /admin/activities — Crée une activité en brouillon */
  async postAdminActivities(input: RequestInput): Promise<unknown> {
    const body = bodyRecord(input.body);
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const sectorId = typeof body.sectorId === 'string' ? body.sectorId.trim() : '';
    const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException('Le slug doit contenir des lettres minuscules, chiffres et tirets.');
    }
    if (!sectorId) throw new BadRequestException('Le secteur est obligatoire.');
    const sector = await this.prisma.sector.findFirst({ where: { id: sectorId, deletedAt: null } });
    if (!sector) throw new BadRequestException('Le secteur sélectionné est introuvable.');
    if (await this.prisma.activity.findUnique({ where: { slug } })) {
      throw new ConflictException('Ce slug est déjà utilisé.');
    }

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: { slug, sectorId, countryCode, status: 'BROUILLON' },
      });
      const draft = await tx.activityVersion.create({
        data: {
          activityId: activity.id,
          version: 1,
          status: 'BROUILLON',
          definition: EMPTY_DEFINITION as Prisma.InputJsonObject,
        },
      });
      return { ...activity, draftVersionId: draft.id };
    });
  }

  /** GET /admin/activities — Liste avec statuts */
  async getAdminActivities(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    const items = await this.prisma.activity.findMany({
      where: {
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return { items, nextCursor: null };
  }

  /** GET /admin/activities/{id}/draft — Document complet du brouillon */
  async getAdminActivitiesByIdDraft(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const activity = await this.prisma.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException('Activité introuvable');
    const draft = await this.prisma.activityVersion.findFirst({
      where: { activityId: id, status: 'BROUILLON', deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!draft) throw new NotFoundException('Aucun brouillon disponible pour cette activité');
    return { activity, draft };
  }

  /** PUT /admin/activities/{id}/draft — Enregistre le brouillon */
  async putAdminActivitiesByIdDraft(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const body = bodyRecord(input.body);
    const definition = jsonObject(body.definition, 'definition');
    const activityInput = isRecord(body.activity) ? body.activity : {};
    const draft = await this.prisma.activityVersion.findFirst({
      where: { activityId: id, status: 'BROUILLON', deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!draft) throw new NotFoundException('Aucun brouillon disponible pour cette activité');
    const updateData: Prisma.ActivityUpdateInput = {
      updatedAt: new Date(),
      version: { increment: 1 },
    };
    if (activityInput.slug !== undefined) {
      if (typeof activityInput.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(activityInput.slug)) {
        throw new BadRequestException('Le slug doit contenir des lettres minuscules, chiffres et tirets.');
      }
      const existing = await this.prisma.activity.findFirst({
        where: { slug: activityInput.slug, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictException('Ce slug est déjà utilisé.');
      updateData.slug = activityInput.slug;
    }
    if (activityInput.sectorId !== undefined) {
      if (typeof activityInput.sectorId !== 'string' || !activityInput.sectorId.trim()) {
        throw new BadRequestException('Le secteur est obligatoire.');
      }
      const sector = await this.prisma.sector.findFirst({
        where: { id: activityInput.sectorId, deletedAt: null },
      });
      if (!sector) throw new BadRequestException('Le secteur sélectionné est introuvable.');
      updateData.sectorId = activityInput.sectorId;
    }
    if (activityInput.countryCode !== undefined) {
      if (activityInput.countryCode !== null && typeof activityInput.countryCode !== 'string') {
        throw new BadRequestException('countryCode doit être une chaîne ou null.');
      }
      updateData.countryCode = typeof activityInput.countryCode === 'string'
        ? activityInput.countryCode.trim().toUpperCase()
        : null;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const version = await tx.activityVersion.update({
        where: { id: draft.id },
        data: { definition, updatedAt: new Date() },
      });
      await tx.activity.update({ where: { id }, data: updateData });
      return version;
    });
    return updated;
  }

  /** POST /admin/activities/{id}/validate — Contrôle de cohérence */
  async postAdminActivitiesByIdValidate(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const activity = await this.prisma.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException('Activité introuvable');
    const draft = await this.prisma.activityVersion.findFirst({
      where: { activityId: id, status: 'BROUILLON', deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!draft) throw new NotFoundException('Aucun brouillon disponible pour cette activité');
    const result = validateDefinition(activity, draft.definition);
    const errors = [...result.errors];
    if (isRecord(draft.definition) && Array.isArray(draft.definition.roles)) {
      const skillIds = draft.definition.roles.flatMap((role) => {
        if (!isRecord(role)) return [];
        const skillId = role.skillId ?? role.skill_id;
        return typeof skillId === 'string' && skillId.trim() ? [skillId.trim()] : [];
      });
      if (skillIds.length > 0) {
        const skills = await this.prisma.skill.findMany({
          where: { id: { in: [...new Set(skillIds)] }, deletedAt: null },
          select: { id: true },
        });
        const existingSkillIds = new Set(skills.map(({ id: skillId }) => skillId));
        for (const skillId of new Set(skillIds)) {
          if (!existingSkillIds.has(skillId)) {
            errors.push(`La compétence « ${skillId} » n’existe pas ou a été supprimée.`);
          }
        }
      }
    }
    return { valid: errors.length === 0, errors, activityId: id, draftVersion: draft.version };
  }

  /** POST /admin/activities/{id}/simulate — Prévisualisation structurelle du modèle */
  async postAdminActivitiesByIdSimulate(input: RequestInput): Promise<unknown> {
    const validation = await this.postAdminActivitiesByIdValidate(input) as {
      valid: boolean;
      errors: string[];
      activityId: string;
      draftVersion: number;
    };
    if (!validation.valid) return { ...validation, preview: null };
    const draft = await this.prisma.activityVersion.findFirst({
      where: { activityId: validation.activityId, status: 'BROUILLON', deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!draft || !isRecord(draft.definition)) throw new NotFoundException('Brouillon introuvable');
    const definition = draft.definition;
    return {
      ...validation,
      preview: {
        roleCount: Array.isArray(definition.roles) ? definition.roles.length : 0,
        stepCount: Array.isArray(definition.steps) ? definition.steps.length : 0,
        milestoneCount: Array.isArray(definition.milestones) ? definition.milestones.length : 0,
        questionnaireFieldCount: Array.isArray(definition.questionnaire) ? definition.questionnaire.length : 0,
      },
      note: 'Prévisualisation structurelle uniquement ; aucun devis ni planning n’est calculé.',
    };
  }

  /** POST /admin/activities/{id}/publish — Publie une version */
  async postAdminActivitiesByIdPublish(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const validation = await this.postAdminActivitiesByIdValidate(input) as { valid: boolean; errors: string[] };
    if (!validation.valid) {
      throw new BadRequestException({ message: 'Le brouillon contient des erreurs.', errors: validation.errors });
    }
    const draft = await this.prisma.activityVersion.findFirst({
      where: { activityId: id, status: 'BROUILLON', deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!draft) throw new NotFoundException('Aucun brouillon disponible pour cette activité');
    const activity = await this.prisma.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.activityVersion.updateMany({
        where: { id: draft.id, version: draft.version, status: 'BROUILLON', deletedAt: null },
        data: {
          status: 'PUBLIE',
          publishedAt: new Date(),
          publishedBy: input.principal?.id ?? null,
        },
      });
      if (changed.count !== 1) throw new ConflictException('Le brouillon a été modifié. Rechargez-le avant publication.');
      const published = await tx.activityVersion.findUnique({ where: { id: draft.id } });
      if (!published) throw new NotFoundException('Brouillon introuvable.');
      const activityChanged = await tx.activity.updateMany({
        where: { id, version: activity.version, deletedAt: null },
        data: {
          status: 'PUBLIE',
          currentVersionId: published.id,
          version: { increment: 1 },
        },
      });
      if (activityChanged.count !== 1) throw new ConflictException('L’activité a été modifiée. Rechargez-la avant publication.');
      const nextDraft = await tx.activityVersion.create({
        data: {
          activityId: id,
          version: draft.version + 1,
          status: 'BROUILLON',
          definition: jsonObject(draft.definition, 'definition'),
        },
      });
      return { activityId: id, publishedVersion: published.version, nextDraftVersion: nextDraft.version };
    });
  }

  /** GET /admin/activities/{id}/versions — Historique des versions */
  async getAdminActivitiesByIdVersions(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const items = await this.prisma.activityVersion.findMany({
      where: { activityId: id, deletedAt: null },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true, publishedAt: true, publishedBy: true, createdAt: true },
    });
    return { items };
  }

  /** POST /admin/activities/{id}/retire — Retire du catalogue */
  async postAdminActivitiesByIdRetire(input: RequestInput): Promise<unknown> {
    const id = activityId(input);
    const activity = await this.prisma.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException('Activité introuvable');
    if (activity.status === 'RETIRE') throw new ConflictException('Cette activité est déjà retirée.');

    return this.prisma.$transaction(async (tx) => {
      if (activity.currentVersionId) {
        await tx.activityVersion.update({
          where: { id: activity.currentVersionId },
          data: { status: 'RETIRE' },
        });
      }
      await tx.activityVersion.updateMany({
        where: { activityId: id, status: 'BROUILLON', deletedAt: null },
        data: { status: 'RETIRE' },
      });
      const changed = await tx.activity.updateMany({
        where: { id, version: activity.version, deletedAt: null },
        data: { status: 'RETIRE', version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('L’activité a été modifiée. Rechargez-la avant de la retirer.');
      return tx.activity.findUnique({ where: { id } });
    });
  }

  /** POST /admin/skills — Crée ou modifie une compétence */
  async postAdminSkills(input: RequestInput): Promise<unknown> {
    const body = bodyRecord(input.body);
    const nameI18n = jsonObject(body.nameI18n, 'nameI18n');
    const name = nameI18n.fr;
    if (typeof name !== 'string' || !name.trim()) throw new BadRequestException('Le nom français est obligatoire.');
    if (body.synonyms !== undefined && (!Array.isArray(body.synonyms) || !body.synonyms.every((item) => typeof item === 'string'))) {
      throw new BadRequestException('synonyms doit être une liste de chaînes.');
    }
    if (body.regulated !== undefined && typeof body.regulated !== 'boolean') {
      throw new BadRequestException('regulated doit être un booléen.');
    }
    for (const field of ['sectorId', 'parentId', 'requiredLicenseType']) {
      if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
        throw new BadRequestException(`${field} doit être une chaîne ou null.`);
      }
    }
    const skillId = typeof body.id === 'string' ? body.id : undefined;
    const sectorId = typeof body.sectorId === 'string' && body.sectorId ? body.sectorId : null;
    const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
    if (sectorId && !await this.prisma.sector.findFirst({ where: { id: sectorId, deletedAt: null } })) {
      throw new BadRequestException('Le secteur sélectionné est introuvable.');
    }
    if (parentId) {
      if (parentId === skillId) throw new BadRequestException('Une compétence ne peut pas être son propre parent.');
      if (!await this.prisma.skill.findFirst({ where: { id: parentId, deletedAt: null } })) {
        throw new BadRequestException('La compétence parente est introuvable.');
      }
    }
    const regulated = body.regulated === true;
    const requiredLicenseType = typeof body.requiredLicenseType === 'string' && body.requiredLicenseType.trim()
      ? body.requiredLicenseType.trim()
      : null;
    if (regulated && !requiredLicenseType) {
      throw new BadRequestException('Une compétence réglementée doit préciser le type de licence requis.');
    }
    const data = {
      nameI18n,
      sectorId,
      synonyms: (body.synonyms as string[] | undefined) ?? [],
      parentId,
      regulated,
      requiredLicenseType,
    };
    if (skillId) {
      return this.prisma.skill.update({
        where: { id: skillId },
        data: { ...data, version: { increment: 1 } },
      });
    }
    return this.prisma.skill.create({ data });
  }

  /** POST /admin/sectors — Crée ou modifie un secteur */
  async postAdminSectors(input: RequestInput): Promise<unknown> {
    const body = bodyRecord(input.body);
    const nameI18n = jsonObject(body.nameI18n, 'nameI18n');
    if (typeof nameI18n.fr !== 'string' || !nameI18n.fr.trim()) {
      throw new BadRequestException('Le nom français est obligatoire.');
    }
    for (const field of ['parentId', 'icon']) {
      if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
        throw new BadRequestException(`${field} doit être une chaîne ou null.`);
      }
    }
    const sectorId = typeof body.id === 'string' ? body.id : undefined;
    const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
    if (parentId) {
      if (parentId === sectorId) throw new BadRequestException('Un secteur ne peut pas être son propre parent.');
      if (!await this.prisma.sector.findFirst({ where: { id: parentId, deletedAt: null } })) {
        throw new BadRequestException('Le secteur parent est introuvable.');
      }
    }
    const data = {
      nameI18n,
      parentId,
      icon: typeof body.icon === 'string' ? body.icon : null,
    };
    if (sectorId) {
      return this.prisma.sector.update({
        where: { id: sectorId },
        data: { ...data, version: { increment: 1 } },
      });
    }
    return this.prisma.sector.create({ data });
  }
}
