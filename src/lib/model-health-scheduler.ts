import * as Sentry from "@sentry/nextjs";
import { checkModelHealth } from "@/lib/model-health";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 10_000;

const globalForScheduler = globalThis as typeof globalThis & {
  modelHealthSchedulerStarted?: boolean;
};

async function runCheck() {
  try {
    await checkModelHealth();
  } catch (error) {
    Sentry.captureException(error);
  }
}

/**
 * Probes the monitored models in-process every 5 minutes. Meant for a long-running
 * server (Docker / Dokploy); with several replicas each one probes on its own, so
 * use `/api/cron/model-health` from an external scheduler instead.
 */
export function startModelHealthScheduler() {
  if (globalForScheduler.modelHealthSchedulerStarted) return;
  globalForScheduler.modelHealthSchedulerStarted = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCheck();
    } finally {
      running = false;
    }
  };

  setTimeout(tick, FIRST_CHECK_DELAY_MS).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}
