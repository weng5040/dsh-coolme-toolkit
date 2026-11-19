/**
 * Host half of the dsh-service-restart bundle.
 *
 * Registers one authenticated HTTP route on the Web carrier:
 *
 *   GET  /api/dsh-web-restart  -> liveness probe, answers { bootId, unit }
 *   POST /api/dsh-web-restart  -> schedules `systemctl restart <unit>`
 *
 * The restart is NOT executed in this process's own cgroup: the request path
 * spawns `systemd-run`, which starts a transient unit that owns the
 * `systemctl` call. Restarting dsh-web tears down this process's cgroup
 * (including any systemctl client started inside it), so running the command
 * from a transient unit is what makes the button work at all.
 *
 * Delaying inside the transient unit's own shell keeps this process alive long
 * enough to answer the request, and avoids `--on-active` timers (whose
 * accuracy is not guaranteed).
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Single exact route; `/api` prefix routes never shadow an exact match. */
const ROUTE = '/api/dsh-web-restart';
const DEFAULT_UNIT = 'dsh-web.service';
const SYSTEMD_RUN = '/usr/bin/systemd-run';
const SYSTEMCTL = '/usr/bin/systemctl';

/**
 * Unit names are interpolated into the transient unit's shell command, so the
 * configured value is constrained to the characters systemd unit names use.
 */
const UNIT_NAME = /^[A-Za-z0-9][A-Za-z0-9@._:-]*$/;


/**
 * @param ctx Cordis context carrying `webServer` and `connection`.
 * @param config optional row config: `{ unit?: string, delaySeconds?: number }`.
 */
export function apply(ctx, config) {
  const requested = typeof config?.unit === 'string' ? config.unit.trim() : '';
  const unit = UNIT_NAME.test(requested) ? requested : DEFAULT_UNIT;
  if (requested !== '' && unit !== requested) {
    ctx.logger.warn(`dsh-web-restart: refusing unit ${JSON.stringify(requested)}; using ${DEFAULT_UNIT}`);
  }
  const delaySeconds = Number.isFinite(config?.delaySeconds) && config.delaySeconds >= 0
    ? config.delaySeconds
    : 1;

  /** Identifies this host *process*: a probe answering a new id means the new process is up. */
  const bootId = randomUUID();
  let restarting = false;
  let scheduledUnitName = null;

  const sendJson = (res, status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  };

  /** Apply Connection's Host/Origin fence plus browser authentication. */
  const rejected = (req, res) => {
    const status = ctx.connection.requestRejection(req);
    if (status === undefined) return false;
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(status));
    return true;
  };

  /**
   * Queue the restart in a transient unit outside this service's cgroup.
   * The command itself sleeps for `delaySeconds` and then runs systemctl, so
   * (a) the HTTP response is written before this process is torn down and
   * (b) the delay is an ordinary `sleep`, not a systemd timer.
   */
  const scheduleRestart = () => {
    const name = `dsh-web-restart-${Date.now()}`;
    const shell = `${delaySeconds > 0 ? `sleep ${delaySeconds}; ` : ''}exec ${SYSTEMCTL} --no-block restart ${unit}`;
    const args = [
      '--collect',
      `--unit=${name}`,
      `--description=Restart of ${unit} requested from the dsh Web UI`,
      '/bin/sh',
      '-c',
      shell,
    ];
    const result = spawnSync(SYSTEMD_RUN, args, { encoding: 'utf8', timeout: 5000 });
    return { name, result };
  };

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return;

      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(res, 200, {
          ok: true,
          unit,
          bootId,
          restarting,
          delaySeconds,
          lastScheduled: scheduledUnitName,
        });
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain; charset=utf-8' });
        res.end('method not allowed');
        return;
      }

      if (restarting) {
        sendJson(res, 202, { ok: true, unit, bootId, alreadyScheduled: true });
        return;
      }

      const { name, result } = scheduleRestart();
      if (result.error !== undefined || result.status !== 0) {
        const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
        const detail = result.error?.message ?? stderr;
        const message = detail !== '' ? detail : `systemd-run exited with status ${String(result.status)}`;
        ctx.logger.warn(`dsh-web-restart: scheduling a restart of ${unit} failed: ${message}`);
        sendJson(res, 502, { ok: false, unit, message });
        return;
      }

      restarting = true;
      scheduledUnitName = name;
      ctx.logger.info(`dsh-web-restart: ${unit} restart scheduled as ${name} (+${delaySeconds}s)`);
      sendJson(res, 202, { ok: true, unit, bootId, unitName: name, delaySeconds });
    },
  }), `dsh-web-restart: ${ROUTE}`);
}
