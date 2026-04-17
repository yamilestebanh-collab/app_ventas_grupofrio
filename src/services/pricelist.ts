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
import { postRpc } from './api';
import {
  shouldTryServerPricingEndpoint,
  disableServerPricingEndpointIfMissing,
  markServerPricingEndpointAvailable,
} from './serverPricingEndpoint';
import {
  buildPartnerPricelistCandidates,
  computeRulePrice,
  extractMany2oneId,
  getPreferredPartnerPricelistId,
} from './pricelistLogic';
import {
  DEFAULT_SALES_COMPANY_ID,
  cacheResolvedPartnerPricelistId,
  cacheCustomerPrices,
  getEffectiveSalesCompanyId,
  getCompanyFallbackPricelistId,
  isPricelistCompatibleWithCompany,
  peekResolvedPartnerPricelistId,
  peekCachedCustomerPrices,
} from './pricelistCache';

export {
  DEFAULT_SALES_COMPANY_ID,
  getEffectiveSalesCompanyId,
  peekCachedCustomerPrices,
  getCompanyFallbackPricelistId,
  isPricelistCompatibleWithCompany,
  peekResolvedPartnerPricelistId,
} from './pricelistCache';

export interface PricelistItem {
  id: number;
  product_id: [number, string] | false;
  product_tmpl_id: [number, string] | false;
  categ_id: [number, string] | false;
  compute_price: 'fixed' | 'percentage' | 'formula';
  base?: 'list_price' | 'standard_price' | 'pricelist';
  base_pricelist_id?: [number, string] | false;
  fixed_price: number;
  percent_price: number;
  price_discount?: number;
  price_surcharge?: number;
  price_round?: number;
  price_min_margin?: number;
  price_max_margin?: number;
  min_quantity: number;
  applied_on: '0_product_variant' | '1_product' | '2_product_category' | '3_global';
}

const PRICELIST_ITEM_FIELDS = [
  'id', 'product_id', 'product_tmpl_id', 'categ_id',
  'compute_price', 'base', 'base_pricelist_id',
  'fixed_price', 'percent_price',
  'price_discount', 'price_surcharge', 'price_round',
  'price_min_margin', 'price_max_margin',
  'min_quantity', 'applied_on',
];

interface PartnerPricelistRecord {
  id: number;
  parent_id?: [number, string] | number | false;
  commercial_partner_id?: [number, string] | number | false;
  pricelist_id?: [number, string] | number | false;
  specific_property_product_pricelist?: [number, string] | number | false;
  property_product_pricelist?: [number, string] | number | false;
}

interface PartnerPricelistResolution {
  candidatePartnerIds: number[];
  resolvedPartnerId: number | null;
  pricelistId: number | null;
  source: 'partner_field' | 'ir.property' | 'get_records' | 'company_fallback' | 'none';
}

interface PricingOptions {
  companyId?: number | null;
  fallbackPricelistId?: number | null;
}

function resolveFallbackPricelistId(options?: PricingOptions): number | null {
  if (typeof options?.fallbackPricelistId === 'number' && options.fallbackPricelistId > 0) {
    return options.fallbackPricelistId;
  }
  return getCompanyFallbackPricelistId(getEffectiveSalesCompanyId(options?.companyId));
}

const partnerPricelistResolutionCache = new Map<string, PartnerPricelistResolution>();
const pricelistItemsCache = new Map<number, PricelistItem[]>();
const pricelistCompanyCache = new Map<number, number | null>();

function buildPartnerResolutionCacheKey(partnerId: number, options?: PricingOptions): string {
  return `${partnerId}|${resolveFallbackPricelistId(options) ?? 0}`;
}

function extractPricelistId(value: unknown): number | null {
  return extractMany2oneId(value);
}

async function loadPricelistCompanyId(pricelistId: number): Promise<number | null> {
  if (pricelistCompanyCache.has(pricelistId)) {
    return pricelistCompanyCache.get(pricelistId) ?? null;
  }

  try {
    const rows = await odooRpc<Array<{ id: number; company_id?: [number, string] | number | false }>>(
      'product.pricelist',
      'read',
      [[pricelistId]],
      { fields: ['company_id'] },
    );
    const companyId = extractMany2oneId(rows?.[0]?.company_id);
    pricelistCompanyCache.set(pricelistId, companyId);
    return companyId;
  } catch (err) {
    console.warn(`[pricelist] read company_id failed for pricelist ${pricelistId}:`, err);
  }

  try {
    const rows = await odooRead<{ company_id?: [number, string] | number | false }>(
      'product.pricelist',
      [['id', '=', pricelistId]],
      ['company_id'],
      1,
    );
    const companyId = extractMany2oneId(rows?.[0]?.company_id);
    pricelistCompanyCache.set(pricelistId, companyId);
    return companyId;
  } catch (err) {
    console.warn(`[pricelist] /get_records company_id failed for pricelist ${pricelistId}:`, err);
  }

  pricelistCompanyCache.set(pricelistId, null);
  return null;
}

async function pickCompatiblePricelistId(
  partnerId: number,
  candidateId: number | null,
  effectiveCompanyId: number,
): Promise<number | null> {
  if (!candidateId) return null;

  const pricelistCompanyId = await loadPricelistCompanyId(candidateId);
  if (isPricelistCompatibleWithCompany(pricelistCompanyId, effectiveCompanyId)) {
    return candidateId;
  }

  console.warn(
    `[pricelist] Ignoring pricelist ${candidateId} for partner ${partnerId} because company mismatch. Expected ${effectiveCompanyId}, got ${pricelistCompanyId}`,
  );
  return null;
}

async function readPartnersForPricelist(partnerIds: number[]): Promise<Map<number, PartnerPricelistRecord>> {
  const uniqueIds = [...new Set(partnerIds.filter((id) => typeof id === 'number' && id > 0))];
  if (uniqueIds.length === 0) return new Map();

  const partners = await odooRpc<PartnerPricelistRecord[]>('res.partner', 'search_read', [
    [['id', 'in', uniqueIds]],
  ], {
    fields: [
      'id',
      'parent_id',
      'commercial_partner_id',
      'pricelist_id',
      'specific_property_product_pricelist',
      'property_product_pricelist',
    ],
    limit: uniqueIds.length,
  });

  return new Map((partners || []).map((partner) => [partner.id, partner]));
}

async function resolvePartnerPricelist(partnerId: number, options?: PricingOptions): Promise<PartnerPricelistResolution> {
  const resolutionCacheKey = buildPartnerResolutionCacheKey(partnerId, options);
  const cachedResolution = partnerPricelistResolutionCache.get(resolutionCacheKey);
  if (cachedResolution) {
    return cachedResolution;
  }

  const effectiveCompanyId = getEffectiveSalesCompanyId(options?.companyId);
  let candidatePartnerIds = [partnerId];

  try {
    const initialPartners = await readPartnersForPricelist([partnerId]);
    const initialPartner = initialPartners.get(partnerId);
    candidatePartnerIds = buildPartnerPricelistCandidates(initialPartner || { id: partnerId });

    if (candidatePartnerIds.length > 0) {
      console.log(`[pricelist] Candidate partners for ${partnerId}:`, JSON.stringify(candidatePartnerIds));
      const candidatePartnersMap = await readPartnersForPricelist(candidatePartnerIds);

      for (const candidateId of candidatePartnerIds) {
        const partner = candidatePartnersMap.get(candidateId);
        const rawPricelistId = getPreferredPartnerPricelistId(partner);
        const pricelistId = await pickCompatiblePricelistId(
          candidateId,
          rawPricelistId,
          effectiveCompanyId,
        );
        if (pricelistId) {
          console.log(`[pricelist] Partner ${candidateId} pricelist: ${pricelistId}`);
          const resolution: PartnerPricelistResolution = {
            candidatePartnerIds,
            resolvedPartnerId: candidateId,
            pricelistId,
            source: 'partner_field',
          };
          cacheResolvedPartnerPricelistId(partnerId, pricelistId, options);
          partnerPricelistResolutionCache.set(resolutionCacheKey, resolution);
          return resolution;
        }
      }
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
        ['res_id', 'in', candidatePartnerIds.map((id) => `res.partner,${id}`)],
      ],
    ], {
      fields: ['res_id', 'value_reference'],
      limit: candidatePartnerIds.length || 1,
    });

    console.log(`[pricelist] ir.property fallback for partner ${partnerId}:`, JSON.stringify(props));

    const propByResId = new Map<string, any>();
    for (const prop of props || []) {
      if (typeof prop?.res_id === 'string') {
        propByResId.set(prop.res_id, prop);
      }
    }

    for (const candidateId of candidatePartnerIds) {
      const prop = propByResId.get(`res.partner,${candidateId}`);
      const ref = prop?.value_reference; // e.g. "product.pricelist,3"
      if (typeof ref === 'string' && ref.startsWith('product.pricelist,')) {
        const rawPricelistId = parseInt(ref.split(',')[1], 10);
        const plId = !isNaN(rawPricelistId) && rawPricelistId > 0
          ? await pickCompatiblePricelistId(candidateId, rawPricelistId, effectiveCompanyId)
          : null;
        if (plId) {
          console.log(`[pricelist] Partner ${candidateId} pricelist from ir.property: ${plId}`);
          const resolution: PartnerPricelistResolution = {
            candidatePartnerIds,
            resolvedPartnerId: candidateId,
            pricelistId: plId,
            source: 'ir.property',
          };
          cacheResolvedPartnerPricelistId(partnerId, plId, options);
          partnerPricelistResolutionCache.set(resolutionCacheKey, resolution);
          return resolution;
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
    ], ['pricelist_id', 'specific_property_product_pricelist', 'property_product_pricelist'], 1);

    console.log(`[pricelist] /get_records fallback for partner ${partnerId}:`, JSON.stringify(partners));

    if (partners && partners.length > 0) {
      const rawPricelistId = getPreferredPartnerPricelistId(partners[0]);
      const plId = await pickCompatiblePricelistId(partnerId, rawPricelistId, effectiveCompanyId);
      if (plId) {
        const resolution: PartnerPricelistResolution = {
          candidatePartnerIds,
          resolvedPartnerId: partnerId,
          pricelistId: plId,
          source: 'get_records',
        };
        cacheResolvedPartnerPricelistId(partnerId, plId, options);
        partnerPricelistResolutionCache.set(resolutionCacheKey, resolution);
        return resolution;
      }
    }
  } catch (err) {
    console.warn('[pricelist] /get_records fallback failed:', err);
  }

  const fallbackPricelistId = resolveFallbackPricelistId(options);
  if (fallbackPricelistId) {
    const resolution: PartnerPricelistResolution = {
      candidatePartnerIds,
      resolvedPartnerId: null,
      pricelistId: fallbackPricelistId,
      source: 'company_fallback',
    };
    cacheResolvedPartnerPricelistId(partnerId, fallbackPricelistId, options);
    console.log(
      `[pricelist] Using company fallback pricelist ${fallbackPricelistId} for partner ${partnerId}`,
    );
    partnerPricelistResolutionCache.set(resolutionCacheKey, resolution);
    return resolution;
  }

  const resolution: PartnerPricelistResolution = {
    candidatePartnerIds,
    resolvedPartnerId: null,
    pricelistId: null,
    source: 'none',
  };
  cacheResolvedPartnerPricelistId(partnerId, null, options);
  partnerPricelistResolutionCache.set(resolutionCacheKey, resolution);
  return resolution;
}

/**
 * Load the partner's pricelist ID using direct JSON-RPC.
 *
 * /get_records does NOT return property fields like property_product_pricelist.
 * We use odooRpc → search_read which calls Odoo's native ORM and DOES
 * resolve property fields correctly.
 *
 * Returns null if no specific pricelist (= uses public).
 */
export async function getPartnerPricelistId(partnerId: number, options?: PricingOptions): Promise<number | null> {
  const resolution = await resolvePartnerPricelist(partnerId, options);
  if (!resolution.pricelistId) {
    console.log(`[pricelist] No pricelist found for partner ${partnerId}, using public prices`);
  }
  return resolution.pricelistId;
}

/**
 * Load pricelist items (rules) for a given pricelist.
 * Uses JSON-RPC search_read (primary) with /get_records fallback.
 */
async function loadPricelistItems(pricelistId: number): Promise<PricelistItem[]> {
  const cachedItems = pricelistItemsCache.get(pricelistId);
  if (cachedItems) return cachedItems;

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
      pricelistItemsCache.set(pricelistId, items);
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
    pricelistItemsCache.set(pricelistId, items || []);
    return items || [];
  } catch (error) {
    console.warn('[pricelist] /get_records pricelist items failed:', error);
    return [];
  }
}

function sortPricelistItems(items: PricelistItem[]): PricelistItem[] {
  return [...items].sort((a, b) => {
    const orderMap: Record<string, number> = {
      '0_product_variant': 0,
      '1_product': 1,
      '2_product_category': 2,
      '3_global': 3,
    };
    return (orderMap[a.applied_on] ?? 4) - (orderMap[b.applied_on] ?? 4);
  });
}

function findMatchingRule(
  items: PricelistItem[],
  product: { id: number; list_price: number; product_tmpl_id?: any; categ_id?: any }
): PricelistItem | undefined {
  const tmplId = Array.isArray(product.product_tmpl_id)
    ? product.product_tmpl_id[0]
    : product.product_tmpl_id;
  const categId = Array.isArray(product.categ_id)
    ? product.categ_id[0]
    : product.categ_id;

  return items.find((item) => {
    if (item.min_quantity > 1) return false;

    switch (item.applied_on) {
      case '0_product_variant': {
        const itemProdId = extractMany2oneId(item.product_id);
        return itemProdId === product.id;
      }
      case '1_product': {
        const itemTmplId = extractMany2oneId(item.product_tmpl_id);
        return itemTmplId === tmplId;
      }
      case '2_product_category': {
        const itemCategId = extractMany2oneId(item.categ_id);
        return itemCategId === categId;
      }
      case '3_global':
        return true;
      default:
        return false;
    }
  });
}

/**
 * Fetch customer-specific prices from Odoo's custom endpoint.
 * This endpoint computes prices server-side using Odoo's native pricelist engine,
 * guaranteeing consistency with what Odoo itself would calculate.
 *
 * Returns Map<productId, customerPrice> or null if the endpoint is unavailable.
 */
async function fetchServerSidePrices(
  partnerId: number,
  products: Array<{ id: number; list_price: number }>,
): Promise<Map<number, number> | null> {
  if (!shouldTryServerPricingEndpoint()) {
    return null;
  }

  try {
    const result = await postRpc<any>('/api/get_all_products_with_customer_price', {
      customer_id: partnerId,
    });

    if (!result || result.status !== 'success' || !Array.isArray(result.data)) {
      console.warn('[pricelist] Server-side endpoint returned unexpected format:', result?.status);
      return null;
    }

    // Endpoint is up. Reset any pending backoff so we fail fast if it
    // disappears again.
    markServerPricingEndpointAvailable();

    const priceMap = new Map<number, number>();
    const productIds = new Set(products.map((p) => p.id));
    const productListPrices = new Map(products.map((p) => [p.id, p.list_price]));

    for (const item of result.data) {
      const productId = item.product_id;
      if (!productId || !productIds.has(productId)) continue;

      // Use customer_price from server (base price without tax)
      const customerPrice = typeof item.customer_price === 'number' ? item.customer_price : null;
      if (customerPrice === null || customerPrice <= 0) continue;

      const listPrice = productListPrices.get(productId) ?? 0;
      if (Math.abs(customerPrice - listPrice) > 0.01) {
        priceMap.set(productId, customerPrice);
      }
    }

    console.log(`[pricelist] Server-side: ${priceMap.size} custom prices for partner ${partnerId}`);
    return priceMap;
  } catch (err) {
    if (disableServerPricingEndpointIfMissing(err)) {
      console.warn('[pricelist] Server-side pricing endpoint unavailable, backing off before retry.');
      return null;
    }
    console.warn('[pricelist] Server-side endpoint unavailable, falling back to client-side:', err);
    return null;
  }
}

/**
 * Compute customer-specific prices for a list of products.
 *
 * Strategy:
 *   1. Try server-side endpoint (Odoo computes prices natively — most accurate)
 *   2. Fall back to client-side pricelist item matching if endpoint unavailable
 *
 * Returns Map<productId, finalPrice> — only products with price
 * overrides are in the map. Products NOT in the map use list_price.
 */
export async function computeCustomerPrices(
  partnerId: number,
  products: Array<{ id: number; list_price: number; product_tmpl_id?: any; categ_id?: any; standard_price?: number }>,
  options?: PricingOptions,
): Promise<Map<number, number>> {
  console.log(`[pricelist] Computing prices for partner ${partnerId}, ${products.length} products`);
  const cachedPrices = peekCachedCustomerPrices(partnerId, products, options);
  if (cachedPrices) {
    return cachedPrices;
  }

  // ── Strategy 1: Server-side (preferred — Odoo native pricelist engine) ──
  const serverPrices = await fetchServerSidePrices(partnerId, products);
  if (serverPrices !== null) {
    cacheCustomerPrices(partnerId, products, serverPrices, options);
    return serverPrices;
  }

  // ── Strategy 2: Client-side fallback ──
  const priceMap = new Map<number, number>();

  const resolution = await resolvePartnerPricelist(partnerId, options);
  const pricelistId = resolution.pricelistId;
  if (!pricelistId) {
    cacheCustomerPrices(partnerId, products, priceMap, options);
    return priceMap;
  }

  const items = await loadPricelistItems(pricelistId);
  if (items.length === 0) {
    console.log(`[pricelist] Pricelist ${pricelistId} has no items`);
    cacheCustomerPrices(partnerId, products, priceMap, options);
    return priceMap;
  }

  const itemsCache = new Map<number, PricelistItem[]>();
  itemsCache.set(pricelistId, sortPricelistItems(items));

  async function getSortedItemsForPricelist(targetPricelistId: number): Promise<PricelistItem[]> {
    const cached = itemsCache.get(targetPricelistId);
    if (cached) return cached;
    const loaded = sortPricelistItems(await loadPricelistItems(targetPricelistId));
    itemsCache.set(targetPricelistId, loaded);
    return loaded;
  }

  async function computePriceForProduct(
    targetPricelistId: number,
    product: { id: number; list_price: number; product_tmpl_id?: any; categ_id?: any; standard_price?: number },
    visited: Set<number>
  ): Promise<number> {
    if (visited.has(targetPricelistId)) return product.list_price;
    visited.add(targetPricelistId);

    const targetItems = await getSortedItemsForPricelist(targetPricelistId);
    const matchingRule = findMatchingRule(targetItems, product);
    if (!matchingRule) return product.list_price;

    if (matchingRule.compute_price === 'formula' && matchingRule.base === 'pricelist') {
      const nestedPricelistId = extractPricelistId(matchingRule.base_pricelist_id);
      if (nestedPricelistId && !visited.has(nestedPricelistId)) {
        const nestedPrice = await computePriceForProduct(nestedPricelistId, product, visited);
        return computeRulePrice(product, matchingRule, () => nestedPrice);
      }
    }

    return computeRulePrice(product, matchingRule);
  }

  for (const product of products) {
    const price = await computePriceForProduct(pricelistId, product, new Set());
    if (Math.abs(price - product.list_price) > 0.01) {
      priceMap.set(product.id, price);
    }
  }

  console.log(`[pricelist] Client-side: ${priceMap.size} custom prices for partner ${partnerId} (pricelist ${pricelistId})`);
  cacheCustomerPrices(partnerId, products, priceMap, options);
  return priceMap;
}

export async function preloadRouteCustomerPrices(
  partnerIds: number[],
  products: Array<{ id: number; list_price: number; product_tmpl_id?: any; categ_id?: any; standard_price?: number }>,
  options?: PricingOptions,
): Promise<void> {
  const uniquePartnerIds = [...new Set(partnerIds.filter((id) => typeof id === 'number' && id > 0))];
  if (uniquePartnerIds.length === 0 || products.length === 0) return;

  await Promise.allSettled(
    uniquePartnerIds.map((partnerId) => computeCustomerPrices(partnerId, products, options)),
  );
}
