/**
 * TopBar with optional back button, matching mockup .tb class.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, sizes, radii } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import {
  buildEnvironmentLabel,
  getRuntimeAppEnvironment,
} from '../../config/appEnvironment.ts';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: { label: string; onPress: () => void };
  rightIcon?: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; accessibilityLabel?: string };
}

export function TopBar({ title, showBack = false, onBack, rightAction, rightIcon }: TopBarProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());
  const environment = getRuntimeAppEnvironment(
    Constants.expoConfig?.extra?.appEnvironment as string | undefined,
  );
  const environmentLabel = buildEnvironmentLabel(environment);

  return (
    <View style={styles.container}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: showBack ? sizes.backButton : 0 }} />
      )}

      <View style={styles.titleWrap}>
        <Text style={[typography.screenTitle, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        {environmentLabel ? (
          <View style={styles.environmentBadge}>
            <Text style={styles.environmentBadgeText}>{environmentLabel}</Text>
          </View>
        ) : null}
      </View>

      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress}>
          <Text style={styles.action}>{rightAction.label}</Text>
        </TouchableOpacity>
      ) : rightIcon ? (
        <TouchableOpacity
          onPress={rightIcon.onPress}
          accessibilityRole="button"
          accessibilityLabel={rightIcon.accessibilityLabel ?? 'Más opciones'}
        >
          <Ionicons name={rightIcon.name} size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 34 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: sizes.backButton,
    height: sizes.backButton,
    borderRadius: radii.circle,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  environmentBadge: {
    backgroundColor: colors.error,
    borderRadius: radii.badge,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  environmentBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  action: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
});
