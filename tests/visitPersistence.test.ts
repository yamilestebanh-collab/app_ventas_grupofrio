import assert from 'node:assert/strict';

interface VisitPersistenceModule {
  buildVisitSnapshot: (input: {
    phase: 'idle' | 'checked_in' | 'selling' | 'no_selling' | 'checked_out';
    currentStopId: number | null;
    currentStop: {
      id: number;
      customer_id: number;
      customer_name: string;
      state: string;
      source_model: 'gf.route.stop';
    } | null;
    checkInTime: number | null;
    checkInLat: number | null;
    checkInLon: number | null;
    elapsedSeconds: number;
  }) => null | {
    phase: string;
    currentStopId: number;
    currentStop: { id: number; customer_name: string };
    checkInTime: number;
    checkInLat: number | null;
    checkInLon: number | null;
    elapsedSeconds: number;
  };
  shouldRehydrateVisit: (
    snapshot: { currentStopId: number } | null,
    stops: Array<{ id: number; state: string }>,
  ) => boolean;
  shouldResetVisitAfterPlanRefresh: (
    currentStopId: number | null,
    stops: Array<{ id: number; state: string }>,
  ) => boolean;
}

function testBuildActiveVisitSnapshot(module: VisitPersistenceModule) {
  const snapshot = module.buildVisitSnapshot({
    phase: 'checked_in',
    currentStopId: 15,
    currentStop: {
      id: 15,
      customer_id: 200,
      customer_name: 'Abarrotes Centro',
      state: 'in_progress',
      source_model: 'gf.route.stop',
    },
    checkInTime: 123456,
    checkInLat: 19.4,
    checkInLon: -99.1,
    elapsedSeconds: 90,
  });

  assert.deepEqual(snapshot, {
    phase: 'checked_in',
    currentStopId: 15,
    currentStop: {
      id: 15,
      customer_id: 200,
      customer_name: 'Abarrotes Centro',
      state: 'in_progress',
      source_model: 'gf.route.stop',
    },
    checkInTime: 123456,
    checkInLat: 19.4,
    checkInLon: -99.1,
    elapsedSeconds: 90,
  });
}

function testIdleVisitDoesNotPersist(module: VisitPersistenceModule) {
  const snapshot = module.buildVisitSnapshot({
    phase: 'idle',
    currentStopId: null,
    currentStop: null,
    checkInTime: null,
    checkInLat: null,
    checkInLon: null,
    elapsedSeconds: 0,
  });

  assert.equal(snapshot, null);
}

function testRehydrateRequiresInProgressStop(module: VisitPersistenceModule) {
  assert.equal(
    module.shouldRehydrateVisit(
      { currentStopId: 15 },
      [
        { id: 15, state: 'in_progress' },
        { id: 16, state: 'pending' },
      ],
    ),
    true,
  );

  assert.equal(
    module.shouldRehydrateVisit(
      { currentStopId: 15 },
      [
        { id: 15, state: 'done' },
      ],
    ),
    false,
  );
}

function testResetVisitWhenCurrentStopDisappearsFromFreshPlan(module: VisitPersistenceModule) {
  assert.equal(
    module.shouldResetVisitAfterPlanRefresh(
      15,
      [
        { id: 16, state: 'pending' },
        { id: 17, state: 'done' },
      ],
    ),
    true,
  );

  assert.equal(
    module.shouldResetVisitAfterPlanRefresh(
      15,
      [
        { id: 15, state: 'pending' },
        { id: 17, state: 'done' },
      ],
    ),
    false,
  );

  assert.equal(
    module.shouldResetVisitAfterPlanRefresh(null, [
      { id: 15, state: 'pending' },
    ]),
    false,
  );
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/visitPersistence.ts', import.meta.url).pathname
  ) as VisitPersistenceModule;

  testBuildActiveVisitSnapshot(module);
  testIdleVisitDoesNotPersist(module);
  testRehydrateRequiresInProgressStop(module);
  testResetVisitWhenCurrentStopDisappearsFromFreshPlan(module);
  console.log('visit persistence tests: ok');
}

void main();
