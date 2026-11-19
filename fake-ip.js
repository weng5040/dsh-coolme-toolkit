/**
 * Host half of the dsh-coolme-toolkit:fake-ip bundle.
 *
 * This host's LAN gateway is a transparent proxy in fake-ip mode: public
 * hostnames resolve into the RFC 2544 benchmarking band 198.18.0.0/15, which
 * `@deepseek-ai/dsh-web-fetch-http`'s SSRF guard (ipaddr.js `range()`) reports as
 * non-public, so `web_fetch` refuses the URL before connecting. Editing that
 * shipped file by hand is undone by every dsh upgrade, so this plugin applies the
 * same relaxation at run time instead, through the provider's own seam:
 * `HttpFetchProvider` takes its resolver as a constructor argument and keeps it
 * as the `resolveAddresses` instance field. Wrapping the registered instance's
 * field changes the policy without touching a single shipped byte.
 *
 * The relaxation is deliberately narrower than "allow private addresses". An
 * answer set is excused only when EVERY address is either
 *   - inside the configured band (default 198.18.0.0/15), or
 *   - already acceptable to upstream's own classifier,
 * and the excused set is the one the connection is then pinned to. Any other
 * destination keeps upstream's verdict, its error, and its diagnostics.
 *
 * Nothing is registered while the shipped provider is present, so `ctx.web`
 * keeps its "exactly one usable provider" invariant and no `fetchProvider`
 * selection config is needed.
 *
 * Config: `band` (IPv4 CIDR, default 198.18.0.0/15), `probe` (boolean, default
 * true: after activation, confirm the seam is still wired and log the verdict).
 */

import { lookup as defaultLookup } from 'node:dns/promises';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The shipped provider package whose seam this plugin relaxes. */
const PACKAGE = '@deepseek-ai/dsh-web-fetch-http';
/** The id that package registers under (`LOCAL_FETCH_PROVIDER_ID`). */
const PROVIDER_ID = 'http';
const DEFAULT_BAND = '198.18.0.0/15';
/** Bounded wait for the shipped provider's row to register before we stop looking. */
const WAIT_STEPS = 40;
const WAIT_STEP_MS = 50;
/** Deadline for the post-activation seam probe. */
const PROBE_TIMEOUT_MS = 1500;
/** Resolved limits used only on the fallback path that registers its own provider. */
const FALLBACK_LIMITS = {
  maxResponseBytes: 5e6,
  maxBodyChars: 1e5,
  timeoutMs: 3e4,
  maxRedirects: 5,
};


/** Strip the brackets an IPv6 URL host carries. */
function stripBrackets(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** The embedded IPv4 text of an IPv4-mapped IPv6 address, else the input. */
function mappedIpv4(address) {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return match === null ? address : match[1];
}

/** Parse dotted-quad IPv4 text into an unsigned 32-bit integer, or undefined. */
export function ipv4ToInt(address) {
  if (typeof address !== 'string') return undefined;
  const parts = address.trim().split('.');
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

/** Render an unsigned 32-bit integer back as dotted-quad IPv4 text. */
export function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/**
 * Parse the configured band into masked base/mask integers.
 * @param text - IPv4 CIDR text, or a bare IPv4 address for a /32.
 * @returns the parsed band, or undefined when the text is not IPv4 CIDR.
 */
export function parseBand(text) {
  if (typeof text !== 'string') return undefined;
  const [addressPart, prefixPart] = text.trim().split('/');
  const address = ipv4ToInt(addressPart ?? '');
  if (address === undefined) return undefined;
  const prefix = prefixPart === undefined || prefixPart === '' ? 32 : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const base = (address & mask) >>> 0;
  return { base, mask, prefix, text: `${intToIpv4(base)}/${prefix}` };
}

/**
 * Whether an address text sits inside the band (IPv4-mapped IPv6 included).
 * @param address - textual IPv4 or IPv6 address.
 * @param band - a band from {@link parseBand}.
 * @returns true when the address is inside the band.
 */
export function inBand(address, band) {
  if (band === undefined) return false;
  const value = ipv4ToInt(mappedIpv4(String(address)));
  return value !== undefined && ((value & band.mask) >>> 0) === band.base;
}

/**
 * Wrap an upstream resolver so answers inside the band are excused.
 *
 * `original` is `HttpFetchProvider.resolveAddresses`: it resolves once, refuses
 * the whole answer set when any address is non-public, and returns the validated
 * set the connection is then pinned to. The wrapper only runs after that refusal,
 * re-reads the same answer set, and returns it when every address is either inside
 * the band or independently acceptable to `original`; otherwise the original
 * error is rethrown untouched.
 *
 * @param original - the upstream resolver `(hostname, signal) => Promise<{address, family}[]>`.
 * @param options - `band` (required), `lookup` (test seam), `onExcused` (notification).
 * @returns the wrapped resolver.
 */
export function relaxedResolver(original, options) {
  const band = options.band;
  const dns = options.lookup ?? defaultLookup;
  const onExcused = options.onExcused;
  return async function resolveWithFakeIp(hostname, signal) {
    try {
      return await original(hostname, signal);
    } catch (error) {
      const unbracketed = stripBrackets(String(hostname));
      const literal = isIP(unbracketed);
      let answers;
      if (literal !== 0) {
        answers = [{ address: unbracketed, family: literal }];
      } else {
        const resolved = await dns(unbracketed, { all: true, order: 'verbatim' }).catch(() => undefined);
        if (!Array.isArray(resolved) || resolved.length === 0) throw error;
        answers = resolved;
      }
      for (const entry of answers) {
        const address = entry !== null && typeof entry === 'object' ? entry.address : undefined;
        if (typeof address !== 'string') throw error;
        if (inBand(address, band)) continue;
        /* Outside the band: keep upstream's own verdict for this answer. */
        try {
          await original(address, signal);
        } catch {
          throw error;
        }
      }
      const validated = answers.map((entry) => ({ address: entry.address, family: isIP(entry.address) }));
      if (validated.some((entry) => entry.family !== 4 && entry.family !== 6)) throw error;
      if (typeof onExcused === 'function') onExcused(unbracketed, validated);
      return validated;
    }
  };
}

/** Sleep helper; the plugin runs inside the host process. */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Cordis's logger is the platform convention, but this deployment attaches one
 * exporter that keeps `warn`/`error` for boot diagnostics and writes nothing to
 * stdout — so a plugin's line would never reach `/var/log/dsh-web.log`, where the
 * service's stdout is appended. Verdicts therefore go to both channels.
 */
function emit(ctx, level, message) {
  const logger = ctx.logger;
  if (logger !== undefined && typeof logger[level] === 'function') {
    try {
      logger[level](`dsh-coolme-toolkit:fake-ip: ${message}`);
    } catch {
      /* the stdout copy below is the durable channel */
    }
  }
}

/** A verdict the operator must be able to find in the service log. */
function notice(ctx, message) {
  emit(ctx, 'info', message);
  process.stdout.write(`[dsh-coolme-toolkit:fake-ip] ${message}\n`);
}

/** A verdict that the relaxed guard is not in place. */
function problem(ctx, message) {
  emit(ctx, 'error', message);
  process.stdout.write(`[dsh-coolme-toolkit:fake-ip] ERROR ${message}\n`);
}

/** A per-resolution detail; kept out of stdout so the log stays readable. */
function detail(ctx, message) {
  emit(ctx, 'info', message);
}

/** Log the first excused resolution where it is visible, the rest as details. */
function noteExcursion(ctx, band) {
  let excused = 0;
  return (hostname, addresses) => {
    excused += 1;
    const summary = `${hostname} -> ${addresses.map((entry) => entry.address).join(', ')}`;
    if (excused === 1) notice(ctx, `excused a ${band.text} answer for ${summary}`);
    else detail(ctx, `excused a ${band.text} answer for ${summary}`);
  };
}

/** Candidate bases for resolving the shipped package from inside this process. */
function resolutionBases() {
  const bases = [];
  const argvEntry = process.argv[1];
  if (typeof argvEntry === 'string' && argvEntry.length > 0) bases.push(argvEntry);
  /* Standard layout of a global install: <prefix>/bin/node -> <prefix>/lib/node_modules. */
  bases.push(join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
  return bases;
}

/**
 * Import the shipped provider class, used only when no registered provider can be
 * wrapped (the shipped row was disabled, for instance).
 * @returns `{ HttpFetchProvider, DEFAULT_USER_AGENT }` or `{}` with a logged error.
 */
async function importProviderClass(ctx) {
  for (const base of resolutionBases()) {
    try {
      const require = createRequire(base);
      const entry = require.resolve(PACKAGE);
      const mod = await import(pathToFileURL(entry).href);
      if (typeof mod.HttpFetchProvider === 'function') {
        return { HttpFetchProvider: mod.HttpFetchProvider, DEFAULT_USER_AGENT: mod.DEFAULT_USER_AGENT };
      }
    } catch {
      /* try the next base */
    }
  }
  problem(ctx, `could not resolve ${PACKAGE} from ${resolutionBases().join(' , ')}; register a provider manually or re-run the local patch script.`);
  return {};
}

/**
 * After activation, confirm the seam is still the one the provider calls: the
 * provider is asked to fetch a band literal, which can only reach the network
 * when `resolveAddresses` really is consulted. `WEB_BLOCKED_URL` means upstream
 * moved the guard and the relaxation is no longer wired.
 */
async function probeSeam(ctx, provider, band) {
  const probeUrl = `http://${intToIpv4(band.base + 1)}/`;
  try {
    await provider.fetch({ url: probeUrl }, AbortSignal.timeout(PROBE_TIMEOUT_MS));
    notice(ctx, 'seam probe answered: the guard still consults the wrapped resolver');
  } catch (error) {
    const code = error !== null && typeof error === 'object' ? error.code : undefined;
    if (code === 'WEB_BLOCKED_URL') {
      problem(ctx, `seam probe was refused (${code}) — upstream no longer consults resolveAddresses; check the plugin compatibility and configuration.`);
      return;
    }
    /* Any transport-level failure proves the resolver ran and the address was accepted. */
    notice(ctx, `seam probe reached the transport (${String(code ?? error)}): the wrapped resolver is wired`);
  }
}

/** Point one provider's resolver at the relaxed wrapper; restore it on unload. */
function wireProvider(ctx, provider, band) {
  const original = provider.resolveAddresses;
  const relaxed = relaxedResolver(original, { band, onExcused: noteExcursion(ctx, band) });
  provider.resolveAddresses = relaxed;
  ctx.effect(() => () => {
    if (provider.resolveAddresses === relaxed) provider.resolveAddresses = original;
  }, `dsh-coolme-toolkit:fake-ip: restore resolver of ${String(provider.id)}`);
  return relaxed;
}

/**
 * @param ctx - Cordis context carrying `web`.
 * @param config - `{ band?: string, probe?: boolean }` from the bundle row.
 */
export async function apply(ctx, config) {
  const requested = typeof config?.band === 'string' && config.band.trim() !== '' ? config.band : DEFAULT_BAND;
  const band = parseBand(requested);
  if (band === undefined) {
    problem(ctx, `band ${JSON.stringify(requested)} is not an IPv4 CIDR; the guard is left untouched.`);
    return;
  }

  const registry = ctx.web?.fetchProviders;
  if (!(registry instanceof Map)) {
    problem(ctx, 'ctx.web.fetchProviders is not a Map, so the fetch-provider seam moved; the guard is left untouched.');
    return;
  }

  let target = registry.get(PROVIDER_ID);
  for (let step = 0; target === undefined && step < WAIT_STEPS; step += 1) {
    await sleep(WAIT_STEP_MS);
    target = registry.get(PROVIDER_ID);
  }

  /* Prefer the shipped id; fall back to whatever single provider is registered. */
  const candidates = target !== undefined ? [target] : [...registry.values()];
  const wired = [];
  for (const provider of candidates) {
    if (provider === null || typeof provider !== 'object' || typeof provider.resolveAddresses !== 'function') continue;
    wired.push(provider);
    wireProvider(ctx, provider, band);
  }

  if (wired.length === 0) {
    if (registry.size > 0) {
      problem(ctx, `${registry.size} fetch provider(s) registered, none exposing resolveAddresses; the guard is left untouched.`);
      return;
    }
    const { HttpFetchProvider, DEFAULT_USER_AGENT } = await importProviderClass(ctx);
    if (HttpFetchProvider === undefined) return;
    const limits = { ...FALLBACK_LIMITS, userAgent: DEFAULT_USER_AGENT };
    const base = new HttpFetchProvider(limits);
    const provider = new HttpFetchProvider(limits, relaxedResolver(base.resolveAddresses, {
      band,
      onExcused: noteExcursion(ctx, band),
    }));
    ctx.web.registerFetchProvider(provider);
    wired.push(provider);
    notice(ctx, `registered provider "${String(provider.id)}" with the ${band.text} allowance`);
  }

  const ids = wired.map((provider) => String(provider.id)).join(', ');
  const probeAddress = intToIpv4(band.base + 1);
  let selfCheck = false;
  try {
    const addresses = await wired[0].resolveAddresses(probeAddress, AbortSignal.timeout(PROBE_TIMEOUT_MS));
    selfCheck = Array.isArray(addresses) && addresses.length > 0;
  } catch {
    selfCheck = false;
  }
  if (!selfCheck) {
    problem(ctx, `self-check failed — ${probeAddress} is still refused; check the plugin compatibility and configuration.`);
    return;
  }
  notice(ctx, `${band.text} is now acceptable to fetch provider "${ids}" (relaxed in memory; no shipped file was edited)`);

  if (config?.probe !== false) {
    void probeSeam(ctx, wired[0], band);
  }
}
