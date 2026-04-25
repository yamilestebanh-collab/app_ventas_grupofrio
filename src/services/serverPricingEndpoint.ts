/**
 * Server-side pricing endpoint availability tracker.
 *
 * Tracks availability of the `/gf/logistics/api/employee/truck_stock` endpoint
 * used for server-side price lookups. The client must tolerate failures without
 * hammering the endpoint or giving up for the rest of the session.
 *
 * Policy: exponential backoff with cap.
 * - On first 404 / "not found", disable the endpoint for
 *   `INITIAL_BACKOFF_MS`.
 * - On each subsequent 404 we observe once the backoff window elapses,
 *   double the delay up to `MAX_BACKOFF_MS`.
 * - On any successful call, reset the backoff so we're ready to fail
 *   fast again if the endpoint gets pulled.
 *
 * This replaces the previous behavior, which disabled the endpoint for
 * the whole session after a single 404. That was safe for operation
 * ("no noise") but meant a mid-shift deployment of the endpoint never
 * got picked up until the driver restarted the app.
 */

export const INITIAL_BACKOFF_MS = 10 * 60 * 1000; // 10 min
export const MAX_BACKOFF_MS = 60 * 60 * 1000;     // 60 min

interface EndpointState {
  disabledUntil: number | null;
  currentBackoffMs: number;
}

const state: EndpointState = {
  disabledUntil: null,
  currentBackoffMs: INITIAL_BACKOFF_MS,
};

export function shouldTryServerPricingEndpoint(now: number = Date.now()): boolean {
  if (state.disabledUntil === null) return true;
  return now >= state.disabledUntil;
}

export function resetServerPricingEndpointForTests(): void {
  state.disabledUntil = null;
  state.currentBackoffMs = INITIAL_BACKOFF_MS;
}

export function isMissingServerPricingEndpointError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('http 404') || normalized.includes('not found');
}

/**
 * Returns true when the error looks like a missing endpoint, in which
 * case the caller should treat the result as unavailable. The endpoint
 * is disabled until `now + currentBackoffMs`. If the endpoint was
 * already disabled and we got another 404, we double the backoff up to
 * the cap — this avoids relearning the same miss every few minutes.
 */
export function disableServerPricingEndpointIfMissing(
  error: unknown,
  now: number = Date.now(),
): boolean {
  if (!isMissingServerPricingEndpointError(error)) return false;

  // If we were outside the current backoff window when this 404 arrived,
  // it means we retried and got another miss → escalate.
  const outsideWindow = state.disabledUntil === null || now >= state.disabledUntil;
  if (outsideWindow && state.disabledUntil !== null) {
    state.currentBackoffMs = Math.min(state.currentBackoffMs * 2, MAX_BACKOFF_MS);
  }
  state.disabledUntil = now + state.currentBackoffMs;
  return true;
}

/**
 * Signal that the endpoint responded successfully. Resets the backoff
 * so the next miss starts from INITIAL_BACKOFF_MS again. Safe to call
 * repeatedly; cheap if already reset.
 */
export function markServerPricingEndpointAvailable(): void {
  if (state.disabledUntil === null && state.currentBackoffMs === INITIAL_BACKOFF_MS) {
    return;
  }
  state.disabledUntil = null;
  state.currentBackoffMs = INITIAL_BACKOFF_MS;
}

/** Diagnostics. Not used by production code. */
export function getServerPricingEndpointState(): Readonly<EndpointState> {
  return { ...state };
}
