/**
 * Transfer screen — F8: Transfer product between trucks.
 * Allows a driver to send/receive product from another unit.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';

export default function TransferScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Transferencias" showBack />
      <View style={styles.container}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🔄</Text>
        </View>
        <Text style={styles.title}>F8: Transferencia entre unidades</Text>
        <Text style={styles.subtitle}>Proximamente.</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Funcionalidad planificada</Text>
          <Text style={styles.infoText}>
            Transferir producto entre camiones en campo. El conductor origen
            selecciona productos y cantidades, el conductor destino confirma
            recepcion. Ambos inventarios se actualizan via sync.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    width: '100%',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 20,
  },
});
