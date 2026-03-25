/**
 * SaveIndicator — V1.2 clear feedback on operation status.
 *
 * Shows:
 *   ✓ Guardado localmente (green) — saved in queue
 *   🔄 Sincronizando... (orange) — uploading
 *   ✓ Sincronizado (green) — confirmed by server
 *   ⚠ Error, reintentando (red) — failed, will retry
 *
 * Used after sale confirm, no-sale save, etc.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radii } from '../../theme/tokens';

export type SaveStatus = 'saved_local' | 'syncing' | 'synced' | 'error';

interface SaveIndicatorProps {
  status: SaveStatus;
  compact?: boolean;
}

const statusConfig: Record<SaveStatus, { icon: string; text: string; color: string; bg: string }> = {
  saved_local: {
    icon: '💾',
    text: 'Guardado localmente',
    color: colors.success,
    bg: colors.successAlpha08,
  },
  syncing: {
    icon: '',
    text: 'Sincronizando...',
    color: colors.primary,
    bg: colors.primaryAlpha08,
  },
  synced: {
    icon: '✓',
    text: 'Sincronizado',
    color: colors.success,
    bg: colors.successAlpha08,
  },
  error: {
    icon: '⚠',
    text: 'Error, reintentando',
    color: colors.error,
    bg: colors.errorAlpha08,
  },
};

export function SaveIndicator({ status, compact = false }: SaveIndicatorProps) {
  const config = statusConfig[status];

  if (compact) {
    return (
      <View style={[styles.compact, { backgroundColor: config.bg }]}>
        {status === 'syncing' ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <Text style={{ color: config.color, fontSize: 12 }}>{config.icon}</Text>
        )}
        <Text style={[styles.compactText, { color: config.color }]}>
          {config.text}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: config.bg, borderColor: config.color + '30' }]}>
      {status === 'syncing' ? (
        <ActivityIndicator size="small" color={config.color} />
      ) : (
        <Text style={{ fontSize: 16 }}>{config.icon}</Text>
      )}
      <Text style={[styles.text, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radii.button,
    borderWidth: 1,
    marginVertical: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
