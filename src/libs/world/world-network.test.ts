import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWorldProductionConfigured } from './world-network';
import production from './world-production.json';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/libs/runtime-config/runtime-config', () => ({ getRuntimeConfig: mocks.read }));

describe('world production boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.read.mockReturnValue({ ...production });
  });

  it('accepts the coherent official production network', () => {
    expect(isWorldProductionConfigured()).toBe(true);
  });

  it.each([
    ['deployEnv', 'staging'],
    ['nexusUrl', 'https://nexus.staging.pubky.app'],
    ['nexusUrl', 'https://nexus.pubky.app.example.com'],
    ['cdnUrl', 'https://nexus.staging.pubky.app/static'],
    ['homeserver', 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy'],
    ['homeserverUrl', 'https://homeserver.staging.pubky.app'],
    ['homegateUrl', 'https://homegate.staging.pubky.app'],
    ['defaultHttpRelay', 'https://httprelay.staging.pubky.app/inbox'],
    ['pkarrRelays', ['https://pkarr.example.com']],
    ['testnet', true],
  ])('rejects drift in %s before world IO', (key, value) => {
    mocks.read.mockReturnValue({ ...production, [key]: value });
    expect(isWorldProductionConfigured()).toBe(false);
  });

  it('fails closed when injected configuration is absent or invalid', () => {
    mocks.read.mockImplementationOnce(() => {
      throw new TypeError('Invalid test configuration');
    });
    expect(isWorldProductionConfigured()).toBe(false);
  });
});
