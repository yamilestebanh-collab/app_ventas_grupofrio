import type { GFStop } from '../types/plan';
import type { VisitPhase } from '../stores/useVisitStore';

export interface PersistedVisitSnapshot {
  phase: VisitPhase;
  currentStopId: number;
  currentStop: GFStop;
  offrouteVisitId: number | null;
  checkInTime: number;
  checkInLat: number | null;
  checkInLon: number | null;
  elapsedSeconds: number;
}

interface BuildVisitSnapshotInput {
  phase: VisitPhase;
  currentStopId: number | null;
  currentStop: GFStop | null;
  offrouteVisitId: number | null;
  checkInTime: number | null;
  checkInLat: number | null;
  checkInLon: number | null;
  elapsedSeconds: number;
}

export function buildVisitSnapshot(input: BuildVisitSnapshotInput): PersistedVisitSnapshot | null {
  const {
    phase,
    currentStopId,
    currentStop,
    offrouteVisitId,
    checkInTime,
    checkInLat,
    checkInLon,
    elapsedSeconds,
  } = input;

  if (!['checked_in', 'selling', 'no_selling'].includes(phase)) return null;
  if (currentStopId == null || !currentStop || checkInTime == null) return null;

  return {
    phase,
    currentStopId,
    currentStop,
    offrouteVisitId,
    checkInTime,
    checkInLat,
    checkInLon,
    elapsedSeconds,
  };
}

export function shouldRehydrateVisit(
  snapshot: Pick<PersistedVisitSnapshot, 'currentStopId'> | null,
  stops: Array<Pick<GFStop, 'id' | 'state'>>,
): boolean {
  if (!snapshot) return false;
  const stop = stops.find((candidate) => candidate.id === snapshot.currentStopId);
  return stop?.state === 'in_progress';
}

export function shouldResetVisitAfterPlanRefresh(
  currentStopId: number | null,
  stops: Array<Pick<GFStop, 'id' | 'state'>>,
): boolean {
  if (currentStopId == null) return false;
  return !stops.some((candidate) => candidate.id === currentStopId);
}
