/**
 * Root layout — providers, fonts, auth guard.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts as useDMSans,
  DMSans_300Light,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  useFonts as useSpaceMono,
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useSyncStore } from '../src/stores/useSyncStore';
import { hasAuthTokens } from '../src/services/api';
import { colors } from '../src/theme/tokens';
// Importamos con cuidado estos servicios
import { rehydrateAppState } from '../src/services/rehydrate';
import { startConnectivityMonitor, checkConnectivity } from '../src/services/connectivity';
import { initializeGPS, startLocationWatch } from '../src/services/gps';
import { startBackgroundTracking } from '../src/services/gpsBackground';

// BLD-20260410-SYNCFIX: Periodic sync heartbeat. Before this, the queue
// only drained on an offline→online edge, so anything enqueued while the
// device was continuously online could sit pending forever (operators
// reported "las ventas no se pasan a Odoo"). The heartbeat runs every
// SYNC_HEARTBEAT_MS: if we are online and have pending/error items, it
// calls processQueue(). processQueue() is already idempotent and guards
// with isSyncing, so spamming is safe. Interval is short enough for the
// pilot to notice the sale land in Odoo within seconds but not so
// aggressive that it wastes battery.
const SYNC_HEARTBEAT_MS = 15_000;

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const segments = useSegments();
  const router = useRouter();

  // Load fonts
  const [dmLoaded, dmError] = useDMSans({
    DMSans_300Light,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const [monoLoaded, monoError] = useSpaceMono({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const fontsLoaded = dmLoaded && monoLoaded;

  useEffect(() => {
    async function initApp() {
      console.log('[Init] Starting app initialization...');
      try {
        // 1. Check auth tokens + restore employee data
        const hasTokens = await hasAuthTokens();
        console.log('[Init] Auth tokens found:', hasTokens);
        if (hasTokens) {
          // BLD-20260408-P0: Restore full employee state (employeeId, warehouseId, etc.)
          // from AsyncStorage. If essential fields are missing, force re-login.
          const authValid = await useAuthStore.getState().rehydrateAuth();
          if (!authValid) {
            console.warn('[Init] Auth tokens exist but employee data missing — forcing login');
            // Clear stale tokens so user gets login screen
            const { clearAuthTokens: clearTokens } = await import('../src/services/api');
            await clearTokens();
            // Don't set isAuthenticated — user will see login screen
          } else {
            // 2. Rehydrate other state (sync queue, route, products)
            console.log('[Init] Rehydrating app state...');
            await rehydrateAppState().catch(e => console.error('Rehydrate failed', e));

            // 3. GPS Initialization
            console.log('[Init] Initializing GPS...');
            await initializeGPS().catch(e => console.error('GPS init failed', e));
            startLocationWatch();

            try {
              await startBackgroundTracking();
            } catch (e) {
              console.log('[gps] Background tracking not available');
            }
          }
        }

        // 4. Connectivity monitor
        console.log('[Init] Starting connectivity monitor...');
        startConnectivityMonitor();
        await checkConnectivity().catch(e => console.log('Connectivity check failed'));

        // 5. BLD-20260410-SYNCFIX: periodic sync heartbeat.
        // See note at SYNC_HEARTBEAT_MS. Fire-and-forget; the callback
        // checks isOnline / pendingCount itself so we can call it blindly.
        setInterval(() => {
          const sync = useSyncStore.getState();
          if (!sync.isOnline) return;
          if (sync.isSyncing) return;
          if (sync.pendingCount === 0 && sync.errorCount === 0) return;
          try {
            sync.processQueue();
          } catch (e) {
            console.warn('[sync-heartbeat] processQueue threw', e);
          }
        }, SYNC_HEARTBEAT_MS);

      } catch (error) {
        console.error('[Init] Critical error during init:', error);
      } finally {
        console.log('[Init] App ready set to true');
        setIsReady(true);
      }
    }
    initApp();
  }, []);

  // Auth guard
  useEffect(() => {
    if (!isReady || !fontsLoaded) {
        console.log('[Guard] Waiting for ready/fonts...', { isReady, fontsLoaded });
        return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    console.log('[Guard] Current segments:', segments, 'IsAuthenticated:', isAuthenticated);

    if (!isAuthenticated && !inAuthGroup) {
      console.log('[Guard] Redirecting to login');
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('[Guard] Redirecting to tabs');
      router.replace('/(tabs)');
    }
  }, [isReady, fontsLoaded, isAuthenticated, segments]);

  if (!isReady || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors?.primary || '#000'} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors?.bg || '#000'} />
      <Slot />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
