import assert from 'node:assert/strict';

interface VisitGuardModule {
  deriveVisitGuard: (input: {
    stopState: 'pending' | 'in_progress' | 'done' | 'not_visited' | 'closed';
    stopId: number;
    currentStopId: number | null;
    phase: 'idle' | 'checked_in' | 'selling' | 'no_selling' | 'checked_out';
  }) => {
    canStartVisit: boolean;
    canResumeVisit: boolean;
    canAccessVisitActions: boolean;
    hasAnotherActiveVisit: boolean;
    isCompletedStop: boolean;
    primaryActionLabel: string;
  };
}

function testPendingStopCanStart(visitGuards: VisitGuardModule) {
  const guard = visitGuards.deriveVisitGuard({
    stopState: 'pending',
    stopId: 10,
    currentStopId: null,
    phase: 'idle',
  });

  assert.equal(guard.canStartVisit, true);
  assert.equal(guard.canResumeVisit, false);
  assert.equal(guard.canAccessVisitActions, false);
  assert.equal(guard.primaryActionLabel, '📍 Check-in · Iniciar Visita');
}

function testInProgressCurrentStopCanResume(visitGuards: VisitGuardModule) {
  const guard = visitGuards.deriveVisitGuard({
    stopState: 'in_progress',
    stopId: 10,
    currentStopId: 10,
    phase: 'checked_in',
  });

  assert.equal(guard.canStartVisit, false);
  assert.equal(guard.canResumeVisit, true);
  assert.equal(guard.canAccessVisitActions, true);
  assert.equal(guard.primaryActionLabel, '▶ Continuar Visita');
}

function testCompletedStopBlocksRestart(visitGuards: VisitGuardModule) {
  const guard = visitGuards.deriveVisitGuard({
    stopState: 'done',
    stopId: 10,
    currentStopId: null,
    phase: 'idle',
  });

  assert.equal(guard.isCompletedStop, true);
  assert.equal(guard.canStartVisit, false);
  assert.equal(guard.canResumeVisit, false);
  assert.equal(guard.primaryActionLabel, '✓ Visita completada');
}

function testAnotherActiveVisitBlocksStart(visitGuards: VisitGuardModule) {
  const guard = visitGuards.deriveVisitGuard({
    stopState: 'pending',
    stopId: 10,
    currentStopId: 22,
    phase: 'checked_in',
  });

  assert.equal(guard.hasAnotherActiveVisit, true);
  assert.equal(guard.canStartVisit, false);
  assert.equal(guard.primaryActionLabel, '🔒 Otra visita en curso');
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const visitGuards = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/visitGuards.ts', import.meta.url).pathname
  ) as VisitGuardModule;

  testPendingStopCanStart(visitGuards);
  testInProgressCurrentStopCanResume(visitGuards);
  testCompletedStopBlocksRestart(visitGuards);
  testAnotherActiveVisitBlocksStart(visitGuards);
  console.log('visit guards tests: ok');
}

void main();
