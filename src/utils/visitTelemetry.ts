/**
 * Visit telemetry counters.
 *
 * These counters validate that the visit-reconciliation patch is cutting
 * a real ghost-stop loop in production, not papering over a new symptom.
 *
 * - `reconcileResetTotal` — loadPlan() detected the active visit's stop
 *   no longer exists in the fresh plan and called resetVisit().
 * - `guardGhostSuppressedTotal` — a stop screen observed that the
 *   globally-active `currentStopId` does not exist in the local plan, so
 *   the "another visit in progress" guard was suppressed.
 *
 * Both counters are process-scoped (reset on cold start) and mirror the
 * pattern of `photoCounters` in services/camera.ts. They're also emitted
 * as structured log events (`visit.reconcile_reset` /
 * `visit.guard_ghost_suppressed`) so they land in the diagnostics export.
 */

export const visitTelemetryCounters = {
  reconcileResetTotal: 0,
  guardGhostSuppressedTotal: 0,
};

export function resetVisitTelemetryCounters(): void {
  visitTelemetryCounters.reconcileResetTotal = 0;
  visitTelemetryCounters.guardGhostSuppressedTotal = 0;
}
