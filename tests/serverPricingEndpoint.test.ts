import assert from 'node:assert/strict';

interface ServerPricingEndpointModule {
  INITIAL_BACKOFF_MS: number;
  MAX_BACKOFF_MS: number;
  shouldTryServerPricingEndpoint: (now?: number) => boolean;
  resetServerPricingEndpointForTests: () => void;
  isMissingServerPricingEndpointError: (error: unknown) => boolean;
  disableServerPricingEndpointIfMissing: (error: unknown, now?: number) => boolean;
  markServerPricingEndpointAvailable: () => void;
  getServerPricingEndpointState: () => { disabledUntil: number | null; currentBackoffMs: number };
}

function test404TriggersInitialBackoff(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  const now = 1_000_000;
  assert.equal(m.shouldTryServerPricingEndpoint(now), true);
  assert.equal(
    m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now),
    true,
  );
  // During backoff: disabled.
  assert.equal(m.shouldTryServerPricingEndpoint(now + 1), false);
  assert.equal(
    m.shouldTryServerPricingEndpoint(now + m.INITIAL_BACKOFF_MS - 1),
    false,
  );
  // After backoff: re-enabled for the next attempt.
  assert.equal(
    m.shouldTryServerPricingEndpoint(now + m.INITIAL_BACKOFF_MS),
    true,
  );
}

function testConsecutive404sEscalateBackoff(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  const now = 2_000_000;
  m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now);
  const firstState = m.getServerPricingEndpointState();
  assert.equal(firstState.currentBackoffMs, m.INITIAL_BACKOFF_MS);

  // Second 404 AFTER the window expired — should double the delay.
  const after = now + m.INITIAL_BACKOFF_MS + 1;
  m.disableServerPricingEndpointIfMissing(new Error('Not Found'), after);
  const secondState = m.getServerPricingEndpointState();
  assert.equal(secondState.currentBackoffMs, m.INITIAL_BACKOFF_MS * 2);

  // Third 404 again after window → doubles again.
  const after2 = after + secondState.currentBackoffMs + 1;
  m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), after2);
  assert.equal(
    m.getServerPricingEndpointState().currentBackoffMs,
    Math.min(m.INITIAL_BACKOFF_MS * 4, m.MAX_BACKOFF_MS),
  );
}

function testBackoffCapIsRespected(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  let now = 3_000_000;
  // Force escalation many times.
  for (let i = 0; i < 20; i++) {
    m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now);
    const st = m.getServerPricingEndpointState();
    now += st.currentBackoffMs + 1;
  }
  assert.equal(
    m.getServerPricingEndpointState().currentBackoffMs,
    m.MAX_BACKOFF_MS,
  );
}

function testMidWindow404DoesNotEscalate(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  const now = 4_000_000;
  m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now);
  // A second 404 INSIDE the backoff window (somehow reached the code
  // path) must NOT double the delay — that would punish the caller for
  // double-calling. Only a post-window retry should escalate.
  m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now + 1);
  assert.equal(
    m.getServerPricingEndpointState().currentBackoffMs,
    m.INITIAL_BACKOFF_MS,
  );
}

function testMarkAvailableResetsBackoff(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  const now = 5_000_000;
  m.disableServerPricingEndpointIfMissing(new Error('HTTP 404'), now);
  m.disableServerPricingEndpointIfMissing(
    new Error('HTTP 404'),
    now + m.INITIAL_BACKOFF_MS + 1,
  );
  assert.equal(
    m.getServerPricingEndpointState().currentBackoffMs,
    m.INITIAL_BACKOFF_MS * 2,
  );

  m.markServerPricingEndpointAvailable();
  const st = m.getServerPricingEndpointState();
  assert.equal(st.disabledUntil, null);
  assert.equal(st.currentBackoffMs, m.INITIAL_BACKOFF_MS);
  assert.equal(m.shouldTryServerPricingEndpoint(now + 10), true);
}

function testKeepsEndpointEnabledForNonMissingErrors(m: ServerPricingEndpointModule) {
  m.resetServerPricingEndpointForTests();
  assert.equal(
    m.disableServerPricingEndpointIfMissing(new Error('Network request failed')),
    false,
  );
  assert.equal(m.shouldTryServerPricingEndpoint(), true);
}

function testDetectsNotFoundVariants(m: ServerPricingEndpointModule) {
  assert.equal(m.isMissingServerPricingEndpointError(new Error('Not Found')), true);
  assert.equal(m.isMissingServerPricingEndpointError('endpoint not found'), true);
  assert.equal(m.isMissingServerPricingEndpointError(new Error('HTTP 500')), false);
}

async function main() {
  // @ts-ignore
  const m = await import(
    // @ts-ignore
    new URL('../src/services/serverPricingEndpoint.ts', import.meta.url).pathname
  ) as ServerPricingEndpointModule;

  test404TriggersInitialBackoff(m);
  testConsecutive404sEscalateBackoff(m);
  testBackoffCapIsRespected(m);
  testMidWindow404DoesNotEscalate(m);
  testMarkAvailableResetsBackoff(m);
  testKeepsEndpointEnabledForNonMissingErrors(m);
  testDetectsNotFoundVariants(m);
  console.log('server pricing endpoint tests: ok');
}

void main();
