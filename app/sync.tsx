/**
 * Sync screen — queue visibility and management.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { colors, spacing, radii } from '../src/theme/tokens';
import { typography, fonts } from '../src/theme/typography';
import { useSyncStore } from '../src/stores/useSyncStore';
import { SyncQueueItem } from '../src/types/sync';

const typeIcons: Record<string, string> = {
  sale_order: '🧾', checkin: '📍', checkout: '📍', photo: '📸',
  no_sale: '✕', payment: '💰', prospection: '📋', gps: '🛰',
};

const typeLabels: Record<string, string> = {
  sale_order: 'Venta', checkin: 'Check-in', checkout: 'Check-out',
  photo: 'Foto', no_sale: 'No venta', payment: 'Cobro',
  prospection: 'Operacion', gps: 'GPS',
};

const statusBadge: Record<string, { label: string; variant: 'yellow' | 'green' | 'red' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'yellow' },
  syncing: { label: 'Sincronizando', variant: 'orange' },
  done: { label: '✓ Listo', variant: 'green' },
  error: { label: 'Error', variant: 'red' },
};

export default function SyncScreen() {
  const { queue, isOnline, isSyncing, pendingCount, errorCount, processQueue, clearDone } = useSyncStore();

  const pending = queue.filter((i) => i.status === 'pending' || i.status === 'syncing');
  const errors = queue.filter((i) => i.status === 'error');
  const done = queue.filter((i) => i.status === 'done').slice(-10); // Last 10

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="🔄 Sincronizacion" showBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={[styles.statusBar, isOnline ? styles.online : styles.offline]}>
          <Text style={styles.statusText}>
            {isOnline ? '🟢 En linea' : '🟡 Sin conexion'}
            {pendingCount > 0 ? ` · ${pendingCount} pendientes` : ''}
            {errorCount > 0 ? ` · ${errorCount} errores` : ''}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
          <Button
            label="🔄 Reintentar"
            variant="primary"
            small
            onPress={() => processQueue()}
            disabled={!isOnline || pendingCount === 0}
            style={{ flex: 1 }}
          />
          <Button
            label="🗑 Limpiar"
            variant="secondary"
            small
            onPress={() => clearDone()}
            style={{ flex: 1 }}
          />
        </View>

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>PENDIENTES ({pending.length})</Text>
            {pending.map((item) => (
              <SyncItem key={item.id} item={item} />
            ))}
          </>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>CON ERROR ({errors.length})</Text>
            {errors.map((item) => (
              <SyncItem key={item.id} item={item} />
            ))}
          </>
        )}

        {/* Done */}
        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>COMPLETADOS (ultimos 10)</Text>
            {done.map((item) => (
              <SyncItem key={item.id} item={item} />
            ))}
          </>
        )}

        {/* Empty */}
        {queue.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
            <Text style={typography.body}>Cola vacia</Text>
            <Text style={[typography.dimSmall, { marginTop: 4 }]}>
              Todas las operaciones sincronizadas
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SyncItem({ item }: { item: SyncQueueItem }) {
  const icon = typeIcons[item.type] || '📦';
  const label = typeLabels[item.type] || item.type;
  const badge = statusBadge[item.status] || statusBadge.pending;
  const time = new Date(item.created_at).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={styles.syncItem}>
      <View style={[styles.syncIcon, item.status === 'done' ? styles.iconDone : styles.iconPending]}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.syncLabel}>{label}</Text>
        <Text style={styles.syncTime}>
          {time}
          {item.retries > 0 ? ` · Intento ${item.retries}/3` : ''}
          {item.error_message ? ` · ${item.error_message}` : ''}
        </Text>
      </View>
      <Badge label={badge.label} variant={badge.variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  statusBar: {
    padding: 10, borderRadius: radii.button, alignItems: 'center',
    marginBottom: 14, borderWidth: 1,
  },
  online: { backgroundColor: colors.successAlpha08, borderColor: 'rgba(34,197,94,0.15)' },
  offline: { backgroundColor: colors.warningAlpha08, borderColor: 'rgba(245,158,11,0.15)' },
  statusText: { fontSize: 12, fontWeight: '600', color: colors.text },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  syncItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: colors.card, borderRadius: radii.button, marginBottom: 6,
  },
  syncIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  iconPending: { backgroundColor: colors.warningAlpha12 },
  iconDone: { backgroundColor: colors.successAlpha12 },
  syncLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  syncTime: { fontSize: 11, color: colors.textDim },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 30, alignItems: 'center', marginTop: 20,
  },
});
