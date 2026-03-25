/**
 * Checkout screen — s-checkout in mockup (lines 679-787).
 * Visit summary, WhatsApp previews, next stop navigation.
 */

import React from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useVisitStore } from '../../src/stores/useVisitStore';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { formatElapsed, formatCurrency } from '../../src/utils/time';
import { checkOut } from '../../src/services/gfLogistics';
import { useLocationStore } from '../../src/stores/useLocationStore';

export default function CheckoutScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const stops = useRouteStore((s) => s.stops);
  const stop = stops.find((s) => s.id === Number(stopId));
  const updateStopState = useRouteStore((s) => s.updateStopState);

  const {
    elapsedSeconds, saleTotal, saleTotalKg, salePhotoTaken,
    checkInLat, checkInLon, resetVisit,
  } = useVisitStore();

  const latitude = useLocationStore((s) => s.latitude);
  const longitude = useLocationStore((s) => s.longitude);
  const enqueue = useSyncStore((s) => s.enqueue);
  const isOnline = useSyncStore((s) => s.isOnline);

  const [sendMessages, setSendMessages] = React.useState(true);
  const [sendEnCamino, setSendEnCamino] = React.useState(true);

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Check-out" showBack />
        <View style={styles.center}>
          <Text style={typography.dim}>Parada no encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Next stop
  const currentIdx = stops.findIndex((s) => s.id === stop.id);
  const nextStop = stops.find((s, i) => i > currentIdx && s.state === 'pending');

  const total = saleTotal();
  const totalKg = saleTotalKg();

  async function handleCheckout() {
    const lat = latitude || 0;
    const lon = longitude || 0;

    // Send checkout
    try {
      if (isOnline) {
        await checkOut(stop!.id, lat, lon);
      } else {
        enqueue('checkout', {
          stop_id: stop!.id,
          latitude: lat,
          longitude: lon,
          timestamp: Date.now(),
        });
      }
    } catch {
      enqueue('checkout', {
        stop_id: stop!.id,
        latitude: lat,
        longitude: lon,
        timestamp: Date.now(),
      });
    }

    // Update stop state
    updateStopState(stop!.id, 'done');

    // Reset visit store
    resetVisit();

    // Navigate to next stop or home
    if (nextStop && sendEnCamino) {
      router.replace(`/stop/${nextStop.id}` as never);
    } else {
      router.replace('/(tabs)' as never);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Check-out" showBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Success header */}
        <View style={styles.successHeader}>
          <Text style={{ fontSize: 44 }}>✅</Text>
          <Text style={styles.successTitle}>Visita completada</Text>
          <Text style={styles.successSub}>
            {stop.customer_name} · {formatElapsed(elapsedSeconds)}
          </Text>
        </View>

        {/* Visit summary card */}
        <Card>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Venta realizada</Text>
            <Text style={[styles.metricValue, { color: total > 0 ? colors.success : colors.textDim }]}>
              {total > 0 ? formatCurrency(total) : 'Sin venta'}
            </Text>
          </View>
          {totalKg > 0 && (
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>kg entregados</Text>
              <Text style={styles.metricValue}>{totalKg.toFixed(1)} kg</Text>
            </View>
          )}
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Foto de entrega</Text>
            {salePhotoTaken ? (
              <Badge label="✓ Capturada" variant="green" />
            ) : (
              <Badge label="Sin foto" variant="dim" />
            )}
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>GPS check-out</Text>
            <Badge
              label={latitude ? `✓ ${latitude.toFixed(4)}` : 'Sin GPS'}
              variant={latitude ? 'green' : 'dim'}
            />
          </View>
        </Card>

        {/* WhatsApp messages */}
        {total > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              📲 Mensajes automaticos a {stop.customer_name}
            </Text>

            {/* WA 1: Ticket digital */}
            <View style={[styles.waCard, styles.waGreen]}>
              <View style={styles.waHeader}>
                <Text style={{ fontSize: 18 }}>🧾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.waTitle, { color: colors.success }]}>
                    Ticket digital via WhatsApp
                  </Text>
                  <Text style={styles.waSub}>W21 · Se envia automaticamente</Text>
                </View>
                <Badge label="✓ Listo" variant="green" />
              </View>
              <View style={styles.waPreview}>
                <Text style={styles.waPreviewText}>
                  "🧊 KOLD · Grupo Frio{'\n'}
                  Ticket de venta #{'\n'}
                  Total: {formatCurrency(total)} MXN"
                </Text>
              </View>
            </View>

            {/* WA 2: Próxima visita */}
            <View style={[styles.waCard, styles.waCyan]}>
              <View style={styles.waHeader}>
                <Text style={{ fontSize: 18 }}>📅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.waTitle, { color: colors.cyan }]}>
                    Proxima visita
                  </Text>
                  <Text style={styles.waSub}>Se envia al confirmar check-out</Text>
                </View>
                <Badge label="Nuevo" variant="cyan" />
              </View>
            </View>

            {/* WA 3: Rating */}
            <View style={[styles.waCard, styles.waYellow]}>
              <View style={styles.waHeader}>
                <Text style={{ fontSize: 18 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.waTitle, { color: colors.warning }]}>
                    Calificacion de servicio
                  </Text>
                  <Text style={styles.waSub}>30 min despues de entrega</Text>
                </View>
                <Badge label="Nuevo" variant="yellow" />
              </View>
            </View>

            {/* Send toggle */}
            <View style={styles.toggleRow}>
              <Switch
                value={sendMessages}
                onValueChange={setSendMessages}
                trackColor={{ true: colors.primary }}
              />
              <Text style={styles.toggleLabel}>
                Enviar los 3 mensajes al cliente
              </Text>
            </View>
          </>
        )}

        {/* Next stop */}
        {nextStop && (
          <>
            <Text style={styles.sectionTitle}>📍 Siguiente parada</Text>
            <Card style={styles.nextStopCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <View style={styles.nextStopIcon}>
                  <Text style={{ fontSize: 20 }}>📍</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                    {nextStop.customer_name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textDim }}>
                    Siguiente en ruta
                  </Text>
                </View>
              </View>
              <View style={styles.toggleRow}>
                <Switch
                  value={sendEnCamino}
                  onValueChange={setSendEnCamino}
                  trackColor={{ true: colors.primary }}
                />
                <Text style={styles.toggleLabel}>
                  Enviar "voy en camino" a {nextStop.customer_name.split(' ')[0]}
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* Confirm checkout */}
        <View style={{ marginTop: 10 }}>
          <Button
            label={nextStop
              ? '✓ Confirmar Check-out y Navegar al Siguiente'
              : '✓ Confirmar Check-out'}
            variant="success"
            onPress={handleCheckout}
            fullWidth
          />
          {nextStop && (
            <Button
              label="Ir al inicio sin navegar"
              variant="secondary"
              onPress={() => {
                updateStopState(stop.id, 'done');
                resetVisit();
                router.replace('/(tabs)' as never);
              }}
              fullWidth
              style={{ marginTop: 6 }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  // Success header
  successHeader: { alignItems: 'center', paddingVertical: 16 },
  successTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 10 },
  successSub: { fontSize: 12, color: colors.textDim, marginTop: 3 },
  // Metric rows
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7,
  },
  metricLabel: { fontSize: 12, color: colors.textDim, flex: 1 },
  metricValue: {
    fontFamily: fonts.monoBold, fontSize: 13, fontWeight: '700', color: colors.text,
  },
  // Section title
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  // WhatsApp cards
  waCard: {
    borderRadius: radii.card, padding: 12, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 1,
  },
  waGreen: {
    backgroundColor: 'rgba(34,197,94,0.03)', borderColor: 'rgba(34,197,94,0.2)',
  },
  waCyan: {
    backgroundColor: 'rgba(6,182,212,0.03)', borderColor: 'rgba(6,182,212,0.2)',
  },
  waYellow: {
    backgroundColor: 'rgba(245,158,11,0.03)', borderColor: 'rgba(245,158,11,0.2)',
  },
  waHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waTitle: { fontSize: 12, fontWeight: '700' },
  waSub: { fontSize: 10, color: colors.textDim },
  waPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    padding: 10, paddingHorizontal: 12, marginTop: 8,
  },
  waPreviewText: { fontSize: 11, color: colors.textDim, fontStyle: 'italic', lineHeight: 16 },
  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6,
  },
  toggleLabel: { fontSize: 12, color: colors.textDim },
  // Next stop
  nextStopCard: {
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },
  nextStopIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.successAlpha08,
    alignItems: 'center', justifyContent: 'center',
  },
});
