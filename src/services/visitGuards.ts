import type { StopState } from '../types/plan';
import type { VisitPhase } from '../stores/useVisitStore';

const COMPLETED_STOP_STATES: StopState[] = [
  'done',
  'not_visited',
  'no_stock',
  'rejected',
  'closed',
];

const ACTIVE_VISIT_PHASES: VisitPhase[] = ['checked_in', 'selling', 'no_selling'];

interface DeriveVisitGuardInput {
  stopState: StopState;
  stopId: number;
  currentStopId: number | null;
  phase: VisitPhase;
}

export function isCompletedStopState(stopState: StopState): boolean {
  return COMPLETED_STOP_STATES.includes(stopState);
}

export function isVisitPhaseActive(phase: VisitPhase): boolean {
  return ACTIVE_VISIT_PHASES.includes(phase);
}

export function deriveVisitGuard({
  stopState,
  stopId,
  currentStopId,
  phase,
}: DeriveVisitGuardInput) {
  const visitPhaseActive = isVisitPhaseActive(phase);
  const isCurrentVisit = visitPhaseActive && currentStopId === stopId;
  const hasAnotherActiveVisit = visitPhaseActive && currentStopId !== null && currentStopId !== stopId;
  const isCompletedStop = isCompletedStopState(stopState);
  const canStartVisit = stopState === 'pending' && !hasAnotherActiveVisit;
  const canResumeVisit = stopState === 'in_progress' && isCurrentVisit;
  const canAccessVisitActions = canResumeVisit;

  let primaryActionLabel = '📍 Check-in · Iniciar Visita';

  if (isCompletedStop) {
    primaryActionLabel = stopState === 'done' ? '✓ Visita completada' : '⛔ Parada cerrada';
  } else if (canResumeVisit) {
    primaryActionLabel = '▶ Continuar Visita';
  } else if (stopState === 'in_progress') {
    primaryActionLabel = '🔵 Visita en progreso';
  } else if (hasAnotherActiveVisit) {
    primaryActionLabel = '🔒 Otra visita en curso';
  }

  return {
    isCompletedStop,
    isCurrentVisit,
    hasAnotherActiveVisit,
    canStartVisit,
    canResumeVisit,
    canAccessVisitActions,
    primaryActionLabel,
  };
}
