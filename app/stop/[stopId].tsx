/**
 * Stop Detail screen — s-stop / s-beto in mockup.
 * F2: Shell with correct routing, customer context, and geo-fence bar.
 * F3: Full visit flow (check-in, sale, no-sale, checkout).
 *
 * NOTE: s-stop and s-beto are the SAME route.
 * UI renders conditionally based on:
 * 1. GPS distance (geo-fence)
 * 2. KoldScore category
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { GeoFenceBar } from '../../src/components/ui/GeoFenceBar';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { ScoreCard } from '../../src/components/domain/ScoreCard';
import { ForecastCard } from '../../src/components/domain/ForecastCard';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useKoldStore } from '../../src/stores/useKoldStore';
import { useLocationStore } from '../../src/stores/useLocationStore';
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function StopDetailScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const stops = useRouteStore((s) => s.stops);
  const stop = stops.find((s) => s.id === Number(stopId));

  // F7: Set geo-fence target for this customer
  const setTarget = useLocationStore((s) => s.setTarget);
  const locStatus = useLocationStore((s) => s.status);
  const realDistance = useLocationStore((s) => s.distanceMeters);
  const realIsWithin = useLocationStore((s) => s.isWithinFence);

  React.useEffect(() => {
    if (stop?.customer_latitude && stop?.customer_longitude) {
      setTarget(stop.customer_latitude, stop.customer_longitude);
    }
    return () => useLocationStore.getState().clearTarget();
  }, [stop?.id]);

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Parada" showBack />
        <View style={styles.center}>
          <Text style={typography.dim}>Parada no encontrada (ID: {stopId})</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasScore = !!stop._koldScore;
  const hasForecast = !!stop._koldForecast;
  // F7: Use real GPS distance, fallback to enriched values
  const isGeoOk = locStatus === 'ready' ? realIsWithin : (stop._geoFenceOk ?? false);
  const distance = locStatus === 'ready' ? (realDistance ?? 999) : (stop._distanceMeters ?? 999);
  const scoreModuleAvailable = useKoldStore((s) => s.scoreModuleAvailable);
  const demandModuleAvailable = useKoldStore((s) => s.demandModuleAvailable);
  const allowOffDistanceVisits = useAuthStore((s) => s.allowOffDistanceVisits);
  const canOperateOffDistance = allowOffDistanceVisits && !!(stop.customer_latitude && stop.customer_longitude);
  const canStartVisit = isGeoOk || canOperateOffDistance;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title={stop.customer_name} showBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Geo-fence indicator */}
        <GeoFenceBar isOk={isGeoOk} distanceMeters={distance} />

        {/* KoldScore card — actionable intelligence */}
        {hasScore ? (
          <ScoreCard score={stop._koldScore!} />
        ) : (
          <Card>
            <View style={styles.customerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={typography.screenTitle}>{stop.customer_name}</Text>
                {stop.customer_ref && (
                  <Text style={typography.dim}>Ref: {stop.customer_ref}</Text>
                )}
              </View>
            </View>
            {!scoreModuleAvailable && (
              <Text style={styles.moduleNote}>
                KoldScore no disponible. Instala el modulo para ver inteligencia comercial.
              </Text>
            )}
          </Card>
        )}

        {/* KoldDemand forecast — real data with V1 disclaimers */}
        {hasForecast ? (
          <ForecastCard forecast={stop._koldForecast!} />
        ) : demandModuleAvailable === false ? null : (
          <Card>
            <Text style={styles.sectionLabel}>🧊 FORECAST</Text>
            <Text style={styles.moduleNote}>
              {demandModuleAvailable === null
                ? 'Verificando modulo KoldDemand...'
                : 'Sin forecast para este cliente hoy.'}
            </Text>
          </Card>
        )}

        {/* Action buttons — real navigation */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.checkinBtn, !canStartVisit && { opacity: 0.4 }]}
            onPress={() => canStartVisit && router.push(`/checkin/${stop.id}` as never)}
            disabled={!canStartVisit}
            activeOpacity={0.8}
          >
            <Text style={styles.checkinText}>📍 Check-in · Iniciar Visita</Text>
          </TouchableOpacity>
          {canOperateOffDistance && !isGeoOk && (
            <Text style={styles.overrideHint}>
              Permiso activo: puedes operar fuera de rango para esta visita.
            </Text>
          )}
          <View style={styles.actionRow}>
            <Button
              label="🧾 Venta"
              variant="secondary"
              onPress={() => router.push(`/sale/${stop.id}` as never)}
              style={{ flex: 1 }}
              disabled={!canStartVisit}
            />
            <Button
              label="✕ No venta"
              variant="danger"
              onPress={() => router.push(`/nosale/${stop.id}` as never)}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.actionRow}>
            <Button
              label="⭐ Lealtad"
              variant="secondary"
              onPress={() => Alert.alert('Lealtad', 'F8: Programa de lealtad')}
              style={{ flex: 1 }}
            />
            <Button
              label="📖 Catalogo"
              variant="secondary"
              onPress={() => Alert.alert('Catalogo', 'Abre KoldWorld')}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {/* KoldScore action suggestion */}
        {hasScore && stop._koldScore!.action && (
          <Card>
            <Text style={styles.sectionLabel}>ACCION SUGERIDA</Text>
            <Text style={typography.body}>{stop._koldScore!.action}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  customerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  moduleNote: {
    fontSize: 11, color: colors.textDim, fontStyle: 'italic', marginTop: 6,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.textDim, marginBottom: 6,
  },
  forecastRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  forecastKg: {
    fontFamily: fonts.monoBold, fontSize: 22, fontWeight: '700', color: colors.text,
  },
  forecastProb: {
    fontFamily: fonts.monoBold, fontSize: 16, fontWeight: '700', color: colors.purple,
  },
  actions: { gap: 8, marginVertical: 14 },
  actionRow: { flexDirection: 'row', gap: 6 },
  checkinBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: radii.card,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  checkinText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  overrideHint: {
    fontSize: 11,
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: -2,
  },
});
