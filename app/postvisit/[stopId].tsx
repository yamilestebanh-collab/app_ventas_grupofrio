/**
 * Prospeccion screen — Datos de campo: competidor, freezer, interes
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Card } from '../../src/components/ui/Card';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';

export default function ProspeccionScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="📋 Prospeccion" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Card>
          <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>📋</Text>
          <Text style={[typography.body, { textAlign: 'center' }]}>Prospeccion</Text>
          <Text style={[typography.dim, { textAlign: 'center', marginTop: 4 }]}>
            Datos de campo: competidor, freezer, interes
          </Text>
          <Text style={[typography.dimSmall, { textAlign: 'center', marginTop: 8, fontStyle: 'italic' }]}>
            ID: stopId={}
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
});
