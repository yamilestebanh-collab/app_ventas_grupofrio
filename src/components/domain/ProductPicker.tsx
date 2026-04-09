/**
 * V1.3 ProductPicker — Full product selector with:
 * - Fuzzy search by name, code, or category
 * - Category tabs (Hielo, Cups, Snack, Proteina, Otros)
 * - Inline quantity selector
 * - Stock visibility with out-of-stock shown but disabled
 * - KoldDemand recommendation badges
 * - Recent products section
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProductStore, TruckProduct } from '../../stores/useProductStore';
import { useVisitStore, SaleLineItem } from '../../stores/useVisitStore';
import { useKoldStore } from '../../stores/useKoldStore';
import { Badge } from '../ui/Badge';
import { colors, spacing, radii } from '../../theme/tokens';
import { typography, fonts } from '../../theme/typography';

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
  // Match all words independently (AND)
  const words = q.split(/\s+/);
  return words.every((w) => t.includes(w));
}

export function ProductPicker({ visible, onClose, existingProductIds, partnerId }: ProductPickerProps) {
  const products = useProductStore((s) => s.products);
  const inventorySource = useProductStore((s) => s.inventorySource);
  const addSaleLine = useVisitStore((s) => s.addSaleLine);
  const forecasts = useKoldStore((s) => s.forecasts);
  const isGlobalFallback = inventorySource === 'global_legacy';
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  // Get demand recommendations for this partner
  const recommendations = useMemo(() => {
    if (!partnerId) return new Set<number>();
    const forecast = forecasts.get(partnerId);
    if (!forecast) return new Set<number>();
    // V1.3: KoldForecastData doesn't have productLines yet.
    // For now, no product-level recommendations — just show forecast exists.
    return new Set<number>();
  }, [partnerId, forecasts]);

  // Enrich products with category and recommendation
  const enrichedProducts = useMemo(() => {
    return products.map((p) => ({
      ...p,
      category: categorizeProduct(p.name),
      isRecommended: recommendations.has(p.id),
      isAlreadyAdded: existingProductIds.includes(p.id),
    }));
  }, [products, recommendations, existingProductIds]);

  // Filter
  const filtered = useMemo(() => {
    return enrichedProducts.filter((p) => {
      // Category filter
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      // Search filter
      if (!fuzzyMatch(p.name + ' ' + (p.default_code || ''), search)) return false;
      // Hide zero-stock unless global fallback (where stock is unreliable)
      if (!isGlobalFallback && p.qty_display <= 0) return false;
      return true;
    }).sort((a, b) => {
      // Sort: recommended first, then in-stock, then alphabetical
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      if (a.qty_display > 0 && b.qty_display <= 0) return -1;
      if (a.qty_display <= 0 && b.qty_display > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [enrichedProducts, activeCategory, search]);

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

  function handleSelect(product: TruckProduct & { category: CategoryKey }) {
    if (product.qty_display <= 0) return;
    if (existingProductIds.includes(product.id)) return;

    const qty = quantities[product.id] || 1;
    // BLD-20260408-P0: Guard against undefined/null list_price from Odoo.
    // Without this, NaN propagates to subtotal/tax/total and the entire
    // sale screen shows $NaN.
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

  function renderProduct({ item: p }: { item: TruckProduct & { category: CategoryKey; isRecommended: boolean; isAlreadyAdded: boolean } }) {
    const outOfStock = p.qty_display <= 0;
    const alreadyAdded = p.isAlreadyAdded;
    const disabled = outOfStock || alreadyAdded;
    const qty = quantities[p.id] || 1;

    // BLD-20260408-P1: Product thumbnail from Odoo image_128
    const hasImage = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 10;

    return (
      <View style={[styles.productRow, disabled && styles.productRowDisabled]}>
        {/* Product thumbnail */}
        {hasImage ? (
          <Image
            source={{ uri: `data:image/png;base64,${p.image_128}` }}
            style={styles.productThumb}
          />
        ) : (
          <View style={[styles.productThumb, styles.productThumbPlaceholder]}>
            <Text style={{ fontSize: 16 }}>📦</Text>
          </View>
        )}

        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => !disabled && handleSelect(p)}
          activeOpacity={disabled ? 1 : 0.7}
          disabled={disabled}
        >
          <View style={styles.productHeader}>
            <Text style={[styles.productName, disabled && styles.textDisabled]} numberOfLines={1}>
              {p.name}
            </Text>
            {p.isRecommended && <Badge label="📊 Sugerido" variant="green" />}
            {alreadyAdded && <Badge label="✓ Agregado" variant="dim" />}
          </View>
          <View style={styles.productMeta}>
            <Text style={[styles.productPrice, disabled && styles.textDisabled]}>
              ${(p.list_price || 0).toFixed(2)}
            </Text>
            <Text style={styles.productSep}>·</Text>
            <Text style={[
              styles.productStock,
              outOfStock && styles.textOutOfStock,
            ]}>
              {outOfStock ? 'Agotado' : `${p.qty_display} disp.`}
            </Text>
            {(p.weight ?? 0) > 0 && (
              <>
                <Text style={styles.productSep}>·</Text>
                <Text style={styles.productWeight}>{p.weight}kg</Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Quantity selector — only if in stock and not added */}
        {!disabled && (
          <View style={styles.qtySelector}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQty(p.id, -1, p.qty_display)}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{qty}</Text>
            <TouchableOpacity
              style={[styles.qtyBtn, qty >= p.qty_display && styles.qtyBtnDisabled]}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={typography.screenTitle}>Agregar Producto</Text>
          <TouchableOpacity onPress={() => { setSearch(''); setQuantities({}); onClose(); }}>
            <Text style={styles.closeBtn}>Cerrar</Text>
          </TouchableOpacity>
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
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Buscar por nombre o codigo..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setSearch('')}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* BLD-20260408-P1: Category tabs — fixed height to prevent overlap with product list */}
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryBar}
          style={styles.categoryList}
          renderItem={({ item: cat }) => (
            <TouchableOpacity
              style={[
                styles.categoryTab,
                activeCategory === cat.key && styles.categoryTabActive,
              ]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[
                styles.categoryLabel,
                activeCategory === cat.key && styles.categoryLabelActive,
              ]}>
                {cat.label}
              </Text>
              <Text style={styles.categoryCount}>
                {categoryCounts[cat.key] || 0}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Info bar */}
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            {inStockCount} disponible{inStockCount !== 1 ? 's' : ''}
            {recommendedCount > 0 ? ` · ${recommendedCount} sugerido${recommendedCount !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>

        {/* Results */}
        <FlatList
          data={filtered}
          renderItem={renderProduct}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
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
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.screenPadding, paddingVertical: 14,
  },
  closeBtn: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  searchContainer: {
    paddingHorizontal: spacing.screenPadding, marginBottom: 8,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.button, paddingHorizontal: 14, paddingVertical: 12,
    paddingRight: 40,
    color: colors.text, fontSize: 15,
  },
  clearBtn: {
    position: 'absolute', right: spacing.screenPadding + 10, top: 10,
    padding: 4,
  },
  clearBtnText: { color: colors.textDim, fontSize: 16 },
  categoryList: {
    maxHeight: 48, // Fixed height to prevent overlap with product list
    flexGrow: 0,
  },
  categoryBar: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 8,
    gap: 6,
  },
  categoryTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  categoryTabActive: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderColor: '#2563EB',
  },
  categoryIcon: { fontSize: 14 },
  categoryLabel: { fontSize: 12, color: colors.textDim, fontWeight: '500' },
  categoryLabelActive: { color: '#2563EB' },
  categoryCount: { fontSize: 10, color: colors.textDim },
  infoBar: {
    paddingHorizontal: spacing.screenPadding, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoText: { fontSize: 11, color: colors.textDim },
  list: { paddingHorizontal: spacing.screenPadding, paddingBottom: 80, paddingTop: 6 },
  productRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14, gap: 10,
    backgroundColor: colors.card, borderRadius: radii.button, marginBottom: 6,
  },
  productThumb: {
    width: 40, height: 40, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  productThumbPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  productRowDisabled: { opacity: 0.45 },
  productHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2,
  },
  productName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  productPrice: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  productSep: { fontSize: 10, color: colors.textDim },
  productStock: { fontSize: 11, color: '#22C55E' },
  productWeight: { fontSize: 11, color: colors.textDim },
  textDisabled: { color: colors.textDim },
  textOutOfStock: { color: '#EF4444' },
  qtySelector: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginLeft: 10,
  },
  qtyBtn: {
    width: 32, height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 18, color: colors.text, fontWeight: '600' },
  qtyValue: {
    fontSize: 16, fontWeight: '700', color: colors.text,
    minWidth: 28, textAlign: 'center',
  },
  qtyBtnDisabled: { opacity: 0.3 },
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
