/**
 * Badge component matching mockup .bg class.
 * inline-flex, padding 3px 9px, border-radius 16px.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { badgeVariants, BadgeVariant, radii } from '../../theme/tokens';
import { typography } from '../../theme/typography';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: object;
}

export function Badge({ label, variant = 'dim', style }: BadgeProps) {
  const v = badgeVariants[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
      <Text style={[typography.badge, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.badge,
    alignSelf: 'flex-start',
  },
});
