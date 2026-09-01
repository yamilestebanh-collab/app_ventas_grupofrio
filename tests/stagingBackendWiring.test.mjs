import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync('src/services/api.ts', 'utf8');
const authSource = readFileSync('src/stores/useAuthStore.ts', 'utf8');
const syncSource = readFileSync('src/stores/useSyncStore.ts', 'utf8');

assert.match(
  apiSource,
  /useStagingBackendStore\.getState\(\)\.assertMutationAllowed\(absoluteUrl\)/,
  'postRest must verify staging identity before sending a POST',
);
assert.match(
  authSource,
  /resolveStagingBackendIdentity\(/,
  'staging login must resolve the active database before authentication',
);
assert.match(
  authSource,
  /environment === 'staging'/,
  'staging DB resolution must be isolated from production login behavior',
);
assert.match(
  syncSource,
  /StagingBackendUnverifiedError/,
  'sync queue must recognize an unverified staging backend',
);
assert.match(
  syncSource,
  /staging_backend_unverified_deferred/,
  'sync queue must defer instead of sending while staging is unverified',
);

console.log('staging backend wiring: ok');
