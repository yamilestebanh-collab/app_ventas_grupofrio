/**
 * Alerts tab — s-alerts in mockup (lines 493-508).
 * Shows KoldScore alerts + demand alerts + operational alerts.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { AlertBanner } from '../../src/components/ui/AlertBanner';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { useKoldStore, KoldAlert } from '../../src/stores/useKoldStore';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { useRouteStore } from '../../src/stores/useRouteStore';

export default function AlertsScreen() {
  const router = useRouter();
  
  // BLD-20260408: Use getAlerts() method (not s.alerts property which doesn't exist)
  const getAlerts = useKoldStore((s) => s.getAlerts);
  const koldAlerts = useMemo(() => getAlerts() || [], [getAlerts]);
  
  const scoreAvailable = useKoldStore((s) => s.scoreModuleAvailable);
  const { pendingCount, errorCount } = useSyncStore();
  const { stopsTotal, stopsCompleted } = useRouteStore();

  const criticalAlerts = useMemo(() => koldAlerts.filter((a: KoldAlert) => a.type === 'critical'), [koldAlerts]);
  const warningAlerts = useMemo(() => koldAlerts.filter((a: KoldAlert) => a.type === 'warning'), [koldAlerts]);
  const opportunityAlerts = useMemo(() => koldAlerts.filter((a: KoldAlert) => a.type === 'opportunity'), [koldAlerts]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="🔔 Alertas" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Sync alerts */}
        {errorCount > 0 && (
          <AlertBanner
            icon="🔴"
            variant="critical"
            message={`${errorCount} operacion(es) con error de sincronizacion. Revisa en Sync.`}
          />
        )}
        {pendingCount > 0 && (
          <AlertBanner
            icon="🟡"
            variant="warning"
            message={`${pendingCount} operacion(es) pendientes de sincronizar.`}
          />
        )}

        {/* KoldScore alerts */}
        {scoreAvailable === false && (
          <View style={styles.moduleNote}>
            <Text style={typography.dim}>
              KoldScore no instalado. Las alertas de inteligencia comercial
              no estan disponibles.
            </Text>
          </View>
        )}

        {criticalAlerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>CRITICAS</Text>
            {criticalAlerts.map((alert: KoldAlert, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={[styles.alertCard, styles.alertCritical]}
                onPress={() => {
                  const stops = useRouteStore.getState().stops;
                  const stop = stops.find((s) => s.customer_id === alert.partnerId);
                  if (stop) router.push(`/stop/${stop.id}` as never);
                }}
              >
                <Text style={[styles.alertTitle, { color: colors.error }]}>
                  🔴 {alert.partnerName}
                  {alert.category ? ` — ${alert.category.replace('_', ' ')}` : ''}
                </Text>
                <Text style={styles.alertMessage}>{alert.message}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {warningAlerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ATENCION</Text>
            {warningAlerts.map((alert: KoldAlert, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={[styles.alertCard, styles.alertWarning]}
                onPress={() => {
                  const stops = useRouteStore.getState().stops;
                  const stop = stops.find((s) => s.customer_id === alert.partnerId);
                  if (stop) router.push(`/stop/${stop.id}` as never);
                }}
              >
                <Text style={[styles.alertTitle, { color: colors.warning }]}>
                  🟡 {alert.partnerName}
                </Text>
                <Text style={styles.alertMessage}>{alert.message}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {opportunityAlerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>OPORTUNIDADES</Text>
            {opportunityAlerts.map((alert: KoldAlert, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={[styles.alertCard, styles.alertOpportunity]}
                onPress={() => {
                  const stops = useRouteStore.getState().stops;
                  const stop = stops.find((s) => s.customer_id === alert.partnerId);
                  if (stop) router.push(`/stop/${stop.id}` as never);
                }}
              >
                <Text style={[styles.alertTitle, { color: colors.success }]}>
                  🟢 {alert.partnerName}
                </Text>
                <Text style={styles.alertMessage}>{alert.message}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Empty state */}
        {koldAlerts.length === 0 && pendingCount === 0 && errorCount === 0 && (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
            <Text style={typography.body}>Sin alertas activas</Text>
            <Text style={[typography.dimSmall, { marginTop: 4 }]}>
              {stopsCompleted}/{stopsTotal} paradas completadas
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  moduleNote: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: 14, marginBottom: 10,
  },
  alertCard: {
    borderRadius: radii.card, padding: 12, paddingHorizontal: 14,
    marginBottom: 8, gap: 3,
  },
  alertCritical: {
    backgroundColor: colors.errorAlpha08, borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  alertWarning: {
    backgroundColor: colors.warningAlpha08, borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
  },
  alertOpportunity: {
    backgroundColor: colors.successAlpha08, borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
  },
  alertTitle: { fontSize: 13, fontWeight: '700' },
  alertMessage: { fontSize: 11, color: colors.textDim, lineHeight: 16 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 30, alignItems: 'center', marginTop: 20,
  },
});
