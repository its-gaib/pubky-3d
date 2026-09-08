import { getRuntimeConfig } from '@/libs/runtime-config/runtime-config';
import production from './world-production.json';

/** Reads and explicit world writes share one complete, fail-closed production boundary. */
export function isWorldProductionConfigured(): boolean {
  try {
    const current = getRuntimeConfig();
    return Object.entries(production).every(([key, value]) => {
      const actual = current[key as keyof typeof production];
      return Array.isArray(value)
        ? Array.isArray(actual) &&
            actual.length === value.length &&
            value.every((relay, index) => relay === actual[index])
        : actual === value;
    });
  } catch {
    return false;
  }
}
