import assert from 'node:assert/strict';

interface GiftPayloadModule {
  buildGiftPayload: (input: {
    analyticAccountId: number;
    idempotencyKey: string;
    mobileLocationId: number;
    partnerId: number;
    visitLineId?: number | null;
    lines: Array<{ productId: number; qty: number }>;
    notes?: string;
  }) => Record<string, unknown>;
  getGiftSubmitIssues: (input: {
    lines: Array<{ key: string; productId: number | null; qtyText: string }>;
    partnerId: number | null;
    mobileLocationId: number | null | undefined;
    analyticAccountId: number | null | undefined;
  }) => string[];
  normalizeGiftErrorMessage: (input: {
    code?: string | null;
    message?: string | null;
    userMessage?: string | null;
  }) => string;
}

function testBuildGiftPayloadAllowsNullVisitLine(module: GiftPayloadModule) {
  const payload = module.buildGiftPayload({
    analyticAccountId: 820,
    idempotencyKey: 'gift-123',
    mobileLocationId: 441,
    partnerId: 51090,
    visitLineId: null,
    lines: [{ productId: 760, qty: 1.5 }],
    notes: 'Entrega de muestra',
  });

  assert.deepEqual(payload, {
    meta: {
      analytic_account_id: 820,
      idempotency_key: 'gift-123',
    },
    data: {
      mobile_location_id: 441,
      partner_id: 51090,
      visit_line_id: null,
      lines: [{ product_id: 760, qty: 1.5 }],
      notes: 'Entrega de muestra',
      validate: true,
    },
  });
}

function testSubmitIssuesBlockMissingPartnerAndDuplicates(module: GiftPayloadModule) {
  const issues = module.getGiftSubmitIssues({
    partnerId: null,
    mobileLocationId: 441,
    analyticAccountId: 820,
    lines: [
      { key: 'a', productId: 760, qtyText: '1' },
      { key: 'b', productId: 760, qtyText: '2' },
    ],
  });

  assert.deepEqual(issues, ['missing_partner', 'duplicate_products']);
}

function testSubmitIssuesRequireAtLeastOneValidLine(module: GiftPayloadModule) {
  const issues = module.getGiftSubmitIssues({
    partnerId: 51090,
    mobileLocationId: 441,
    analyticAccountId: 820,
    lines: [
      { key: 'a', productId: 760, qtyText: '0' },
      { key: 'b', productId: null, qtyText: '' },
    ],
  });

  assert.deepEqual(issues, ['no_valid_lines']);
}

function testSubmitIssuesRequireOperationalIds(module: GiftPayloadModule) {
  const issues = module.getGiftSubmitIssues({
    partnerId: 51090,
    mobileLocationId: null,
    analyticAccountId: null,
    lines: [{ key: 'a', productId: 760, qtyText: '1' }],
  });

  assert.deepEqual(issues, ['missing_mobile_location', 'missing_analytic_account']);
}

function testNormalizeGiftErrorMessage(module: GiftPayloadModule) {
  assert.equal(
    module.normalizeGiftErrorMessage({ code: 'LOCK_BUSY' }),
    'Otro movimiento está usando la unidad. Reintenta en unos segundos.',
  );
  assert.equal(
    module.normalizeGiftErrorMessage({ code: 'SERVER_MISCONFIG' }),
    'Falta configuración en Odoo para registrar el regalo. Contacta al administrador.',
  );
  assert.equal(
    module.normalizeGiftErrorMessage({ message: 'Mensaje backend' }),
    'Mensaje backend',
  );
}

async function main() {
  const module = await import(
    new URL('../src/services/giftPayload.ts', import.meta.url).pathname
  ) as GiftPayloadModule;

  testBuildGiftPayloadAllowsNullVisitLine(module);
  testSubmitIssuesBlockMissingPartnerAndDuplicates(module);
  testSubmitIssuesRequireAtLeastOneValidLine(module);
  testSubmitIssuesRequireOperationalIds(module);
  testNormalizeGiftErrorMessage(module);
  console.log('gift payload tests: ok');
}

void main();
