import { networkStorageName } from '@/libs/runtime-config/network-storage';

// Runtime config is injected before client modules and fixed for this page load.
// Legacy unscoped staging state is deliberately left untouched and never imported.
export const AUTH_PERSIST_KEY = networkStorageName('auth-store');
export const ONBOARDING_PERSIST_KEY = networkStorageName('onboarding-storage');
export const NOTIFICATION_PERSIST_KEY = networkStorageName('notification-store');
export const SEARCH_PERSIST_KEY = networkStorageName('search-store');
export const HOME_PERSIST_KEY = networkStorageName('home-store');
export const HOT_PERSIST_KEY = networkStorageName('hot-store');
export const SETTINGS_PERSIST_KEY = networkStorageName('settings-storage');
export const MIGRATION_STORE_KEY = networkStorageName('migration-store');

// List of all persisted store keys (Local storage keys)
// EX: MIGRATION_STORE_KEY won't be included in this list because it's not a persisted store key.
export const PERSISTED_STORE_KEYS = [
  AUTH_PERSIST_KEY,
  ONBOARDING_PERSIST_KEY,
  NOTIFICATION_PERSIST_KEY,
  SEARCH_PERSIST_KEY,
  HOME_PERSIST_KEY,
  HOT_PERSIST_KEY,
  SETTINGS_PERSIST_KEY,
] as const;
