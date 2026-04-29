/**
 * AlertBanner matching mockup .ab class.
 * Variants: critical (red), warning (yellow), info (blue).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../../theme/tokens';

type AlertVariant = 'critical' | 'warning' | 'info' | 'success';

interface AlertBannerProps {
  message: string;
  variant?: AlertVariant;
  icon?: string;
}

const variantStyles: Record<AlertVariant, { bg: string; border: string; text: string }> = {
  critical: {
    bg: colors.errorAlpha08,
    border: 'rgba(239,68,68,0.15)',
    text: colors.error,
  },
  warning: {
    bg: colors.warningAlpha08,
    border: 'rgba(245,158,11,0.15)',
    text: colors.warning,
  },
  info: {
    bg: colors.infoAlpha08,
    border: 'rgba(59,130,246,0.15)',
    text: colors.info,
  },
  success: {
    bg: colors.successAlpha08,
    border: 'rgba(34,197,94,0.15)',
    text: colors.success,
  },
};

export function AlertBanner({ message, variant = 'info', icon }: AlertBannerProps) {
  const v = variantStyles[variant];
  return (
    <View style={[styles.banner, { backgroundColor: v.bg, borderColor: v.border }]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.text, { color: v.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 9,
    paddingHorizontal: 12,
    borderRadius: radii.button,
    borderWidth: 1,
    marginBottom: 8,
  },
  icon: {
    fontSize: 14,
    flexShrink: 0,
  },
  text: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
