/**
 * Print Ticket screen — Print receipt for a completed order.
 * Note: Bluetooth printer (ESC/POS) requires a custom dev client.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { colors, spacing, radii } from '../../src/theme/tokens';

export default function PrintTicketScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Imprimir Ticket" showBack />
      <View style={styles.container}>
        <View style={styles.ticketPreview}>
          <Text style={styles.ticketHeader}>KOLD FIELD</Text>
          <View style={styles.divider} />
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel}>Pedido</Text>
            <Text style={styles.ticketValue}>#{orderId ?? '---'}</Text>
          </View>
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel}>Fecha</Text>
            <Text style={styles.ticketValue}>--/--/----</Text>
          </View>
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel}>Cliente</Text>
            <Text style={styles.ticketValue}>---</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.ticketRow}>
            <Text style={styles.ticketLabel}>Total</Text>
            <Text style={styles.ticketTotal}>$0.00</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>🖨️ Impresora Bluetooth</Text>
          <Text style={styles.noticeText}>
            La impresion ESC/POS por Bluetooth requiere un custom dev client.
            No disponible en Expo Go. Librerias sugeridas:
            react-native-esc-pos-printer o react-native-thermal-receipt-printer.
          </Text>
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Acciones disponibles</Text>
          <View style={styles.actionRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.actionText}>
              Compartir ticket como imagen (Share API)
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.actionText}>
              Enviar por WhatsApp al cliente
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.actionText}>
              Imprimir via Bluetooth (requiere dev client)
            </Text>
          </View>
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
    padding: spacing.lg,
  },
  ticketPreview: {
    backgroundColor: '#FAFAFA',
    borderRadius: radii.button,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  ticketHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: spacing.sm,
    borderStyle: 'dashed',
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  ticketLabel: {
    fontSize: 13,
    color: '#666',
  },
  ticketValue: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  ticketTotal: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '700',
  },
  notice: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderRadius: radii.button,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  noticeText: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 20,
  },
  actionsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
  },
  actionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  bullet: {
    color: colors.primary,
    fontSize: 14,
    marginRight: spacing.sm,
    lineHeight: 20,
  },
  actionText: {
    fontSize: 14,
    color: colors.textDim,
    lineHeight: 20,
    flex: 1,
  },
});
