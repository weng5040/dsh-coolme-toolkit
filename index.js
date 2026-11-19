/**
 * Unified Host entry for CoolMe Toolkit.
 *
 * Only `web` is a hard requirement, so the fake-ip allowance keeps working even
 * if the restart route's services move. The restart half waits briefly for
 * `webServer`/`connection` and disables itself with a logged warning instead of
 * blocking the rest of the bundle.
 */
import { apply as applyFakeIp } from './fake-ip.js';
import { apply as applyServiceRestart } from './service-restart.js';

export const inject = ['web'];

/** Bounded wait for the restart route's services, mirroring the fake-ip wait. */
const RESTART_WAIT_STEPS = 20;
const RESTART_WAIT_STEP_MS = 100;

/** A problem the operator must be able to find in the service log. */
function warn(ctx, message) {
  const logger = ctx.logger;
  if (logger !== undefined && typeof logger.warn === 'function') {
    try {
      logger.warn(`dsh-coolme-toolkit: ${message}`);
    } catch {
      /* the stdout copy below is the durable channel */
    }
  }
  process.stdout.write(`[dsh-coolme-toolkit] WARN ${message}\n`);
}

function restartServicesReady(ctx) {
  return ctx.webServer !== undefined && ctx.connection !== undefined;
}

async function startRestart(ctx, config) {
  for (let step = 0; step < RESTART_WAIT_STEPS && !restartServicesReady(ctx); step += 1) {
    await new Promise((resolve) => { setTimeout(resolve, RESTART_WAIT_STEP_MS); });
  }
  if (!restartServicesReady(ctx)) {
    warn(ctx, 'webServer/connection services are unavailable; the restart button stays disabled.');
    return;
  }
  applyServiceRestart(ctx, config);
}

export async function apply(ctx, config = {}) {
  /* Register the restart route first; do not let the fake-ip provider checks delay it. */
  void startRestart(ctx, config.restart).catch((error) => {
    warn(ctx, `service-restart half failed: ${String(error?.message ?? error)}`);
  });
  await applyFakeIp(ctx, config.fakeIp);
}
