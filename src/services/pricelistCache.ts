export const DEFAULT_SALES_COMPANY_ID = 34;

export const COMPANY_PRICELIST_FALLBACKS: Record<number, number> = {
  34: 81,
};

export function getEffectiveSalesCompanyId(companyId: number | null | undefined): number {
  if (typeof companyId === 'number' && companyId > 0) return companyId;
  return DEFAULT_SALES_COMPANY_ID;
}

export function getCompanyFallbackPricelistId(companyId: number | null | undefined): number | null {
  const effectiveCompanyId = getEffectiveSalesCompanyId(companyId);
  return COMPANY_PRICELIST_FALLBACKS[effectiveCompanyId] ?? null;
}

export function isPricelistCompatibleWithCompany(
  pricelistCompanyId: number | null | undefined,
  companyId: number | null | undefined,
): boolean {
  if (typeof pricelistCompanyId !== 'number' || pricelistCompanyId <= 0) return true;
  if (typeof companyId !== 'number' || companyId <= 0) return true;
  return pricelistCompanyId === companyId;
}

type CacheOptions = {
  companyId?: number | null;
  fallbackPricelistId?: number | null;
};

function normalizeFallbackPricelistId(options?: CacheOptions): number | null {
  if (typeof options?.fallbackPricelistId === 'number' && options.fallbackPricelistId > 0) {
    return options.fallbackPricelistId;
  }
  return getCompanyFallbackPricelistId(options?.companyId);
}

function buildProductsKey(products: Array<{ id: number }>): string {
  return products
    .map((product) => product.id)
    .filter((id) => typeof id === 'number' && id > 0)
    .sort((a, b) => a - b)
    .join(',');
}

function buildPartnerCacheKey(
  partnerId: number,
  products: Array<{ id: number }>,
  options?: CacheOptions,
): string {
  return [
    partnerId,
    normalizeFallbackPricelistId(options) ?? 0,
    buildProductsKey(products),
  ].join('|');
}

const partnerPriceCache = new Map<string, Map<number, number>>();
const partnerPricelistIdCache = new Map<string, number | null>();

export function peekCachedCustomerPrices(
  partnerId: number,
  products: Array<{ id: number }>,
  options?: CacheOptions,
): Map<number, number> | null {
  const key = buildPartnerCacheKey(partnerId, products, options);
  const cached = partnerPriceCache.get(key);
  return cached ? new Map(cached) : null;
}

export function cacheCustomerPrices(
  partnerId: number,
  products: Array<{ id: number }>,
  prices: Map<number, number>,
  options?: CacheOptions,
): void {
  const key = buildPartnerCacheKey(partnerId, products, options);
  partnerPriceCache.set(key, new Map(prices));
}

function buildPartnerPricelistKey(partnerId: number, options?: CacheOptions): string {
  return [
    partnerId,
    normalizeFallbackPricelistId(options) ?? 0,
  ].join('|');
}

export function cacheResolvedPartnerPricelistId(
  partnerId: number,
  pricelistId: number | null,
  options?: CacheOptions,
): void {
  partnerPricelistIdCache.set(buildPartnerPricelistKey(partnerId, options), pricelistId);
}

export function peekResolvedPartnerPricelistId(
  partnerId: number,
  options?: CacheOptions,
): number | null {
  const key = buildPartnerPricelistKey(partnerId, options);
  return partnerPricelistIdCache.has(key) ? (partnerPricelistIdCache.get(key) ?? null) : null;
}

export function primeCustomerPriceCacheForTests(
  partnerId: number,
  products: Array<{ id: number }>,
  prices: Array<[number, number]>,
  options?: CacheOptions,
): void {
  cacheCustomerPrices(partnerId, products, new Map(prices), options);
}

export function clearPricelistCaches(): void {
  partnerPriceCache.clear();
  partnerPricelistIdCache.clear();
}

export function resetPricelistCachesForTests(): void {
  clearPricelistCaches();
}
