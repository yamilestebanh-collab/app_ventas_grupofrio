import assert from 'node:assert/strict';

interface SaleAnalyticsModule {
  DEFAULT_ANALYTIC_UN_ID: number;
  resolveImplicitSaleAnalytics: (input: {
    employeeAnalyticPlazaId?: number | null;
    employeeAnalyticUnId?: number | null;
  }) => {
    analytic_plaza_id: number | null;
    analytic_un_id: number | null;
    analytic_distribution: Record<string, number> | null;
  };
  buildFallbackAnalyticsSnapshot: () => {
    plazaOptions: Array<{ id: number }>;
    unOptions: Array<{ id: number }>;
    globalDefaults: { analytic_plaza_id: number | null; analytic_un_id: number | null };
    defaultsByPartner: Record<string, { analytic_plaza_id: number | null; analytic_un_id: number | null }>;
  };
  normalizeAnalyticsOptionsPayload: (payload: unknown) => {
    plazaOptions: Array<{ id: number; code: string }>;
    unOptions: Array<{ id: number; code: string }>;
    globalDefaults: { analytic_plaza_id: number | null; analytic_un_id: number | null };
    defaultsByPartner: Record<string, { analytic_plaza_id: number | null; analytic_un_id: number | null }>;
  };
}

function testFallbackKeepsRequiredCatalogs(module: SaleAnalyticsModule) {
  const fallback = module.buildFallbackAnalyticsSnapshot();
  assert.equal(module.DEFAULT_ANALYTIC_UN_ID, 864);
  assert.ok(fallback.plazaOptions.length > 0);
  assert.ok(fallback.unOptions.length > 0);
  assert.equal(fallback.globalDefaults.analytic_plaza_id, null);
  assert.equal(fallback.globalDefaults.analytic_un_id, 864);
}

function testImplicitSaleAnalyticsUsesEmployeePlazaAndFixedCedis(module: SaleAnalyticsModule) {
  const actual = module.resolveImplicitSaleAnalytics({
    employeeAnalyticPlazaId: 820,
    employeeAnalyticUnId: null,
  });

  assert.deepEqual(actual, {
    analytic_plaza_id: 820,
    analytic_un_id: 864,
    analytic_distribution: {
      '820': 100,
      '864': 100,
    },
  });
}

function testServerPayloadOverridesCatalogAndDefaults(module: SaleAnalyticsModule) {
  const actual = module.normalizeAnalyticsOptionsPayload({
    plans: {
      plaza: {
        plan_id: 2,
        options: [{ id: 820, name: 'Iguala', code: 'IGU', plan_id: 2 }],
      },
      unidad_negocio: {
        plan_id: 12,
        options: [{ id: 864, name: 'CEDIS', code: 'CDS', plan_id: 12 }],
      },
    },
    defaults: {
      analytic_plaza_id: 820,
      analytic_un_id: 864,
    },
    defaults_by_partner: {
      '51090': {
        analytic_plaza_id: 820,
        analytic_un_id: 864,
      },
    },
  });

  assert.deepEqual(actual, {
    plazaOptions: [{ id: 820, name: 'Iguala', code: 'IGU', plan_id: 2 }],
    unOptions: [{ id: 864, name: 'CEDIS', code: 'CDS', plan_id: 12 }],
    globalDefaults: { analytic_plaza_id: 820, analytic_un_id: 864 },
    defaultsByPartner: {
      '51090': { analytic_plaza_id: 820, analytic_un_id: 864 },
    },
  });
}

async function main() {
  const module = await import(
    // @ts-ignore -- import.meta only used in test runtime.
    new URL('../src/services/saleAnalytics.ts', import.meta.url).pathname
  ) as SaleAnalyticsModule;

  testFallbackKeepsRequiredCatalogs(module);
  testImplicitSaleAnalyticsUsesEmployeePlazaAndFixedCedis(module);
  testServerPayloadOverridesCatalogAndDefaults(module);
  console.log('sale analytics tests: ok');
}

void main();
