/**
 * GPS Map screen — Real-time GPS tracking of team members.
 * Requires isSupervisor permission. Uses react-native-maps (needs prebuild).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';

interface DriverPin {
  id: number;
  name: string;
  route: string;
  lastSeen: string;
}

const MOCK_DRIVERS: DriverPin[] = [
  { id: 1, name: 'Carlos Lopez', route: 'R-Norte', lastSeen: 'Hace 2 min' },
  { id: 2, name: 'Miguel Torres', route: 'R-Sur', lastSeen: 'Hace 5 min' },
  { id: 3, name: 'Ana Rivera', route: 'R-Centro', lastSeen: 'Hace 1 min' },
];

export default function GpsMapScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="GPS del Equipo" showBack />
      <View style={styles.container}>
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            🔒 Requiere permiso isSupervisor
          </Text>
        </View>

        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapIcon}>📍</Text>
          <Text style={styles.mapLabel}>Mapa GPS en tiempo real</Text>
          <Text style={styles.mapSublabel}>
            react-native-maps requiere expo prebuild
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Conductores</Text>
        {MOCK_DRIVERS.map((driver) => (
          <View key={driver.id} style={styles.driverRow}>
            <View style={styles.pinDot} />
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{driver.name}</Text>
              <Text style={styles.driverRoute}>{driver.route}</Text>
            </View>
            <Text style={styles.lastSeen}>{driver.lastSeen}</Text>
          </View>
        ))}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Funcionalidad</Text>
          <Text style={styles.infoText}>
            Posicion GPS en tiempo real de cada conductor. Los conductores
            reportan ubicacion cada 60 segundos via el servicio de background
            location. El supervisor puede ver la ultima posicion conocida y el
            historial de recorrido del dia.
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
    padding: spacing.lg,
  },
  permissionBanner: {
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderRadius: radii.button,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  permissionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  mapPlaceholder: {
    height: 180,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  mapIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  mapLabel: {
    fontSize: 14,
    color: colors.textDim,
    marginBottom: 4,
  },
  mapSublabel: {
    fontSize: 11,
    color: colors.textDim,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  driverRoute: {
    fontSize: 12,
    color: colors.textDim,
  },
  lastSeen: {
    fontSize: 12,
    color: colors.textDim,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 20,
  },
});
