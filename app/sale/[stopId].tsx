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
import { useAuthStore } from '../../src/stores/useAuthStore';
import { SaveIndicator } from '../../src/components/ui/SaveIndicator';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { formatCurrency, formatPriceWithIVA } from '../../src/utils/time';
import { takePhoto } from '../../src/services/camera';
import { ProductPicker } from '../../src/components/domain/ProductPicker';
import { LeadConversionModal } from '../../src/components/domain/LeadConversionModal';

export default function SaleScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const stops = useRouteStore((s) => s.stops);
  const stop = stops.find((s) => s.id === Number(stopId));
  const updateStopState = useRouteStore((s) => s.updateStopState);
  const updateStopPartner = useRouteStore((s) => s.updateStopPartner);

  const {
    saleLines, salePaymentMethod, salePhotoTaken,
    updateSaleQty, setSalePayment, setPhase,
    saleSubtotal, saleTax, saleTotal, saleTotalKg,
  } = useVisitStore();

  const enqueue = useSyncStore((s) => s.enqueue);
  const isOnline = useSyncStore((s) => s.isOnline);
  const warehouseId = useAuthStore((s) => s.warehouseId);
  const employeeId = useAuthStore((s) => s.employeeId);

  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [leadModalVisible, setLeadModalVisible] = React.useState(false);
  // BLD-20260410: Tracks whether this stop's lead has already been converted
  // in this session (to avoid re-asking after a successful conversion).
  const [leadConverted, setLeadConverted] = React.useState(false);
  // BLD-20260410-UX: true when the modal was opened via the "Confirmar"
  // button (so we auto-continue the sale on success). False when the
  // vendor opened it eagerly via "Completar datos del lead ahora".
  const [continueAfterConvert, setContinueAfterConvert] = React.useState(false);
  // BLD-20260410-CRIT: Visit result for leads — drives the 3 possible outcomes:
  //   'sale'         → venta real, pagable
  //   'muestra'      → muestra sin costo, precios a 0
  //   'consignacion' → consignación, precios a 0, pago diferido
  type LeadResult = 'sale' | 'muestra' | 'consignacion';
  const [leadResult, setLeadResult] = React.useState<LeadResult>('sale');

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

  // BLD-20260410-LEAD2: Detect if this stop is a lead candidate.
  //
  // History:
  //   v1 used customer_rank===0 and blocked sales (false positive on
  //       real customers imported with rank=0 and no phone/RFC).
  //   v2 removed customer_rank entirely (BLD-20260410-HOTFIX). That
  //       broke lead-only routes because the backend does NOT send
  //       stop_kind/is_lead/lead_id in production yet — the only
  //       signal it gives for a lead is customer_rank=0.
  //
  // v3 (this one) brings customer_rank back as a SOFT classifier and
  // decouples the banner from the sale flow:
  //   - The "Completar lead" banner/button appears whenever there's a
  //     reasonable signal it's a lead.
  //   - The sale is NEVER blocked by this. The vendor may tap the
  //     button to complete data, or just confirm the sale directly.
  //     This avoids the old dead-end while still surfacing the CTA.
  //
  // Priority of signals (any one is enough):
  //   1. stop_kind === 'lead'                (canonical, Plan 2)
  //   2. is_lead === true                    (virtual/offroute flag)
  //   3. lead_id > 0 AND no customer_id      (pure lead stop)
  //   4. customer_rank === 0                 (soft fallback)
  const stopIsLead = !!stop && !leadConverted && (
    stop.stop_kind === 'lead' ||
    stop.is_lead === true ||
    (stop.lead_id != null && stop.lead_id > 0 && !(stop.customer_id > 0)) ||
    stop.customer_rank === 0
  );

  // BLD-20260410-LEAD2: one-shot diagnostic so we can see in the device
  // log what lead-related fields the backend is actually sending. Helps
  // Sebastián debug Plan 2 deployment without a new build.
  React.useEffect(() => {
    if (!stop) return;
    console.log(
      `[sale] stop=${stop.id} customer_id=${stop.customer_id} ` +
      `customer_rank=${stop.customer_rank} stop_kind=${stop.stop_kind} ` +
      `is_lead=${stop.is_lead} lead_id=${stop.lead_id} ` +
      `origin_lead_id=${stop.origin_lead_id} stopIsLead=${stopIsLead}`,
    );
  }, [stop?.id, stopIsLead]);

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

    // BLD-20260410-LEAD2: We NO LONGER block the sale on lead detection.
    // The previous behaviour dead-ended operators on real customers that
    // Odoo had imported with customer_rank=0 and no phone (could not
    // satisfy the modal's required fields). Now the "Completar lead"
    // button is opt-in — the vendor taps it before confirming if they
    // have the data, or proceeds with the sale if the data is already
    // in Odoo. The backend `/lead/convert` update-only path means the
    // sale itself doesn't need the modal to have run.

    // V1.2: Lock to prevent duplicate
    const operationId = lockSaleConfirm();

    // BLD-20260408-P0: Detect off-route sales (virtual stops have negative IDs)
    const isOffRoute = stop.id < 0 || !!stop.is_offroute;

    // BLD-20260410-CRIT: Ship enough context for gf_control_tower_v2 + backend
    // audit. Unknown fields are safely ignored by Odoo create.
    const payload = {
      _operationId: operationId,
      partner_id: stop.customer_id,
      stop_id: isOffRoute ? null : stop.id, // Don't send negative virtual IDs to backend
      is_offroute: isOffRoute,
      // BLD-20260410-BACKEND: Prefer the canonical lead_id stored in the
      // stop (set by plan/stops when stop_kind='lead'). Fall back to the
      // client-only origin_lead_id for offroute virtual stops.
      origin_lead_id: stop.lead_id ?? stop.origin_lead_id ?? null,
      lead_result: leadResult, // sale | muestra | consignacion (drives pricing)
      payment_method: salePaymentMethod,
      warehouse_id: warehouseId,
      employee_id: employeeId,
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

  function handleLeadConverted(newPartnerId: number) {
    if (!stop) return;
    // BLD-20260410-BACKEND: The backend /lead/convert endpoint can return a
    // fresh partner_id (the crm.lead just got promoted to a res.partner).
    // Bind it to the stop so the upcoming sale uses the correct partner.
    updateStopPartner(stop.id, newPartnerId, stop.customer_name);
    setLeadConverted(true);
    setLeadModalVisible(false);
    // BLD-20260410-LEAD2: modal is always opt-in now. The vendor stays on
    // the sale screen after conversion to keep building the order.
    setContinueAfterConvert(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Nueva Venta" showBack />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Customer + forecast hint */}
        <Text style={styles.customerName}>{stop.customer_name}</Text>
        {stopIsLead && (
          <View style={styles.leadBanner}>
            <Text style={styles.leadBannerIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.leadBannerTitle}>Lead sin convertir</Text>
              <Text style={styles.leadBannerText}>
                Captura los datos del propietario para convertirlo en cliente. Puedes hacerlo ahora o continuar la venta directamente.
              </Text>
              {/* BLD-20260410-UX: allow capturing lead data BEFORE the sale
                  is built. Vendors reported it was frustrating to type 10
                  product lines and only then discover that a RFC was
                  required. This button opens the same conversion modal
                  used on confirm, but eagerly. */}
              <TouchableOpacity
                style={styles.leadCompleteBtn}
                onPress={() => {
                  if (!isOnline) {
                    Alert.alert(
                      'Sin conexión',
                      'Necesitas internet para convertir el lead en cliente.',
                    );
                    return;
                  }
                  setLeadModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.leadCompleteBtnText}>
                  📝 Completar datos del lead ahora
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {stop.is_offroute && !stopIsLead && (
          <View style={styles.offrouteBadge}>
            <Text style={styles.offrouteBadgeText}>VENTA FUERA DE RUTA</Text>
          </View>
        )}
        {/* BLD-20260410-UX2: Siempre permitir editar/completar datos del
            cliente, incluso si NO es lead. Operadores reportaron que
            muchos res.partner importados en Odoo vienen con RFC vacío,
            dirección incompleta o sin régimen fiscal — y sin un punto
            de entrada visible no había forma de arreglarlo desde campo.
            Este botón abre el mismo modal de conversión, pero sobre un
            partner existente: actualiza los campos sin tocar customer_rank
            (salvo que el backend /lead/convert decida bumpearlo). */}
        {!stopIsLead && stop.customer_id > 0 && (
          <TouchableOpacity
            style={styles.editPartnerBtn}
            onPress={() => {
              if (!isOnline) {
                Alert.alert(
                  'Sin conexión',
                  'Necesitas internet para actualizar los datos del cliente.',
                );
                return;
              }
              setLeadModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.editPartnerBtnText}>
              ✏️ Completar / actualizar datos del cliente
            </Text>
          </TouchableOpacity>
        )}
        {forecast && (
          <Text style={styles.forecastHint}>
            Sugerido KoldDemand: {forecast.predicted_kg.toFixed(0)} kg
          </Text>
        )}

        {/* BLD-20260410-CRIT: Lead result selector — only for leads.
            Venta = pedido normal; Muestra = sin costo para demostrar producto;
            Consignación = producto dejado, pago diferido (precio 0 en Odoo,
            conciliación posterior). */}
        {stopIsLead && (
          <View style={styles.leadResultRow}>
            <Text style={styles.leadResultTitle}>Resultado de la visita al lead</Text>
            <View style={styles.leadResultButtons}>
              <TouchableOpacity
                style={[styles.leadResultBtn, leadResult === 'sale' && styles.leadResultBtnActive]}
                onPress={() => setLeadResult('sale')}
              >
                <Text style={styles.leadResultIcon}>💰</Text>
                <Text style={[styles.leadResultLabel, leadResult === 'sale' && styles.leadResultLabelActive]}>
                  Venta
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.leadResultBtn, leadResult === 'muestra' && styles.leadResultBtnActive]}
                onPress={() => setLeadResult('muestra')}
              >
                <Text style={styles.leadResultIcon}>🎁</Text>
                <Text style={[styles.leadResultLabel, leadResult === 'muestra' && styles.leadResultLabelActive]}>
                  Muestra
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.leadResultBtn, leadResult === 'consignacion' && styles.leadResultBtnActive]}
                onPress={() => setLeadResult('consignacion')}
              >
                <Text style={styles.leadResultIcon}>📦</Text>
                <Text style={[styles.leadResultLabel, leadResult === 'consignacion' && styles.leadResultLabelActive]}>
                  Consigna
                </Text>
              </TouchableOpacity>
            </View>
            {leadResult !== 'sale' && (
              <Text style={styles.leadResultHint}>
                {leadResult === 'muestra'
                  ? 'Los productos irán a $0 en Odoo. Se marcará como muestra.'
                  : 'Consignación: producto entregado sin cobro inmediato. Pago posterior.'}
              </Text>
            )}
          </View>
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
                  {formatPriceWithIVA(line.price)} c/IVA · Stock: {line.stock}
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
          partnerId={stop.customer_id}
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

      {/* BLD-20260410: Lead → customer conversion modal.
          BLD-20260410-UX2: Reusado también para editar customers existentes
          (cuando stopIsLead=false) — mismo endpoint, solo cambia la copy. */}
      <LeadConversionModal
        visible={leadModalVisible}
        stopId={stop.id}
        partnerId={stop.customer_id}
        leadId={stop.lead_id ?? stop.origin_lead_id}
        initialName={stop.customer_name}
        mode={stopIsLead ? 'lead' : 'edit-customer'}
        onClose={() => {
          setLeadModalVisible(false);
          setContinueAfterConvert(false);
        }}
        onConfirmed={handleLeadConverted}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  customerName: { fontSize: 12, color: colors.textDim, marginBottom: 2 },
  forecastHint: { fontSize: 11, color: colors.primary, marginBottom: 14 },
  // BLD-20260410: Lead + offroute visual cues
  leadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: radii.button,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  leadBannerIcon: { fontSize: 18 },
  leadBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  leadBannerText: {
    fontSize: 11,
    color: colors.warning,
    lineHeight: 15,
  },
  leadCompleteBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.button,
  },
  leadCompleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  // BLD-20260410-UX2: editable partner CTA (siempre visible para customers)
  editPartnerBtn: {
    alignSelf: 'stretch',
    marginBottom: 10,
    backgroundColor: colors.cardLighter,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  editPartnerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  // BLD-20260410-CRIT: Lead result selector
  leadResultRow: {
    backgroundColor: colors.cardLighter,
    borderRadius: radii.card,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leadResultTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textDim,
    marginBottom: 8,
  },
  leadResultButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  leadResultBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  leadResultBtnActive: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderColor: colors.primary,
  },
  leadResultIcon: { fontSize: 20 },
  leadResultLabel: { fontSize: 11, fontWeight: '600', color: colors.textDim },
  leadResultLabelActive: { color: colors.primary },
  leadResultHint: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 6,
    fontStyle: 'italic',
    lineHeight: 14,
  },
  offrouteBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37,99,235,0.15)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  offrouteBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.6,
  },
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
