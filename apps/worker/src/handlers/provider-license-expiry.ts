import type { Handler } from '../handler';
import { pollingHandler, prisma } from '../runtime';

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1_000;

async function expireProviderLicenses(now = new Date()): Promise<void> {
  const requiredSkills = await prisma.skill.findMany({
    where: { requiredLicenseType: { not: null }, deletedAt: null },
    select: { id: true, requiredLicenseType: true },
  });
  const licenseSkills = new Map<string, string[]>();
  for (const skill of requiredSkills) {
    if (!skill.requiredLicenseType) continue;
    const ids = licenseSkills.get(skill.requiredLicenseType) ?? [];
    ids.push(skill.id);
    licenseSkills.set(skill.requiredLicenseType, ids);
  }

  const documents = await prisma.providerDocument.findMany({
    where: {
      expiresAt: { lte: now },
      status: { not: 'EXPIRE' },
      deletedAt: null,
    },
    orderBy: { expiresAt: 'asc' },
    take: 500,
  });

  for (const document of documents) {
    await prisma.$transaction(async (tx) => {
      const expired = await tx.providerDocument.updateMany({
        where: {
          id: document.id,
          version: document.version,
          expiresAt: { lte: now },
          status: { not: 'EXPIRE' },
          deletedAt: null,
        },
        data: { status: 'EXPIRE', version: { increment: 1 } },
      });
      if (expired.count !== 1) return;

      const skillIds = licenseSkills.get(document.type) ?? [];
      if (skillIds.length === 0) return;

      const providerSkills = await tx.providerSkill.findMany({
        where: {
          providerId: document.providerId,
          skillId: { in: skillIds },
          deletedAt: null,
        },
        select: { providerId: true },
      });
      if (providerSkills.length === 0) return;

      const provider = await tx.provider.findFirst({
        where: { id: document.providerId, deletedAt: null },
        select: { id: true, status: true, version: true },
      });
      if (!provider || provider.status === 'SUSPENDU') return;

      const suspended = await tx.provider.updateMany({
        where: {
          id: provider.id,
          version: provider.version,
          status: provider.status,
          deletedAt: null,
        },
        data: { status: 'SUSPENDU', version: { increment: 1 } },
      });
      if (suspended.count !== 1) {
        throw new Error(`Prestataire ${provider.id} modifié pendant la suspension de sa licence`);
      }
      await tx.auditLog.create({
        data: {
          action: 'PROVIDER_LICENSE_EXPIRED',
          entity: 'Provider',
          entityId: provider.id,
          before: { status: provider.status, documentId: document.id },
          after: { status: 'SUSPENDU', licenseType: document.type },
          at: now,
        },
      });
    });
  }
}

const polling = pollingHandler(
  'provider-license-expiry',
  DAILY_INTERVAL_MS,
  () => expireProviderLicenses(),
);

export const providerLicenseExpiry: Handler = {
  ...polling,
  start() {
    console.warn(
      '[worker] provider-license-expiry: alertes avant échéance bloquées; délai d’alerte et canal de notification non spécifiés/configurés',
    );
    polling.start();
  },
};
