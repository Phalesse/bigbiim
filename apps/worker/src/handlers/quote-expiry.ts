import type { Handler } from '../handler';
import { pollingHandler, prisma } from '../runtime';

const POLL_INTERVAL_MS = 60_000;

/** Expire les projets DEVIS dont le devis verrouillé courant a dépassé sa validité. */
async function expireQuotes(now = new Date()): Promise<void> {
  const expiredQuotes = await prisma.quote.findMany({
    where: { locked: true, validUntil: { lte: now }, deletedAt: null },
    orderBy: [{ projectId: 'asc' }, { version: 'desc' }],
    take: 200,
  });

  for (const quote of expiredQuotes) {
    const latest = await prisma.quote.findFirst({
      where: { projectId: quote.projectId, deletedAt: null },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (latest?.id !== quote.id) continue;

    await prisma.$transaction(async (tx) => {
      const currentQuote = await tx.quote.findFirst({
        where: { projectId: quote.projectId, deletedAt: null },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (currentQuote?.id !== quote.id) return;

      const project = await tx.project.findFirst({
        where: { id: quote.projectId, status: 'DEVIS', deletedAt: null },
        select: { id: true, version: true },
      });
      if (!project) return;

      const unlocked = await tx.quote.updateMany({
        where: {
          id: quote.id,
          locked: true,
          validUntil: { lte: now },
          deletedAt: null,
        },
        data: { locked: false },
      });
      if (unlocked.count !== 1) return;

      const changed = await tx.project.updateMany({
        where: {
          id: project.id,
          version: project.version,
          status: 'DEVIS',
          deletedAt: null,
        },
        data: { status: 'EXPIRE', version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new Error(`Projet ${project.id} modifié pendant son expiration`);
      }

      await tx.projectEvent.create({
        data: {
          projectId: project.id,
          type: 'DevisExpiré',
          payload: {
            projectId: project.id,
            quoteId: quote.id,
            quoteVersion: quote.version,
            validUntil: quote.validUntil.toISOString(),
          },
          at: now,
        },
      });
    });
  }
}

const polling = pollingHandler('quote-expiry', POLL_INTERVAL_MS, () => expireQuotes());

export const quoteExpiry: Handler = {
  ...polling,
  start() {
    console.warn(
      '[worker] quote-expiry: le journal de projet est enregistré; publication Outbox de DevisExpiré non effectuée car son contrat de domaine manque',
    );
    polling.start();
  },
};
