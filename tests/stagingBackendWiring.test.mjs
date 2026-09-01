import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync('src/services/api.ts', 'utf8');

assert.match(
  apiSource,
  /useStagingBackendStore\.getState\(\)\.assertMutationAllowed\(absoluteUrl\)/,
  'postRest must verify staging identity before sending a POST',
);

console.log('staging backend wiring: ok');
