/**
 * Root layout — providers, fonts, auth guard.
 * From KOLD_FIELD_ADDENDUM.md Bloque 1.
 *
 * AUDIT FIX: Uses @expo-google-fonts instead of local .ttf placeholders.
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
import { hasAuthTokens } from '../src/services/api';
import { colors } from '../src/theme/tokens';
import { rehydrateAppState } from '../src/services/rehydrate';
import { startConnectivityMonitor, checkConnectivity } from '../src/services/connectivity';
import { initializeGPS, startLocationWatch } from '../src/services/gps';
import { startBackgroundTracking } from '../src/services/gpsBackground';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const segments = useSegments();
  const router = useRouter();

  // Load fonts from Google Fonts packages
  const [dmLoaded] = useDMSans({
    DMSans_300Light,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const [monoLoaded] = useSpaceMono({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const fontsLoaded = dmLoaded && monoLoaded;

  // Check stored auth + rehydrate + connectivity on mount
  useEffect(() => {
    async function initApp() {
      // 1. Check auth
      const hasTokens = await hasAuthTokens();
      if (hasTokens) {
        useAuthStore.setState({ isAuthenticated: true });
      }

      // 2. F6: Rehydrate persisted state
      if (hasTokens) {
        await rehydrateAppState();
      }

      // 3. F6: Start connectivity monitor
      startConnectivityMonitor();
      await checkConnectivity();

      // 4. F7: Initialize GPS (request permissions)
      if (hasTokens) {
        await initializeGPS();
        startLocationWatch();
        // V1.1: Start background tracking (10 min interval)
        // Requires expo prebuild — fails gracefully in Expo Go
        try {
          await startBackgroundTracking();
        } catch {
          console.log('[gps] Background tracking not available (needs prebuild)');
        }
      }

      setIsReady(true);
    }
    initApp();
  }, []);

  // Auth guard: redirect based on auth state
  useEffect(() => {
    if (!isReady || !fontsLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isReady, fontsLoaded, isAuthenticated, segments]);

  if (!isReady || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <Slot />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
