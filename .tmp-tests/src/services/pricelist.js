"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnerPricelistId = getPartnerPricelistId;
exports.computeCustomerPrices = computeCustomerPrices;
const odooRpc_1 = require("./odooRpc");
const pricelistLogic_1 = require("./pricelistLogic");
const PRICELIST_ITEM_FIELDS = [
    'id', 'product_id', 'product_tmpl_id', 'categ_id',
    'compute_price', 'base', 'base_pricelist_id',
    'fixed_price', 'percent_price',
    'price_discount', 'price_surcharge', 'price_round',
    'price_min_margin', 'price_max_margin',
    'min_quantity', 'applied_on',
];
function extractPricelistId(value) {
    return (0, pricelistLogic_1.extractMany2oneId)(value);
}
async function readPartnersForPricelist(partnerIds) {
    const uniqueIds = [...new Set(partnerIds.filter((id) => typeof id === 'number' && id > 0))];
    if (uniqueIds.length === 0)
        return new Map();
    const partners = await (0, odooRpc_1.odooRpc)('res.partner', 'search_read', [
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
async function resolvePartnerPricelist(partnerId) {
    let candidatePartnerIds = [partnerId];
    try {
        const initialPartners = await readPartnersForPricelist([partnerId]);
        const initialPartner = initialPartners.get(partnerId);
        candidatePartnerIds = (0, pricelistLogic_1.buildPartnerPricelistCandidates)(initialPartner || { id: partnerId });
        if (candidatePartnerIds.length > 0) {
            console.log(`[pricelist] Candidate partners for ${partnerId}:`, JSON.stringify(candidatePartnerIds));
            const candidatePartnersMap = await readPartnersForPricelist(candidatePartnerIds);
            for (const candidateId of candidatePartnerIds) {
                const partner = candidatePartnersMap.get(candidateId);
                const pricelistId = (0, pricelistLogic_1.getPreferredPartnerPricelistId)(partner);
                if (pricelistId) {
                    console.log(`[pricelist] Partner ${candidateId} pricelist: ${pricelistId}`);
                    return {
                        candidatePartnerIds,
                        resolvedPartnerId: candidateId,
                        pricelistId,
                        source: 'partner_field',
                    };
                }
            }
        }
    }
    catch (err) {
        console.warn('[pricelist] search_read failed, trying ir.property fallback:', err);
    }
    // ── Attempt 2: Read ir.property directly ──
    // property_product_pricelist is stored in ir.property with
    // res_id = 'res.partner,{partnerId}'
    try {
        const props = await (0, odooRpc_1.odooRpc)('ir.property', 'search_read', [
            [
                ['name', '=', 'property_product_pricelist'],
                ['res_id', 'in', candidatePartnerIds.map((id) => `res.partner,${id}`)],
            ],
        ], {
            fields: ['res_id', 'value_reference'],
            limit: candidatePartnerIds.length || 1,
        });
        console.log(`[pricelist] ir.property fallback for partner ${partnerId}:`, JSON.stringify(props));
        const propByResId = new Map();
        for (const prop of props || []) {
            if (typeof prop?.res_id === 'string') {
                propByResId.set(prop.res_id, prop);
            }
        }
        for (const candidateId of candidatePartnerIds) {
            const prop = propByResId.get(`res.partner,${candidateId}`);
            const ref = prop?.value_reference; // e.g. "product.pricelist,3"
            if (typeof ref === 'string' && ref.startsWith('product.pricelist,')) {
                const plId = parseInt(ref.split(',')[1], 10);
                if (!isNaN(plId) && plId > 0) {
                    console.log(`[pricelist] Partner ${candidateId} pricelist from ir.property: ${plId}`);
                    return {
                        candidatePartnerIds,
                        resolvedPartnerId: candidateId,
                        pricelistId: plId,
                        source: 'ir.property',
                    };
                }
            }
        }
    }
    catch (err) {
        console.warn('[pricelist] ir.property fallback failed:', err);
    }
    // ── Attempt 3: /get_records as last resort ──
    try {
        const partners = await (0, odooRpc_1.odooRead)('res.partner', [
            ['id', '=', partnerId],
        ], ['pricelist_id', 'specific_property_product_pricelist', 'property_product_pricelist'], 1);
        console.log(`[pricelist] /get_records fallback for partner ${partnerId}:`, JSON.stringify(partners));
        if (partners && partners.length > 0) {
            const plId = (0, pricelistLogic_1.getPreferredPartnerPricelistId)(partners[0]);
            if (plId) {
                return {
                    candidatePartnerIds,
                    resolvedPartnerId: partnerId,
                    pricelistId: plId,
                    source: 'get_records',
                };
            }
        }
    }
    catch (err) {
        console.warn('[pricelist] /get_records fallback failed:', err);
    }
    return {
        candidatePartnerIds,
        resolvedPartnerId: null,
        pricelistId: null,
        source: 'none',
    };
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
async function getPartnerPricelistId(partnerId) {
    const resolution = await resolvePartnerPricelist(partnerId);
    if (!resolution.pricelistId) {
        console.log(`[pricelist] No pricelist found for partner ${partnerId}, using public prices`);
    }
    return resolution.pricelistId;
}
/**
 * Load pricelist items (rules) for a given pricelist.
 * Uses JSON-RPC search_read (primary) with /get_records fallback.
 */
async function loadPricelistItems(pricelistId) {
    // Try direct JSON-RPC first
    try {
        const items = await (0, odooRpc_1.odooRpc)('product.pricelist.item', 'search_read', [
            [['pricelist_id', '=', pricelistId]],
        ], {
            fields: PRICELIST_ITEM_FIELDS,
            limit: 500,
        });
        if (items && items.length > 0) {
            console.log(`[pricelist] Loaded ${items.length} pricelist items via search_read for pricelist ${pricelistId}`);
            return items;
        }
    }
    catch (err) {
        console.warn('[pricelist] search_read pricelist items failed:', err);
    }
    // Fallback to /get_records
    try {
        const items = await (0, odooRpc_1.odooRead)('product.pricelist.item', [
            ['pricelist_id', '=', pricelistId],
        ], PRICELIST_ITEM_FIELDS, 500);
        console.log(`[pricelist] Loaded ${items?.length ?? 0} pricelist items via /get_records for pricelist ${pricelistId}`);
        return items || [];
    }
    catch (error) {
        console.warn('[pricelist] /get_records pricelist items failed:', error);
        return [];
    }
}
function sortPricelistItems(items) {
    return [...items].sort((a, b) => {
        const orderMap = {
            '0_product_variant': 0,
            '1_product': 1,
            '2_product_category': 2,
            '3_global': 3,
        };
        return (orderMap[a.applied_on] ?? 4) - (orderMap[b.applied_on] ?? 4);
    });
}
function findMatchingRule(items, product) {
    const tmplId = Array.isArray(product.product_tmpl_id)
        ? product.product_tmpl_id[0]
        : product.product_tmpl_id;
    const categId = Array.isArray(product.categ_id)
        ? product.categ_id[0]
        : product.categ_id;
    return items.find((item) => {
        if (item.min_quantity > 1)
            return false;
        switch (item.applied_on) {
            case '0_product_variant': {
                const itemProdId = (0, pricelistLogic_1.extractMany2oneId)(item.product_id);
                return itemProdId === product.id;
            }
            case '1_product': {
                const itemTmplId = (0, pricelistLogic_1.extractMany2oneId)(item.product_tmpl_id);
                return itemTmplId === tmplId;
            }
            case '2_product_category': {
                const itemCategId = (0, pricelistLogic_1.extractMany2oneId)(item.categ_id);
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
 * Compute customer-specific prices for a list of products.
 *
 * Returns Map<productId, finalPrice> — only products with price
 * overrides are in the map. Products NOT in the map use list_price.
 *
 * Rule priority (Odoo standard):
 *   0_product_variant > 1_product > 2_product_category > 3_global
 *   Lower min_quantity matches first for qty=1
 */
async function computeCustomerPrices(partnerId, products) {
    const priceMap = new Map();
    console.log(`[pricelist] Computing prices for partner ${partnerId}, ${products.length} products`);
    const resolution = await resolvePartnerPricelist(partnerId);
    const pricelistId = resolution.pricelistId;
    if (!pricelistId)
        return priceMap;
    const items = await loadPricelistItems(pricelistId);
    if (items.length === 0) {
        console.log(`[pricelist] Pricelist ${pricelistId} has no items`);
        return priceMap;
    }
    const itemsCache = new Map();
    itemsCache.set(pricelistId, sortPricelistItems(items));
    async function getSortedItemsForPricelist(targetPricelistId) {
        const cached = itemsCache.get(targetPricelistId);
        if (cached)
            return cached;
        const loaded = sortPricelistItems(await loadPricelistItems(targetPricelistId));
        itemsCache.set(targetPricelistId, loaded);
        return loaded;
    }
    async function computePriceForProduct(targetPricelistId, product, visited) {
        if (visited.has(targetPricelistId))
            return product.list_price;
        visited.add(targetPricelistId);
        const targetItems = await getSortedItemsForPricelist(targetPricelistId);
        const matchingRule = findMatchingRule(targetItems, product);
        if (!matchingRule)
            return product.list_price;
        if (matchingRule.compute_price === 'formula' && matchingRule.base === 'pricelist') {
            const nestedPricelistId = extractPricelistId(matchingRule.base_pricelist_id);
            if (nestedPricelistId && !visited.has(nestedPricelistId)) {
                const nestedPrice = await computePriceForProduct(nestedPricelistId, product, visited);
                return (0, pricelistLogic_1.computeRulePrice)(product, matchingRule, () => nestedPrice);
            }
        }
        return (0, pricelistLogic_1.computeRulePrice)(product, matchingRule);
    }
    for (const product of products) {
        const price = await computePriceForProduct(pricelistId, product, new Set());
        if (Math.abs(price - product.list_price) > 0.01) {
            priceMap.set(product.id, price);
        }
    }
    console.log(`[pricelist] Computed ${priceMap.size} custom prices for partner ${partnerId} (pricelist ${pricelistId})`);
    return priceMap;
}
