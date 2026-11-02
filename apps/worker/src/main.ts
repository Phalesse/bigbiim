import { outboxPublisher } from './handlers/outbox-publisher';
import { notificationsDispatch } from './handlers/notifications-dispatch';
import { offerExpiry } from './handlers/offer-expiry';
import { milestoneAutoRelease } from './handlers/milestone-auto-release';
import { quoteExpiry } from './handlers/quote-expiry';
import { providerLicenseExpiry } from './handlers/provider-license-expiry';
import { ledgerReconciliation } from './handlers/ledger-reconciliation';
import { fileScan } from './handlers/file-scan';
import type { Handler } from './handler';
import { prisma } from './runtime';

const handlers: Handler[] = [
  outboxPublisher,
  notificationsDispatch,
  offerExpiry,
  milestoneAutoRelease,
  quoteExpiry,
  providerLicenseExpiry,
  ledgerReconciliation,
  fileScan,
];

async function main() {
  const started: Handler[] = [];
  for (const h of handlers) {
    try {
      await h.start();
      started.push(h);
    } catch (error) {
      console.error(`[worker] ${h.name}: démarrage impossible`, error);
    }
  }
  console.log(`[worker] ${started.length}/${handlers.length} traitements démarrés`);
  const keepAlive = setInterval(() => undefined, 1 << 30);
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] arrêt demandé (${signal})`);
    clearInterval(keepAlive);
    await Promise.allSettled(started.map((handler) => Promise.resolve(handler.stop?.())));
    await prisma.$disconnect();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((error: unknown) => {
  console.error('[worker] erreur fatale au démarrage', error);
  process.exitCode = 1;
});
