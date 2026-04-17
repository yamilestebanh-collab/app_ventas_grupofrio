import assert from 'node:assert/strict';

interface VirtualStopsModule {
  shouldSkipStopCheckout: (stopId: number | null | undefined) => boolean;
}

function testVirtualStopsSkipCheckout(module: VirtualStopsModule) {
  assert.equal(module.shouldSkipStopCheckout(-1), true);
  assert.equal(module.shouldSkipStopCheckout(-999), true);
}

function testRealStopsStillUseCheckout(module: VirtualStopsModule) {
  assert.equal(module.shouldSkipStopCheckout(0), false);
  assert.equal(module.shouldSkipStopCheckout(44), false);
  assert.equal(module.shouldSkipStopCheckout(null), false);
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/virtualStops.ts', import.meta.url).pathname
  ) as VirtualStopsModule;

  testVirtualStopsSkipCheckout(module);
  testRealStopsStillUseCheckout(module);
  console.log('virtual stop tests: ok');
}

void main();
