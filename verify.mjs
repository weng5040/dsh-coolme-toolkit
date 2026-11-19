#!/usr/bin/env node
/**
 * End-to-end check for the fake-ip allowance, independent of the running server.
 *
 * Drives the real `HttpFetchProvider` with this plugin's relaxed resolver and
 * prints the outcome. Run it after a dsh upgrade when you want to be sure the
 * seam still works (it replaces the older /root/dsh-web-fetch-allowlist/verify.mjs
 * for the plugin route):
 *
 *   node /root/dsh-coolme-toolkit:fake-ip/verify.mjs [url]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { intToIpv4, parseBand, relaxedResolver } from './fake-ip.js';

const PACKAGE = '@deepseek-ai/dsh-web-fetch-http';
const url = process.argv[2] ?? 'https://example.com';
const band = parseBand(process.env.DSH_FAKE_IP_BAND ?? '198.18.0.0/15');
if (band === undefined) {
  console.error('FAIL: band is not an IPv4 CIDR');
  process.exit(1);
}

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const require = createRequire(`${globalRoot}/@deepseek-ai/dsh/package.json`);
const entry = require.resolve(PACKAGE);
const { HttpFetchProvider, DEFAULT_USER_AGENT } = await import(pathToFileURL(entry).href);

const limits = {
  maxResponseBytes: 2e6,
  maxBodyChars: 4000,
  timeoutMs: 25e3,
  maxRedirects: 3,
  userAgent: DEFAULT_USER_AGENT,
};
const base = new HttpFetchProvider(limits);
const relaxed = relaxedResolver(base.resolveAddresses, {
  band,
  onExcused: (hostname, addresses) => {
    console.log(`excused ${hostname} -> ${addresses.map((address) => address.address).join(', ')}`);
  },
});
const provider = new HttpFetchProvider(limits, relaxed);

/* The same offline check the plugin performs at activation. */
const probeAddress = intToIpv4(band.base + 1);
try {
  const probe = await provider.resolveAddresses(probeAddress, AbortSignal.timeout(2000));
  console.log(`self-check: ${probeAddress} accepted (${probe.map((a) => a.address).join(', ')})`);
} catch (error) {
  console.error(`self-check FAILED: ${error?.code ?? error?.name}: ${error?.message}`);
}

try {
  const result = await provider.fetch({ url });
  console.log(`OK ${result.statusCode} ${result.url}`);
  console.log(`kind=${result.body.kind} chars=${result.body.content.length} truncated=${result.truncated}`);
  console.log(result.body.content.split('\n').slice(0, 2).join('\n'));
} catch (error) {
  console.error(`FAIL ${error?.name}: ${error?.message}`);
  console.error(JSON.stringify({ code: error?.code, cause: String(error?.cause ?? '') }, null, 2));
  process.exit(1);
}
