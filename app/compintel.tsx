/**
 * Competitor Intelligence screen — Track competitor activity in the field.
 * Drivers report competitor brands, promotions, and affected points of sale.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';

interface CompetitorEntry {
  id: number;
  brand: string;
  type: string;
  pointsAffected: number;
}

const MOCK_COMPETITORS: CompetitorEntry[] = [
  { id: 1, brand: 'Competidor A', type: 'Precio agresivo', pointsAffected: 12 },
  { id: 2, brand: 'Competidor B', type: 'Producto nuevo', pointsAffected: 5 },
  { id: 3, brand: 'Competidor C', type: 'Promocion 2x1', pointsAffected: 8 },
];

export default function CompIntelScreen() {
  const totalDetected = MOCK_COMPETITORS.length;
  const totalBrands = new Set(MOCK_COMPETITORS.map((c) => c.brand)).size;
  const totalPoints = MOCK_COMPETITORS.reduce(
    (sum, c) => sum + c.pointsAffected,
    0,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Inteligencia Competitiva" showBack />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalDetected}</Text>
            <Text style={styles.statLabel}>Detectados</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalBrands}</Text>
            <Text style={styles.statLabel}>Marcas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalPoints}</Text>
            <Text style={styles.statLabel}>Pts. Afectados</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Actividad Reciente</Text>
        {MOCK_COMPETITORS.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <View style={styles.brandBadge}>
                <Text style={styles.brandText}>{entry.brand}</Text>
              </View>
              <Text style={styles.entryType}>{entry.type}</Text>
            </View>
            <View style={styles.entryFooter}>
              <Text style={styles.affectedText}>
                📍 {entry.pointsAffected} puntos afectados
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Reportar Competencia</Text>
          <Text style={styles.infoText}>
            Los conductores pueden reportar actividad competitiva durante sus
            visitas. Cada reporte incluye: marca competidora, tipo de actividad
            (precio, promocion, producto nuevo, exhibicion), evidencia
            fotografica, y punto de venta afectado. Los reportes se consolidan
            para el equipo comercial.
          </Text>
        </View>
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
  statsRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  entryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  brandBadge: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.circle,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  entryType: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  entryFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: spacing.sm,
  },
  affectedText: {
    fontSize: 13,
    color: colors.textDim,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 20,
  },
});
