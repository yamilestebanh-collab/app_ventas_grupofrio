/**
 * BLD-20260404-012 — GPS admission buffer (minimal scaffold).
 *
 * Purpose: sit in front of `useSyncStore.enqueue('gps', ...)` so we can,
 * without redesigning the GPS pipeline:
 *   1. Enforce a simple **rate limit** (min elapsed ms between accepted
 *      points per employee).
 *   2. **Dedupe** points that are effectively identical (same coords
 *      rounded to ~11 m, within a short window).
 *   3. Apply a **cap** on the number of pending GPS ops in the sync
 *      queue, so a multi-hour offline window cannot balloon the queue
 *      to tens of thousands of points.
 *   4. Provide a **safe fallback**: if anything throws, or the feature
 *      flag is off, the caller keeps the legacy behaviour (enqueue
 *      every point). Zero risk of breaking GPS tracking.
 *
 * Non-goals for this scaffold:
 *   - No batched uploads. The sync queue still sends one op per
 *     accepted point. Batching is a later ticket that will replace
 *     this buffer, not fight it.
 *   - No server-side contract change. Accepted points use the exact
 *     same payload shape as today.
 *   - No persistent dedup window. The last-accepted map is in-memory
 *     per process lifetime, which is fine for the rate-limit case
 *     and acceptable for the dedup case (worst case: one extra point
 *     after an app cold start).
 *
 * This module is pure helpers + a tiny in-memory state. No React,
 * no zustand, no AsyncStorage, no native deps. It is trivially
 * removable if we ever want to revert.
 */

// Feature flag — default ON because the buffer is strictly additive
// (rejects noisy/duplicated points that the backend would also reject).
// Flip to `false` to get the exact legacy behaviour (enqueue every point).
export const GPS_BUFFER_ENABLED = true;

// Minimum ms between two accepted points for the same employee.
// Must be <= the expo-location timeInterval so we never starve the
// legitimate cadence. gpsBackground.ts uses 15 min = 900_000 ms, so any
// value up to that is safe.
export const GPS_MIN_INTERVAL_MS = 60_000; // 1 minute

// Coordinate rounding precision for dedup (4 decimal places ≈ 11 m at
// the equator). Two points inside the same 11 m cell within the
// GPS_DEDUP_WINDOW_MS window are considered duplicates.
export const GPS_DEDUP_PRECISION = 4;
export const GPS_DEDUP_WINDOW_MS = 120_000; // 2 minutes

// Cap on GPS ops allowed to live pending in the sync queue. Once the
// cap is hit the buffer drops the oldest pending GPS point in the
// queue BEFORE inserting the new one. This is the only path that ever
// drops an already-queued point, and it only touches the `gps` type.
//
// Why 500?
//   - Native interval is 15 min → at most 4 points/hour/employee.
//   - A full 10 h working day produces ~40 points in the best case.
//   - With the rate-limit + dedup layers the effective rate is
//     bounded at ~1 point/min = 60 points/hour max.
//   - 500 points therefore represents ~8.3 h of uninterrupted
//     worst-case offline tracking, which is longer than a full shift.
//   - Beyond that window, the oldest points have the LEAST business
//     value (the route is already over) so evicting FIFO is safe.
//   - 500 is also small enough that the full queue + AsyncStorage
//     serialisation cost stays trivial (~40 KB).
// If we ever need a larger window, flip GPS_BUFFER_ENABLED=false OR
// raise this constant — no other code depends on the number.
export const GPS_QUEUE_CAP = 500;

// BLD-20260404-012 — in-process counters (telemetry only, not
// persisted). Purpose: quantify how often the buffer rejects points
// in production so we can tune thresholds without guessing. Reset on
// cold start or via resetGpsBufferState().
export const gpsBufferCounters = {
  admittedTotal: 0,
  rateLimitedTotal: 0,
  duplicateTotal: 0,
  invalidTotal: 0,
  flagOffTotal: 0,
  evictedByCapTotal: 0,
};

interface LastAcceptedPoint {
  tMs: number;
  latR: number; // rounded latitude
  lonR: number; // rounded longitude
}

// In-memory, per-process. Keys are employeeId (numeric) serialised.
const _lastAccepted: Map<string, LastAcceptedPoint> = new Map();

function roundCoord(v: number): number {
  const p = Math.pow(10, GPS_DEDUP_PRECISION);
  return Math.round(v * p) / p;
}

export interface GpsCandidate {
  employeeId: number | string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp?: number;
}

export type GpsAdmissionResult =
  | { accept: true; reason: 'ok' }
  | { accept: false; reason: 'flag-off' }
  | { accept: false; reason: 'rate-limited' }
  | { accept: false; reason: 'duplicate' }
  | { accept: false; reason: 'invalid' };

/**
 * Decide whether a GPS candidate should be admitted into the sync queue.
 * Pure function w.r.t. the inputs except for the in-memory last-accepted
 * map. Never throws. If any unexpected error occurs, returns accept=true
 * so the legacy behaviour is preserved.
 */
export function shouldAdmitGpsPoint(
  candidate: GpsCandidate,
  nowMs: number = Date.now(),
): GpsAdmissionResult {
  try {
    if (!GPS_BUFFER_ENABLED) {
      gpsBufferCounters.flagOffTotal += 1;
      return { accept: false, reason: 'flag-off' };
    }
    if (
      candidate == null ||
      typeof candidate.latitude !== 'number' ||
      typeof candidate.longitude !== 'number' ||
      Number.isNaN(candidate.latitude) ||
      Number.isNaN(candidate.longitude)
    ) {
      gpsBufferCounters.invalidTotal += 1;
      return { accept: false, reason: 'invalid' };
    }

    const key = String(candidate.employeeId ?? 'anon');
    const prev = _lastAccepted.get(key);
    const latR = roundCoord(candidate.latitude);
    const lonR = roundCoord(candidate.longitude);

    if (prev) {
      const dt = nowMs - prev.tMs;
      if (dt < GPS_MIN_INTERVAL_MS) {
        gpsBufferCounters.rateLimitedTotal += 1;
        if (__DEV__) {
          console.log(
            `[gpsBuffer] rate-limited emp=${key} dt=${dt}ms ` +
            `(total=${gpsBufferCounters.rateLimitedTotal})`,
          );
        }
        return { accept: false, reason: 'rate-limited' };
      }
      if (
        dt < GPS_DEDUP_WINDOW_MS &&
        prev.latR === latR &&
        prev.lonR === lonR
      ) {
        gpsBufferCounters.duplicateTotal += 1;
        if (__DEV__) {
          console.log(
            `[gpsBuffer] duplicate emp=${key} cell=${latR},${lonR} ` +
            `(total=${gpsBufferCounters.duplicateTotal})`,
          );
        }
        return { accept: false, reason: 'duplicate' };
      }
    }

    _lastAccepted.set(key, { tMs: nowMs, latR, lonR });
    gpsBufferCounters.admittedTotal += 1;
    return { accept: true, reason: 'ok' };
  } catch {
    // Hard fallback — if the buffer logic itself breaks, let the point
    // through so we never starve the GPS pipeline.
    return { accept: true, reason: 'ok' };
  }
}

/**
 * Reset in-memory state. Useful for tests and for logout flows.
 */
export function resetGpsBufferState(): void {
  _lastAccepted.clear();
  gpsBufferCounters.admittedTotal = 0;
  gpsBufferCounters.rateLimitedTotal = 0;
  gpsBufferCounters.duplicateTotal = 0;
  gpsBufferCounters.invalidTotal = 0;
  gpsBufferCounters.flagOffTotal = 0;
  gpsBufferCounters.evictedByCapTotal = 0;
}

/**
 * Given the current sync queue, decide whether we need to drop the
 * oldest pending GPS op to make room for a new one. Returns the id
 * of the item to drop, or null if no dropping is needed.
 *
 * Pure function: does not touch the queue itself.
 */
export function pickGpsOverflowVictim(
  queue: Array<{ id: string; type: string; status: string; created_at: number }>,
): string | null {
  try {
    // IMPORTANT: the filter restricts to type==='gps' AND status in
    // {pending, error}. We never touch 'syncing' (currently in flight),
    // 'done' (already uploaded), or any other sync type (sale_order,
    // checkin, checkout, photo, etc.). This is what makes cap eviction
    // safe across a mixed queue.
    const pendingGps = queue.filter(
      (i) => i.type === 'gps' && (i.status === 'pending' || i.status === 'error'),
    );
    if (pendingGps.length < GPS_QUEUE_CAP) return null;
    // Drop the oldest — its business value is lowest.
    pendingGps.sort((a, b) => a.created_at - b.created_at);
    const victimId = pendingGps[0]?.id ?? null;
    if (victimId) {
      gpsBufferCounters.evictedByCapTotal += 1;
      if (__DEV__) {
        console.log(
          `[gpsBuffer] evicted-by-cap id=${victimId} ` +
          `(total=${gpsBufferCounters.evictedByCapTotal})`,
        );
      }
    }
    return victimId;
  } catch {
    return null;
  }
}
