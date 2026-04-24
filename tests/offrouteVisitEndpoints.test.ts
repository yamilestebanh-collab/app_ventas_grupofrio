import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function main() {
  const gfLogistics = readFileSync(
    '/Users/sebis/Desktop/app-ventas-v2/src/services/gfLogistics.ts',
    'utf8',
  );
  const syncStore = readFileSync(
    '/Users/sebis/Desktop/app-ventas-v2/src/stores/useSyncStore.ts',
    'utf8',
  );
  const syncTypes = readFileSync(
    '/Users/sebis/Desktop/app-ventas-v2/src/types/sync.ts',
    'utf8',
  );

  assert.match(gfLogistics, /export async function startOffrouteVisit\(/);
  assert.match(gfLogistics, /\$\{GF_BASE\}\/offroute\/visit\/start/);
  assert.match(gfLogistics, /export async function closeOffrouteVisit\(/);
  assert.match(gfLogistics, /\$\{GF_BASE\}\/offroute\/visit\/close/);
  assert.match(syncTypes, /'offroute_visit_close'/);
  assert.match(
    syncStore,
    /case 'offroute_visit_close':[\s\S]*?closeOffrouteVisit\(/,
    'offroute_visit_close queue branch must call closeOffrouteVisit()',
  );

  console.log('offroute visit endpoint tests: ok');
}

main();
