import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

/**
 * Module identity — Comptes, sessions, rôles, consentements
 * Logiques métier à coder ici (document, section 3) :
 *   3.20 Permissions (RBAC)
 */
@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /auth/otp/request — Envoie un code par SMS/WhatsApp */
  async postAuthOtpRequest(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'OTP indisponible : aucun fournisseur SMS/WhatsApp ni stockage de défi à usage unique n’est configuré.',
    );
  }

  /** POST /auth/otp/verify — Vérifie le code, renvoie les jetons */
  async postAuthOtpVerify(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Vérification OTP indisponible : aucun fournisseur ni mécanisme de preuve à usage unique n’est configuré.',
    );
  }

  /** POST /auth/register — Crée un compte (client ou prestataire) */
  async postAuthRegister(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Inscription indisponible : l’identité est déléguée à OIDC et aucun flux de provisionnement/consentement n’est configuré.',
    );
  }

  /** POST /auth/login — Connexion par e-mail et mot de passe */
  async postAuthLogin(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Connexion indisponible : l’authentification est déléguée à OIDC; aucun flux de mot de passe local sûr n’est défini.',
    );
  }

  /** POST /auth/refresh — Renouvelle le jeton */
  async postAuthRefresh(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Renouvellement indisponible : le fournisseur OIDC ne définit pas ici de flux de renouvellement.',
    );
  }

  /** POST /auth/logout — Révoque la session */
  async postAuthLogout(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Déconnexion indisponible : la révocation de session doit être effectuée auprès du fournisseur OIDC, non configuré.',
    );
  }

  /** GET /me — Profil courant */
  async getMe(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    const user = await this.prisma.user.findFirst({
      where: { id: principal.id, deletedAt: null },
      select: {
        id: true,
        phone: true,
        email: true,
        status: true,
        locale: true,
        type: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('Compte indisponible.');
    const [roles, clientProfile, provider, notificationPreferences] = await Promise.all([
      this.prisma.role.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { role: true },
      }),
      this.prisma.clientProfile.findFirst({ where: { userId: user.id, deletedAt: null } }),
      this.prisma.provider.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true, type: true, legalName: true, bio: true, status: true, kycLevel: true },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { eventType: true, channel: true, enabled: true },
      }),
    ]);
    return {
      ...user,
      roles: roles.map(({ role }) => role),
      profile: clientProfile
        ? { displayName: clientProfile.displayName, city: clientProfile.city }
        : null,
      provider,
      notificationPreferences,
    };
  }

  /** PATCH /me — Modifie le profil */
  async patchMe(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
      throw new BadRequestException('Le corps doit être un objet.');
    }
    const body = input.body as Record<string, unknown>;
    const allowed = new Set(['displayName', 'city', 'locale']);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new BadRequestException('Seuls displayName, city et locale peuvent être modifiés ici.');
    }
    if (
      body.displayName !== undefined &&
      (typeof body.displayName !== 'string' || body.displayName.trim().length < 1 || body.displayName.trim().length > 160)
    ) {
      throw new BadRequestException('displayName doit contenir entre 1 et 160 caractères.');
    }
    if (
      body.city !== undefined &&
      body.city !== null &&
      (typeof body.city !== 'string' || body.city.trim().length > 120)
    ) {
      throw new BadRequestException('city ne peut pas dépasser 120 caractères.');
    }
    if (body.locale !== undefined && (typeof body.locale !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(body.locale))) {
      throw new BadRequestException('locale doit être une langue ou un code langue-région.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: principal.id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Compte indisponible.');

    return this.prisma.$transaction(async (tx) => {
      const data: { locale?: string } = {};
      if (body.locale !== undefined) data.locale = body.locale;
      if (Object.keys(data).length > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { ...data, version: { increment: 1 } },
        });
      }
      const profileFields: { displayName?: string; city?: string | null } = {};
      if (body.displayName !== undefined) profileFields.displayName = (body.displayName as string).trim();
      if (body.city !== undefined) {
        profileFields.city = typeof body.city === 'string' ? body.city.trim() || null : null;
      }
      let profile = await tx.clientProfile.findFirst({ where: { userId: user.id, deletedAt: null } });
      if (Object.keys(profileFields).length > 0) {
        if (profile) {
          profile = await tx.clientProfile.update({ where: { id: profile.id }, data: profileFields });
        } else if (typeof profileFields.displayName === 'string') {
          profile = await tx.clientProfile.create({
            data: {
              userId: user.id,
              displayName: profileFields.displayName,
              city: typeof profileFields.city === 'string' ? profileFields.city : null,
            },
          });
        } else {
          throw new ConflictException('Un nom d’affichage doit être défini avant la ville.');
        }
      }
      const updatedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, phone: true, email: true, status: true, locale: true, type: true },
      });
      return {
        ...updatedUser,
        profile: profile ? { displayName: profile.displayName, city: profile.city } : null,
      };
    });
  }

  /** PUT /me/notification-preferences — Canaux et langues */
  async putMeNotificationPreferences(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    const body = input.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Le corps doit contenir une liste preferences.');
    }
    const preferences = (body as Record<string, unknown>).preferences;
    if (!Array.isArray(preferences) || preferences.length > 100) {
      throw new BadRequestException('preferences doit être une liste de 0 à 100 éléments.');
    }
    const channels = new Set(['email', 'sms', 'whatsapp', 'push', 'in_app']);
    const seen = new Set<string>();
    const updates = preferences.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestException(`preferences[${index}] doit être un objet.`);
      }
      const value = entry as Record<string, unknown>;
      if (typeof value.eventType !== 'string' || !/^[A-Z0-9_.-]{1,120}$/i.test(value.eventType)) {
        throw new BadRequestException(`preferences[${index}].eventType est invalide.`);
      }
      if (typeof value.channel !== 'string' || !channels.has(value.channel)) {
        throw new BadRequestException(`preferences[${index}].channel est invalide.`);
      }
      if (typeof value.enabled !== 'boolean') {
        throw new BadRequestException(`preferences[${index}].enabled doit être booléen.`);
      }
      const key = `${value.eventType}:${value.channel}`;
      if (seen.has(key)) throw new BadRequestException('Une préférence ne peut être fournie qu’une fois.');
      seen.add(key);
      return { eventType: value.eventType, channel: value.channel, enabled: value.enabled };
    });
    const user = await this.prisma.user.findFirst({
      where: { id: principal.id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Compte indisponible.');
    return this.prisma.$transaction(async (tx) => {
      for (const preference of updates) {
        const existing = await tx.notificationPreference.findFirst({
          where: {
            userId: user.id,
            eventType: preference.eventType,
            channel: preference.channel,
          },
        });
        if (existing) {
          await tx.notificationPreference.update({
            where: { id: existing.id },
            data: { enabled: preference.enabled, deletedAt: null },
          });
        } else {
          await tx.notificationPreference.create({ data: { ...preference, userId: user.id } });
        }
      }
      return { items: updates };
    });
  }

  /** DELETE /me — Demande de suppression (droit à l’effacement) */
  async deleteMe(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    const user = await this.prisma.user.findFirst({
      where: { id: principal.id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');
    if (user.status === 'SUPPRESSION_DEMANDEE') return { status: user.status };
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'SUPPRESSION_DEMANDEE', version: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: user.id, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'USER_ERASURE_REQUESTED',
          entity: 'User',
          entityId: user.id,
          before: { status: user.status },
          after: { status: 'SUPPRESSION_DEMANDEE' },
          at: new Date(),
        },
      });
      return { status: 'SUPPRESSION_DEMANDEE' };
    });
  }

  /** GET /admin/users — Comptes et rôles */
  async getAdminUsers(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    if (query.cursor !== undefined && !query.cursor.trim()) {
      throw new BadRequestException('cursor ne peut pas être vide');
    }

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: {
        id: true,
        phone: true,
        email: true,
        status: true,
        locale: true,
        type: true,
        createdAt: true,
      },
    });
    const roles = users.length
      ? await this.prisma.role.findMany({
          where: { userId: { in: users.slice(0, limit).map((user) => user.id) }, deletedAt: null },
          select: { userId: true, role: true },
        })
      : [];
    const roleByUser = new Map<string, string[]>();
    for (const role of roles) {
      roleByUser.set(role.userId, [...(roleByUser.get(role.userId) ?? []), role.role]);
    }
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    return {
      items: page.map((user) => ({ ...user, roles: roleByUser.get(user.id) ?? [] })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

}
