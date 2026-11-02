import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotImplementedException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';
import type { AuthenticatedPrincipal } from '../../common/oidc-token.service';
import { calculateQuote } from '@bigbiim/rules';
import type { QuoteLineInput } from '@bigbiim/rules';
import { evaluate } from '@bigbiim/rules';
import type { RuleContext } from '@bigbiim/rules';
import {
  canTransitionMission,
  canTransitionProject,
  isMissionState,
  isProjectState,
} from './project.states';
import type { MissionState, ProjectState } from './project.states';
import { MatchingService } from '../matching/matching.service';
import type { MatchCandidate } from '../matching/matching.service';

type JsonRecord = Record<string, unknown>;

interface ActivityDefinition extends JsonRecord {
  questionnaire: unknown[];
  roles: unknown[];
  pricing: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): JsonRecord {
  if (!isRecord(value)) throw new BadRequestException(`${name} doit être un objet JSON`);
  return value;
}

function jsonInput(value: unknown, name: string): Prisma.InputJsonValue {
  if (value === undefined) throw new BadRequestException(`${name} est requis`);
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 65_536) {
      throw new BadRequestException(`${name} est invalide ou trop volumineux`);
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`${name} doit être un JSON valide`);
  }
}

function activityDefinition(value: Prisma.JsonValue): ActivityDefinition {
  if (!isRecord(value)) throw new ConflictException('Définition de l’activité invalide');
  if (
    !Array.isArray(value.questionnaire) ||
    !Array.isArray(value.roles) ||
    !isRecord(value.pricing)
  ) {
    throw new ConflictException('Définition publiée incomplète : questionnaire, rôles ou tarifs');
  }
  return value as ActivityDefinition;
}

function fieldKey(field: JsonRecord): string | null {
  const key = field.key ?? field.id;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function isRuleTables(value: unknown): value is NonNullable<RuleContext['tables']> {
  return isRecord(value) && Object.values(value).every(isRecord);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizedScore(value: number | null | undefined, maximum: number): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value / maximum));
}

function normalizedCity(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function validateAnswers(
  definition: ActivityDefinition,
  answers: JsonRecord,
  requireRequired: boolean,
): void {
  const fields = definition.questionnaire.map((field, index) => {
    if (!isRecord(field) || !fieldKey(field)) {
      throw new ConflictException(`Champ de questionnaire ${index} invalide`);
    }
    return field;
  });
  const knownKeys = new Set(fields.map((field) => fieldKey(field) as string));

  for (const key of Object.keys(answers)) {
    if (!knownKeys.has(key)) {
      throw new UnprocessableEntityException(`Réponse inconnue : ${key}`);
    }
  }

  for (const field of fields) {
    const key = fieldKey(field) as string;
    const value = answers[key];
    if (value === undefined || value === null || value === '') {
      if (requireRequired && field.required === true) {
        throw new UnprocessableEntityException(`Réponse obligatoire manquante : ${key}`);
      }
      continue;
    }

    const type = typeof field.type === 'string' ? field.type.replaceAll('-', '_') : '';
    const valid =
      type === 'text' || type === 'string'
        ? typeof value === 'string'
        : type === 'number' || type === 'amount' || type === 'montant' || type === 'nombre'
          ? typeof value === 'number' && Number.isFinite(value)
          : type === 'yes_no' || type === 'boolean' || type === 'oui_non'
            ? typeof value === 'boolean'
            : type === 'multiple_choice' || type === 'repeatable' || type === 'liste_repetable'
              ? Array.isArray(value)
              : type === 'address' || type === 'date_range' || type === 'plage_dates'
                ? isRecord(value)
                : type === 'date'
                  ? isDateString(value)
                  : type === 'file'
                    ? typeof value === 'string' || isRecord(value)
                    : type === 'single_choice' || type === 'choix_unique'
                      ? typeof value === 'string'
                      : false;
    if (!valid) {
      throw new UnprocessableEntityException(`Format de réponse invalide : ${key}`);
    }

    if (
      typeof value === 'number' &&
      ((typeof field.min === 'number' && value < field.min) ||
        (typeof field.max === 'number' && value > field.max))
    ) {
      throw new UnprocessableEntityException(`Valeur hors limites : ${key}`);
    }
    if (type === 'date_range' || type === 'plage_dates') {
      const range = value as JsonRecord;
      const start = range.start ?? range.from;
      const end = range.end ?? range.to;
      if (!isDateString(start) || !isDateString(end) || Date.parse(start) > Date.parse(end)) {
        throw new UnprocessableEntityException(`Plage de dates invalide : ${key}`);
      }
    }
    if (
      typeof value === 'string' &&
      ((typeof field.minLength === 'number' && value.length < field.minLength) ||
        (typeof field.maxLength === 'number' && value.length > field.maxLength))
    ) {
      throw new UnprocessableEntityException(`Longueur invalide : ${key}`);
    }
    if (typeof value === 'string' && typeof field.pattern === 'string') {
      let pattern: RegExp;
      try {
        pattern = new RegExp(field.pattern);
      } catch {
        throw new ConflictException(`Motif de validation invalide pour le champ ${key}`);
      }
      if (!pattern.test(value)) {
        throw new UnprocessableEntityException(`Format de réponse invalide : ${key}`);
      }
    }
    if (typeof value === 'string' || Array.isArray(value)) {
      const options = field.options;
      if (Array.isArray(options)) {
        const allowed = new Set(
          options.flatMap((option) => {
            if (typeof option === 'string') return [option];
            if (isRecord(option) && typeof option.value === 'string') return [option.value];
            return [];
          }),
        );
        const selected = typeof value === 'string' ? [value] : value;
        if (selected.some((option) => typeof option !== 'string' || !allowed.has(option))) {
          throw new UnprocessableEntityException(`Choix invalide : ${key}`);
        }
      }
    }
  }
}

function evaluateConfiguredValue(
  value: unknown,
  context: RuleContext,
  name: string,
): number {
  let result: unknown;
  try {
    result =
      typeof value === 'number'
        ? value
        : isRecord(value) || Array.isArray(value)
          ? evaluate(JSON.stringify(value), context)
          : undefined;
  } catch (error) {
    if (
      error instanceof TypeError ||
      error instanceof RangeError ||
      error instanceof SyntaxError
    ) {
      throw new UnprocessableEntityException(`${name} invalide : ${error.message}`);
    }
    throw error;
  }
  if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
    throw new UnprocessableEntityException(`${name} doit produire un entier sûr`);
  }
  return result;
}

export function quoteFromDefinition(
  definition: ActivityDefinition,
  answers: JsonRecord,
): { lines: QuoteLineInput[]; calculation: ReturnType<typeof calculateQuote>; currency: string } {
  const currency = definition.pricing.currency ?? definition.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new ConflictException('La devise ISO 4217 doit être définie sur l’activité');
  }

  const configuredTables = definition.pricing.tables;
  if (configuredTables !== undefined && !isRuleTables(configuredTables)) {
    throw new ConflictException('Les tables tarifaires de l’activité sont invalides');
  }
  const tables = isRuleTables(configuredTables) ? configuredTables : undefined;
  const context = { answers, settings: definition.pricing, tables };
  const lines = definition.roles.flatMap((role, index): QuoteLineInput[] => {
    if (!isRecord(role)) throw new ConflictException(`Rôle ${index} invalide`);
    const rawKey = role.key ?? role.roleKey;
    if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      throw new ConflictException(`Clé du rôle ${index} invalide`);
    }
    const key = rawKey.trim();

    const quantity = evaluateConfiguredValue(
      role.quantity_formula ?? role.quantityFormula ?? role.quantity,
      context,
      `Quantité du rôle ${key}`,
    );
    if (quantity === 0 && role.required !== true && role.mandatory !== true) return [];
    if (quantity <= 0) {
      throw new UnprocessableEntityException(`Quantité invalide pour le rôle ${key}`);
    }
    const unitAmount = evaluateConfiguredValue(
      role.unit_amount ?? role.unitAmount ?? role.price_formula ?? role.priceFormula,
      context,
      `Prix unitaire du rôle ${key}`,
    );
    if (unitAmount < 0) {
      throw new UnprocessableEntityException(`Prix invalide pour le rôle ${key}`);
    }
    return [{ key, quantity, unitAmount }];
  });
  if (lines.length === 0) {
    throw new ConflictException('Aucun rôle tarifé ne permet de calculer le devis');
  }

  const optionalAmount = (snakeCase: string, camelCase: string) => {
    const value = definition.pricing[snakeCase] ?? definition.pricing[camelCase] ?? 0;
    return evaluateConfiguredValue(value, context, snakeCase);
  };
  let calculation: ReturnType<typeof calculateQuote>;
  try {
    calculation = calculateQuote({
      lines,
      coordinationFee: optionalAmount('coordination_fee', 'coordinationFee'),
      platformFee: optionalAmount('platform_fee', 'platformFee'),
      discount: optionalAmount('discount', 'discount'),
      taxes: optionalAmount('taxes', 'taxes'),
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new UnprocessableEntityException(`Calcul du devis impossible : ${error.message}`);
    }
    throw error;
  }
  return { lines, calculation, currency };
}

export function projectRolesFromDefinition(
  definition: ActivityDefinition,
  lines: QuoteLineInput[],
): Array<{ roleKey: string; skillId: string; quantity: number }> {
  const definitions = new Map<string, JsonRecord>();
  for (const [index, rawRole] of definition.roles.entries()) {
    if (!isRecord(rawRole)) throw new ConflictException(`Rôle ${index} invalide`);
    const rawKey = rawRole.key ?? rawRole.roleKey;
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      throw new ConflictException(`Clé du rôle ${index} invalide`);
    }
    const key = rawKey.trim();
    if (definitions.has(key)) throw new ConflictException(`Clé de rôle dupliquée : ${key}`);
    definitions.set(key, rawRole);
  }

  return lines.map((line) => {
    const role = definitions.get(line.key);
    const skillId = role?.skillId ?? role?.skill_id;
    if (typeof skillId !== 'string' || !skillId.trim()) {
      throw new ConflictException(`La compétence doit être définie pour le rôle ${line.key}`);
    }
    return { roleKey: line.key, skillId: skillId.trim(), quantity: line.quantity };
  });
}

function safeNumberFromBigInt(value: bigint, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new ConflictException(`${field} dépasse la précision monétaire autorisée`);
  }
  return number;
}

function currentPrincipal(input: RequestInput) {
  if (!input.principal) throw new UnauthorizedException('Utilisateur authentifié absent');
  return input.principal;
}

async function projectRoleIdsForProvider(
  prisma: Prisma.TransactionClient | PrismaService,
  userId: string,
): Promise<string[]> {
  const provider = await prisma.provider.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  if (!provider) return [];
  const missions = await prisma.mission.findMany({
    where: { providerId: provider.id, deletedAt: null },
    select: { projectRoleId: true },
  });
  const offers = await prisma.missionOffer.findMany({
    where: { providerId: provider.id, deletedAt: null },
    select: { missionId: true },
  });
  const projectRoleIds = new Set(missions.map((mission) => mission.projectRoleId));
  const offeredMissionIds = offers.map((offer) => offer.missionId);
  if (offeredMissionIds.length > 0) {
    const offeredRoles = await prisma.mission.findMany({
      where: { id: { in: offeredMissionIds }, deletedAt: null },
      select: { projectRoleId: true },
    });
    for (const role of offeredRoles) projectRoleIds.add(role.projectRoleId);
  }
  if (projectRoleIds.size === 0) return [];
  const roles = await prisma.projectRole.findMany({
    where: { id: { in: [...projectRoleIds] }, deletedAt: null },
    select: { projectId: true },
  });
  return [...new Set(roles.map((role) => role.projectId))];
}

async function providerIdForUser(
  prisma: Prisma.TransactionClient | PrismaService,
  userId: string,
): Promise<string> {
  const provider = await prisma.provider.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  if (!provider) throw new NotFoundException('Profil prestataire introuvable');
  return provider.id;
}

function isMissionOfferExpired(offerExpiresAt: Date | null): boolean {
  return offerExpiresAt !== null && offerExpiresAt.getTime() <= Date.now();
}

async function visibleProjectWhere(
  prisma: Prisma.TransactionClient | PrismaService,
  principal: ReturnType<typeof currentPrincipal>,
): Promise<Prisma.ProjectWhereInput> {
  if (principal.roles.includes('A')) return { deletedAt: null };
  const access: Prisma.ProjectWhereInput[] = [];
  if (principal.roles.includes('C')) access.push({ clientId: principal.id });
  if (principal.roles.includes('P')) {
    const projectIds = await projectRoleIdsForProvider(prisma, principal.id);
    if (projectIds.length > 0) access.push({ id: { in: projectIds } });
  }
  if (access.length === 0) throw new UnauthorizedException('Rôle non autorisé à consulter les projets');
  return { deletedAt: null, OR: access };
}

/**
 * Module projects — Machine à états, devis, plan, missions, jalons
 * Logiques métier à coder ici (document, section 3) :
 *   3.1 Cycle de vie d’un projet
 *   3.2 Cycle de vie d’une mission
 *   3.5 Génération du plan de projet
 *   3.6 Calcul du devis
 *   3.8 Offres de mission
 *   3.11 Jalons et preuves
 *   3.16 Modification d’un projet en cours
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  /** POST /projects — Crée un projet depuis une version d’activité */
  async postProjects(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const body = requireRecord(input.body, 'Corps de requête');
    if (typeof body.activityVersionId !== 'string' || body.activityVersionId.length === 0) {
      throw new BadRequestException('activityVersionId est requis');
    }

    const version = await this.prisma.activityVersion.findFirst({
      where: { id: body.activityVersionId, status: 'PUBLIE', deletedAt: null },
    });
    if (!version) throw new NotFoundException('Version d’activité publiée introuvable');

    const definition = activityDefinition(version.definition);
    const currency = definition.pricing.currency ?? definition.currency;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new ConflictException('La devise ISO 4217 doit être définie sur l’activité');
    }
    const answers: JsonRecord = {};
    let targetDate: Date | null = null;
    if (body.targetDate !== undefined) {
      if (typeof body.targetDate !== 'string' || Number.isNaN(Date.parse(body.targetDate))) {
        throw new BadRequestException('targetDate doit être une date valide');
      }
      targetDate = new Date(body.targetDate);
    }
    if (body.city !== undefined && (typeof body.city !== 'string' || body.city.length > 160)) {
      throw new BadRequestException('city doit être une chaîne de 160 caractères maximum');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const activity = await tx.activity.findFirst({
          where: {
            id: version.activityId,
            status: 'PUBLIE',
            currentVersionId: version.id,
            deletedAt: null,
          },
        });
        if (!activity) throw new ConflictException('Cette activité n’accepte plus de projets');

        const project = await tx.project.create({
          data: {
            clientId: principal.id,
            activityVersionId: version.id,
            status: 'BROUILLON',
            answers: jsonInput(answers, 'answers'),
            targetDate,
            city: typeof body.city === 'string' ? body.city.trim() : null,
            currency,
            countryCode: activity.countryCode,
          },
        });
        const occurredAt = new Date();
        const payload = jsonInput(
          { projectId: project.id, clientId: principal.id, activityVersionId: version.id },
          'Événement ProjetCréé',
        );
        await tx.projectEvent.create({
          data: { projectId: project.id, type: 'ProjetCréé', payload, at: occurredAt },
        });
        await tx.outboxEvent.create({ data: { type: 'ProjetCréé', payload } });
        return project;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Le projet a été modifié simultanément ; réessayez');
      }
      throw error;
    }
  }

  /** PATCH /projects/{id}/answers — Enregistre les réponses du questionnaire */
  async patchProjectsByIdAnswers(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    const body = requireRecord(input.body, 'Corps de requête');
    const submittedAnswers = requireRecord(body.answers, 'answers');
    const answersJson = jsonInput(submittedAnswers, 'answers');

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, clientId: principal.id, deletedAt: null },
      });
      if (!project) throw new NotFoundException('Projet introuvable');
      if (project.status !== 'BROUILLON' && project.status !== 'DEVIS') {
        throw new ConflictException('Les réponses ne peuvent plus être modifiées dans cet état');
      }

      const version = await tx.activityVersion.findFirst({
        where: { id: project.activityVersionId, status: 'PUBLIE', deletedAt: null },
      });
      if (!version) throw new ConflictException('Version d’activité du projet indisponible');
      const definition = activityDefinition(version.definition);
      const currentAnswers = isRecord(project.answers) ? project.answers : {};
      const mergedAnswers = { ...currentAnswers, ...submittedAnswers };
      validateAnswers(definition, mergedAnswers, false);
      const mergedAnswersJson = jsonInput(mergedAnswers, 'answers');

      const updated = await tx.project.updateMany({
        where: {
          id: project.id,
          clientId: principal.id,
          version: project.version,
          status: project.status,
          deletedAt: null,
        },
        data: { answers: mergedAnswersJson, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Le projet a été modifié simultanément');
      await tx.quote.updateMany({
        where: { projectId: project.id, deletedAt: null, locked: true },
        data: { validUntil: new Date(), locked: false },
      });

      const occurredAt = new Date();
      const payload = jsonInput(
        { projectId: project.id, clientId: principal.id, projectVersion: project.version + 1 },
        'Événement RéponsesProjetModifiées',
      );
      await tx.projectEvent.create({
        data: { projectId: project.id, type: 'RéponsesProjetModifiées', payload, at: occurredAt },
      });
      await tx.outboxEvent.create({ data: { type: 'RéponsesProjetModifiées', payload } });
      return { id: project.id, answers: mergedAnswers, version: project.version + 1 };
    });
  }

  /** POST /projects/{id}/quote — Calcule le devis */
  async postProjectsByIdQuote(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    if (input.body !== undefined && input.body !== null) {
      const body = requireRecord(input.body, 'Corps de requête');
      if (Object.keys(body).length > 0) {
        throw new BadRequestException('Le devis est calculé à partir du projet et de ses réponses');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, clientId: principal.id, deletedAt: null },
      });
      if (!project) throw new NotFoundException('Projet introuvable');
      if (!isProjectState(project.status)) {
        throw new ConflictException(`État de projet inconnu : ${project.status}`);
      }
      const from = project.status;
      if (from !== 'BROUILLON' && from !== 'DEVIS') {
        throw new ConflictException('Un devis ne peut pas être recalculé dans cet état');
      }

      const version = await tx.activityVersion.findFirst({
        where: { id: project.activityVersionId, status: 'PUBLIE', deletedAt: null },
      });
      if (!version) throw new ConflictException('Version d’activité du projet indisponible');
      const definition = activityDefinition(version.definition);
      const answers = isRecord(project.answers) ? project.answers : {};
      validateAnswers(definition, answers, true);
      const { calculation, currency } = quoteFromDefinition(definition, answers);
      const configuredRoles = projectRolesFromDefinition(definition, calculation.lines);
      const skills = await tx.skill.findMany({
        where: {
          id: { in: [...new Set(configuredRoles.map(({ skillId }) => skillId))] },
          deletedAt: null,
        },
        select: { id: true },
      });
      const availableSkills = new Set(skills.map(({ id }) => id));
      for (const role of configuredRoles) {
        if (!availableSkills.has(role.skillId)) {
          throw new ConflictException(`Compétence introuvable pour le rôle ${role.roleKey}`);
        }
      }
      const nextState: ProjectState = from === 'BROUILLON' ? 'DEVIS' : from;
      if (nextState !== from && !canTransitionProject(from, nextState)) {
        throw new ConflictException(`Transition de projet interdite : ${from} → ${nextState}`);
      }

      const latest = await tx.quote.findFirst({
        where: { projectId: project.id, deletedAt: null },
        orderBy: { version: 'desc' },
      });
      const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const quote = await tx.quote.create({
        data: {
          projectId: project.id,
          version: (latest?.version ?? 0) + 1,
          lines: jsonInput(calculation.lines, 'Lignes de devis'),
          total: BigInt(calculation.total),
          validUntil,
          locked: true,
        },
      });
      const existingRoles = await tx.projectRole.findMany({
        where: { projectId: project.id, deletedAt: null },
        select: { id: true, roleKey: true },
      });
      const configuredRoleKeys = new Set(configuredRoles.map(({ roleKey }) => roleKey));
      const removedRoleIds = existingRoles
        .filter(({ roleKey }) => !configuredRoleKeys.has(roleKey))
        .map(({ id }) => id);
      if (removedRoleIds.length > 0) {
        await tx.projectRole.updateMany({
          where: { id: { in: removedRoleIds }, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
      }
      for (const role of configuredRoles) {
        const existing = existingRoles.find((entry) => entry.roleKey === role.roleKey);
        if (existing) {
          await tx.projectRole.update({
            where: { id: existing.id },
            data: {
              skillId: role.skillId,
              quantity: role.quantity,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.projectRole.create({
            data: { projectId: project.id, ...role },
          });
        }
      }
      const updated = await tx.project.updateMany({
        where: {
          id: project.id,
          clientId: principal.id,
          version: project.version,
          status: project.status,
          deletedAt: null,
        },
        data: {
          status: nextState,
          currency,
          totalAmount: BigInt(calculation.total),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Le projet a été modifié simultanément');

      const occurredAt = new Date();
      const payload = jsonInput(
        {
          projectId: project.id,
          quoteId: quote.id,
          quoteVersion: quote.version,
          total: calculation.total,
          currency,
          validUntil: validUntil.toISOString(),
        },
        'Événement DevisCalculé',
      );
      await tx.projectEvent.create({
        data: { projectId: project.id, type: 'DevisCalculé', payload, at: occurredAt },
      });
      await tx.outboxEvent.create({ data: { type: 'DevisCalculé', payload } });
      return {
        ...quote,
        lines: calculation.lines,
        total: calculation.total,
        currency,
      };
    });
  }

  /** GET /projects/{id}/quote — Lit le devis courant */
  async getProjectsByIdQuote(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId: principal.id, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    const quote = await this.prisma.quote.findFirst({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    if (!quote) throw new NotFoundException('Aucun devis disponible');

    return {
      ...quote,
      lines: quote.lines,
      total: safeNumberFromBigInt(quote.total, 'total du devis'),
      currency: project.currency,
      expired: quote.validUntil.getTime() <= Date.now(),
    };
  }

  /** POST /projects/{id}/team/suggest — Lance le matching */
  async postProjectsByIdTeamSuggest(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId: principal.id, deletedAt: null },
      select: { id: true, city: true, targetDate: true, status: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    if (project.status !== 'DEVIS' && project.status !== 'EQUIPE') {
      throw new ConflictException('Les suggestions ne sont disponibles qu’avant la confirmation de l’équipe');
    }
    if (!project.city?.trim() || !project.targetDate) {
      throw new BadRequestException('La ville et la date souhaitée doivent être renseignées avant le matching');
    }

    const roles = await this.prisma.projectRole.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, roleKey: true, skillId: true, quantity: true },
    });
    const targetDayStart = project.targetDate
      ? new Date(Date.UTC(
          project.targetDate.getUTCFullYear(),
          project.targetDate.getUTCMonth(),
          project.targetDate.getUTCDate(),
        ))
      : null;
    const targetDayEnd = targetDayStart
      ? new Date(targetDayStart.getTime() + 24 * 60 * 60 * 1000)
      : null;
    const now = new Date();

    const items = await Promise.all(roles.map(async (role) => {
      const skill = await this.prisma.skill.findFirst({
        where: { id: role.skillId, deletedAt: null },
        select: { regulated: true, requiredLicenseType: true },
      });
      if (!skill) {
        return { roleId: role.id, roleKey: role.roleKey, quantity: role.quantity, candidates: [] };
      }

      const providerSkills = await this.prisma.providerSkill.findMany({
        where: { skillId: role.skillId, verified: true, deletedAt: null },
        select: { providerId: true, years: true },
      });
      const providerIds = [...new Set(providerSkills.map(({ providerId }) => providerId))];
      if (providerIds.length === 0) {
        return { roleId: role.id, roleKey: role.roleKey, quantity: role.quantity, candidates: [] };
      }

      const requiresLicense = skill.regulated;
      const minimumKyc = requiresLicense ? 3 : 1;
      const providers = await this.prisma.provider.findMany({
        where: {
          id: { in: providerIds },
          deletedAt: null,
          status: { notIn: ['REFUSE', 'SUSPENDU'] },
          kycLevel: { gte: minimumKyc },
        },
        select: { id: true, kycLevel: true, ratingBayes: true, reliabilityScore: true },
      });
      if (providers.length === 0) {
        return { roleId: role.id, roleKey: role.roleKey, quantity: role.quantity, candidates: [] };
      }

      const eligibleProviderIds = providers.map(({ id }) => id);
      const [zones, availability, licenses, activeMissionCounts] = await Promise.all([
        this.prisma.providerZone.findMany({
          where: { providerId: { in: eligibleProviderIds }, deletedAt: null },
          select: { providerId: true, city: true },
        }),
        targetDayStart && targetDayEnd
          ? this.prisma.providerAvailability.findMany({
              where: {
                providerId: { in: eligibleProviderIds },
                fromAt: { lt: targetDayEnd },
                toAt: { gt: targetDayStart },
                capacity: { gt: 0 },
                deletedAt: null,
              },
              select: { providerId: true },
            })
          : Promise.resolve([]),
        requiresLicense && skill.requiredLicenseType
          ? this.prisma.providerDocument.findMany({
              where: {
                providerId: { in: eligibleProviderIds },
                type: skill.requiredLicenseType,
                status: { in: ['VERIFIE', 'VALIDE'] },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                deletedAt: null,
              },
              select: { providerId: true },
            })
          : Promise.resolve([]),
        this.prisma.mission.groupBy({
          by: ['providerId'],
          where: {
            providerId: { in: eligibleProviderIds },
            deletedAt: null,
            status: { notIn: ['REFUSEE', 'EXPIREE', 'ANNULEE', 'REMPLACEE', 'VALIDEE'] },
          },
          _count: { _all: true },
        }),
      ]);

      const zoneProviders = new Set(
        zones
          .filter(({ city }) => normalizedCity(city) !== '')
          .filter(({ city }) => normalizedCity(city) === normalizedCity(project.city))
          .map(({ providerId }) => providerId),
      );
      const availableProviders = new Set(availability.map(({ providerId }) => providerId));
      const licensedProviders = new Set(licenses.map(({ providerId }) => providerId));
      const missionsByProvider = new Map(
        activeMissionCounts.map(({ providerId, _count }) => [providerId, _count._all]),
      );
      const yearsByProvider = new Map<string, number>();
      for (const providerSkill of providerSkills) {
        const years = providerSkill.years ?? 0;
        yearsByProvider.set(
          providerSkill.providerId,
          Math.max(yearsByProvider.get(providerSkill.providerId) ?? 0, years),
        );
      }

      const candidates: MatchCandidate[] = providers.map((provider) => {
        const reputation = normalizedScore(provider.ratingBayes, 5);
        const reliability = normalizedScore(
          provider.reliabilityScore,
          (provider.reliabilityScore ?? 0) > 1 ? 100 : 1,
        );
        return {
          providerId: provider.id,
          hardFilters: {
            verifiedSkill: true,
            validLicense:
              !requiresLicense || Boolean(skill.requiredLicenseType && licensedProviders.has(provider.id)),
            serviceArea: zoneProviders.has(provider.id),
            availability: availableProviders.has(provider.id),
            activeAccount: true,
            verificationLevel: provider.kycLevel >= minimumKyc,
          },
          scores: {
            ...(reputation === undefined ? {} : { reputation }),
            ...(reliability === undefined ? {} : { reliability }),
            experience: Math.max(0, Math.min(1, (yearsByProvider.get(provider.id) ?? 0) / 10)),
            equity: 1 / (1 + (missionsByProvider.get(provider.id) ?? 0)),
            ...(zoneProviders.has(provider.id) ? { proximity: 1 } : {}),
          },
        };
      });

      return {
        roleId: role.id,
        roleKey: role.roleKey,
        quantity: role.quantity,
        candidates: this.matching.rankCandidates(candidates),
      };
    }));

    return { projectId: project.id, items };
  }

  /** PUT /projects/{id}/team/{role} — Choisit un prestataire pour un rôle */
  async putProjectsByIdTeamByRole(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    const roleKey = input.params?.role;
    const body = requireRecord(input.body, 'Corps de requête');
    if (!projectId || !roleKey) throw new BadRequestException('Projet et rôle requis');
    if (typeof body.providerId !== 'string' || !body.providerId.trim()) {
      throw new BadRequestException('providerId est requis');
    }
    const providerId = body.providerId.trim();

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId: principal.id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    if (project.status !== 'DEVIS' && project.status !== 'EQUIPE') {
      throw new ConflictException('L’équipe ne peut plus être modifiée dans cet état du projet');
    }

    const suggestions = await this.postProjectsByIdTeamSuggest({
      params: { id: projectId },
      principal,
    });
    if (!isRecord(suggestions) || !Array.isArray(suggestions.items)) {
      throw new ConflictException('Les suggestions de prestataires sont indisponibles');
    }
    const selectedRole = suggestions.items.find(
      (item): item is JsonRecord =>
        isRecord(item) && (item.roleId === roleKey || item.roleKey === roleKey),
    );
    const selectedCandidate = isRecord(selectedRole) && Array.isArray(selectedRole.candidates)
      ? selectedRole.candidates.find(
          (candidate): candidate is JsonRecord =>
            isRecord(candidate) && candidate.providerId === providerId,
        )
      : undefined;
    if (!selectedRole || !selectedCandidate) {
      throw new BadRequestException('Le prestataire doit faire partie des suggestions éligibles pour ce rôle');
    }

    const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const currentProject = await tx.project.findFirst({
        where: { id: projectId, clientId: principal.id, deletedAt: null },
      });
      if (!currentProject || (currentProject.status !== 'DEVIS' && currentProject.status !== 'EQUIPE')) {
        throw new ConflictException('Le projet a changé d’état. Rechargez-le avant de sélectionner un prestataire');
      }

      const role = await tx.projectRole.findFirst({
        where: {
          projectId,
          deletedAt: null,
          OR: [{ id: roleKey }, { roleKey }],
        },
      });
      if (!role) throw new NotFoundException('Rôle du projet introuvable');

      const reservedRole = await tx.projectRole.updateMany({
        where: { id: role.id, version: role.version, deletedAt: null },
        data: { version: { increment: 1 } },
      });
      if (reservedRole.count !== 1) {
        throw new ConflictException('Le rôle a été modifié simultanément');
      }

      const existingMissions = await tx.mission.findMany({
        where: {
          projectRoleId: role.id,
          deletedAt: null,
          status: { in: ['PROPOSEE', 'ACCEPTEE', 'CONTRE_PROPOSEE', 'PLANIFIEE', 'EN_COURS', 'LIVREE'] },
        },
        select: { id: true },
      });
      if (existingMissions.length >= role.quantity) {
        throw new ConflictException('Tous les postes de ce rôle ont déjà une mission active');
      }
      if (existingMissions.length > 0) {
        const duplicateOffer = await tx.missionOffer.findFirst({
          where: {
            missionId: { in: existingMissions.map(({ id }) => id) },
            providerId,
            status: { in: ['PROPOSEE', 'ACCEPTEE', 'CONTRE_PROPOSEE'] },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (duplicateOffer) {
          throw new ConflictException('Ce prestataire a déjà une mission active pour ce rôle');
        }
      }

      const mission = await tx.mission.create({
        data: {
          projectRoleId: role.id,
          status: 'PROPOSEE',
          offerExpiresAt,
        },
      });
      const offer = await tx.missionOffer.create({
        data: {
          missionId: mission.id,
          providerId,
          status: 'PROPOSEE',
          rank: 1,
          score: typeof selectedCandidate.score === 'number' ? selectedCandidate.score : 0,
          explanation: jsonInput(selectedCandidate.explanation ?? {}, 'Explication du matching'),
        },
      });

      if (currentProject.status === 'DEVIS') {
        if (!canTransitionProject('DEVIS', 'EQUIPE')) {
          throw new ConflictException('Transition de projet interdite');
        }
        const updatedProject = await tx.project.updateMany({
          where: {
            id: currentProject.id,
            version: currentProject.version,
            status: 'DEVIS',
            deletedAt: null,
          },
          data: { status: 'EQUIPE', version: { increment: 1 } },
        });
        if (updatedProject.count !== 1) {
          throw new ConflictException('Le projet a été modifié simultanément');
        }
      }

      await this.recordMissionEvent(tx, mission.id, 'MissionProposée', principal.id, {
        providerId,
        offerId: offer.id,
        roleId: role.id,
        roleKey: role.roleKey,
        expiresAt: offerExpiresAt.toISOString(),
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'MISSION_OFFER_CREATED',
          entity: 'Mission',
          entityId: mission.id,
          after: {
            projectId,
            roleId: role.id,
            providerId,
            offerId: offer.id,
          },
          at: new Date(),
        },
      });

      return {
        mission: { ...mission, offerExpiresAt },
        offer,
      };
    });
  }

  /** POST /projects/{id}/team/{role}/replace — Remplace un prestataire */
  async postProjectsByIdTeamByRoleReplace(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    const roleKey = input.params?.role;
    const body = requireRecord(input.body, 'Corps de requête');
    if (!projectId || !roleKey) throw new BadRequestException('Projet et rôle requis');
    if (typeof body.missionId !== 'string' || !body.missionId.trim()) {
      throw new BadRequestException('missionId est requis');
    }
    if (typeof body.providerId !== 'string' || !body.providerId.trim()) {
      throw new BadRequestException('providerId est requis');
    }
    const missionId = body.missionId.trim();
    const providerId = body.providerId.trim();

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        ...(principal.roles.includes('A') ? {} : { clientId: principal.id }),
      },
      select: { id: true, clientId: true, status: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    if (project.status !== 'EQUIPE') {
      throw new ConflictException('Le remplacement automatique n’est disponible que pendant la constitution de l’équipe');
    }

    const originalMission = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        deletedAt: null,
        status: { in: ['REFUSEE', 'EXPIREE'] },
      },
      select: { id: true, projectRoleId: true, status: true },
    });
    if (!originalMission) throw new ConflictException('La mission doit avoir été refusée ou expirée');
    const role = await this.prisma.projectRole.findFirst({
      where: {
        id: originalMission.projectRoleId,
        projectId,
        deletedAt: null,
        OR: [{ id: roleKey }, { roleKey }],
      },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Mission introuvable pour ce rôle');

    const suggestionPrincipal = principal.roles.includes('A')
      ? { id: project.clientId, roles: ['C'] as AuthenticatedPrincipal['roles'] }
      : principal;
    const suggestions = await this.postProjectsByIdTeamSuggest({
      params: { id: projectId },
      principal: suggestionPrincipal,
    });
    const selectedRole = isRecord(suggestions) && Array.isArray(suggestions.items)
      ? suggestions.items.find(
          (item): item is JsonRecord =>
            isRecord(item) && (item.roleId === role.id || item.roleKey === roleKey),
        )
      : undefined;
    const selectedCandidate = isRecord(selectedRole) && Array.isArray(selectedRole.candidates)
      ? selectedRole.candidates.find(
          (candidate): candidate is JsonRecord =>
            isRecord(candidate) && candidate.providerId === providerId,
        )
      : undefined;
    if (!selectedCandidate) {
      throw new BadRequestException('Le prestataire doit faire partie des suggestions éligibles pour ce rôle');
    }
    const previousOffer = await this.prisma.missionOffer.findFirst({
      where: { missionId, providerId, deletedAt: null },
      select: { id: true },
    });
    if (previousOffer) {
      throw new BadRequestException('Ce prestataire a déjà reçu une offre pour la mission remplacée');
    }

    const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const currentProject = await tx.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
          ...(principal.roles.includes('A') ? {} : { clientId: principal.id }),
        },
        select: { id: true, clientId: true, status: true },
      });
      if (!currentProject || currentProject.status !== 'EQUIPE') {
        throw new ConflictException('Le projet a changé d’état. Rechargez-le avant de remplacer la mission');
      }

      const mission = await tx.mission.findFirst({
        where: {
          id: missionId,
          projectRoleId: role.id,
          status: { in: ['REFUSEE', 'EXPIREE'] },
          deletedAt: null,
        },
      });
      if (!mission || !isMissionState(mission.status) || !canTransitionMission(mission.status, 'REMPLACEE')) {
        throw new ConflictException('La mission a déjà été remplacée ou modifiée');
      }

      const currentRole = await tx.projectRole.findFirst({
        where: { id: role.id, projectId, deletedAt: null },
        select: { id: true, version: true, quantity: true },
      });
      if (!currentRole) throw new NotFoundException('Rôle du projet introuvable');
      const reservedRole = await tx.projectRole.updateMany({
        where: { id: currentRole.id, version: currentRole.version, deletedAt: null },
        data: { version: { increment: 1 } },
      });
      if (reservedRole.count !== 1) {
        throw new ConflictException('Le rôle a été modifié simultanément');
      }

      const activeMissions = await tx.mission.findMany({
        where: {
          projectRoleId: currentRole.id,
          deletedAt: null,
          status: { in: ['PROPOSEE', 'ACCEPTEE', 'CONTRE_PROPOSEE', 'PLANIFIEE', 'EN_COURS', 'LIVREE'] },
        },
        select: { id: true },
      });
      if (activeMissions.length >= currentRole.quantity) {
        throw new ConflictException('Tous les postes de ce rôle ont déjà une mission active');
      }
      if (activeMissions.length > 0) {
        const duplicateOffer = await tx.missionOffer.findFirst({
          where: {
            missionId: { in: activeMissions.map(({ id }) => id) },
            providerId,
            status: { in: ['PROPOSEE', 'ACCEPTEE', 'CONTRE_PROPOSEE'] },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (duplicateOffer) throw new ConflictException('Ce prestataire a déjà une mission active pour ce rôle');
      }

      const replaced = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: mission.status,
          deletedAt: null,
        },
        data: { status: 'REMPLACEE', version: { increment: 1 } },
      });
      if (replaced.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');

      const replacement = await tx.mission.create({
        data: { projectRoleId: currentRole.id, status: 'PROPOSEE', offerExpiresAt },
      });
      const offer = await tx.missionOffer.create({
        data: {
          missionId: replacement.id,
          providerId,
          status: 'PROPOSEE',
          rank: 1,
          score: typeof selectedCandidate.score === 'number' ? selectedCandidate.score : 0,
          explanation: jsonInput(selectedCandidate.explanation ?? {}, 'Explication du matching'),
        },
      });

      await this.recordMissionEvent(tx, mission.id, 'MissionRemplacée', principal.id, {
        replacementMissionId: replacement.id,
      });
      await this.recordMissionEvent(tx, replacement.id, 'MissionProposée', principal.id, {
        providerId,
        offerId: offer.id,
        replacedMissionId: mission.id,
        expiresAt: offerExpiresAt.toISOString(),
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'MISSION_REPLACED',
          entity: 'Mission',
          entityId: replacement.id,
          before: { missionId: mission.id, status: mission.status },
          after: { missionId: replacement.id, providerId, offerId: offer.id },
          at: new Date(),
        },
      });

      return { replacedMissionId: mission.id, mission: replacement, offer };
    });
  }

  /** POST /projects/{id}/confirm — Génère le contrat et ouvre la réservation */
  async postProjectsByIdConfirm(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Confirmation indisponible : la génération/signature du contrat et l’ouverture de la réservation nécessitent des intégrations non configurées.',
    );
  }

  /** GET /projects — Liste des projets */
  async getProjects(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && query.cursor.length === 0) {
      throw new BadRequestException('cursor ne peut pas être vide');
    }

    const where = await visibleProjectWhere(this.prisma, principal);
    const results = await this.prisma.project.findMany({
      where: {
        ...where,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = results.length > limit;
    const projects = results.slice(0, limit);
    return {
      items: projects.map((project) => ({
        ...project,
        totalAmount:
          project.totalAmount === null
            ? null
            : safeNumberFromBigInt(project.totalAmount, 'totalAmount'),
      })),
      nextCursor: hasMore ? projects[projects.length - 1]?.id ?? null : null,
    };
  }

  /** GET /projects/{id} — Détail */
  async getProjectsById(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    const where = await visibleProjectWhere(this.prisma, principal);
    const project = await this.prisma.project.findFirst({ where: { ...where, id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable');

    const [roles, milestones, quote] = await Promise.all([
      this.prisma.projectRole.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.milestone.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.quote.findFirst({
        where: { projectId, deletedAt: null },
        orderBy: { version: 'desc' },
      }),
    ]);

    return {
      ...project,
      totalAmount:
        project.totalAmount === null
          ? null
          : safeNumberFromBigInt(project.totalAmount, 'totalAmount'),
      roles,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        amount: safeNumberFromBigInt(milestone.amount, 'montant du jalon'),
      })),
      quote: quote
        ? {
            ...quote,
            total: safeNumberFromBigInt(quote.total, 'total du devis'),
            currency: project.currency,
            expired: quote.validUntil.getTime() <= Date.now(),
          }
        : null,
    };
  }

  /** GET /projects/{id}/timeline — Chronologie et phases */
  async getProjectsByIdTimeline(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    const where = await visibleProjectWhere(this.prisma, principal);
    const project = await this.prisma.project.findFirst({
      where: { ...where, id: projectId },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    const [events, steps, milestones] = await Promise.all([
      this.prisma.projectEvent.findMany({
        where: { projectId },
        orderBy: [{ at: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.step.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.milestone.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      projectId,
      status: project.status,
      events,
      steps,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        amount: safeNumberFromBigInt(milestone.amount, 'montant du jalon'),
      })),
    };
  }

  /** POST /projects/{id}/cancel — Annule selon les règles */
  async postProjectsByIdCancel(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    const body = input.body === undefined || input.body === null
      ? {}
      : requireRecord(input.body, 'Corps de requête');
    const reason = body.reason;
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1_000)) {
      throw new BadRequestException('reason doit être une chaîne de 1 000 caractères maximum');
    }

    return this.prisma.$transaction(async (tx) => {
      const where = await visibleProjectWhere(tx, principal);
      const project = await tx.project.findFirst({ where: { ...where, id: projectId } });
      if (!project) throw new NotFoundException('Projet introuvable');
      if (!isProjectState(project.status)) {
        throw new ConflictException(`État de projet inconnu : ${project.status}`);
      }
      const from = project.status;
      if (!canTransitionProject(from, 'ANNULE')) {
        throw new ConflictException(`Le projet ne peut pas être annulé depuis ${from}`);
      }

      const updated = await tx.project.updateMany({
        where: {
          id: project.id,
          version: project.version,
          status: project.status,
          deletedAt: null,
        },
        data: { status: 'ANNULE', version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Le projet a été modifié simultanément');

      const occurredAt = new Date();
      const payload = jsonInput(
        {
          projectId,
          actorId: principal.id,
          previousStatus: from,
          reason: typeof reason === 'string' ? reason.trim() : null,
        },
        'Événement ProjetAnnulé',
      );
      await tx.projectEvent.create({
        data: { projectId, type: 'ProjetAnnulé', payload, at: occurredAt },
      });
      await tx.outboxEvent.create({ data: { type: 'ProjetAnnulé', payload } });
      return { id: projectId, status: 'ANNULE', version: project.version + 1 };
    });
  }

  /** GET /missions — Offres et missions du prestataire */
  async getMissions(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const providerId = await providerIdForUser(this.prisma, principal.id);
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && query.cursor.length === 0) {
      throw new BadRequestException('cursor ne peut pas être vide');
    }

    const offers = await this.prisma.missionOffer.findMany({
      where: { providerId, deletedAt: null },
      select: {
        missionId: true,
        status: true,
        rank: true,
        score: true,
        explanation: true,
      },
    });
    const missionIds = [...new Set(offers.map((offer) => offer.missionId))];
    const missions = await this.prisma.mission.findMany({
      where: {
        deletedAt: null,
        OR: [
          { providerId },
          ...(missionIds.length > 0 ? [{ id: { in: missionIds } }] : []),
        ],
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = missions.length > limit;
    const items = missions.slice(0, limit);
    const offersByMission = new Map(offers.map((offer) => [offer.missionId, offer]));
    return {
      items: items.map((mission) => ({
        ...mission,
        price:
          mission.price === null
            ? null
            : safeNumberFromBigInt(mission.price, 'prix de la mission'),
        offer: offersByMission.get(mission.id) ?? null,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  /** POST /missions/{id}/accept — Accepte */
  async postMissionsByIdAccept(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.missionOffer.findFirst({
        where: { missionId, providerId, status: 'PROPOSEE', deletedAt: null },
      });
      if (!offer) throw new NotFoundException('Offre de mission introuvable');
      const mission = await tx.mission.findFirst({
        where: { id: missionId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      if (isMissionOfferExpired(mission.offerExpiresAt)) {
        throw new ConflictException('Cette offre de mission a expiré');
      }
      if (!isMissionState(mission.status) || mission.status !== 'PROPOSEE') {
        throw new ConflictException('Cette mission ne peut plus être acceptée');
      }
      if (mission.providerId && mission.providerId !== providerId) {
        throw new ConflictException('Cette mission a déjà été attribuée');
      }
      if (!canTransitionMission(mission.status, 'ACCEPTEE')) {
        throw new ConflictException('Transition de mission interdite');
      }

      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: mission.status,
          providerId: mission.providerId,
          deletedAt: null,
        },
        data: {
          providerId,
          status: 'ACCEPTEE',
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      const acceptedOffer = await tx.missionOffer.updateMany({
        where: {
          id: offer.id,
          version: offer.version,
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: { status: 'ACCEPTEE', version: { increment: 1 } },
      });
      if (acceptedOffer.count !== 1) throw new ConflictException('L’offre a été modifiée simultanément');
      await tx.missionOffer.updateMany({
        where: {
          missionId,
          providerId: { not: providerId },
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: { status: 'REMPLACEE', version: { increment: 1 } },
      });
      await this.recordMissionEvent(tx, missionId, 'MissionAcceptée', principal.id, {
        providerId,
      });
      return { id: missionId, status: 'ACCEPTEE', providerId };
    });
  }

  /** POST /missions/{id}/decline — Refuse avec motif */
  async postMissionsByIdDecline(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const body = input.body === undefined || input.body === null
      ? {}
      : requireRecord(input.body, 'Corps de requête');
    const reason = body.reason;
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1_000)) {
      throw new BadRequestException('reason doit être une chaîne de 1 000 caractères maximum');
    }
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.missionOffer.findFirst({
        where: { missionId, providerId, status: 'PROPOSEE', deletedAt: null },
      });
      if (!offer) throw new NotFoundException('Offre de mission introuvable');
      const mission = await tx.mission.findFirst({
        where: { id: missionId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      if (isMissionOfferExpired(mission.offerExpiresAt)) {
        throw new ConflictException('Cette offre de mission a expiré');
      }
      if (mission.status !== 'PROPOSEE') {
        throw new ConflictException('Cette mission ne peut plus être refusée');
      }

      const updated = await tx.missionOffer.updateMany({
        where: {
          id: offer.id,
          version: offer.version,
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: {
          status: 'REFUSEE',
          explanation: jsonInput(
            { reason: typeof reason === 'string' ? reason.trim() : null },
            'Motif de refus',
          ),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('L’offre a été modifiée simultanément');
      const currentMission = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: { version: { increment: 1 } },
      });
      if (currentMission.count !== 1) {
        throw new ConflictException('La mission a été modifiée simultanément');
      }
      await this.recordMissionEvent(tx, missionId, 'MissionRefusée', principal.id, {
        providerId,
        reason: typeof reason === 'string' ? reason.trim() : null,
      });
      return { id: missionId, status: 'PROPOSEE', offerStatus: 'REFUSEE' };
    });
  }

  /** POST /missions/{id}/counter — Contre-proposition (prix, date) */
  async postMissionsByIdCounter(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const body = requireRecord(input.body, 'Corps de requête');
    if (typeof body.price !== 'number' || !Number.isSafeInteger(body.price) || body.price < 0) {
      throw new BadRequestException('price doit être un entier positif en unités mineures');
    }
    if (
      body.startAt !== undefined &&
      (typeof body.startAt !== 'string' || Number.isNaN(Date.parse(body.startAt)))
    ) {
      throw new BadRequestException('startAt doit être une date valide');
    }
    if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1_000)) {
      throw new BadRequestException('reason doit être une chaîne de 1 000 caractères maximum');
    }
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.missionOffer.findFirst({
        where: { missionId, providerId, status: 'PROPOSEE', deletedAt: null },
      });
      if (!offer) throw new NotFoundException('Offre de mission introuvable');
      const mission = await tx.mission.findFirst({
        where: { id: missionId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      if (isMissionOfferExpired(mission.offerExpiresAt)) {
        throw new ConflictException('Cette offre de mission a expiré');
      }
      if (mission.status !== 'PROPOSEE' || !canTransitionMission('PROPOSEE', 'CONTRE_PROPOSEE')) {
        throw new ConflictException('Cette mission ne peut plus faire l’objet d’une contre-proposition');
      }
      const startAt = body.startAt === undefined ? null : new Date(body.startAt as string);
      if (startAt && startAt.getTime() < Date.now()) {
        throw new BadRequestException('startAt ne peut pas être dans le passé');
      }

      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: mission.status,
          deletedAt: null,
        },
        data: { status: 'CONTRE_PROPOSEE', version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      const updatedOffer = await tx.missionOffer.updateMany({
        where: {
          id: offer.id,
          version: offer.version,
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: {
          status: 'CONTRE_PROPOSEE',
          explanation: jsonInput(
            {
              price: body.price,
              startAt: startAt?.toISOString() ?? null,
              reason: typeof body.reason === 'string' ? body.reason.trim() : null,
            },
            'Contre-proposition',
          ),
          version: { increment: 1 },
        },
      });
      if (updatedOffer.count !== 1) throw new ConflictException('L’offre a été modifiée simultanément');
      await this.recordMissionEvent(tx, missionId, 'MissionContreProposée', principal.id, {
        providerId,
        price: body.price,
        startAt: startAt?.toISOString() ?? null,
      });
      return {
        id: missionId,
        status: 'CONTRE_PROPOSEE',
        price: body.price,
        startAt,
      };
    });
  }

  /** POST /missions/{id}/counter/resolve — Le client accepte ou refuse la contre-proposition */
  async postMissionsByIdCounterResolve(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const body = requireRecord(input.body, 'Corps de requête');
    if (typeof body.accept !== 'boolean') {
      throw new BadRequestException('accept doit être un booléen');
    }

    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findFirst({
        where: { id: missionId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      const role = await tx.projectRole.findFirst({
        where: { id: mission.projectRoleId, deletedAt: null },
      });
      if (!role) throw new NotFoundException('Rôle du projet introuvable');
      const project = await tx.project.findFirst({
        where: { id: role.projectId, deletedAt: null },
      });
      if (!project) throw new NotFoundException('Projet introuvable');
      if (!principal.roles.includes('A') && project.clientId !== principal.id) {
        throw new NotFoundException('Mission introuvable');
      }
      if (mission.status !== 'CONTRE_PROPOSEE') {
        throw new ConflictException('Aucune contre-proposition à résoudre');
      }
      const offer = await tx.missionOffer.findFirst({
        where: { missionId, status: 'CONTRE_PROPOSEE', deletedAt: null },
      });
      if (!offer) throw new ConflictException('Contre-proposition introuvable');
      const proposal = isRecord(offer.explanation) ? offer.explanation : {};

      if (!body.accept) {
        const updated = await tx.mission.updateMany({
          where: {
            id: mission.id,
            version: mission.version,
            status: 'CONTRE_PROPOSEE',
            deletedAt: null,
          },
          data: { status: 'REFUSEE', version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
        const declinedOffer = await tx.missionOffer.updateMany({
          where: { id: offer.id, version: offer.version, status: 'CONTRE_PROPOSEE' },
          data: { status: 'REFUSEE', version: { increment: 1 } },
        });
        if (declinedOffer.count !== 1) {
          throw new ConflictException('La contre-proposition a été modifiée simultanément');
        }
        await this.recordMissionEvent(tx, missionId, 'MissionRefusée', principal.id, {
          providerId: offer.providerId,
          reason: 'Contre-proposition refusée par le client',
        });
        return { id: missionId, status: 'REFUSEE' };
      }

      const price = proposal.price;
      if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 0) {
        throw new ConflictException('Le prix de la contre-proposition est invalide');
      }
      const startAt =
        typeof proposal.startAt === 'string' && !Number.isNaN(Date.parse(proposal.startAt))
          ? new Date(proposal.startAt)
          : null;
      if (!canTransitionMission('CONTRE_PROPOSEE', 'ACCEPTEE')) {
        throw new ConflictException('Transition de mission interdite');
      }
      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'CONTRE_PROPOSEE',
          deletedAt: null,
        },
        data: {
          providerId: offer.providerId,
          price: BigInt(price),
          startAt,
          status: 'ACCEPTEE',
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      const updatedOffer = await tx.missionOffer.updateMany({
        where: { id: offer.id, version: offer.version, status: 'CONTRE_PROPOSEE' },
        data: { status: 'ACCEPTEE', version: { increment: 1 } },
      });
      if (updatedOffer.count !== 1) throw new ConflictException('L’offre a été modifiée simultanément');
      await tx.missionOffer.updateMany({
        where: {
          missionId,
          providerId: { not: offer.providerId },
          status: 'PROPOSEE',
          deletedAt: null,
        },
        data: { status: 'REMPLACEE', version: { increment: 1 } },
      });
      await this.recordMissionEvent(tx, missionId, 'MissionAcceptée', principal.id, {
        providerId: offer.providerId,
        price,
        startAt: startAt?.toISOString() ?? null,
      });
      return { id: missionId, status: 'ACCEPTEE', providerId: offer.providerId, price, startAt };
    });
  }

  /** POST /missions/{id}/start — Démarre */
  async postMissionsByIdStart(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findFirst({
        where: { id: missionId, providerId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      if (!isMissionState(mission.status)) {
        throw new ConflictException(`État de mission inconnu : ${mission.status}`);
      }
      if (mission.startAt && mission.startAt.getTime() > Date.now()) {
        throw new ConflictException('La mission ne peut pas démarrer avant la date convenue');
      }
      if (mission.status !== 'ACCEPTEE' && mission.status !== 'PLANIFIEE') {
        throw new ConflictException('Seule une mission acceptée ou planifiée peut démarrer');
      }

      let currentStatus: MissionState = mission.status;
      let currentVersion = mission.version;
      if (currentStatus === 'ACCEPTEE') {
        if (!canTransitionMission(currentStatus, 'PLANIFIEE')) {
          throw new ConflictException('Transition de mission interdite');
        }
        const planned = await tx.mission.updateMany({
          where: {
            id: mission.id,
            version: currentVersion,
            status: currentStatus,
            deletedAt: null,
          },
          data: { status: 'PLANIFIEE', version: { increment: 1 } },
        });
        if (planned.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
        currentStatus = 'PLANIFIEE';
        currentVersion += 1;
        await this.recordMissionEvent(tx, missionId, 'MissionPlanifiée', principal.id, {
          providerId,
        });
      }
      if (!canTransitionMission(currentStatus, 'EN_COURS')) {
        throw new ConflictException('Transition de mission interdite');
      }
      const started = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: currentVersion,
          status: currentStatus,
          deletedAt: null,
        },
        data: { status: 'EN_COURS', version: { increment: 1 } },
      });
      if (started.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      await this.recordMissionEvent(tx, missionId, 'MissionCommencée', principal.id, {
        providerId,
      });
      return { id: missionId, status: 'EN_COURS', version: currentVersion + 1 };
    });
  }

  /** POST /missions/{id}/progress — Déclare l’avancement */
  async postMissionsByIdProgress(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const body = requireRecord(input.body, 'Corps de requête');
    if (
      typeof body.progress !== 'number' ||
      !Number.isFinite(body.progress) ||
      body.progress < 0 ||
      body.progress > 100
    ) {
      throw new BadRequestException('progress doit être un nombre entre 0 et 100');
    }
    if (body.description !== undefined && (
      typeof body.description !== 'string' || body.description.length > 2_000
    )) {
      throw new BadRequestException('description doit être une chaîne de 2 000 caractères maximum');
    }
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findFirst({
        where: { id: missionId, providerId, status: 'EN_COURS', deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission en cours introuvable');
      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'EN_COURS',
          deletedAt: null,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      await this.recordMissionEvent(tx, missionId, 'AvancementMissionDéclaré', principal.id, {
        providerId,
        progress: body.progress,
        description: typeof body.description === 'string' ? body.description.trim() : null,
      });
      return { id: missionId, progress: body.progress };
    });
  }

  /** POST /missions/{id}/deliverables — Dépose un livrable */
  async postMissionsByIdDeliverables(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const body = requireRecord(input.body, 'Corps de requête');
    if (typeof body.fileId !== 'string' || body.fileId.length === 0) {
      throw new BadRequestException('fileId est requis');
    }
    if (body.description !== undefined && (
      typeof body.description !== 'string' || body.description.length > 2_000
    )) {
      throw new BadRequestException('description doit être une chaîne de 2 000 caractères maximum');
    }
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findFirst({
        where: { id: missionId, providerId, status: 'EN_COURS', deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission en cours introuvable');
      const file = await tx.file.findFirst({
        where: { id: body.fileId as string, ownerId: principal.id, deletedAt: null },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Fichier introuvable');
      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'EN_COURS',
          deletedAt: null,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      const deliverable = await tx.deliverable.create({
        data: {
          missionId,
          fileId: file.id,
          description: typeof body.description === 'string' ? body.description.trim() : null,
        },
      });
      await this.recordMissionEvent(tx, missionId, 'LivrableDéposé', principal.id, {
        providerId,
        deliverableId: deliverable.id,
        fileId: file.id,
      });
      return deliverable;
    });
  }

  /** POST /missions/{id}/complete — Déclare la mission terminée */
  async postMissionsByIdComplete(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const missionId = input.params?.id;
    if (!missionId) throw new BadRequestException('Identifiant de mission requis');
    const providerId = await providerIdForUser(this.prisma, principal.id);

    return this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findFirst({
        where: { id: missionId, providerId, deletedAt: null },
      });
      if (!mission) throw new NotFoundException('Mission introuvable');
      if (mission.status !== 'EN_COURS' || !canTransitionMission('EN_COURS', 'LIVREE')) {
        throw new ConflictException('Seule une mission en cours peut être livrée');
      }
      const updated = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'EN_COURS',
          deletedAt: null,
        },
        data: { status: 'LIVREE', endAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('La mission a été modifiée simultanément');
      await this.recordMissionEvent(tx, missionId, 'MissionTerminée', principal.id, {
        providerId,
      });
      return { id: missionId, status: 'LIVREE', version: mission.version + 1 };
    });
  }

  private async recordMissionEvent(
    tx: Prisma.TransactionClient,
    missionId: string,
    type: string,
    actorId: string,
    details: JsonRecord,
  ): Promise<void> {
    const mission = await tx.mission.findFirst({
      where: { id: missionId, deletedAt: null },
      select: { projectRoleId: true },
    });
    if (!mission) throw new NotFoundException('Mission introuvable');
    const role = await tx.projectRole.findFirst({
      where: { id: mission.projectRoleId, deletedAt: null },
      select: { projectId: true },
    });
    if (!role) throw new NotFoundException('Rôle du projet introuvable');
    const occurredAt = new Date();
    const payload = jsonInput(
      { projectId: role.projectId, missionId, actorId, ...details },
      `Événement ${type}`,
    );
    await tx.projectEvent.create({
      data: { projectId: role.projectId, type, payload, at: occurredAt },
    });
    await tx.outboxEvent.create({ data: { type, payload } });
  }

  /** GET /projects/{id}/milestones — Jalons du projet */
  async getProjectsByIdMilestones(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const projectId = input.params?.id;
    if (!projectId) throw new BadRequestException('Identifiant de projet requis');
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && !query.cursor.trim()) {
      throw new BadRequestException('cursor ne peut pas être vide');
    }
    const access = await visibleProjectWhere(this.prisma, principal);
    const project = await this.prisma.project.findFirst({
      where: { ...access, id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    const results = await this.prisma.milestone.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = results.length > limit;
    const items = results.slice(0, limit).map((milestone) => ({
      ...milestone,
      amount: milestone.amount.toString(),
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  /** POST /milestones/{id}/submit-proof — Soumet les preuves */
  async postMilestonesByIdSubmitProof(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const milestoneId = input.params?.id;
    if (!milestoneId) throw new BadRequestException('Identifiant de jalon requis');
    const body = requireRecord(input.body, 'proof');
    if (typeof body.type !== 'string' || !/^[A-Z0-9_.-]{1,80}$/i.test(body.type)) {
      throw new BadRequestException('type de preuve invalide');
    }
    if (body.fileId !== undefined && body.fileId !== null && typeof body.fileId !== 'string') {
      throw new BadRequestException('fileId invalide');
    }
    if (body.geo !== undefined && body.geo !== null && !isRecord(body.geo)) {
      throw new BadRequestException('geo doit être un objet JSON');
    }
    if (!body.fileId && !body.geo) {
      throw new BadRequestException('Une preuve doit inclure fileId ou geo.');
    }
    const providerId = await providerIdForUser(this.prisma, principal.id);
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, deletedAt: null },
      select: { id: true, projectId: true, status: true },
    });
    if (!milestone) throw new NotFoundException('Jalon introuvable');
    const roles = await this.prisma.projectRole.findMany({
      where: { projectId: milestone.projectId, deletedAt: null },
      select: { id: true },
    });
    const mission = await this.prisma.mission.findFirst({
      where: {
        projectRoleId: { in: roles.map(({ id }) => id) },
        providerId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!mission) throw new NotFoundException('Jalon introuvable');
    if (milestone.status === 'APPROUVE' || milestone.status === 'LIBERE' || milestone.status === 'ANNULE') {
      throw new ConflictException('Ce jalon ne peut plus recevoir de preuve.');
    }
    let fileId: string | null = null;
    if (typeof body.fileId === 'string') {
      const file = await this.prisma.file.findFirst({
        where: { id: body.fileId, ownerId: principal.id, scanStatus: 'CLEAN' },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Fichier de preuve disponible introuvable');
      fileId = file.id;
    }
    return this.prisma.$transaction(async (tx) => {
      const proof = await tx.proof.create({
        data: {
          milestoneId,
          type: body.type as string,
          fileId,
          geo: body.geo === undefined || body.geo === null ? Prisma.JsonNull : jsonInput(body.geo, 'geo'),
          submittedBy: principal.id,
          submittedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'MILESTONE_PROOF_SUBMITTED',
          entity: 'Milestone',
          entityId: milestoneId,
          after: { proofId: proof.id, type: proof.type, fileId: proof.fileId },
          at: new Date(),
        },
      });
      return proof;
    });
  }

  /** POST /milestones/{id}/approve — Valide, libère le paiement */
  async postMilestonesByIdApprove(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Validation de jalon indisponible : la libération de fonds exige le partenaire de paiement et les écritures séquestre/réconciliation définis par ADR 0006.',
    );
  }

  /** POST /milestones/{id}/contest — Conteste, ouvre un litige */
  async postMilestonesByIdContest(input: RequestInput): Promise<unknown> {
    const principal = currentPrincipal(input);
    const milestoneId = input.params?.id;
    if (!milestoneId) throw new BadRequestException('Identifiant de jalon requis');
    const body = requireRecord(input.body, 'contest');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.trim().length > 2000) {
      throw new BadRequestException('Le motif doit contenir entre 5 et 2000 caractères.');
    }
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, deletedAt: null },
    });
    if (!milestone) throw new NotFoundException('Jalon introuvable');
    const project = await this.prisma.project.findFirst({
      where: { id: milestone.projectId, clientId: principal.id, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Jalon introuvable');
    if (milestone.status === 'APPROUVE' || milestone.status === 'LIBERE' || milestone.status === 'ANNULE') {
      throw new ConflictException('Ce jalon ne peut pas être contesté.');
    }
    const openDispute = await this.prisma.dispute.findFirst({
      where: { projectId: project.id, decision: { equals: Prisma.DbNull }, deletedAt: null },
      select: { id: true },
    });
    if (openDispute) throw new ConflictException('Un litige est déjà ouvert pour ce projet.');
    if (!isProjectState(project.status) || !canTransitionProject(project.status, 'EN_LITIGE')) {
      throw new ConflictException('Le projet ne peut pas entrer en litige dans son état actuel.');
    }
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.project.updateMany({
        where: { id: project.id, version: project.version, status: project.status, deletedAt: null },
        data: { status: 'EN_LITIGE', version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Le projet a été modifié simultanément.');
      const dispute = await tx.dispute.create({
        data: {
          projectId: project.id,
          milestoneId,
          openedBy: principal.id,
          status: 'OUVERT',
        },
      });
      const occurredAt = new Date();
      const payload = jsonInput(
        { projectId: project.id, milestoneId, disputeId: dispute.id, openedBy: principal.id },
        'Événement LitigeOuvert',
      );
      await tx.projectEvent.create({
        data: { projectId: project.id, type: 'LitigeOuvert', payload, at: occurredAt },
      });
      await tx.outboxEvent.create({ data: { type: 'LitigeOuvert', payload } });
      await tx.auditLog.create({
        data: {
          actorId: principal.id,
          action: 'MILESTONE_CONTESTED',
          entity: 'Dispute',
          entityId: dispute.id,
          after: { projectId: project.id, milestoneId, reason: (body.reason as string).trim() },
          at: occurredAt,
        },
      });
      return dispute;
    });
  }

}
