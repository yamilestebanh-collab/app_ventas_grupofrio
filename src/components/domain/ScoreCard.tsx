/**
 * ScoreCard — KoldScore summary with actionable insight.
 * Shows: score ring, category badge, priority, action text.
 * Matches mockup s-stop score section (line 236).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KoldScoreData, KoldCategory } from '../../types/kold';
import { Badge, } from '../ui/Badge';
import { ScoreRing } from '../ui/ScoreRing';
import { Card } from '../ui/Card';
import { colors } from '../../theme/tokens';
import { BadgeVariant } from '../../theme/tokens';

interface ScoreCardProps {
  score: KoldScoreData;
  compact?: boolean;
}

const categoryDisplay: Record<KoldCategory, { label: string; variant: BadgeVariant; emoji: string }> = {
  joya: { label: 'JOYA', variant: 'green', emoji: '💎' },
  premium: { label: 'PREMIUM', variant: 'green', emoji: '⭐' },
  diamante_en_bruto: { label: 'DIAMANTE', variant: 'cyan', emoji: '💎' },
  en_peligro: { label: 'EN PELIGRO', variant: 'red', emoji: '🔴' },
  trampa_operativa: { label: 'TRAMPA OP.', variant: 'dim', emoji: '⚠️' },
  recuperacion: { label: 'RECUPERACION', variant: 'red', emoji: '🔄' },
  oportunidad_inmediata: { label: 'OPORTUNIDAD', variant: 'blue', emoji: '🎯' },
  bajo_retorno: { label: 'BAJO RET.', variant: 'dim', emoji: '📉' },
  estable: { label: 'ESTABLE', variant: 'dim', emoji: '✅' },
  revisar: { label: 'REVISAR', variant: 'dim', emoji: '🔍' },
};

const priorityDisplay: Record<string, { label: string; variant: BadgeVariant }> = {
  critica: { label: 'CRITICA', variant: 'red' },
  alta: { label: 'ALTA', variant: 'orange' },
  media: { label: 'MEDIA', variant: 'dim' },
  baja: { label: 'BAJA', variant: 'dim' },
  monitoreo: { label: 'MONITOREO', variant: 'dim' },
};

export function ScoreCard({ score, compact = false }: ScoreCardProps) {
  const cat = categoryDisplay[score.category] || categoryDisplay.revisar;
  const pri = priorityDisplay[score.priority] || priorityDisplay.monitoreo;

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <ScoreRing score={score.score_master} size={40} />
        <View style={styles.compactBadges}>
          <Badge label={cat.label} variant={cat.variant} />
          <Badge label={pri.label} variant={pri.variant} />
        </View>
      </View>
    );
  }

  return (
    <Card>
      <View style={styles.headerRow}>
        <ScoreRing score={score.score_master} size={50} />
        <View style={styles.headerInfo}>
          <View style={styles.badges}>
            <Badge label={cat.label} variant={cat.variant} />
            <Badge label={pri.label} variant={pri.variant} />
          </View>
          {score.action && (
            <Text style={styles.actionHint} numberOfLines={1}>
              Accion: {score.action}
            </Text>
          )}
        </View>
      </View>

      {/* Actionable insight */}
      {score.explanation_text && (
        <Text style={styles.explanation} numberOfLines={3}>
          {score.explanation_text}
        </Text>
      )}

      {/* V1 note */}
      {score.score_master === 0 && (
        <Text style={styles.v1Note}>
          Score aun no calculado. Se actualiza con el cron de KoldScore.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  badges: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  actionHint: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  explanation: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
    marginTop: 10,
  },
  v1Note: {
    fontSize: 10,
    color: colors.warning,
    fontStyle: 'italic',
    marginTop: 6,
  },
  // Compact variant
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactBadges: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
});
