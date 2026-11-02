import type { Handler } from '../handler';
import { connect, StorageType } from 'nats';
import type { JetStreamClient, JetStreamManager, NatsConnection } from 'nats';
import { pollingHandler, prisma } from '../runtime';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 100;
const streamName = process.env.NATS_STREAM ?? 'BIGBIIM_EVENTS';
const subject = process.env.NATS_SUBJECT ?? 'bigbiim.events';

type OutboxRecord = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
};

let connection: NatsConnection | undefined;
let jetstream: JetStreamClient | undefined;

async function getJetStream(): Promise<JetStreamClient> {
  if (!connection) {
    const servers = process.env.NATS_URL;
    if (!servers) throw new Error('NATS_URL manquant');
    connection = await connect({ servers });
  }
  if (!jetstream) {
    const manager: JetStreamManager = await connection.jetstreamManager();
    try {
      await manager.streams.info(streamName);
    } catch {
      await manager.streams.add({
        name: streamName,
        subjects: [subject],
        storage: StorageType.File,
      });
    }
    jetstream = connection.jetstream();
  }
  if (!jetstream) throw new Error('Connexion NATS JetStream indisponible');
  return jetstream;
}

async function publishOutboxBatch(): Promise<void> {
  const events = (await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: BATCH_SIZE,
  })) as OutboxRecord[];
  if (events.length === 0) return;

  const js = await getJetStream();
  for (const event of events) {
    const payload = JSON.stringify({
      id: event.id,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    });
    await js.publish(subject, new TextEncoder().encode(payload), {
      msgID: event.id,
    });

    await prisma.outboxEvent.updateMany({
      where: { id: event.id, publishedAt: null },
      data: { publishedAt: new Date() },
    });
  }
}

const polling = pollingHandler('outbox-publisher', POLL_INTERVAL_MS, publishOutboxBatch);

export const outboxPublisher: Handler = {
  ...polling,
  async stop() {
    polling.stop?.();
    if (connection) {
      await connection.drain();
      connection = undefined;
      jetstream = undefined;
    }
  },
};
