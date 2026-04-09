/**
 * Monitoring service for Kold Build Crew integration.
 *
 * Provides a structured snapshot of device/app state that can be
 * consumed by an external monitoring agent (Kold Build Crew).
 *
 * RULES:
 * - Monitoring NEVER blocks sync or business operations
 * - Monitoring data is P3 (telemetry) — lower than media (P2)
 * - sendMonitoringSnapshot is retry-safe and fire-and-forget
 * - Backend endpoint is NOT implemented yet — this is prep only
 */

import { useSyncStore } from '../stores/useSyncStore';
import { useProductStore } from '../stores/useProductStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useLocationStore } from '../stores/useLocationStore';
import { getErrorLog } from '../utils/logger';
import { getGpsMode } from './gps';

// ── Types ──

export interface MonitoringSnapshot {
  deviceId: string;
  employeeId: number | null;
  appVersion: string;
  capturedAt: string;
  sync: {
    pending: number;
    dead: number;
    lastSuccessAt: number | null;
  };
  gps: {
    queueSize: number;
    lastPointAt: number | null;
    mode: string;
  };
  inventory: {
    source: string | null;
    productCount: number;
    lastRefreshAt: number | null;
  };
  errors: {
    count: number;
    lastErrorAt: string | null;
  };
}

// ── Device ID ──

import { storeSave, storeLoad } from '../persistence/storage';

const DEVICE_ID_KEY = 'meta:deviceId';
let _cachedDeviceId: string | null = null;

/**
 * Get or generate a stable device ID.
 * Persisted to AsyncStorage so it survives app restarts.
 */
async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;

  const stored = await storeLoad<string>(DEVICE_ID_KEY);
  if (stored) {
    _cachedDeviceId = stored;
    return stored;
  }

  // Generate a simple unique ID (no crypto dependency needed)
  const id = `kf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await storeSave(DEVICE_ID_KEY, id);
  _cachedDeviceId = id;
  return id;
}

// ── Snapshot ──

const APP_VERSION = '2.0.0-pilot';

/**
 * Build a structured monitoring snapshot.
 * Lightweight — reads only from Zustand stores and in-memory state.
 */
export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const sync = useSyncStore.getState();
  const products = useProductStore.getState();
  const auth = useAuthStore.getState();
  const location = useLocationStore.getState();
  const errorLog = getErrorLog();
  const deviceId = await getDeviceId();

  // Find last GPS point timestamp from queue
  const gpsItems = sync.queue.filter((i) => i.type === 'gps');
  const pendingGps = gpsItems.filter((i) => i.status === 'pending').length;
  const lastGpsPoint = gpsItems.length > 0
    ? Math.max(...gpsItems.map((i) => i.created_at))
    : null;

  // Last error timestamp
  const lastError = errorLog.length > 0
    ? errorLog[errorLog.length - 1].ts
    : null;

  return {
    deviceId,
    employeeId: auth.employeeId,
    appVersion: APP_VERSION,
    capturedAt: new Date().toISOString(),
    sync: {
      pending: sync.queue.filter((i) => i.status === 'pending').length,
      dead: sync.queue.filter((i) => i.status === 'dead').length,
      lastSuccessAt: sync.lastSyncAt,
    },
    gps: {
      queueSize: pendingGps,
      lastPointAt: lastGpsPoint,
      mode: getGpsMode(),
    },
    inventory: {
      source: products.inventorySource,
      productCount: products.productCount,
      lastRefreshAt: products.lastSync,
    },
    errors: {
      count: errorLog.length,
      lastErrorAt: lastError,
    },
  };
}

// ── Send (prepared, not connected to backend) ──

/**
 * Send monitoring snapshot to Kold Build Crew.
 *
 * NOT IMPLEMENTED: backend endpoint does not exist yet.
 * This function is ready to be connected when the endpoint is deployed.
 *
 * Characteristics:
 * - Fire-and-forget (never throws)
 * - Does NOT use the sync queue (avoids polluting business P1)
 * - Has its own timeout (5s)
 * - Retry-safe: calling multiple times is harmless
 */
export async function sendMonitoringSnapshot(
  _endpointUrl?: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const snapshot = await getMonitoringSnapshot();

    // ──────────────────────────────────────────────
    // TODO: Activate when Build Crew endpoint is ready
    //
    // const url = endpointUrl || MONITORING_ENDPOINT;
    // const controller = new AbortController();
    // const timeout = setTimeout(() => controller.abort(), 5000);
    //
    // await fetch(url, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(snapshot),
    //   signal: controller.signal,
    // });
    //
    // clearTimeout(timeout);
    // ──────────────────────────────────────────────

    // For now, just log that it was prepared
    if (__DEV__) {
      console.log('[monitoring] snapshot prepared:', snapshot.sync.pending, 'pending,', snapshot.errors.count, 'errors');
    }

    return { sent: false, reason: 'endpoint_not_configured' };
  } catch {
    return { sent: false, reason: 'error' };
  }
}
