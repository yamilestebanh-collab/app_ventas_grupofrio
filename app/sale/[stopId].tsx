/**
 * Sale screen — s-sale in mockup (lines 283-306).
 * Product lines with +/- qty, totals, payment method, mandatory photo.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useVisitStore, SaleLineItem } from '../../src/stores/useVisitStore';
import { useProductStore } from '../../src/stores/useProductStore';
import { SaveIndicator } from '../../src/components/ui/SaveIndicator';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { formatCurrency } from '../../src/utils/time';
import { takePhoto } from '../../src/services/camera';
import { ProductPicker } from '../../src/components/domain/ProductPicker';

export default function SaleScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const stops = useRouteStore((s) => s.stops);
  const stop = stops.find((s) => s.id === Number(stopId));
  const updateStopState = useRouteStore((s) => s.updateStopState);

  const {
    saleLines, salePaymentMethod, salePhotoTaken,
    updateSaleQty, setSalePayment, setPhase,
    saleSubtotal, saleTax, saleTotal, saleTotalKg,
  } = useVisitStore();

  const enqueue = useSyncStore((s) => s.enqueue);
  const isOnline = useSyncStore((s) => s.isOnline);

  const [pickerVisible, setPickerVisible] = React.useState(false);

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Venta" showBack />
        <View style={styles.center}>
          <Text style={typography.dim}>Parada no encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subtotal = saleSubtotal();
  const tax = saleTax();
  const total = saleTotal();
  const totalKg = saleTotalKg();
  const forecast = stop._koldForecast;

  // V1.2: Stock validation + anti-duplicate
  const { saleConfirmed, hasStockIssues, getStockIssues, lockSaleConfirm } = useVisitStore();
  const stockIssues = getStockIssues();
  const hasStock = !hasStockIssues();
  const canConfirm = saleLines.length > 0 && salePhotoTaken && salePaymentMethod
                     && hasStock && !saleConfirmed;

  async function handleConfirm() {
    if (saleConfirmed) return; // V1.2: Anti double-tap

    if (!hasStock) {
      Alert.alert(
        'Stock insuficiente',
        stockIssues.map((i) =>
          `${i.name}: pides ${i.requested}, disponible ${i.available}`
        ).join('\n'),
      );
      return;
    }

    if (!canConfirm) {
      const missing = [];
      if (saleLines.length === 0) missing.push('productos');
      if (!salePhotoTaken) missing.push('foto de entrega');
      if (!salePaymentMethod) missing.push('metodo de pago');
      Alert.alert('Faltan datos', `Completa: ${missing.join(', ')}`);
      return;
    }

    if (!stop) return;

    // V1.2: Lock to prevent duplicate
    const operationId = lockSaleConfirm();

    // Create sale order payload with idempotency key
    const payload = {
      _operationId: operationId,
      partner_id: stop.customer_id,
      stop_id: stop.id,
      payment_method: salePaymentMethod,
      lines: saleLines.map((l) => ({
        product_id: l.productId,
        qty: l.qty,
        price_unit: l.price,
      })),
      total,
      total_kg: totalKg,
      timestamp: Date.now(),
    };

    // Enqueue (idempotent — operationId prevents duplicates)
    enqueue('sale_order', payload);

    // V1.2: Deduct local inventory immediately
    const updateLocalStock = useProductStore.getState().updateLocalStock;
    saleLines.forEach((l) => updateLocalStock(l.productId, -l.qty));

    // Update stop state
    updateStopState(stop.id, 'done');
    setPhase('checked_out');

    // Navigate to checkout
    router.push(`/checkout/${stop.id}` as never);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Nueva Venta" showBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Customer + forecast hint */}
        <Text style={styles.customerName}>{stop.customer_name}</Text>
        {forecast && (
          <Text style={styles.forecastHint}>
            Sugerido KoldDemand: {forecast.predicted_kg.toFixed(0)} kg
          </Text>
        )}

        {/* Product lines */}
        {saleLines.length === 0 ? (
          <View style={styles.emptyProducts}>
            <Text style={typography.dim}>Agrega productos a la venta</Text>
            <Text style={[typography.dimSmall, { marginTop: 4 }]}>
              F4: Integración con catálogo de productos
            </Text>
          </View>
        ) : (
          saleLines.map((line) => (
            <View key={line.productId} style={styles.productLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{line.productName}</Text>
                <Text style={styles.productInfo}>
                  {formatCurrency(line.price)} · Stock: {line.stock}
                </Text>
              </View>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateSaleQty(line.productId, line.qty - 1)}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{line.qty}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateSaleQty(line.productId, line.qty + 1)}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Product picker */}
        <Button
          label="+ Agregar producto"
          variant="secondary"
          small
          fullWidth
          onPress={() => setPickerVisible(true)}
          style={{ marginVertical: 10 }}
        />
        <ProductPicker
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          existingProductIds={saleLines.map((l) => l.productId)}
        />

        {/* Totals card */}
        <Card style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>IVA (16%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(tax)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total kg</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>
              {totalKg.toFixed(1)} kg
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(total)}</Text>
          </View>
        </Card>

        {/* Payment method */}
        <View style={styles.paymentRow}>
          <Button
            label="💵 Efectivo"
            variant={salePaymentMethod === 'cash' ? 'primary' : 'secondary'}
            onPress={() => setSalePayment('cash')}
            style={{ flex: 1 }}
          />
          <Button
            label="💳 Crédito"
            variant={salePaymentMethod === 'credit' ? 'primary' : 'secondary'}
            onPress={() => setSalePayment('credit')}
            style={{ flex: 1 }}
          />
        </View>

        {/* Mandatory photo */}
        <Text style={styles.sectionTitle}>📸 Foto de entrega (obligatoria)</Text>
        {salePhotoTaken ? (
          <View style={styles.photoDone}>
            <Text style={{ fontSize: 28 }}>📸</Text>
            <Text style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}>
              ✓ Foto capturada
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.photoReq}
            onPress={async () => {
              const photo = await takePhoto();
              if (photo) {
                useVisitStore.getState().setSalePhoto(photo.localUri);
              } else {
                Alert.alert('Foto requerida', 'No se pudo capturar la foto. Intenta de nuevo.');
              }
            }}
          >
            <Text style={{ fontSize: 32 }}>📸</Text>
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
              Tomar foto de entrega
            </Text>
            <Text style={{ fontSize: 10, color: colors.textDim }}>
              Requerida para confirmar el pedido
            </Text>
          </TouchableOpacity>
        )}

        {/* V1.2: Stock issues warning */}
        {stockIssues.length > 0 && (
          <View style={styles.stockWarning}>
            <Text style={styles.stockWarningTitle}>⚠️ Stock insuficiente</Text>
            {stockIssues.map((issue) => (
              <Text key={issue.productId} style={styles.stockWarningLine}>
                {issue.name}: pides {issue.requested}, disponible {issue.available}
              </Text>
            ))}
          </View>
        )}

        {/* V1.2.1: Save status indicator */}
        {saleConfirmed && (
          <SaveIndicator status="saved_local" />
        )}

        {/* Confirm button */}
        <Button
          label={saleConfirmed ? '✓ Pedido Guardado' : '✓ Confirmar Pedido'}
          onPress={handleConfirm}
          fullWidth
          disabled={!canConfirm}
          loading={false}
          style={{ marginTop: saleConfirmed ? 0 : 14 }}
        />

        {/* Validation feedback */}
        {!canConfirm && saleLines.length > 0 && !saleConfirmed && (
          <Text style={styles.validationHint}>
            {!hasStock ? '⚠️ Ajusta cantidades al stock' : ''}
            {hasStock && !salePhotoTaken ? '📸 Toma la foto' : ''}
            {hasStock && salePhotoTaken && !salePaymentMethod ? '💰 Selecciona pago' : ''}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  customerName: { fontSize: 12, color: colors.textDim, marginBottom: 2 },
  forecastHint: { fontSize: 11, color: colors.primary, marginBottom: 14 },
  emptyProducts: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  // Product line (.pl in mockup)
  productLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.cardLighter,
    borderRadius: radii.button,
    marginBottom: 5,
  },
  productName: { fontSize: 13, fontWeight: '600', color: colors.text },
  productInfo: { fontSize: 11, color: colors.textDim },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, color: colors.text },
  qtyValue: {
    fontFamily: fonts.monoBold,
    fontSize: 15, fontWeight: '700', color: colors.text,
    minWidth: 24, textAlign: 'center',
  },
  // Totals
  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  totalLabel: { fontSize: 12, color: colors.textDim },
  totalValue: { fontFamily: fonts.monoBold, fontSize: 13, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 6 },
  grandTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  grandTotalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 22, fontWeight: '700', color: colors.success,
  },
  // Payment
  paymentRow: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  // Photo
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.7, color: colors.textDim, marginTop: 16, marginBottom: 8,
  },
  photoReq: {
    backgroundColor: colors.cardLighter,
    borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(37,99,235,0.3)',
    borderRadius: radii.card, padding: 28, alignItems: 'center', gap: 6,
  },
  photoDone: {
    backgroundColor: colors.cardLighter,
    borderWidth: 2, borderColor: colors.success,
    borderRadius: radii.card, padding: 14, alignItems: 'center', gap: 4,
  },
  validationHint: {
    fontSize: 11, color: colors.warning, textAlign: 'center', marginTop: 8,
  },
  // V1.2
  stockWarning: {
    backgroundColor: colors.errorAlpha08, borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)', borderRadius: radii.button,
    padding: 10, marginTop: 8,
  },
  stockWarningTitle: {
    fontSize: 12, fontWeight: '700', color: colors.error, marginBottom: 4,
  },
  stockWarningLine: {
    fontSize: 11, color: colors.error, lineHeight: 16,
  },
});
