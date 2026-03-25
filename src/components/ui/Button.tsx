/**
 * Button component matching mockup .bt classes.
 * Variants: primary, secondary, danger, success, small.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radii, sizes } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: colors.primary, text: colors.textOnPrimary },
  secondary: { bg: colors.cardLighter, text: colors.text },
  danger: { bg: colors.errorAlpha12, text: colors.error },
  success: { bg: colors.successAlpha12, text: colors.success },
};

export function Button({
  label, onPress, variant = 'primary', small = false,
  fullWidth = false, loading = false, disabled = false, icon, style,
}: ButtonProps) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        { backgroundColor: v.bg },
        small && styles.small,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {icon}
          <Text style={[small ? typography.buttonSmall : typography.button, { color: v.text }]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: radii.button,
    minHeight: sizes.buttonMinHeight,
  },
  small: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 7,
    minHeight: sizes.buttonSmMinHeight,
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
});
