/**
 * ScoreRing — conic gradient circle matching mockup .sr class.
 * Shows score 0-100 with colored arc.
 * Props: score, size, level (high/medium/low)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, sizes } from '../../theme/tokens';
import { fonts } from '../../theme/typography';

interface ScoreRingProps {
  score: number;
  size?: number;
  level?: 'high' | 'medium' | 'low';
}

const levelColors = {
  high: colors.success,
  medium: colors.warning,
  low: colors.error,
};

const levelBgAlpha = {
  high: colors.successAlpha08,
  medium: colors.warningAlpha08,
  low: colors.errorAlpha08,
};

/**
 * NOTE: React Native doesn't support conic-gradient natively.
 * This uses a solid ring with opacity to approximate the mockup.
 * For pixel-perfect conic gradient, use react-native-svg in F8.
 *
 * The visual effect is: colored border ring with score number inside.
 */
export function ScoreRing({ score, size = sizes.scoreRing, level }: ScoreRingProps) {
  const computedLevel = level || (score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low');
  const ringColor = levelColors[computedLevel];
  const bgColor = levelBgAlpha[computedLevel];
  const innerSize = size - 12; // 6px border on each side

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          borderWidth: 3,
          borderColor: ringColor,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
      >
        <Text style={[styles.value, { color: ringColor }]}>
          {Math.round(score)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    fontWeight: '700',
  },
});
