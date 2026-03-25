/**
 * Card component matching mockup .cd class.
 * background: card, border-radius: 14px, padding: 14-16px.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

interface CardProps {
  children: React.ReactNode;
  compact?: boolean;
  style?: ViewStyle;
}

export function Card({ children, compact = false, style }: CardProps) {
  return (
    <View style={[styles.card, compact && styles.compact, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.cardPaddingLg,
    marginBottom: spacing.cardGap,
  },
  compact: {
    padding: 10,
    borderRadius: radii.button,
    marginBottom: 6,
  },
});
