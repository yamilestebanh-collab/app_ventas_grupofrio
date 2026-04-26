import assert from 'node:assert/strict';

interface ExchangeContractsModule {
  buildExchangeCreatePayload: (payload: Record<string, unknown>) => Record<string, unknown>;
}

function testExchangePayloadMatchesContract(module: ExchangeContractsModule) {
  const actual = module.buildExchangeCreatePayload({
    analytic_account_id: 820,
    mobile_location_id: 44,
    partner_id: 52738,
    visit_line_id: 9123,
    idempotency_key: '0d4c8d3d-4ea3-49c0-a412-b5f3f3d37200',
    delivery_lines: [
      { product_id: 987, qty: 2 },
      { product_id: 654, quantity: 1.5 },
    ],
    merma_lines: [
      { product_id: 333, qty: 1 },
    ],
    notes: 'Cambio por producto dañado',
    validate: true,
  });

  assert.deepEqual(actual, {
    meta: {
      analytic_account_id: 820,
      idempotency_key: '0d4c8d3d-4ea3-49c0-a412-b5f3f3d37200',
    },
    data: {
      mobile_location_id: 44,
      partner_id: 52738,
      visit_line_id: 9123,
      delivery_lines: [
        { product_id: 987, qty: 2 },
        { product_id: 654, qty: 1.5 },
      ],
      merma_lines: [
        { product_id: 333, qty: 1 },
      ],
      notes: 'Cambio por producto dañado',
      validate: true,
    },
  });
}

function testExchangePayloadOmitsEmptyOptionals(module: ExchangeContractsModule) {
  const actual = module.buildExchangeCreatePayload({
    analytic_account_id: 820,
    mobile_location_id: 44,
    partner_id: 52738,
    idempotency_key: 'retry-uuid',
    visit_line_id: 0,
    delivery_lines: [
      { product_id: 987, qty: 0 },
      { product_id: 654, qty: 3 },
    ],
    merma_lines: [],
    notes: '   ',
    validate: undefined,
  });

  assert.deepEqual(actual, {
    meta: {
      analytic_account_id: 820,
      idempotency_key: 'retry-uuid',
    },
    data: {
      mobile_location_id: 44,
      partner_id: 52738,
      delivery_lines: [
        { product_id: 654, qty: 3 },
      ],
      merma_lines: [],
      validate: true,
    },
  });
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/gfLogisticsContracts.ts', import.meta.url).pathname
  ) as ExchangeContractsModule;

  testExchangePayloadMatchesContract(module);
  testExchangePayloadOmitsEmptyOptionals(module);
  console.log('gf exchange contracts tests: ok');
}

void main();
