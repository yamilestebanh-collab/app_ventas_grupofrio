/**
 * BLD-20260409: Customer-specific pricelist service.
 *
 * Odoo price logic:
 *   product.product.list_price = PUBLIC price (tarifa publica)
 *   Each partner has property_product_pricelist → their specific pricelist
 *   Pricelist items define: fixed price, percentage discount, or formula
 *
 * IMPORTANT: property_product_pricelist is a "property" field stored in
 * ir.property, NOT directly on res.partner. The custom /get_records endpoint
 * does NOT return property fields. We MUST use direct JSON-RPC (search_read
 * or read) to fetch it.
 *
 * Strategy:
 *   1. Try odooRpc search_read on res.partner for property_product_pricelist
 *   2. If that fails, read ir.property directly as fallback
 *   3. Load pricelist items and compute prices manually
 *   4. As ultimate fallback, try product.pricelist get_products_price
 */

import { odooRead, odooRpc } from './odooRpc';

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
 * Load the partner's pricelist ID using direct JSON-RPC.
 *
 * /get_records does NOT return property fields like property_product_pricelist.
 * We use odooRpc → search_read which calls Odoo's native ORM and DOES
 * resolve property fields correctly.
 *
 * Returns null if no specific pricelist (= uses public).
 */
export async function getPartnerPricelistId(partnerId: number): Promise<number | null> {
  // ── Attempt 1: Direct JSON-RPC search_read ──
  try {
    const partners = await odooRpc<any[]>('res.partner', 'search_read', [
      [['id', '=', partnerId]],
    ], {
      fields: ['property_product_pricelist'],
      limit: 1,
    });

    console.log(`[pricelist] search_read res.partner ${partnerId}:`, JSON.stringify(partners));

    if (partners && partners.length > 0) {
      const pl = partners[0].property_product_pricelist;
      if (Array.isArray(pl) && pl.length > 0) {
        console.log(`[pricelist] Partner ${partnerId} pricelist: ${pl[0]} (${pl[1]})`);
        return pl[0];
      }
      if (typeof pl === 'number' && pl > 0) {
        console.log(`[pricelist] Partner ${partnerId} pricelist: ${pl}`);
        return pl;
      }
      console.log(`[pricelist] Partner ${partnerId} has no pricelist (field=${JSON.stringify(pl)})`);
    }
  } catch (err) {
    console.warn('[pricelist] search_read failed, trying ir.property fallback:', err);
  }

  // ── Attempt 2: Read ir.property directly ──
  // property_product_pricelist is stored in ir.property with
  // res_id = 'res.partner,{partnerId}'
  try {
    const props = await odooRpc<any[]>('ir.property', 'search_read', [
      [
        ['name', '=', 'property_product_pricelist'],
        ['res_id', '=', `res.partner,${partnerId}`],
      ],
    ], {
      fields: ['value_reference'],
      limit: 1,
    });

    console.log(`[pricelist] ir.property fallback for partner ${partnerId}:`, JSON.stringify(props));

    if (props && props.length > 0) {
      const ref = props[0].value_reference; // e.g. "product.pricelist,3"
      if (typeof ref === 'string' && ref.startsWith('product.pricelist,')) {
        const plId = parseInt(ref.split(',')[1], 10);
        if (!isNaN(plId) && plId > 0) {
          console.log(`[pricelist] Partner ${partnerId} pricelist from ir.property: ${plId}`);
          return plId;
        }
      }
    }
  } catch (err) {
    console.warn('[pricelist] ir.property fallback failed:', err);
  }

  // ── Attempt 3: /get_records as last resort ──
  try {
    const partners = await odooRead<any>('res.partner', [
      ['id', '=', partnerId],
    ], ['property_product_pricelist'], 1);

    console.log(`[pricelist] /get_records fallback for partner ${partnerId}:`, JSON.stringify(partners));

    if (partners && partners.length > 0) {
      const pl = partners[0].property_product_pricelist;
      if (Array.isArray(pl) && pl.length > 0) return pl[0];
      if (typeof pl === 'number' && pl > 0) return pl;
    }
  } catch (err) {
    console.warn('[pricelist] /get_records fallback failed:', err);
  }

  console.log(`[pricelist] No pricelist found for partner ${partnerId}, using public prices`);
  return null;
}

/**
 * Load pricelist items (rules) for a given pricelist.
 * Uses JSON-RPC search_read (primary) with /get_records fallback.
 */
async function loadPricelistItems(pricelistId: number): Promise<PricelistItem[]> {
  // Try direct JSON-RPC first
  try {
    const items = await odooRpc<PricelistItem[]>('product.pricelist.item', 'search_read', [
      [['pricelist_id', '=', pricelistId]],
    ], {
      fields: PRICELIST_ITEM_FIELDS,
      limit: 500,
    });

    if (items && items.length > 0) {
      console.log(`[pricelist] Loaded ${items.length} pricelist items via search_read for pricelist ${pricelistId}`);
      return items;
    }
  } catch (err) {
    console.warn('[pricelist] search_read pricelist items failed:', err);
  }

  // Fallback to /get_records
  try {
    const items = await odooRead<PricelistItem>('product.pricelist.item', [
      ['pricelist_id', '=', pricelistId],
    ], PRICELIST_ITEM_FIELDS, 500);
    console.log(`[pricelist] Loaded ${items?.length ?? 0} pricelist items via /get_records for pricelist ${pricelistId}`);
    return items || [];
  } catch (error) {
    console.warn('[pricelist] /get_records pricelist items failed:', error);
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

  console.log(`[pricelist] Computing prices for partner ${partnerId}, ${products.length} products`);

  const pricelistId = await getPartnerPricelistId(partnerId);
  if (!pricelistId) return priceMap; // No custom pricelist, use public

  const items = await loadPricelistItems(pricelistId);
  if (items.length === 0) {
    console.log(`[pricelist] Pricelist ${pricelistId} has no items`);
    return priceMap;
  }

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

  console.log(`[pricelist] Computed ${priceMap.size} custom prices for partner ${partnerId} (pricelist ${pricelistId})`);
  return priceMap;
}
