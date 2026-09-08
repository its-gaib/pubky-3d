import { getRuntimeConfig } from './runtime-config';
import type { NetworkRuntimeConfig } from './runtime-config.schema';

/** Lossless public network identity: never restore another network's sessions or caches. */
export function networkStorageName(name: string, config: NetworkRuntimeConfig = getRuntimeConfig()): string {
  const network = [
    config.deployEnv,
    config.nexusUrl,
    config.cdnUrl,
    config.homeserver,
    config.homeserverUrl,
    config.homegateUrl,
    config.defaultHttpRelay,
    config.pkarrRelays,
    config.testnet,
  ];
  return `pubky-world-v2:${encodeURIComponent(JSON.stringify(network))}:${name}`;
}
