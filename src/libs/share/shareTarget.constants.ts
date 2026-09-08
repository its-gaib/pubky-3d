// A new handoff cache for this production world; never consume legacy staging files.
// This leaf is shared with the service worker, which cannot read window runtime config.
export const SHARE_TARGET_CACHE = 'pubky-world-production-share-target-v1';
