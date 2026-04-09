/**
 * Cash Close screen — End-of-day cash settlement (Corte de Caja).
 *
 * BLD-20260408-P1: Currently a stub. Real values require backend integration
 * (endpoint to aggregate day's sales by payment method).
 * Shows "Proximamente" banner + live sync queue count as partial data.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';
import { useSyncStore } from '../src/stores/useSyncStore';
import { formatCurrency } from '../src/utils/time';

interface SummaryLine {
  label: string;
  value: string;
  highlight?: boolean;
}

export default function CashCloseScreen() {
  const [cashInHand, setCashInHand] = useState('');
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const totalItems = useSyncStore((s) => s.queue.length);

  // BLD-20260408-P1: Show real pending sync info, even if totals aren't connected yet
  const summaryLines: SummaryLine[] = [
    { label: 'Total Vendido', value: 'Proximamente' },
    { label: 'Efectivo', value: 'Proximamente' },
    { label: 'Credito', value: 'Proximamente' },
    { label: 'Devoluciones', value: 'Proximamente' },
    { label: 'Ops. sincronizadas', value: `${totalItems - pendingCount}/${totalItems}` },
    { label: 'Total a Liquidar', value: 'Proximamente', highlight: true },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Corte de Caja" showBack />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* BLD-20260408-P1: Stub banner */}
        <View style={styles.stubBanner}>
          <Text style={styles.stubIcon}>🚧</Text>
          <Text style={styles.stubText}>
            Corte de caja en desarrollo. Los totales se conectaran con el servidor en la proxima version.
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Resumen del Dia</Text>
          {summaryLines.map((line) => (
            <View key={line.label} style={styles.summaryRow}>
              <Text
                style={[
                  styles.summaryLabel,
                  line.highlight && styles.highlightLabel,
                ]}
              >
                {line.label}
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  line.highlight && styles.highlightValue,
                ]}
              >
                {line.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>Efectivo en Mano</Text>
          <Text style={styles.inputHint}>
            Cuenta el efectivo fisico y captura el total
          </Text>
          <TextInput
            style={styles.cashInput}
            placeholder="$0.00"
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
            value={cashInHand}
            onChangeText={setCashInHand}
          />
        </View>

        <View style={styles.differenceCard}>
          <Text style={styles.differenceLabel}>Diferencia</Text>
          <Text style={styles.differenceValue}>$0.00</Text>
          <Text style={styles.differenceHint}>
            Positivo = sobrante, Negativo = faltante
          </Text>
        </View>

        <Text style={styles.footerNote}>
          El corte se sincronizara con el servidor. El supervisor revisara las
          diferencias mayores a $50.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  summaryLabel: {
    fontSize: 15,
    color: colors.textDim,
  },
  summaryValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  highlightLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  highlightValue: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 17,
  },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  inputHint: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  cashInput: {
    backgroundColor: colors.bg,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  differenceCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  differenceLabel: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: spacing.xs,
  },
  differenceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  differenceHint: {
    fontSize: 11,
    color: colors.textDim,
  },
  footerNote: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
    textAlign: 'center',
  },
  stubBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: radii.button,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 8,
  },
  stubIcon: { fontSize: 20 },
  stubText: {
    flex: 1,
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
    lineHeight: 16,
  },
});
