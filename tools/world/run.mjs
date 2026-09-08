import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import production from '../../src/libs/world/world-production.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const network = {
  PUBKY_RUNTIME_ENV: production.deployEnv,
  PUBKY_RUNTIME_TESTNET: String(production.testnet),
  PUBKY_RUNTIME_NEXUS_URL: production.nexusUrl,
  PUBKY_RUNTIME_CDN_URL: production.cdnUrl,
  PUBKY_RUNTIME_HOMESERVER: production.homeserver,
  PUBKY_RUNTIME_HOMESERVER_URL: production.homeserverUrl,
  PUBKY_RUNTIME_HOMEGATE_URL: production.homegateUrl,
  PUBKY_RUNTIME_DEFAULT_HTTP_RELAY: production.defaultHttpRelay,
  PUBKY_RUNTIME_PKARR_RELAYS: JSON.stringify(production.pkarrRelays),
};

// Explicit arguments, no shell, and all nine values together for this production fork.
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...network },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  process.stderr.write('Could not start Pubky World.\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
