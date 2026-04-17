import assert from 'node:assert/strict';

interface OffrouteDraftsModule {
  VIRTUAL_STOP_TTL_MS: number;
  isVirtualStop: (stop: any) => boolean;
  extractVirtualDrafts: (stops: any[]) => any[];
  pruneStaleVirtualDrafts: (drafts: any[], now?: number, ttlMs?: number) => any[];
  stampMissingCreatedAt: (stops: any[], now?: number) => any[];
  mergeBackendStopsWithDrafts: (
    backendStops: any[],
    existingStops: any[],
    now?: number,
  ) => any[];
}

function real(id: number) {
  return { id, customer_id: id * 10, customer_name: `C${id}`, state: 'pending', source_model: 'gf.route.stop' };
}

function draft(id: number, createdAt?: number) {
  return {
    id,
    customer_id: 99,
    customer_name: 'Offroute',
    state: 'pending',
    source_model: 'gf.route.stop',
    _isOffroute: true,
    _virtualCreatedAt: createdAt,
  };
}

function testIsVirtual(m: OffrouteDraftsModule) {
  assert.equal(m.isVirtualStop(real(1)), false);
  assert.equal(m.isVirtualStop(draft(-123, Date.now())), true);
  assert.equal(m.isVirtualStop({ id: -5, source_model: 'gf.route.stop' }), true);
}

function testPreservesFreshDraftsOnRefresh(m: OffrouteDraftsModule) {
  const now = 1_700_000_000_000;
  const existing = [real(1), draft(-5, now - 1000)];
  const backend = [real(1), real(2)];
  const merged = m.mergeBackendStopsWithDrafts(backend, existing, now);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.slice(0, 2).map((s) => s.id), [1, 2]);
  assert.equal(merged[2].id, -5, 'fresh virtual draft must survive refresh');
}

function testDropsStaleDraftsOnRefresh(m: OffrouteDraftsModule) {
  const now = 1_700_000_000_000;
  const ancient = now - (m.VIRTUAL_STOP_TTL_MS + 1);
  const existing = [real(1), draft(-9, ancient)];
  const merged = m.mergeBackendStopsWithDrafts([real(1)], existing, now);
  assert.equal(merged.length, 1, 'stale virtual draft must be dropped');
  assert.equal(merged[0].id, 1);
}

function testStampsLegacyDrafts(m: OffrouteDraftsModule) {
  const now = 1_700_000_000_000;
  const legacy = draft(-7); // no _virtualCreatedAt
  const stamped = m.stampMissingCreatedAt([real(1), legacy], now);
  assert.equal(stamped[1]._virtualCreatedAt, now);
  // Idempotent: second call is a no-op.
  const again = m.stampMissingCreatedAt(stamped, now + 1000);
  assert.equal(again[1]._virtualCreatedAt, now);
}

function testBackendCollisionWins(m: OffrouteDraftsModule) {
  const now = 1_700_000_000_000;
  const existing = [draft(-1, now)];
  // Defensive case: if the backend ever returns the same id, drop the draft.
  const merged = m.mergeBackendStopsWithDrafts([real(-1)], existing, now);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]._isOffroute, undefined);
}

async function main() {
  const m = await import(
    // @ts-ignore
    new URL('../src/services/offrouteDrafts.ts', import.meta.url).pathname
  ) as OffrouteDraftsModule;

  testIsVirtual(m);
  testPreservesFreshDraftsOnRefresh(m);
  testDropsStaleDraftsOnRefresh(m);
  testStampsLegacyDrafts(m);
  testBackendCollisionWins(m);
  console.log('offroute drafts tests: ok');
}

void main();
