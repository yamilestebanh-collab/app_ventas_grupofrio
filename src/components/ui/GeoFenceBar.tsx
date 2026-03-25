/**
 * GeoFenceBar — green ok / red warning with distance.
 * From KOLD_FIELD_SPEC.md section 8.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../../theme/tokens';

interface GeoFenceBarProps {
  isOk: boolean;
  distanceMeters: number;
}

export function GeoFenceBar({ isOk, distanceMeters }: GeoFenceBarProps) {
  if (isOk) {
    return (
      <View style={[styles.bar, styles.ok]}>
        <Text style={[styles.text, { color: colors.success }]}>
          📍 GPS verificado · Estas a {distanceMeters}m (max 50m) ✓
        </Text>
      </View>
    );
  }

  const display = distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)}km`
    : `${Math.round(distanceMeters)}m`;

  return (
    <View style={[styles.bar, styles.warn]}>
      <Text style={[styles.text, { color: colors.error }]}>
        📍 Fuera de rango: {display}. Acercate a {'<'}50m
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    padding: 10,
    borderRadius: radii.button,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },
  ok: {
    backgroundColor: colors.successAlpha08,
    borderColor: 'rgba(34,197,94,0.15)',
  },
  warn: {
    backgroundColor: colors.errorAlpha08,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
