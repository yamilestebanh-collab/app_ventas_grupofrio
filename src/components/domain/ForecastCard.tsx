/**
 * ForecastCard — KoldDemand forecast visualization.
 * Matches mockup s-stop forecast section (lines 237-241).
 *
 * Shows: predicted kg, confidence badge, range bar, explanation.
 * CLEARLY marks V1 limitations when data is estimated.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KoldForecastData } from '../../types/kold';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { colors, radii } from '../../theme/tokens';
import { fonts } from '../../theme/typography';

interface ForecastCardProps {
  forecast: KoldForecastData;
}

const confidenceBadge: Record<string, { label: string; variant: 'green' | 'yellow' | 'red' }> = {
  high: { label: '🟢 Alta confianza', variant: 'green' },
  medium: { label: '🟡 Media', variant: 'yellow' },
  low: { label: '🔴 Baja confianza', variant: 'red' },
};

export function ForecastCard({ forecast }: ForecastCardProps) {
  const conf = confidenceBadge[forecast.confidence_level] || confidenceBadge.medium;
  const rangeWidth = forecast.upper_bound > 0
    ? Math.min(100, Math.round((forecast.predicted_kg / forecast.upper_bound) * 100))
    : 50;

  return (
    <Card>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧊 FORECAST HOY</Text>
        <Badge label={conf.label} variant={conf.variant} />
      </View>

      {/* Main value */}
      <View style={styles.valueRow}>
        <Text style={styles.mainValue}>{forecast.predicted_kg.toFixed(0)}</Text>
        <Text style={styles.valueUnit}>kg esperados</Text>
      </View>

      {/* Range bar */}
      <View style={styles.rangeBar}>
        <View style={[styles.rangeFill, { width: `${rangeWidth}%` }]} />
      </View>
      <View style={styles.rangeLabels}>
        <Text style={styles.rangeText}>
          Rango: {forecast.lower_bound.toFixed(0)}–{forecast.upper_bound.toFixed(0)} kg
        </Text>
        <Text style={styles.rangeText}>
          P(compra): {(forecast.probability_of_purchase * 100).toFixed(0)}%
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Explanation */}
      {forecast.explanation_text ? (
        <Text style={styles.explanation}>{forecast.explanation_text}</Text>
      ) : (
        <Text style={styles.explanation}>
          📦 Base estimada · V1: proxy basado en historial de ventas
        </Text>
      )}

      {/* V1 disclaimer if low confidence */}
      {forecast.confidence_level === 'low' && (
        <Text style={styles.disclaimer}>
          ⚠ Confianza baja: datos limitados. Use el rango como referencia.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  mainValue: {
    fontFamily: fonts.monoBold,
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  valueUnit: {
    fontSize: 14,
    color: colors.textDim,
  },
  rangeBar: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  rangeFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rangeText: {
    fontSize: 10,
    color: colors.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 10,
  },
  explanation: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
  },
  disclaimer: {
    fontSize: 10,
    color: colors.warning,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
