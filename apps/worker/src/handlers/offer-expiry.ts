import type { Handler } from '../handler';
import { pollingHandler, prisma } from '../runtime';

const POLL_INTERVAL_MS = 30_000;

async function expireOffers(now = new Date()): Promise<void> {
  const missions = await prisma.mission.findMany({
    where: {
      status: 'PROPOSEE',
      offerExpiresAt: { lte: now },
      deletedAt: null,
    },
    orderBy: { offerExpiresAt: 'asc' },
    take: 200,
  });

  for (const mission of missions) {
    const transitioned = await prisma.$transaction(async (tx) => {
      const changed = await tx.mission.updateMany({
        where: {
          id: mission.id,
          version: mission.version,
          status: 'PROPOSEE',
          offerExpiresAt: { lte: now },
          deletedAt: null,
        },
        data: { status: 'EXPIREE', version: { increment: 1 } },
      });
      if (changed.count !== 1) return false;

      await tx.missionOffer.updateMany({
        where: { missionId: mission.id, status: 'PROPOSEE', deletedAt: null },
        data: { status: 'EXPIREE', version: { increment: 1 } },
      });

      const role = await tx.projectRole.findFirst({
        where: { id: mission.projectRoleId, deletedAt: null },
        select: { projectId: true },
      });
      if (!role) {
        throw new Error(`Rôle de projet introuvable pour la mission ${mission.id}`);
      }
      await tx.projectEvent.create({
        data: {
          projectId: role.projectId,
          type: 'MissionExpirée',
          payload: { missionId: mission.id, projectId: role.projectId },
          at: now,
        },
      });
      return true;
    });
    if (transitioned) {
      console.warn(
        `[worker] offer-expiry: mission ${mission.id} expirée; remplacement bloqué (pas de contrat de matching/remplacement); aucune publication Outbox disponible sans contrat d’événement MissionExpirée`,
      );
    }
  }
}

export const offerExpiry: Handler = pollingHandler(
  'offer-expiry',
  POLL_INTERVAL_MS,
  () => expireOffers(),
);
