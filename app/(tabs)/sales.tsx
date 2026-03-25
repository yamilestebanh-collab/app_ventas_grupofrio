/**
 * Sales tab — s-sales in mockup (lines 469-491).
 * Daily sales summary, KPIs, order list.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Button } from '../../src/components/ui/Button';
import { KPICard } from '../../src/components/ui/KPICard';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';

export default function SalesScreen() {
  const router = useRouter();

  // F8: These will come from aggregating sync queue + Odoo data
  const todaySales = 0;
  const todayKg = 0;
  const todayOrders = 0;
  const monthlyTarget = 0;
  const monthlyAchieved = 0;
  const progressPct = monthlyTarget > 0
    ? Math.round((monthlyAchieved / monthlyTarget) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar
        title="📊 Ventas del dia"
        rightAction={{
          label: '💰 Corte',
          onPress: () => router.push('/cashclose' as never),
        }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Button label="🏆 Ranking" variant="secondary" small
            onPress={() => router.push('/ranking' as never)} style={{ flex: 1 }} />
          <Button label="📈 Analiticas" variant="secondary" small
            onPress={() => router.push('/analytics' as never)} style={{ flex: 1 }} />
        </View>

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <KPICard label="VENDIDO" value={`$${todaySales.toLocaleString()}`}
                   valueColor={colors.success} />
          <KPICard label="META" value={monthlyTarget > 0 ? `$${(monthlyTarget/1000).toFixed(1)}k` : '--'}
                   subtitle={`${progressPct}%`} />
          <KPICard label="PEDIDOS" value={`${todayOrders}`} />
          <KPICard label="KG" value={`${todayKg}`} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressText}>{progressPct}% de meta diaria</Text>

        {/* Orders list */}
        <Text style={styles.sectionTitle}>PEDIDOS</Text>
        {todayOrders === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={typography.dim}>Sin pedidos registrados hoy</Text>
            <Text style={[typography.dimSmall, { marginTop: 4 }]}>
              Las ventas aparecen aqui al confirmar pedidos
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  progressBar: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressText: { fontSize: 10, color: colors.textDim, textAlign: 'center', marginBottom: 14 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card, padding: 20, alignItems: 'center',
  },
});
