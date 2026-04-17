import assert from 'node:assert/strict';

interface RouteStopsModule {
  removeStopById: (
    stops: Array<{ id: number; state: string }>,
    stopId: number,
  ) => Array<{ id: number; state: string }>;
}

function testRemoveStopById(module: RouteStopsModule) {
  const result = module.removeStopById(
    [
      { id: 10, state: 'pending' },
      { id: -99, state: 'done' },
      { id: 11, state: 'in_progress' },
    ],
    -99,
  );

  assert.deepEqual(result, [
    { id: 10, state: 'pending' },
    { id: 11, state: 'in_progress' },
  ]);
}

function testRemoveStopByIdNoopWhenMissing(module: RouteStopsModule) {
  const input = [
    { id: 10, state: 'pending' },
    { id: 11, state: 'in_progress' },
  ];
  const result = module.removeStopById(input, 999);
  assert.deepEqual(result, input);
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/routeStops.ts', import.meta.url).pathname
  ) as RouteStopsModule;

  testRemoveStopById(module);
  testRemoveStopByIdNoopWhenMissing(module);
  console.log('route stops tests: ok');
}

void main();
