import { describe, expect, it } from 'vitest';
import production from '@/libs/world/world-production.json';
import { networkStorageName } from './network-storage';
import { NETWORK_RUNTIME_DEFAULTS, type NetworkRuntimeConfig } from './runtime-config.schema';

const prod = { ...production, deployEnv: 'production' } satisfies NetworkRuntimeConfig;

describe('network storage isolation', () => {
  it('never addresses legacy staging storage and keeps networks separate', () => {
    const oldSession = '{"state":{"sessionExport":"staging-session"},"version":0}';
    localStorage.setItem('auth-store', oldSession);
    localStorage.setItem(networkStorageName('auth-store', NETWORK_RUNTIME_DEFAULTS), oldSession);
    expect(localStorage.getItem(networkStorageName('auth-store', prod))).toBeNull();
    expect(localStorage.getItem('auth-store')).toBe(oldSession);
    expect(networkStorageName('franky', prod)).not.toBe('franky');
    localStorage.clear();
  });

  it.each(Object.keys(prod) as (keyof NetworkRuntimeConfig)[])('isolates changes to %s without a lossy hash', (key) => {
    const changed = {
      ...prod,
      [key]: key === 'testnet' ? true : key === 'pkarrRelays' ? ['https://other.example/'] : 'other-network',
    } as NetworkRuntimeConfig;
    expect(networkStorageName('auth-store', changed)).not.toBe(networkStorageName('auth-store', prod));
  });

  it('is stable regardless of property insertion order and separates storage purposes', () => {
    const reversed = Object.fromEntries(Object.entries(prod).reverse()) as NetworkRuntimeConfig;
    expect(networkStorageName('auth-store', reversed)).toBe(networkStorageName('auth-store', prod));
    expect(networkStorageName('franky', prod)).not.toBe(networkStorageName('auth-store', prod));
  });
});
