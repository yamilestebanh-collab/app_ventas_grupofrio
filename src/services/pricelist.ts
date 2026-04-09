/**
 * BLD-20260409: Customer-specific pricelist service.
 *
 * Odoo price logic:
 *   product.product.list_price = PUBLIC price (tarifa publica)
 *   Each partner has property_product_pricelist → their specific pricelist
 *   Pricelist items define: fixed price, percentage discount, or formula
 *
 * This service:
 *   1. Loads the partner's pricelist ID from res.partner
 *   2. Loads pricelist items (rules) for that pricelist
 *   3. Computes final price per product
 *   4. Returns a Map<productId, price> for display
 *
 * If the partner has no pricelist or it's the public one, returns empty map
 * (caller falls back to list_price).
 */

import { odooRead } from './odooRpc';

export interface PricelistItem {
  id: number;
  product_id: [number, string] | false;
  product_tmpl_id: [number, string] | false;
  categ_id: [number, string] | false;
  compute_price: 'fixed' | 'percentage' | 'formula';
  fixed_price: number;
  percent_price: number;
  min_quantity: number;
  applied_on: '0_product_variant' | '1_product' | '2_product_category' | '3_global';
}

const PRICELIST_ITEM_FIELDS = [
  'id', 'product_id', 'product_tmpl_id', 'categ_id',
  'compute_price', 'fixed_price', 'percent_price',
  'min_quantity', 'applied_on',
];

/**
 * Load the partner's pricelist ID.
 * Returns null if no specific pricelist (= uses public).
 */
export async function getPartnerPricelistId(partnerId: number): Promise<number | null> {
  try {
    const partners = await odooRead<any>('res.partner', [
      ['id', '=', partnerId],
    ], ['property_product_pricelist'], 1);

    if (!partners || partners.length === 0) return null;

    const pl = partners[0].property_product_pricelist;
    // Many2one: [id, name] or false
    if (Array.isArray(pl) && pl.length > 0) return pl[0];
    if (typeof pl === 'number') return pl;
    return null;
  } catch (error) {
    console.warn('[pricelist] Failed to load partner pricelist:', error);
    return null;
  }
}

/**
 * Load pricelist items (rules) for a given pricelist.
 */
async function loadPricelistItems(pricelistId: number): Promise<PricelistItem[]> {
  try {
    const items = await odooRead<PricelistItem>('product.pricelist.item', [
      ['pricelist_id', '=', pricelistId],
    ], PRICELIST_ITEM_FIELDS, 500);
    return items || [];
  } catch (error) {
    console.warn('[pricelist] Failed to load pricelist items:', error);
    return [];
  }
}

/**
 * Compute customer-specific prices for a list of products.
 *
 * Returns Map<productId, finalPrice> — only products with price
 * overrides are in the map. Products NOT in the map use list_price.
 *
 * Rule priority (Odoo standard):
 *   0_product_variant > 1_product > 2_product_category > 3_global
 *   Lower min_quantity matches first for qty=1
 */
export async function computeCustomerPrices(
  partnerId: number,
  products: Array<{ id: number; list_price: number; product_tmpl_id?: any; categ_id?: any }>,
): Promise<Map<number, number>> {
  const priceMap = new Map<number, number>();

  const pricelistId = await getPartnerPricelistId(partnerId);
  if (!pricelistId) return priceMap; // No custom pricelist, use public

  const items = await loadPricelistItems(pricelistId);
  if (items.length === 0) return priceMap;

  // Sort items by specificity (most specific first)
  const sortedItems = [...items].sort((a, b) => {
    const orderMap: Record<string, number> = {
      '0_product_variant': 0,
      '1_product': 1,
      '2_product_category': 2,
      '3_global': 3,
    };
    return (orderMap[a.applied_on] ?? 4) - (orderMap[b.applied_on] ?? 4);
  });

  for (const product of products) {
    const tmplId = Array.isArray(product.product_tmpl_id)
      ? product.product_tmpl_id[0]
      : product.product_tmpl_id;
    const categId = Array.isArray(product.categ_id)
      ? product.categ_id[0]
      : product.categ_id;

    // Find the best matching rule for this product (qty=1)
    const matchingRule = sortedItems.find((item) => {
      if (item.min_quantity > 1) return false; // Skip rules for bulk qty

      switch (item.applied_on) {
        case '0_product_variant': {
          const itemProdId = Array.isArray(item.product_id) ? item.product_id[0] : item.product_id;
          return itemProdId === product.id;
        }
        case '1_product': {
          const itemTmplId = Array.isArray(item.product_tmpl_id) ? item.product_tmpl_id[0] : item.product_tmpl_id;
          return itemTmplId === tmplId;
        }
        case '2_product_category': {
          const itemCategId = Array.isArray(item.categ_id) ? item.categ_id[0] : item.categ_id;
          return itemCategId === categId;
        }
        case '3_global':
          return true; // Matches all products
        default:
          return false;
      }
    });

    if (matchingRule) {
      let price: number;
      switch (matchingRule.compute_price) {
        case 'fixed':
          price = matchingRule.fixed_price || 0;
          break;
        case 'percentage':
          // Percentage discount from list_price
          price = product.list_price * (1 - (matchingRule.percent_price || 0) / 100);
          break;
        case 'formula':
          // Formula-based — too complex for pilot. Use list_price as fallback.
          price = product.list_price;
          break;
        default:
          price = product.list_price;
      }
      // Only store if different from list_price
      if (Math.abs(price - product.list_price) > 0.01) {
        priceMap.set(product.id, price);
      }
    }
  }

  console.log(`[pricelist] Computed ${priceMap.size} custom prices for partner ${partnerId}`);
  return priceMap;
}
