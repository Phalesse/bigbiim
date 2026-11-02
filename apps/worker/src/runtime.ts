import { PrismaClient } from '@prisma/client';
import type { Handler } from './handler';

export const prisma = new PrismaClient();

export function pollingHandler(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
): Handler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let active: Promise<void> | undefined;

  const schedule = (delay: number) => {
    if (!stopped) {
      timer = setTimeout(() => {
        active = tick();
      }, delay);
    }
  };

  const tick = async () => {
    try {
      await run();
    } catch (error) {
      console.error(
        `[worker] ${name}: traitement échoué; nouvelle tentative dans ${intervalMs} ms`,
        error,
      );
    } finally {
      schedule(intervalMs);
    }
  };

  return {
    name,
    start() {
      if (!stopped) return;
      stopped = false;
      console.info(`[worker] ${name}: démarré (intervalle ${intervalMs} ms)`);
      schedule(0);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await active;
    },
  };
}

export function blockedHandler(name: string, reason: string): Handler {
  return {
    name,
    start() {
      throw new Error(`BLOCKED: ${reason}`);
    },
  };
}
