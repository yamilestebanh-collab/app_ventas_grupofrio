/**
 * ProductPicker V2 — Dual view product selector.
 *
 * BLD-20260409: Complete rewrite for UX pilot feedback.
 *
 * Features:
 * - Dual view: list (compact) and grid (2 columns with images)
 * - Prices shown WITH IVA (precio final visible para el vendedor)
 * - Fuzzy search by name, code, or category
 * - Category tabs (fixed height, no overlap)
 * - Inline quantity selector
 * - Product images from Odoo image_128
 * - View preference persisted
 *
 * PRICE LOGIC:
 *   Odoo list_price = base price WITHOUT IVA
 *   Visual price = list_price * 1.16 (IVA included)
 *   Internal SaleLineItem.price = list_price (base, for Odoo)
 *   This means the sale screen subtotal/tax/total breakdown is correct.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProductStore, TruckProduct } from '../../stores/useProductStore';
import { useVisitStore, SaleLineItem } from '../../stores/useVisitStore';
import { useKoldStore } from '../../stores/useKoldStore';
import { Badge } from '../ui/Badge';
import { colors, spacing, radii } from '../../theme/tokens';
import { typography, fonts } from '../../theme/typography';
import { formatPriceWithIVA } from '../../utils/time';

// ═══ Types ═══

type ViewMode = 'list' | 'grid';

interface ProductPickerProps {
  visible: boolean;
  onClose: () => void;
  existingProductIds: number[];
  partnerId?: number;
}

// Category mapping based on real Odoo product categories
const CATEGORIES = [
  { key: 'all', label: 'Todos', icon: '📦' },
  { key: 'hielo', label: 'Hielo', icon: '🧊' },
  { key: 'cups', label: 'Cups', icon: '🥤' },
  { key: 'snack', label: 'Snack', icon: '🍦' },
  { key: 'proteina', label: 'Proteina', icon: '🥩' },
  { key: 'otros', label: 'Otros', icon: '📋' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

const VIEW_PREF_KEY = 'kf:ui:productViewMode';
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 8;
const GRID_PADDING = spacing.screenPadding;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

// ═══ Helpers ═══

function categorizeProduct(name: string): CategoryKey {
  const n = name.toUpperCase();
  if (n.includes('BARRA') || n.includes('ROLITO') || n.includes('BOLSA DE HIELO') ||
      n.includes('MOLIDO') || n.includes('CILINDRO') || n.includes('GLOBAL ICE') ||
      n.includes('ICE')) return 'hielo';
  if (n.includes('CUP') || n.includes('MICHE') || n.includes('JUICE')) return 'cups';
  if (n.includes('KOLD POP') || n.includes('KOLD FRUIT') || n.includes('CREME') ||
      n.includes('SNACK') || n.includes('PALETA')) return 'snack';
  if (n.includes('ATUN') || n.includes('CAMARON') || n.includes('CECINA') ||
      n.includes('MACHACA') || n.includes('MEAT') || n.includes('SEA')) return 'proteina';
  return 'otros';
}

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const words = q.split(/\s+/);
  return words.every((w) => t.includes(w));
}

/** Check if product has a valid image from Odoo */
function hasValidImage(p: TruckProduct): boolean {
  return !!(p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 10);
}

// Enriched product type used internally
type EnrichedProduct = TruckProduct & {
  category: CategoryKey;
  isRecommended: boolean;
  isAlreadyAdded: boolean;
};

// ═══ Component ═══

export function ProductPicker({ visible, onClose, existingProductIds, partnerId }: ProductPickerProps) {
  const products = useProductStore((s) => s.products);
  const inventorySource = useProductStore((s) => s.inventorySource);
  const addSaleLine = useVisitStore((s) => s.addSaleLine);
  const forecasts = useKoldStore((s) => s.forecasts);
  const isGlobalFallback = inventorySource === 'global_legacy';

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Load saved view preference
  useEffect(() => {
    AsyncStorage.getItem(VIEW_PREF_KEY).then((v) => {
      if (v === 'list' || v === 'grid') setViewMode(v);
    }).catch(() => {});
  }, []);

  // Save view preference on change
  const toggleView = useCallback(() => {
    const next: ViewMode = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(next);
    AsyncStorage.setItem(VIEW_PREF_KEY, next).catch(() => {});
  }, [viewMode]);

  // Demand recommendations
  const recommendations = useMemo(() => {
    if (!partnerId) return new Set<number>();
    const forecast = forecasts.get(partnerId);
    if (!forecast) return new Set<number>();
    return new Set<number>();
  }, [partnerId, forecasts]);

  // Enrich products
  const enrichedProducts = useMemo(() => {
    return products.map((p) => ({
      ...p,
      category: categorizeProduct(p.name),
      isRecommended: recommendations.has(p.id),
      isAlreadyAdded: existingProductIds.includes(p.id),
    }));
  }, [products, recommendations, existingProductIds]);

  // Filter + sort
  const filtered = useMemo(() => {
    return enrichedProducts.filter((p) => {
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      if (!fuzzyMatch(p.name + ' ' + (p.default_code || ''), search)) return false;
      if (!isGlobalFallback && p.qty_display <= 0) return false;
      return true;
    }).sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      if (a.qty_display > 0 && b.qty_display <= 0) return -1;
      if (a.qty_display <= 0 && b.qty_display > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [enrichedProducts, activeCategory, search, isGlobalFallback]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enrichedProducts.length };
    enrichedProducts.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [enrichedProducts]);

  const setQty = useCallback((productId: number, delta: number, maxStock: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 1;
      const next = Math.max(1, Math.min(maxStock, current + delta));
      return { ...prev, [productId]: next };
    });
  }, []);

  function handleSelect(product: EnrichedProduct) {
    if (product.qty_display <= 0) return;
    if (existingProductIds.includes(product.id)) return;

    const qty = quantities[product.id] || 1;
    // IMPORTANT: SaleLineItem.price = list_price (base, sin IVA)
    // The IVA is added in saleTotal() = subtotal * 1.16
    // Visual display uses formatPriceWithIVA() separately.
    const safePrice = (typeof product.list_price === 'number' && !isNaN(product.list_price))
      ? product.list_price : 0;
    const line: SaleLineItem = {
      productId: product.id,
      productName: product.name,
      price: safePrice,
      qty: Math.min(qty, product.qty_display),
      stock: product.qty_display,
      weight: product.weight || 5,
    };
    addSaleLine(line);
    setSearch('');
    setQuantities({});
    onClose();
  }

  // ═══ Product Image Component ═══

  function ProductImage({ product, size }: { product: TruckProduct; size: number }) {
    if (hasValidImage(product)) {
      return (
        <Image
          source={{ uri: `data:image/png;base64,${product.image_128}` }}
          style={{ width: size, height: size, borderRadius: 8 }}
          resizeMode="cover"
        />
      );
    }
    // Placeholder with category-aware emoji
    const cat = categorizeProduct(product.name);
    const emoji = cat === 'hielo' ? '🧊' : cat === 'cups' ? '🥤' :
                  cat === 'snack' ? '🍦' : cat === 'proteina' ? '🥩' : '📦';
    return (
      <View style={[styles.imgPlaceholder, { width: size, height: size }]}>
        <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
      </View>
    );
  }

  // ═══ List View Row ═══

  function renderListItem({ item: p }: { item: EnrichedProduct }) {
    const outOfStock = p.qty_display <= 0;
    const alreadyAdded = p.isAlreadyAdded;
    const disabled = outOfStock || alreadyAdded;
    const qty = quantities[p.id] || 1;

    return (
      <View style={[styles.listRow, disabled && styles.rowDisabled]}>
        <ProductImage product={p} size={44} />

        <TouchableOpacity
          style={styles.listInfo}
          onPress={() => !disabled && handleSelect(p)}
          activeOpacity={disabled ? 1 : 0.7}
          disabled={disabled}
        >
          <View style={styles.listHeader}>
            <Text style={[styles.listName, disabled && styles.textDim]} numberOfLines={1}>
              {p.name}
            </Text>
            {p.isRecommended && <Badge label="Sugerido" variant="green" />}
            {alreadyAdded && <Badge label="Agregado" variant="dim" />}
          </View>
          <View style={styles.listMeta}>
            <Text style={[styles.listPrice, disabled && styles.textDim]}>
              {formatPriceWithIVA(p.list_price)}
            </Text>
            <Text style={styles.sep}>·</Text>
            <Text style={[styles.listStock, outOfStock && styles.textRed]}>
              {outOfStock ? 'Agotado' : `${p.qty_display} disp.`}
            </Text>
            {(p.weight ?? 0) > 0 && (
              <>
                <Text style={styles.sep}>·</Text>
                <Text style={styles.listWeight}>{p.weight}kg</Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {!disabled && (
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(p.id, -1, p.qty_display)}>
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyVal}>{qty}</Text>
            <TouchableOpacity
              style={[styles.qtyBtn, qty >= p.qty_display && styles.qtyBtnOff]}
              onPress={() => setQty(p.id, 1, p.qty_display)}
              disabled={qty >= p.qty_display}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ═══ Grid View Card ═══

  function renderGridItem({ item: p }: { item: EnrichedProduct }) {
    const outOfStock = p.qty_display <= 0;
    const alreadyAdded = p.isAlreadyAdded;
    const disabled = outOfStock || alreadyAdded;
    const qty = quantities[p.id] || 1;

    return (
      <View style={[styles.gridCard, disabled && styles.rowDisabled]}>
        <TouchableOpacity
          onPress={() => !disabled && handleSelect(p)}
          activeOpacity={disabled ? 1 : 0.7}
          disabled={disabled}
          style={styles.gridTouchArea}
        >
          {/* Image */}
          <View style={styles.gridImgWrap}>
            <ProductImage product={p} size={GRID_CARD_WIDTH - 20} />
            {p.isRecommended && (
              <View style={styles.gridBadge}>
                <Text style={styles.gridBadgeText}>Sugerido</Text>
              </View>
            )}
            {alreadyAdded && (
              <View style={[styles.gridBadge, styles.gridBadgeDim]}>
                <Text style={styles.gridBadgeText}>Agregado</Text>
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={[styles.gridName, disabled && styles.textDim]} numberOfLines={2}>
            {p.name}
          </Text>

          {/* Price with IVA */}
          <Text style={[styles.gridPrice, disabled && styles.textDim]}>
            {formatPriceWithIVA(p.list_price)}
          </Text>

          {/* Stock */}
          <Text style={[styles.gridStock, outOfStock && styles.textRed]}>
            {outOfStock ? 'Agotado' : `${p.qty_display} disponibles`}
          </Text>
        </TouchableOpacity>

        {/* Qty controls */}
        {!disabled && (
          <View style={styles.gridQtyRow}>
            <TouchableOpacity style={styles.qtyBtnSm} onPress={() => setQty(p.id, -1, p.qty_display)}>
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyVal}>{qty}</Text>
            <TouchableOpacity
              style={[styles.qtyBtnSm, qty >= p.qty_display && styles.qtyBtnOff]}
              onPress={() => setQty(p.id, 1, p.qty_display)}
              disabled={qty >= p.qty_display}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const inStockCount = filtered.filter((p) => p.qty_display > 0 && !p.isAlreadyAdded).length;
  const recommendedCount = filtered.filter((p) => p.isRecommended).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modal}>
        {/* Header with view toggle */}
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Agregar Producto</Text>
          <View style={styles.headerRight}>
            {/* View toggle */}
            <TouchableOpacity style={styles.viewToggle} onPress={toggleView}>
              <Text style={styles.viewToggleText}>
                {viewMode === 'list' ? '▦' : '☰'}
              </Text>
              <Text style={styles.viewToggleLabel}>
                {viewMode === 'list' ? 'Grid' : 'Lista'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setSearch(''); setQuantities({}); onClose(); }}>
              <Text style={styles.closeBtn}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Global fallback warning */}
        {isGlobalFallback && (
          <View style={styles.fallbackBanner}>
            <Text style={styles.fallbackText}>
              ⚠ Inventario global — stock puede no reflejar tu unidad
            </Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre o codigo..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category tabs — fixed height, no overlap */}
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          style={styles.catList}
          contentContainerStyle={styles.catBar}
          renderItem={({ item: cat }) => (
            <TouchableOpacity
              style={[styles.catTab, activeCategory === cat.key && styles.catTabActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={[styles.catLabel, activeCategory === cat.key && styles.catLabelActive]}>
                {cat.label}
              </Text>
              <Text style={styles.catCount}>{categoryCounts[cat.key] || 0}</Text>
            </TouchableOpacity>
          )}
        />

        {/* Info bar */}
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            {inStockCount} disponible{inStockCount !== 1 ? 's' : ''}
            {recommendedCount > 0 ? ` · ${recommendedCount} sugerido${recommendedCount !== 1 ? 's' : ''}` : ''}
          </Text>
          <Text style={styles.infoText}>Precios con IVA</Text>
        </View>

        {/* Product list/grid */}
        {viewMode === 'list' ? (
          <FlatList
            data={filtered}
            renderItem={renderListItem}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.listContainer}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={<EmptyState search={search} activeCategory={activeCategory} />}
          />
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderGridItem}
            keyExtractor={(p) => String(p.id)}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContainer}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            ListEmptyComponent={<EmptyState search={search} activeCategory={activeCategory} />}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ═══ Empty State ═══

function EmptyState({ search, activeCategory }: { search: string; activeCategory: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={{ fontSize: 32, marginBottom: 8 }}>📦</Text>
      <Text style={typography.dim}>
        {search
          ? `Sin resultados para "${search}"`
          : activeCategory !== 'all'
            ? 'Sin productos en esta categoria'
            : 'No hay productos disponibles'}
      </Text>
    </View>
  );
}

// ═══ Styles ═══

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.screenPadding, paddingVertical: 12,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  closeBtn: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // View toggle
  viewToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.card, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  viewToggleText: { fontSize: 16, color: colors.text },
  viewToggleLabel: { fontSize: 11, color: colors.textDim, fontWeight: '500' },

  // Search
  searchWrap: {
    paddingHorizontal: spacing.screenPadding, marginBottom: 8, position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.button, paddingHorizontal: 14, paddingVertical: 11,
    paddingRight: 40, color: colors.text, fontSize: 14,
  },
  clearBtn: { position: 'absolute', right: spacing.screenPadding + 10, top: 9, padding: 4 },
  clearBtnText: { color: colors.textDim, fontSize: 16 },

  // Categories
  catList: { maxHeight: 44, flexGrow: 0 },
  catBar: { paddingHorizontal: spacing.screenPadding, paddingBottom: 6, gap: 6 },
  catTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  catTabActive: { backgroundColor: 'rgba(37,99,235,0.12)', borderColor: '#2563EB' },
  catIcon: { fontSize: 13 },
  catLabel: { fontSize: 11, color: colors.textDim, fontWeight: '500' },
  catLabelActive: { color: '#2563EB' },
  catCount: { fontSize: 10, color: colors.textDim },

  // Info bar
  infoBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding, paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoText: { fontSize: 11, color: colors.textDim },

  // ═══ LIST VIEW ═══
  listContainer: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80, paddingTop: 6 },
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, paddingHorizontal: 12, gap: 10,
    backgroundColor: colors.card, borderRadius: radii.button, marginBottom: 6,
  },
  listInfo: { flex: 1 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  listName: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1 },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  listPrice: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  listStock: { fontSize: 11, color: '#22C55E' },
  listWeight: { fontSize: 11, color: colors.textDim },
  sep: { fontSize: 10, color: colors.textDim },

  // ═══ GRID VIEW ═══
  gridContainer: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80, paddingTop: 6 },
  gridRow: { justifyContent: 'space-between', marginBottom: GRID_GAP },
  gridCard: {
    width: GRID_CARD_WIDTH, backgroundColor: colors.card,
    borderRadius: radii.card, overflow: 'hidden',
  },
  gridTouchArea: { padding: 10, alignItems: 'center' },
  gridImgWrap: { width: '100%', alignItems: 'center', marginBottom: 8, position: 'relative' },
  gridBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(34,197,94,0.85)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  gridBadgeDim: { backgroundColor: 'rgba(139,149,163,0.6)' },
  gridBadgeText: { fontSize: 9, color: '#FFF', fontWeight: '700' },
  gridName: {
    fontSize: 12, fontWeight: '600', color: colors.text,
    textAlign: 'center', lineHeight: 16, minHeight: 32,
  },
  gridPrice: {
    fontSize: 15, fontWeight: '700', color: colors.primary,
    textAlign: 'center', marginTop: 4,
  },
  gridStock: {
    fontSize: 11, color: '#22C55E', textAlign: 'center', marginTop: 2,
  },
  gridQtyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },

  // ═══ SHARED ═══
  imgPlaceholder: {
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  rowDisabled: { opacity: 0.4 },
  textDim: { color: colors.textDim },
  textRed: { color: '#EF4444' },

  // Qty controls (list)
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnSm: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 17, color: colors.text, fontWeight: '600' },
  qtyVal: {
    fontSize: 15, fontWeight: '700', color: colors.text,
    minWidth: 24, textAlign: 'center',
  },
  qtyBtnOff: { opacity: 0.3 },

  // Banners
  fallbackBanner: {
    backgroundColor: colors.warningAlpha08,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: radii.button, marginHorizontal: spacing.screenPadding,
    marginBottom: 8, padding: 8, alignItems: 'center',
  },
  fallbackText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 30, alignItems: 'center', marginTop: 20,
  },
});
