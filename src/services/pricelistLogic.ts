export interface PartnerPricelistCandidateInput {
  id: number;
  parent_id?: [number, string] | number | false | null;
  commercial_partner_id?: [number, string] | number | false | null;
  pricelist_id?: [number, string] | number | false | null;
  specific_property_product_pricelist?: [number, string] | number | false | null;
  property_product_pricelist?: [number, string] | number | false | null;
}

export interface RulePriceProductLike {
  id: number;
  list_price: number;
  standard_price?: number;
}

export interface RulePriceInput {
  compute_price: 'fixed' | 'percentage' | 'formula';
  fixed_price?: number;
  percent_price?: number;
  base?: 'list_price' | 'standard_price' | 'pricelist';
  base_pricelist_id?: [number, string] | number | false | null;
  price_discount?: number;
  price_surcharge?: number;
  price_round?: number;
  price_min_margin?: number;
  price_max_margin?: number;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function extractMany2oneId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (typeof value === 'number' && value > 0) return value;
  return null;
}

export function buildPartnerPricelistCandidates(
  partner: PartnerPricelistCandidateInput | null | undefined
): number[] {
  if (!partner || !partner.id) return [];

  const ids = [
    partner.id,
    extractMany2oneId(partner.parent_id),
    extractMany2oneId(partner.commercial_partner_id),
  ].filter((id): id is number => typeof id === 'number' && id > 0);

  return [...new Set(ids)];
}

export function getPreferredPartnerPricelistId(
  partner: Pick<
    PartnerPricelistCandidateInput,
    'pricelist_id' | 'specific_property_product_pricelist' | 'property_product_pricelist'
  > | null | undefined
): number | null {
  if (!partner) return null;

  return (
    extractMany2oneId(partner.pricelist_id) ??
    extractMany2oneId(partner.specific_property_product_pricelist) ??
    extractMany2oneId(partner.property_product_pricelist)
  );
}

export function roundToPricelistStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(step) || step <= 0) return value;
  const scaled = value / step;
  const rounded = Math.ceil(scaled - 1e-9) * step;
  return Number(rounded.toFixed(6));
}

export function computeRulePrice(
  product: RulePriceProductLike,
  rule: RulePriceInput,
  resolveBasePrice?: (pricelistId: number) => number | null | undefined
): number {
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
      } else if (rule.base === 'pricelist') {
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
