/**
 * GPS service — real location with permissions.
 *
 * Uses expo-location for foreground location.
 * Handles all permission states explicitly.
 * Updates useLocationStore with real coordinates.
 *
 * PREBUILD NOTE: Background location (GPS tracking every 10 min)
 * requires expo-location background task which needs custom dev client.
 * V1 uses foreground-only location (works with Expo Go).
 * V2 will add background tracking.
 */

import * as Location from 'expo-location';
import { useLocationStore, LocationStatus } from '../stores/useLocationStore';

let watchSubscription: Location.LocationSubscription | null = null;

/**
 * Request location permissions and start watching.
 * Returns the initial status.
 */
export async function initializeGPS(): Promise<LocationStatus> {
  const store = useLocationStore.getState();

  try {
    store.setStatus('loading');

    // Check if location services are enabled
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      store.setStatus('unavailable', 'Servicios de ubicacion desactivados');
      return 'unavailable';
    }

    // Request foreground permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      store.setStatus('denied', 'Permiso de ubicacion denegado');
      return 'denied';
    }

    // Get initial position
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    store.setLocation(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy || 0
    );

    return 'ready';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error de GPS';
    store.setStatus('error', msg);
    return 'error';
  }
}

/**
 * Start watching position for real-time updates.
 * Updates useLocationStore on each change.
 */
export async function startLocationWatch(): Promise<void> {
  if (watchSubscription) return; // Already watching

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // 5 seconds
        distanceInterval: 5, // 5 meters
      },
      (position) => {
        useLocationStore.getState().setLocation(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy || 0
        );
      }
    );

    if (__DEV__) console.log('[gps] Watch started');
  } catch (error) {
    console.warn('[gps] Watch failed:', error);
  }
}

/**
 * Stop watching position.
 */
export function stopLocationWatch(): void {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
    if (__DEV__) console.log('[gps] Watch stopped');
  }
}

/**
 * Get current position once (for check-in/check-out).
 * Returns coordinates or null if unavailable.
 */
export async function getCurrentPosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
} | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const result = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
    };

    // Also update store
    useLocationStore.getState().setLocation(
      result.latitude, result.longitude, result.accuracy
    );

    return result;
  } catch {
    return null;
  }
}
