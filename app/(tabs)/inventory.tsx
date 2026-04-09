/**
 * Inventory tab — s-inv in mockup (lines 323-348).
 * Truck stock overview, product list, action buttons.
 */

import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { AlertBanner } from '../../src/components/ui/AlertBanner';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useProductStore } from '../../src/stores/useProductStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { formatPriceWithIVA } from '../../src/utils/time';

export default function InventoryScreen() {
  const router = useRouter();
  const warehouseId = useAuthStore((s) => s.warehouseId);
  const {
    products, totalStockKg, isLoading, error, loadProducts,
  } = useProductStore();

  useEffect(() => {
    if (warehouseId && products.length === 0) {
      loadProducts(warehouseId);
    }
  }, [warehouseId]);

  // Forecast total for route (F5: real aggregation)
  const forecastKg = 0; // Placeholder until KoldDemand integration
  const bufferKg = totalStockKg - forecastKg;
  const bufferPct = totalStockKg > 0 ? Math.round((bufferKg / totalStockKg) * 100) : 0;
  const fillPct = forecastKg > 0 && totalStockKg > 0
    ? Math.min(100, Math.round((forecastKg / totalStockKg) * 100))
    : 0;

  // Low stock warnings
  const lowStockProducts = products.filter((p) => p.qty_available > 0 && p.qty_available <= 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="📦 Camioneta" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Stock summary card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Stock total</Text>
              <Text style={styles.summaryValue}>{totalStockKg} kg</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>Forecast ruta</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {forecastKg > 0 ? `${forecastKg} kg` : '-- kg'}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          {forecastKg > 0 && (
            <>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${fillPct}%` }]} />
              </View>
              <Text style={styles.bufferText}>
                Buffer: {bufferKg} kg ({bufferPct}%)
                {bufferPct >= 20 ? ' — ✅ Suficiente' : ' — ⚠️ Bajo'}
              </Text>
            </>
          )}

          {forecastKg === 0 && (
            <Text style={[styles.bufferText, { marginTop: 8 }]}>
              F5: Forecast de ruta desde KoldDemand
            </Text>
          )}
        </Card>

        {/* Low stock warnings */}
        {lowStockProducts.map((p) => (
          <AlertBanner
            key={p.id}
            icon="⚠️"
            variant="warning"
            message={`${p.name}: solo quedan ${p.qty_available} unidades`}
          />
        ))}

        {/* Product list */}
        <Text style={styles.sectionTitle}>DETALLE DE CARGA</Text>
        {isLoading ? (
          <Card><Text style={typography.dim}>Cargando productos...</Text></Card>
        ) : error ? (
          <AlertBanner icon="❌" variant="critical" message={error} />
        ) : products.length === 0 ? (
          <Card>
            <Text style={typography.dim}>Sin productos en camioneta</Text>
            <Text style={[typography.dimSmall, { marginTop: 4 }]}>
              Carga productos con "Solicitar Carga"
            </Text>
          </Card>
        ) : (
          products
            .filter((p) => p.qty_available > 0)
            .map((p) => (
              <View key={p.id} style={styles.productRow}>
                <Text style={styles.productName} numberOfLines={1}>
                  {p.name.includes('Hielo') || p.name.includes('Barra') ? '🧊 ' : '🥤 '}
                  {p.name}
                </Text>
                <View style={styles.productRight}>
                  <Text style={styles.productPrice}>
                    {formatPriceWithIVA(p.list_price)}
                  </Text>
                  <Text style={styles.productQty}>
                    {p.qty_display} disp. · {p._totalKg.toFixed(0)}kg
                  </Text>
                </View>
              </View>
            ))
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Button
            label="📥 Solicitar Carga"
            onPress={() => router.push('/refill' as never)}
            style={{ flex: 1 }}
          />
          <Button
            label="📤 Devolucion"
            variant="secondary"
            onPress={() => router.push('/unload' as never)}
            style={{ flex: 1 }}
          />
        </View>
        <Button
          label="🔄 Transferencias"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/transfer' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  // Summary card
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 11, color: colors.textDim },
  summaryValue: {
    fontFamily: fonts.monoBold, fontSize: 24, fontWeight: '700', color: colors.text,
  },
  progressBar: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3, overflow: 'hidden', marginTop: 10,
  },
  progressFill: {
    height: '100%', borderRadius: 3, backgroundColor: colors.success,
  },
  bufferText: { fontSize: 10, color: colors.textDim, marginTop: 4 },
  // Section
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  // Product rows
  productRow: {
    backgroundColor: colors.card, borderRadius: radii.button,
    padding: 10, paddingHorizontal: 14, marginBottom: 5,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  productName: { flex: 1, fontSize: 13, color: colors.text, marginRight: 8 },
  productRight: { alignItems: 'flex-end' },
  productPrice: {
    fontFamily: fonts.monoBold, fontSize: 13, fontWeight: '700', color: colors.primary,
  },
  productQty: {
    fontFamily: fonts.monoBold, fontSize: 11, fontWeight: '500', color: colors.textDim,
    marginTop: 1,
  },
  // Actions
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 8 },
});
