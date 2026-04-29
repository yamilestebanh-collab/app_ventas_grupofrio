import assert from 'node:assert/strict';

interface EmployeeAnalyticsModule {
  extractEmployeeAnalyticPlaza: (payload: Record<string, unknown>) => {
    id: number | null;
    name: string;
  };
}

function testExtractsAnalyticPlazaFromNewFieldName(module: EmployeeAnalyticsModule) {
  const actual = module.extractEmployeeAnalyticPlaza({
    x_analytic_un_id: [820, 'Iguala'],
  });

  assert.deepEqual(actual, {
    id: 820,
    name: 'Iguala',
  });
}

function testExtractsAnalyticPlazaFromLegacyFieldName(module: EmployeeAnalyticsModule) {
  const actual = module.extractEmployeeAnalyticPlaza({
    x_analytic_account_id: [818, 'Guadalajara'],
  });

  assert.deepEqual(actual, {
    id: 818,
    name: 'Guadalajara',
  });
}

async function main() {
  const module = await import(
    // @ts-ignore -- import.meta only used in test runtime.
    new URL('../src/services/extractEmployeeAnalyticPlaza.ts', import.meta.url).pathname
  ) as EmployeeAnalyticsModule;

  testExtractsAnalyticPlazaFromNewFieldName(module);
  testExtractsAnalyticPlazaFromLegacyFieldName(module);
  console.log('employee analytics tests: ok');
}

void main();
