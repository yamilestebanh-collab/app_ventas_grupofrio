/**
 * Home screen — s-home in mockup (lines 122-155).
 * Full implementation with real layout matching HTML.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SyncBar } from '../../src/components/ui/SyncBar';
import { KPICard } from '../../src/components/ui/KPICard';
import { AlertBanner } from '../../src/components/ui/AlertBanner';
import { StopCard } from '../../src/components/domain/StopCard';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useKoldStore, KoldAlert } from '../../src/stores/useKoldStore';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { useAsyncRefresh } from '../../src/hooks/useAsyncRefresh';
import { useProductStore } from '../../src/stores/useProductStore';
import { preloadRouteCustomerPrices } from '../../src/services/pricelist';

export default function HomeScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const employeeId = useAuthStore((s) => s.employeeId);
  const employeeName = useAuthStore((s) => s.employeeName);
  const companyId = useAuthStore((s) => s.companyId);
  const warehouseId = useAuthStore((s) => s.warehouseId);
  const {
    plan, stops, stopsCompleted, stopsTotal, progressPct,
    isLoading, loadPlan,
  } = useRouteStore();
  const isOnline = useSyncStore((s) => s.isOnline);
  const products = useProductStore((s) => s.products);
  const isLoadingProducts = useProductStore((s) => s.isLoading);
  const loadProducts = useProductStore((s) => s.loadProducts);

  // Reload on auth identity changes so a previous employee's in-memory state is not reused.
  useEffect(() => {
    if (isAuthenticated && isOnline) {
      void loadPlan();
    }
  }, [employeeId, isAuthenticated, isOnline, loadPlan]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline || !warehouseId || products.length > 0 || isLoadingProducts) {
      return;
    }
    void loadProducts(warehouseId);
  }, [isAuthenticated, isOnline, warehouseId, products.length, isLoadingProducts, loadProducts]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline || stops.length === 0 || products.length === 0) {
      return;
    }
    const partnerIds = stops.map((stop) => stop.customer_id);
    void preloadRouteCustomerPrices(partnerIds, products, { companyId });
  }, [isAuthenticated, isOnline, stops, products, companyId]);

  // BLD-20260408: Use getAlerts() method (not s.alerts property which doesn't exist)
  const getAlerts = useKoldStore((s) => s.getAlerts);
  const koldAlerts = useMemo(() => getAlerts() || [], [getAlerts]);
  const refreshPlan = useCallback(async () => {
    await loadPlan();
  }, [loadPlan]);
  const { refreshing, onRefresh } = useAsyncRefresh(refreshPlan);

  // Next stops (pending + in_progress, max 4)
  const nextStops = useMemo(() => 
    stops
      .filter((s) => ['pending', 'in_progress'].includes(s.state))
      .slice(0, 4)
  , [stops]);

  // Completed stops
  const doneStops = useMemo(() => stops.filter((s) => s.state === 'done'), [stops]);
  const todaySales = doneStops.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.clock}>9:41</Text>
        <Text style={styles.statusIcons}>📶 🔋 📍</Text>
      </View>

      {/* Sync bar */}
      <SyncBar />

      {/* Greeting + settings */}
      <View style={styles.greeting}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetLabel}>Buenos dias</Text>
          <Text style={styles.greetName}>{employeeName || 'Vendedor'}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/profile' as never)}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* BLD-20260408-P2: Weather card — no API available yet, show honest placeholder */}
        <View style={styles.weatherCard}>
          <Text style={{ fontSize: 22 }}>🌤️</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.weatherCity}>Clima no disponible</Text>
            <Text style={styles.weatherSub}>Proximamente en KOLD</Text>
          </View>
        </View>

        {/* KPI Grid 2x2 */}
        <View style={styles.kpiGrid}>
          <KPICard
            label="PARADAS"
            value={`${stopsTotal}`}
            subtitle={`${stopsCompleted} de ${stopsTotal}`}
          />
          <KPICard
            label="CARGAR"
            value="--"
            subtitle="kg estimados"
          />
          <KPICard
            label="VENTA HOY"
            value="$0"
            subtitle={`${todaySales} pedidos`}
            valueColor={colors.success}
          />
          <KPICard
            label="FORECAST"
            value="--"
            subtitle="F5: KoldDemand"
          />
        </View>

        {/* Intelligence alerts */}
        {koldAlerts.slice(0, 3).map((alert: KoldAlert, idx: number) => (
          <AlertBanner
            key={idx}
            icon={alert.type === 'critical' ? '🔴' : alert.type === 'warning' ? '🟡' : '🟢'}
            variant={alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'warning' : 'info'}
            message={alert.message}
          />
        ))}

        {/* Route map preview */}
        <Text style={styles.sectionTitle}>RUTA DEL DIA</Text>
        <TouchableOpacity
          style={styles.mapPreview}
          onPress={() => router.push('/map' as never)}
          activeOpacity={0.8}
        >
          <View style={styles.mapContent}>
            <Text style={styles.mapRouteName}>
              {plan?.route || plan?.name || 'Sin ruta asignada'}
            </Text>
            <Text style={styles.mapSub}>
              {stopsTotal} paradas · Toca para mapa
            </Text>
          </View>
        </TouchableOpacity>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressRow}>
            <Text style={typography.bodySmall}>Progreso</Text>
            <Text style={styles.progressValue}>{progressPct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>

        {/* Next stops */}
        <Text style={styles.sectionTitle}>PROXIMAS PARADAS</Text>
        {isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={typography.dim}>Cargando plan...</Text>
          </View>
        ) : nextStops.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={typography.dim}>
              {stopsTotal === 0
                ? 'Sin plan asignado para hoy'
                : 'Todas las paradas completadas 🎉'}
            </Text>
          </View>
        ) : (
          nextStops.map((stop, idx) => (
            <StopCard key={stop.id} stop={stop} index={idx} />
          ))
        )}

        {/* Done stops */}
        {doneStops.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>COMPLETADAS ({doneStops.length})</Text>
            {doneStops.slice(0, 2).map((stop, idx) => (
              <StopCard key={stop.id} stop={stop} index={idx} />
            ))}
            {doneStops.length > 2 && (
              <Text style={[typography.dim, { textAlign: 'center', marginBottom: 10 }]}>
                +{doneStops.length - 2} paradas mas
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  statusBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
  },
  clock: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  statusIcons: {
    fontSize: 11,
    color: colors.textDim,
  },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 6,
  },
  greetLabel: {
    fontSize: 12,
    color: colors.textDim,
  },
  greetName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: radii.button,
    marginBottom: 14,
    backgroundColor: 'rgba(37,99,235,0.04)',
  },
  weatherTemp: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  weatherCity: {
    fontSize: 10,
    color: colors.textDim,
  },
  weatherImpact: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  weatherSub: {
    fontSize: 9,
    color: colors.textDim,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.textDim,
    marginTop: 16,
    marginBottom: 8,
  },
  mapPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  mapContent: {
    alignItems: 'center',
  },
  mapRouteName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  mapSub: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 2,
  },
  progressContainer: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 14,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressValue: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 20,
    alignItems: 'center',
  },
});
