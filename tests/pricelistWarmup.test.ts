import assert from 'node:assert/strict';

interface PricelistModule {
  DEFAULT_SALES_COMPANY_ID: number;
  getEffectiveSalesCompanyId: (companyId: number | null | undefined) => number;
  getCompanyFallbackPricelistId: (companyId: number | null | undefined) => number | null;
  isPricelistCompatibleWithCompany: (
    pricelistCompanyId: number | null | undefined,
    companyId: number | null | undefined,
  ) => boolean;
  cacheResolvedPartnerPricelistId: (
    partnerId: number,
    pricelistId: number | null,
    options?: { companyId?: number | null; fallbackPricelistId?: number | null },
  ) => void;
  peekResolvedPartnerPricelistId: (
    partnerId: number,
    options?: { companyId?: number | null; fallbackPricelistId?: number | null },
  ) => number | null;
  peekCachedCustomerPrices: (
    partnerId: number,
    products: Array<{ id: number }>,
    options?: { companyId?: number | null; fallbackPricelistId?: number | null },
  ) => Map<number, number> | null;
  primeCustomerPriceCacheForTests: (
    partnerId: number,
    products: Array<{ id: number }>,
    prices: Array<[number, number]>,
    options?: { companyId?: number | null; fallbackPricelistId?: number | null },
  ) => void;
  resetPricelistCachesForTests: () => void;
}

function testCompany34UsesExpectedFallbackPricelist(module: PricelistModule) {
  assert.equal(module.DEFAULT_SALES_COMPANY_ID, 34);
  assert.equal(module.getEffectiveSalesCompanyId(null), 34);
  assert.equal(module.getCompanyFallbackPricelistId(34), 81);
  assert.equal(module.getCompanyFallbackPricelistId(1), null);
  assert.equal(module.getCompanyFallbackPricelistId(null), 81);
}

function testPricelistCompatibilityFavorsCompany34(module: PricelistModule) {
  assert.equal(module.isPricelistCompatibleWithCompany(34, 34), true);
  assert.equal(module.isPricelistCompatibleWithCompany(1, 34), false);
  assert.equal(module.isPricelistCompatibleWithCompany(null, 34), true);
  assert.equal(module.isPricelistCompatibleWithCompany(34, null), true);
}

function testCachedPartnerPricesAreReused(module: PricelistModule) {
  module.resetPricelistCachesForTests();
  const products = [{ id: 10 }, { id: 20 }];
  module.primeCustomerPriceCacheForTests(
    52738,
    products,
    [[10, 44.5], [20, 89]],
    { companyId: 34 },
  );

  const cached = module.peekCachedCustomerPrices(52738, products, { companyId: 34 });
  assert.ok(cached instanceof Map);
  assert.equal(cached?.get(10), 44.5);
  assert.equal(cached?.get(20), 89);

  const missingCoverage = module.peekCachedCustomerPrices(
    52738,
    [{ id: 10 }, { id: 20 }, { id: 30 }],
    { companyId: 34 },
  );
  assert.equal(missingCoverage, null);
}

function testResolvedPartnerPricelistCanBeReused(module: PricelistModule) {
  module.resetPricelistCachesForTests();
  module.cacheResolvedPartnerPricelistId(51090, 81, { companyId: 34 });

  assert.equal(
    module.peekResolvedPartnerPricelistId(51090, { companyId: 34 }),
    81,
  );
  assert.equal(
    module.peekResolvedPartnerPricelistId(51090, { companyId: 1 }),
    null,
  );
}

async function main() {
  const module = await import(
    // @ts-ignore -- import.meta only used in test runtime.
    new URL('../src/services/pricelistCache.ts', import.meta.url).pathname
  ) as PricelistModule;

  testCompany34UsesExpectedFallbackPricelist(module);
  testPricelistCompatibilityFavorsCompany34(module);
  testCachedPartnerPricesAreReused(module);
  testResolvedPartnerPricelistCanBeReused(module);
  console.log('pricelist warmup tests: ok');
}

void main();
