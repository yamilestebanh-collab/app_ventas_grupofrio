/**
 * RegaloProductoScreen — Registrar regalo / muestra de producto.
 *
 * FLUJO:
 *  1. Chofer llega desde /stop/:stopId con visit_line_id y mobile_location_id
 *     disponibles en el stop y en el plan respectivamente.
 *  2. Agrega líneas (producto + qty).
 *  3. Escribe observaciones opcionales.
 *  4. Toca "Registrar Regalo" → POST /gf/salesops/gift/create.
 *  5. En éxito: Alert de confirmación → router.back().
 *  6. En error: Alert descriptivo por código de error conocido.
 *
 * NOTAS DE BACKEND:
 *  - mobile_location_id = plan.mobile_location_id (stock.location.id, NOT warehouse_id).
 *    Se expone en POST /gf/logistics/api/employee/my_plan como data.mobile_location_id.
 *  - visit_line_id = stop.visit_line_id (salesperson.visit.line.id, campo legacy).
 *    Se expone en plan/stops como stops[].visit_line_id (alias de legacy_visit_line_id).
 *    Puede ser null en paradas no bridged y en visitas offroute.
 *  - analytic_account_id = employeeAnalyticPlazaId (plaza/sucursal activa del empleado).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography, fonts } from '../../src/theme/typography';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useProductStore, TruckProduct } from '../../src/stores/useProductStore';
import { createGift, GiftErrorCode, GiftCreateFailure } from '../../src/services/gfLogistics';
import { logInfo } from '../../src/utils/logger';

// ─── UUID helper (same pattern as useSyncStore) ───────────────────────────────

function makeUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface GiftLineItem {
  productId: number;
  productName: string;
  qty: number;
  stock: number; // qty_display at the moment of selection
}

// ─── Error code → human-readable message ─────────────────────────────────────

function describeGiftError(failure: GiftCreateFailure): string {
  switch (failure.code) {
    case 'VALIDATION_ERROR':
      return `Error de validación:\n${failure.message}`;
    case 'FORBIDDEN':
      return 'Esta van no está autorizada para la sucursal activa. Contacta al administrador.';
    case 'SERVER_MISCONFIG':
      return 'Falta configuración en Odoo para registrar regalos (merma o picking type). Avisa al administrador.';
    case 'LOCKED': {
      const seconds = failure.retryAfterSeconds ?? 10;
      return `La van está siendo utilizada en este momento. Reintenta en ${seconds} segundo${seconds !== 1 ? 's' : ''}.`;
    }
    case 'SERVER_ERROR':
      return `Error interno del servidor:\n${failure.message}`;
    default:
      return failure.message || 'Error desconocido al registrar el regalo.';
  }
}

// ─── GiftPickerModal ──────────────────────────────────────────────────────────
// Simplified product picker — no customer pricing, no visit-store integration.
// Calls onSelect({ productId, productName, stock }) so the gift screen owns
// the state entirely.

interface PickerProduct extends TruckProduct {
  isAlreadyAdded: boolean;
}

interface GiftPickerModalProps {
  visible: boolean;
  onClose: () => void;
  existingProductIds: number[];
  onSelect: (product: { productId: number; productName: string; qty: number; stock: number }) => void;
}

function GiftPickerModal({ visible, onClose, existingProductIds, onSelect }: GiftPickerModalProps) {
  const products = useProductStore((s) => s.products);
  const hasStockData = useProductStore((s) => s.hasStockData);
  const inventorySource = useProductStore((s) => s.inventorySource);
  const isGlobalFallback = inventorySource === 'global_legacy';

  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const showAll = hasStockData === false || hasStockData === null || isGlobalFallback;

  const enriched: PickerProduct[] = useMemo(() => {
    return products.map((p) => ({
      ...p,
      isAlreadyAdded: existingProductIds.includes(p.id),
    }));
  }, [products, existingProductIds]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enriched.filter((p) => {
      if (!showAll && p.qty_display <= 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.default_code ?? '').toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      if (a.qty_display > 0 && b.qty_display <= 0) return -1;
      if (a.qty_display <= 0 && b.qty_display > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [enriched, search, showAll]);

  const setQty = useCallback((productId: number, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  }, []);

  function handleSelect(p: PickerProduct) {
    if (p.isAlreadyAdded) return;
    const qty = quantities[p.id] ?? 1;
    onSelect({ productId: p.id, productName: p.name, qty, stock: p.qty_display });
    setSearch('');
    setQuantities({});
    onClose();
  }

  function renderItem({ item: p }: { item: PickerProduct }) {
    const outOfStock = p.qty_display <= 0;
    const disabled = outOfStock || p.isAlreadyAdded;
    const qty = quantities[p.id] ?? 1;

    return (
      <TouchableOpacity
        style={[pickerStyles.row, disabled && pickerStyles.rowDisabled]}
        onPress={() => !disabled && handleSelect(p)}
        activeOpacity={disabled ? 1 : 0.7}
        disabled={disabled}
      >
        <View style={{ flex: 1 }}>
          <Text style={[pickerStyles.name, disabled && pickerStyles.dimText]} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={[pickerStyles.stock, outOfStock && pickerStyles.redText]}>
            {p.isAlreadyAdded
              ? 'Ya en la lista'
              : outOfStock
                ? 'Agotado'
                : `${p.qty_display} disponibles`}
          </Text>
        </View>

        {!disabled && (
          <View style={pickerStyles.qtyRow}>
            <TouchableOpacity style={pickerStyles.qtyBtn} onPress={() => setQty(p.id, -1)}>
              <Text style={pickerStyles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={pickerStyles.qtyVal}>{qty}</Text>
            <TouchableOpacity style={pickerStyles.qtyBtn} onPress={() => setQty(p.id, +1)}>
              <Text style={pickerStyles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={pickerStyles.modal}>
        {/* Header */}
        <View style={pickerStyles.header}>
          <Text style={typography.screenTitle}>Seleccionar Producto</Text>
          <TouchableOpacity
            onPress={() => { setSearch(''); setQuantities({}); onClose(); }}
          >
            <Text style={pickerStyles.closeBtn}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {/* Fallback banner */}
        {isGlobalFallback && (
          <View style={pickerStyles.fallbackBanner}>
            <Text style={pickerStyles.fallbackText}>
              Inventario global — stock puede no reflejar tu unidad
            </Text>
          </View>
        )}

        {/* Search */}
        <View style={pickerStyles.searchWrap}>
          <TextInput
            style={pickerStyles.searchInput}
            placeholder="Buscar por nombre o código..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity style={pickerStyles.clearBtn} onPress={() => setSearch('')}>
              <Text style={pickerStyles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Count */}
        <View style={pickerStyles.countBar}>
          <Text style={pickerStyles.countText}>
            {filtered.filter((p) => p.qty_display > 0 && !p.isAlreadyAdded).length} disponibles
          </Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={pickerStyles.list}
          initialNumToRender={20}
          ListEmptyComponent={
            <View style={pickerStyles.emptyCard}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>📦</Text>
              <Text style={typography.dim}>
                {search ? `Sin resultados para "${search}"` : 'No hay productos disponibles'}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RegaloProductoScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();

  // Store data
  const stops = useRouteStore((s) => s.stops);
  const plan = useRouteStore((s) => s.plan);
  const employeeAnalyticPlazaId = useAuthStore((s) => s.employeeAnalyticPlazaId);
  const isLoadingProducts = useProductStore((s) => s.isLoading);

  const stop = stops.find((s) => s.id === Number(stopId));

  // Local state
  const [giftLines, setGiftLines] = useState<GiftLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  // ─── Guard: stop not found ───────────────────────────────────────────────

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Registrar Regalo" showBack />
        <View style={styles.center}>
          <Text style={typography.dim}>Parada no encontrada (ID: {stopId})</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Derived data ────────────────────────────────────────────────────────

  // partner_id: prefer enriched _partnerId (lead bridge), fall back to customer_id
  const partnerId = stop._partnerId ?? stop.customer_id;

  // mobile_location_id: plan.mobile_location_id (stock.location from gf.route.location_en_ruta_id)
  // Backend will populate this once the backend change lands (see architecture note in spec).
  const mobileLocationId = plan?.mobile_location_id ?? null;

  // visit_line_id: optional legacy reference, can be null for non-bridged stops
  const visitLineId = typeof stop.visit_line_id === 'number' ? stop.visit_line_id : null;

  const existingProductIds = useMemo(
    () => giftLines.map((l) => l.productId),
    [giftLines],
  );

  const hasValidLines = giftLines.length > 0 && giftLines.every((l) => l.qty > 0);
  const canSubmit = hasValidLines && !isSubmitting;

  // ─── Line management ─────────────────────────────────────────────────────

  function handleProductSelect(product: { productId: number; productName: string; qty: number; stock: number }) {
    setGiftLines((prev) => {
      // Prevent duplicates (picker already blocks them, but guard here too)
      if (prev.some((l) => l.productId === product.productId)) return prev;
      return [...prev, {
        productId: product.productId,
        productName: product.productName,
        qty: Math.max(1, product.qty),
        stock: product.stock,
      }];
    });
  }

  function updateQty(productId: number, delta: number) {
    setGiftLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, qty: Math.max(1, l.qty + delta) }
          : l,
      ),
    );
  }

  function removeLine(productId: number) {
    setGiftLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!stop) return; // TypeScript narrowing — guaranteed by the early-return guard above

    // Guard: analytic_account_id (sucursal del empleado)
    if (!employeeAnalyticPlazaId) {
      Alert.alert(
        'Sin plaza asignada',
        'Tu empleado no tiene una plaza (sucursal) configurada. Contacta al administrador.',
      );
      return;
    }

    // Guard: mobile_location_id (ubicación de van en ruta)
    if (!mobileLocationId) {
      Alert.alert(
        'Van sin ubicación móvil',
        'No se encontró la ubicación de la van en el plan de ruta. ' +
        'Asegúrate de que el plan esté activo o contacta al administrador.',
      );
      return;
    }

    setIsSubmitting(true);

    const idempotencyKey = makeUuid();

    logInfo('general', 'gift_submit', {
      stop_id: stop.id,
      partner_id: partnerId,
      mobile_location_id: mobileLocationId,
      visit_line_id: visitLineId,
      analytic_account_id: employeeAnalyticPlazaId,
      idempotency_key: idempotencyKey,
      line_count: giftLines.length,
    });

    const result = await createGift({
      analyticAccountId: employeeAnalyticPlazaId,
      idempotencyKey,
      mobileLocationId,
      partnerId,
      visitLineId,
      lines: giftLines.map((l) => ({ product_id: l.productId, qty: l.qty })),
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (result.ok) {
      Alert.alert(
        '🎁 Regalo registrado',
        `${result.userMessage}\n\nFolio: ${result.giftName}`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } else {
      const userMsg = describeGiftError(result);
      // LOCKED = pipeline lock (van ocupada) — se puede reintentar.
      // El resto son errores de datos o configuración que no se resuelven reintentando.
      const isRetryable = result.code === 'LOCKED';

      Alert.alert(
        'No se pudo registrar el regalo',
        userMsg,
        isRetryable
          ? [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Reintentar', onPress: handleSubmit },
            ]
          : [{ text: 'Entendido' }],
      );
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Registrar Regalo" showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Customer */}
          <Text style={styles.customerName}>{stop.customer_name}</Text>
          {visitLineId === null && (
            <Text style={styles.offlineHint}>
              Parada sin referencia de visita legacy — el regalo se registrará sin visit_line_id.
            </Text>
          )}

          {/* ── Productos a regalar ── */}
          <Text style={styles.sectionTitle}>PRODUCTOS A REGALAR</Text>

          {giftLines.length === 0 ? (
            <View style={styles.emptyLines}>
              <Text style={typography.dim}>Agrega al menos un producto</Text>
            </View>
          ) : (
            giftLines.map((line) => (
              <View key={line.productId} style={styles.giftLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{line.productName}</Text>
                  <Text style={styles.lineStock}>
                    Stock disponible: {line.stock > 0 ? line.stock : '—'}
                  </Text>
                </View>

                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQty(line.productId, -1)}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{line.qty}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQty(line.productId, +1)}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeLine(line.productId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {isLoadingProducts && giftLines.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.dim, { marginLeft: 8 }]}>Cargando productos...</Text>
            </View>
          ) : (
            <Button
              label="+ Agregar producto"
              variant="secondary"
              small
              fullWidth
              onPress={() => setPickerVisible(true)}
              disabled={isLoadingProducts}
              style={{ marginTop: 10 }}
            />
          )}

          {/* ── Observaciones ── */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>OBSERVACIONES (opcional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ej: muestra para degustación, evento especial..."
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            maxLength={500}
            textAlignVertical="top"
          />

          {/* ── Resumen de contexto ── */}
          <Card style={styles.contextCard}>
            <Text style={styles.contextLabel}>CONTEXTO DE LA OPERACIÓN</Text>
            <View style={styles.contextRow}>
              <Text style={styles.contextKey}>Ubicación van</Text>
              <Text style={[styles.contextVal, !mobileLocationId && styles.contextMissing]}>
                {mobileLocationId ? `ID ${mobileLocationId}` : 'Sin configurar ⚠️'}
              </Text>
            </View>
            <View style={styles.contextRow}>
              <Text style={styles.contextKey}>Plaza (sucursal)</Text>
              <Text style={[styles.contextVal, !employeeAnalyticPlazaId && styles.contextMissing]}>
                {employeeAnalyticPlazaId ? `ID ${employeeAnalyticPlazaId}` : 'Sin configurar ⚠️'}
              </Text>
            </View>
            <View style={styles.contextRow}>
              <Text style={styles.contextKey}>Visit line</Text>
              <Text style={styles.contextVal}>
                {visitLineId ? `ID ${visitLineId}` : 'N/A (offroute / no bridged)'}
              </Text>
            </View>
          </Card>

          {/* ── Warnings ── */}
          {(!mobileLocationId || !employeeAnalyticPlazaId) && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Datos requeridos faltantes</Text>
              {!mobileLocationId && (
                <Text style={styles.warningLine}>
                  • Sin ubicación de van — el plan no expone mobile_location_id.
                </Text>
              )}
              {!employeeAnalyticPlazaId && (
                <Text style={styles.warningLine}>
                  • Sin plaza asignada en tu perfil de empleado.
                </Text>
              )}
              <Text style={styles.warningLine}>Contacta al administrador.</Text>
            </View>
          )}

          {/* ── Botón confirmar ── */}
          <Button
            label={isSubmitting ? 'Registrando...' : '🎁 Registrar Regalo'}
            onPress={handleSubmit}
            fullWidth
            disabled={!canSubmit || !mobileLocationId || !employeeAnalyticPlazaId}
            loading={isSubmitting}
            style={{ marginTop: 20 }}
          />

          {/* Validación inline */}
          {!hasValidLines && giftLines.length === 0 && (
            <Text style={styles.validationHint}>
              Agrega al menos un producto con cantidad mayor a 0
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Product Picker Modal */}
      <GiftPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        existingProductIds={existingProductIds}
        onSelect={handleProductSelect}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 120 },

  customerName: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 2,
    marginTop: 4,
  },
  offlineHint: {
    fontSize: 10,
    color: colors.warning,
    marginBottom: 8,
    fontStyle: 'italic',
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.textDim,
    marginBottom: 8,
    marginTop: 16,
  },

  emptyLines: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 20,
    alignItems: 'center',
    marginBottom: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },

  // Gift line row
  giftLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.cardLighter,
    borderRadius: radii.button,
    marginBottom: 6,
  },
  lineName: { fontSize: 13, fontWeight: '600', color: colors.text },
  lineStock: { fontSize: 11, color: colors.textDim, marginTop: 1 },

  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, color: colors.text, lineHeight: 18 },
  qtyValue: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    minWidth: 26,
    textAlign: 'center',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.errorAlpha08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 13, color: colors.error, fontWeight: '700' },

  // Notes
  notesInput: {
    backgroundColor: colors.cardLighter,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    padding: 12,
    color: colors.text,
    fontSize: 13,
    minHeight: 80,
    lineHeight: 20,
  },

  // Context info card
  contextCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.card,
  },
  contextLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textDim,
    marginBottom: 8,
  },
  contextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contextKey: { fontSize: 12, color: colors.textDim },
  contextVal: { fontSize: 12, color: colors.text, fontWeight: '500' },
  contextMissing: { color: colors.warning },

  // Warnings
  warningBox: {
    backgroundColor: colors.warningAlpha08,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: radii.button,
    padding: 12,
    marginTop: 12,
  },
  warningTitle: { fontSize: 12, fontWeight: '700', color: colors.warning, marginBottom: 6 },
  warningLine: { fontSize: 11, color: colors.warning, lineHeight: 18 },

  validationHint: {
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 8,
  },
});

// ─── GiftPickerModal styles ───────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
  },
  closeBtn: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  fallbackBanner: {
    backgroundColor: colors.warningAlpha08,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: radii.button,
    marginHorizontal: spacing.screenPadding,
    marginBottom: 8,
    padding: 8,
    alignItems: 'center',
  },
  fallbackText: { fontSize: 11, color: colors.warning, fontWeight: '600' },

  searchWrap: {
    paddingHorizontal: spacing.screenPadding,
    marginBottom: 8,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 11,
    paddingRight: 40,
    color: colors.text,
    fontSize: 14,
  },
  clearBtn: { position: 'absolute', right: spacing.screenPadding + 10, top: 9, padding: 4 },
  clearBtnText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },

  countBar: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countText: { fontSize: 11, color: colors.textDim },

  list: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80, paddingTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    marginBottom: 6,
  },
  rowDisabled: { opacity: 0.4 },
  name: { fontSize: 13, fontWeight: '600', color: colors.text },
  stock: { fontSize: 11, color: colors.success, marginTop: 2 },
  dimText: { color: colors.textDim },
  redText: { color: colors.error },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.cardLighter,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, color: colors.text, lineHeight: 18 },
  qtyVal: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },

  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
});
