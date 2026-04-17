import assert from 'node:assert/strict';

interface EmployeeAnalyticsModule {
  extractEmployeeAnalyticPlaza: (payload: Record<string, unknown>) => {
    id: number | null;
    name: string;
  };
}

function testExtractsAnalyticPlazaFromRealEmployeeField(module: EmployeeAnalyticsModule) {
  const actual = module.extractEmployeeAnalyticPlaza({
    x_analytic_account_id: [820, 'Iguala'],
  });

  assert.deepEqual(actual, {
    id: 820,
    name: 'Iguala',
  });
}

async function main() {
  const module = await import(
    // @ts-ignore -- import.meta only used in test runtime.
    new URL('../src/services/employeeAnalytics.ts', import.meta.url).pathname
  ) as EmployeeAnalyticsModule;

  testExtractsAnalyticPlazaFromRealEmployeeField(module);
  console.log('employee analytics tests: ok');
}

void main();
