import type { Handler } from '../handler';
import { Prisma } from '@prisma/client';
import { pollingHandler, prisma } from '../runtime';

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1_000;

type BalanceRow = {
  transactionId: string;
  currency: string;
  debits: string;
  credits: string;
};

async function reconcileLedger(): Promise<void> {
  const balances = await prisma.$queryRaw<BalanceRow[]>(Prisma.sql`
    SELECT "transactionId", "currency",
      COALESCE(SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount" ELSE 0 END), 0)::text AS "debits",
      COALESCE(SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE 0 END), 0)::text AS "credits"
    FROM "LedgerEntry"
    GROUP BY "transactionId", "currency"
    HAVING
      COALESCE(SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount" ELSE 0 END), 0)
      <> COALESCE(SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE 0 END), 0)
  `);
  const invalidEntries = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { direction: { notIn: ['DEBIT', 'CREDIT'] } },
        { amount: { lte: 0n } },
      ],
    },
    select: { id: true, transactionId: true, direction: true, amount: true },
    take: 100,
  });

  if (balances.length > 0 || invalidEntries.length > 0) {
    console.error(
      `[worker] ledger-reconciliation: ${balances.length} transaction(s) déséquilibrée(s), ${invalidEntries.length} écriture(s) invalide(s)`,
      { balances, invalidEntries },
    );
  } else {
    console.info('[worker] ledger-reconciliation: invariant interne débit/crédit vérifié');
  }
  console.warn(
    '[worker] ledger-reconciliation: comparaison avec les relevés externes bloquée; aucun opérateur de paiement n’est configuré',
  );
}

const polling = pollingHandler(
  'ledger-reconciliation',
  DAILY_INTERVAL_MS,
  reconcileLedger,
);

export const ledgerReconciliation: Handler = {
  ...polling,
  start() {
    console.warn(
      '[worker] ledger-reconciliation: relevés externes indisponibles tant qu’aucun opérateur n’est choisi (ADR 0006)',
    );
    polling.start();
  },
};
