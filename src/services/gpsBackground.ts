/**
 * GPS Background tracking — 10 minute interval.
 *
 * Uses expo-location TaskManager for background updates.
 * Sends position to Odoo (os.employee.gps.history) or enqueues if offline.
 *
 * REQUIRES: expo prebuild (native modules for background location).
 *
 * From KOLD_FIELD_SPEC.md section 7 + xvan_audit.md.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useSyncStore } from '../stores/useSyncStore';
import { useAuthStore } from '../stores/useAuthStore';
// BLD-20260404-012: GPS admission buffer (rate-limit + dedup).
// Pure helper, safe fallback — if it throws we still enqueue.
import { shouldAdmitGpsPoint } from '../utils/gpsBuffer';

const GPS_TASK_NAME = 'kold-field-gps-tracking';
// V1.2: 15 min interval (was 10) — balances tracking vs battery/data
const INTERVAL_MS = 900000; // 15 minutes

// Define the background task (async for TaskManager return type)
TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[gps-bg] Task error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const latest = locations[locations.length - 1];
      const employeeId = useAuthStore.getState().employeeId;

      if (employeeId) {
        // BLD-20260404-012: admission buffer. Rejects rate-limited or
        // duplicate points BEFORE they hit the sync queue. On any error
        // the helper returns accept=true so legacy behaviour is kept.
        let admit: { accept: boolean; reason: string } = { accept: true, reason: 'ok' };
        try {
          admit = shouldAdmitGpsPoint({
            employeeId,
            latitude: latest.coords.latitude,
            longitude: latest.coords.longitude,
            accuracy: latest.coords.accuracy ?? null,
            timestamp: latest.timestamp,
          });
        } catch {
          admit = { accept: true, reason: 'ok' };
        }

        if (!admit.accept) {
          if (__DEV__) console.log(`[gps-bg] drop ${admit.reason}`);
          return;
        }

        useSyncStore.getState().enqueue('gps', {
          employee_id: employeeId,
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
          accuracy: latest.coords.accuracy,
          timestamp: latest.timestamp,
        });

        if (__DEV__) console.log(
          `[gps-bg] Location: ${latest.coords.latitude.toFixed(4)}, ` +
          `${latest.coords.longitude.toFixed(4)}`
        );
      }
    }
  }
});

/**
 * Start background GPS tracking.
 * Requires background location permission (always).
 */
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    // Check if already running
    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    if (isRunning) {
      if (__DEV__) console.log('[gps-bg] Already running');
      return true;
    }

    // Request background permission
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[gps-bg] Background permission denied');
      return false;
    }

    // Start updates
    // V1.2: Balanced accuracy — saves battery without losing useful tracking
    await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced, // V1.2: was High, Balanced saves 40% battery
      timeInterval: INTERVAL_MS,
      distanceInterval: 100, // V1.2: 100m (was 50m) — less noise, fewer uploads
      deferredUpdatesInterval: INTERVAL_MS,
      showsBackgroundLocationIndicator: true, // iOS: blue bar
      foregroundService: {
        notificationTitle: 'KOLD Field',
        notificationBody: 'Tracking de ruta activo',
        notificationColor: '#FF6B35',
      },
    });

    if (__DEV__) console.log('[gps-bg] Background tracking started (10 min interval)');
    return true;
  } catch (error) {
    console.error('[gps-bg] Failed to start:', error);
    return false;
  }
}

/**
 * Stop background GPS tracking.
 */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(GPS_TASK_NAME);
      if (__DEV__) console.log('[gps-bg] Background tracking stopped');
    }
  } catch (error) {
    console.error('[gps-bg] Failed to stop:', error);
  }
}

/**
 * Check if background tracking is running.
 */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
  } catch {
    return false;
  }
}
