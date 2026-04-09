/**
 * Supervisor screen — Supervisor dashboard to oversee team members.
 * Requires isSupervisor permission on the user's route config.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';

interface TeamMember {
  id: number;
  name: string;
  route: string;
  status: 'activo' | 'inactivo' | 'en_ruta';
  stopsCompleted: number;
  stopsTotal: number;
}

const MOCK_TEAM: TeamMember[] = [
  { id: 1, name: 'Carlos Lopez', route: 'R-Norte', status: 'en_ruta', stopsCompleted: 8, stopsTotal: 22 },
  { id: 2, name: 'Miguel Torres', route: 'R-Sur', status: 'en_ruta', stopsCompleted: 14, stopsTotal: 18 },
  { id: 3, name: 'Ana Rivera', route: 'R-Centro', status: 'activo', stopsCompleted: 0, stopsTotal: 25 },
  { id: 4, name: 'Pedro Sanchez', route: 'R-Oriente', status: 'inactivo', stopsCompleted: 0, stopsTotal: 20 },
];

const STATUS_COLORS: Record<TeamMember['status'], string> = {
  activo: '#22C55E',
  en_ruta: colors.primary,
  inactivo: '#6B7280',
};

const STATUS_LABELS: Record<TeamMember['status'], string> = {
  activo: 'Activo',
  en_ruta: 'En Ruta',
  inactivo: 'Inactivo',
};

export default function SupervisorScreen() {
  function renderMember({ item }: { item: TeamMember }) {
    const progress = item.stopsTotal > 0
      ? Math.round((item.stopsCompleted / item.stopsTotal) * 100)
      : 0;

    return (
      <View style={styles.memberCard}>
        <View style={styles.memberHeader}>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{item.name}</Text>
            <Text style={styles.memberRoute}>{item.route}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[item.status] + '20' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: STATUS_COLORS[item.status] },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: STATUS_COLORS[item.status] },
              ]}
            >
              {STATUS_LABELS[item.status]}
            </Text>
          </View>
        </View>
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${progress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>
            {item.stopsCompleted}/{item.stopsTotal} paradas
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Supervisor" showBack />
      <View style={styles.permissionBanner}>
        <Text style={styles.permissionText}>
          🔒 Requiere permiso isSupervisor
        </Text>
      </View>
      <FlatList
        data={MOCK_TEAM}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  permissionBanner: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  permissionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
  list: {
    padding: spacing.lg,
  },
  separator: {
    height: spacing.md,
  },
  memberCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  memberRoute: {
    fontSize: 13,
    color: colors.textDim,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.circle,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.bg,
    borderRadius: 3,
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: colors.textDim,
    minWidth: 80,
    textAlign: 'right',
  },
});
