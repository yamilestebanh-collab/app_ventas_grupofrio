"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMany2oneId = extractMany2oneId;
exports.buildPartnerPricelistCandidates = buildPartnerPricelistCandidates;
exports.getPreferredPartnerPricelistId = getPreferredPartnerPricelistId;
exports.roundToPricelistStep = roundToPricelistStep;
exports.computeRulePrice = computeRulePrice;
function toNumber(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function extractMany2oneId(value) {
    if (Array.isArray(value) && typeof value[0] === 'number')
        return value[0];
    if (typeof value === 'number' && value > 0)
        return value;
    return null;
}
function buildPartnerPricelistCandidates(partner) {
    if (!partner || !partner.id)
        return [];
    const ids = [
        partner.id,
        extractMany2oneId(partner.parent_id),
        extractMany2oneId(partner.commercial_partner_id),
    ].filter((id) => typeof id === 'number' && id > 0);
    return [...new Set(ids)];
}
function getPreferredPartnerPricelistId(partner) {
    if (!partner)
        return null;
    return (extractMany2oneId(partner.pricelist_id) ??
        extractMany2oneId(partner.specific_property_product_pricelist) ??
        extractMany2oneId(partner.property_product_pricelist));
}
function roundToPricelistStep(value, step) {
    if (!Number.isFinite(value))
        return 0;
    if (!Number.isFinite(step) || step <= 0)
        return value;
    const scaled = value / step;
    const rounded = Math.ceil(scaled - 1e-9) * step;
    return Number(rounded.toFixed(6));
}
function computeRulePrice(product, rule, resolveBasePrice) {
    const listPrice = toNumber(product.list_price);
    switch (rule.compute_price) {
        case 'fixed':
            return toNumber(rule.fixed_price);
        case 'percentage':
            return listPrice * (1 - toNumber(rule.percent_price) / 100);
        case 'formula': {
            let basePrice = listPrice;
            if (rule.base === 'standard_price') {
                basePrice = toNumber(product.standard_price, listPrice);
            }
            else if (rule.base === 'pricelist') {
                const nestedPricelistId = extractMany2oneId(rule.base_pricelist_id);
                const nestedPrice = nestedPricelistId ? resolveBasePrice?.(nestedPricelistId) : null;
                if (typeof nestedPrice === 'number' && Number.isFinite(nestedPrice)) {
                    basePrice = nestedPrice;
                }
            }
            let price = basePrice * (1 - toNumber(rule.price_discount) / 100);
            price = roundToPricelistStep(price, toNumber(rule.price_round));
            price += toNumber(rule.price_surcharge);
            const minMargin = toNumber(rule.price_min_margin);
            if (minMargin > 0) {
                price = Math.max(price, basePrice + minMargin);
            }
            const maxMargin = toNumber(rule.price_max_margin);
            if (maxMargin > 0) {
                price = Math.min(price, basePrice + maxMargin);
            }
            return Number(price.toFixed(6));
        }
        default:
            return listPrice;
    }
}
