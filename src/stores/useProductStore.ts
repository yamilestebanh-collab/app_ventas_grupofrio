/**
 * Product store — truck inventory + product catalog.
 * Manages product list, stock levels, and pricing.
 *
 * Data sources:
 *   - product.product via odooRead (catalog + prices)
 *   - stock.quant via odooRead (truck inventory by warehouse)
 *
 * NOTE: In V1, products are loaded from Odoo on login/refresh.
 *       F6 will add WatermelonDB persistence for offline.
 */

import { create } from 'zustand';
import { Product } from '../types/product';
import { odooRead } from '../services/odooRpc';
import { storeSave, STORAGE_KEYS } from '../persistence/storage';

export interface TruckProduct extends Product {
  // Computed at load time
  _totalKg: number; // qty_available * weight
}

interface ProductState {
  products: TruckProduct[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null;

  // Derived
  totalStockKg: number;
  productCount: number;

  // Actions
  loadProducts: (warehouseId: number) => Promise<void>;
  updateLocalStock: (productId: number, qtyChange: number) => void;
  getProduct: (productId: number) => TruckProduct | undefined;
  reset: () => void;
}

// Weight fallback table for products without product.weight
const WEIGHT_FALLBACK: Record<string, number> = {
  '5 kg': 5, '5kg': 5,
  '10 kg': 10, '10kg': 10,
  '15 kg': 15, '15kg': 15,
  '20 kg': 20, '20kg': 20,
  '25 kg': 25, '25kg': 25,
  '50 kg': 50, '50kg': 50,
  '75 kg': 75, '75kg': 75,
  'cup': 0.3, 'CUP': 0.3,
  'miche': 0.3, 'MICHE': 0.3,
  'juice': 0.3, 'JUICE': 0.3,
  'frappe': 1, 'FRAPPE': 1, 'frappé': 1,
};

function estimateWeight(name: string, existingWeight: number | undefined): number {
  if (existingWeight && existingWeight > 0) return existingWeight;
  const lowerName = name.toLowerCase();
  for (const [key, weight] of Object.entries(WEIGHT_FALLBACK)) {
    if (lowerName.includes(key.toLowerCase())) return weight;
  }
  return 1; // Default 1 kg if unknown
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,
  lastSync: null,
  totalStockKg: 0,
  productCount: 0,

  loadProducts: async (warehouseId: number) => {
    set({ isLoading: true, error: null });
    try {
      // Load products with stock from Odoo
      const rawProducts = await odooRead<Product>(
        'product.product',
        [
          ['sale_ok', '=', true],
          ['type', '!=', 'service'],
          ['active', '=', true],
        ],
        ['id', 'name', 'default_code', 'list_price', 'qty_available',
         'sale_ok', 'product_tmpl_id', 'weight', 'categ_id'],
        200
      );

      // Enrich with weight estimation
      const products: TruckProduct[] = rawProducts
        .filter((p) => p.sale_ok)
        .map((p) => {
          const weight = estimateWeight(p.name, p.weight);
          return {
            ...p,
            weight,
            _totalKg: (p.qty_available || 0) * weight,
          };
        })
        .sort((a, b) => b.qty_available - a.qty_available);

      const totalKg = products.reduce((sum, p) => sum + p._totalKg, 0);

      set({
        products,
        isLoading: false,
        lastSync: Date.now(),
        totalStockKg: Math.round(totalKg),
        productCount: products.length,
      });

      // F7-PRE: Persist for offline
      storeSave(STORAGE_KEYS.PRODUCTS, products);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error cargando productos';
      set({ error: msg, isLoading: false });
    }
  },

  /**
   * Update local stock after a sale (before sync).
   * qtyChange is negative for sales, positive for returns.
   */
  updateLocalStock: (productId, qtyChange) => {
    const products = get().products.map((p) => {
      if (p.id === productId) {
        const newQty = Math.max(0, p.qty_available + qtyChange);
        return {
          ...p,
          qty_available: newQty,
          _totalKg: newQty * (p.weight || 1),
        };
      }
      return p;
    });
    const totalKg = products.reduce((sum, p) => sum + p._totalKg, 0);
    set({ products, totalStockKg: Math.round(totalKg) });
    storeSave(STORAGE_KEYS.PRODUCTS, products);
  },

  getProduct: (productId) => get().products.find((p) => p.id === productId),

  reset: () => set({
    products: [], isLoading: false, error: null,
    lastSync: null, totalStockKg: 0, productCount: 0,
  }),
}));
