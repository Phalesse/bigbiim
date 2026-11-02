import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pageSize(query: Record<string, string>): number {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException('limit doit être un entier entre 1 et 100');
  }
  if (query.cursor !== undefined && !query.cursor.trim()) {
    throw new BadRequestException('cursor ne peut pas être vide');
  }
  return limit;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /sectors — Arborescence des secteurs */
  async getSectors(input: RequestInput): Promise<unknown> {
    void input;
    const items = await this.prisma.sector.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, parentId: true, nameI18n: true, icon: true },
    });
    return { items };
  }

  /** GET /activities — Recherche d’activités publiées */
  async getActivities(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = pageSize(query);
    const q = query.q?.trim().toLocaleLowerCase();
    const city = query.city?.trim().toLocaleLowerCase();
    const sectorId = query.sectorId ?? query.sector;
    const items: JsonRecord[] = [];
    let cursor = query.cursor;
    let exhausted = false;

    // Activity definitions are JSON; filter their localized names/cities only after
    // retrieving the currently published version, while keeping a bounded DB batch.
    while (items.length <= limit && !exhausted) {
      const activities = await this.prisma.activity.findMany({
        where: {
          deletedAt: null,
          status: 'PUBLIE',
          currentVersionId: { not: null },
          ...(sectorId ? { sectorId } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
        select: { id: true, slug: true, sectorId: true, currentVersionId: true },
      });
      if (activities.length === 0) {
        exhausted = true;
        break;
      }
      cursor = activities[activities.length - 1].id;
      exhausted = activities.length < 100;
      const versions = await this.prisma.activityVersion.findMany({
        where: {
          id: { in: activities.map((activity) => activity.currentVersionId as string) },
          status: 'PUBLIE',
          deletedAt: null,
        },
        select: { id: true, version: true, definition: true, publishedAt: true },
      });
      const versionById = new Map(versions.map((version) => [version.id, version]));
      for (const activity of activities) {
        const version = activity.currentVersionId
          ? versionById.get(activity.currentVersionId)
          : undefined;
        if (!version || !isRecord(version.definition)) continue;
        const definition = version.definition;
        const searchText = [
          activity.slug,
          ...Object.values(isRecord(definition.name) ? definition.name : { name: definition.name }),
          ...Object.values(
            isRecord(definition.description)
              ? definition.description
              : { description: definition.description },
          ),
        ]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLocaleLowerCase();
        if (q && !searchText.includes(q)) continue;
        if (city && !this.activitySupportsCity(definition.cities, city)) continue;
        items.push({
          id: activity.id,
          slug: activity.slug,
          sectorId: activity.sectorId,
          versionId: version.id,
          version: version.version,
          publishedAt: version.publishedAt,
          name: definition.name ?? null,
          description: definition.description ?? null,
          coverImageUrl: definition.coverImageUrl ?? null,
          cities: definition.cities ?? [],
        });
        if (items.length > limit) break;
      }
    }

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  /** GET /activities/{id} — Fiche activité publiée */
  async getActivitiesById(input: RequestInput): Promise<unknown> {
    const { activity, version } = await this.getPublishedActivity(input.params?.id);
    const definition = isRecord(version.definition) ? version.definition : {};
    return {
      id: activity.id,
      slug: activity.slug,
      sectorId: activity.sectorId,
      versionId: version.id,
      version: version.version,
      publishedAt: version.publishedAt,
      definition,
    };
  }

  /** GET /activities/{id}/questionnaire — Questionnaire de la version publiée */
  async getActivitiesByIdQuestionnaire(input: RequestInput): Promise<unknown> {
    const { activity, version } = await this.getPublishedActivity(input.params?.id);
    const definition = isRecord(version.definition) ? version.definition : {};
    return {
      activityId: activity.id,
      versionId: version.id,
      version: version.version,
      questionnaire: Array.isArray(definition.questionnaire) ? definition.questionnaire : [],
    };
  }

  /** GET /activities/{id}/estimate — Fourchette indicative explicitement configurée */
  async getActivitiesByIdEstimate(input: RequestInput): Promise<unknown> {
    const { activity, version } = await this.getPublishedActivity(input.params?.id);
    const definition = isRecord(version.definition) ? version.definition : {};
    const pricing = isRecord(definition.pricing) ? definition.pricing : {};
    const estimate = pricing.estimate;
    if (
      !isRecord(estimate) ||
      !Number.isSafeInteger(estimate.min) ||
      !Number.isSafeInteger(estimate.median) ||
      !Number.isSafeInteger(estimate.max) ||
      typeof estimate.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(estimate.currency) ||
      (estimate.min as number) < 0 ||
      (estimate.min as number) > (estimate.median as number) ||
      (estimate.median as number) > (estimate.max as number)
    ) {
      throw new NotImplementedException(
        'Estimation indisponible : la définition publiée ne contient pas de fourchette min/médiane/max vérifiable.',
      );
    }
    return {
      activityId: activity.id,
      versionId: version.id,
      currency: estimate.currency,
      min: String(estimate.min),
      median: String(estimate.median),
      max: String(estimate.max),
    };
  }

  /** GET /skills — Catalogue de compétences */
  async getSkills(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const items = await this.prisma.skill.findMany({
      where: {
        deletedAt: null,
        ...(query.sectorId ? { sectorId: query.sectorId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sectorId: true,
        nameI18n: true,
        synonyms: true,
        parentId: true,
        regulated: true,
        requiredLicenseType: true,
      },
    });
    return { items };
  }

  private async getPublishedActivity(id: string | undefined) {
    if (!id) throw new BadRequestException('Identifiant d’activité manquant.');
    const activity = await this.prisma.activity.findFirst({
      where: {
        deletedAt: null,
        status: 'PUBLIE',
        OR: [{ id }, { slug: id }],
      },
      select: { id: true, slug: true, sectorId: true, currentVersionId: true },
    });
    if (!activity?.currentVersionId) throw new NotFoundException('Activité publiée introuvable.');
    const version = await this.prisma.activityVersion.findFirst({
      where: {
        id: activity.currentVersionId,
        activityId: activity.id,
        status: 'PUBLIE',
        deletedAt: null,
      },
      select: { id: true, version: true, definition: true, publishedAt: true },
    });
    if (!version) throw new NotFoundException('Activité publiée introuvable.');
    return { activity, version };
  }

  private activitySupportsCity(value: Prisma.JsonValue | unknown, requestedCity: string): boolean {
    if (!Array.isArray(value)) return false;
    return value.some((entry) => {
      const cityName =
        typeof entry === 'string'
          ? entry
          : isRecord(entry)
            ? [entry.name, entry.city, entry.value, ...Object.values(isRecord(entry.name) ? entry.name : {})]
                .find((candidate) => typeof candidate === 'string')
            : undefined;
      return typeof cityName === 'string' && cityName.toLocaleLowerCase() === requestedCity;
    });
  }
}
