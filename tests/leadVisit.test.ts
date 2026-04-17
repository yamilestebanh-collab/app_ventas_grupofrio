import assert from 'node:assert/strict';

interface LeadVisitModule {
  getLeadActionVisibility: (stop: {
    _entityType?: 'customer' | 'lead';
    _partnerId?: number | null;
    partner_id?: [number, string] | number | false | null;
  }) => {
    showData: boolean;
    showSale: boolean;
    showNoSale: boolean;
  };
  applyLeadUpsertToStop: (stop: {
    id: number;
    customer_id: number;
    customer_name: string;
    state: 'pending';
    source_model: 'gf.route.stop';
    _entityType?: 'lead' | 'customer';
    _leadId?: number | null;
    _partnerId?: number | null;
    partner_id?: [number, string] | number | false | null;
  }, lead: {
    id: number;
    partner_id?: [number, string] | number | false | null;
  }) => Record<string, unknown>;
}

function testLeadWithoutPartnerOnlyShowsData(module: LeadVisitModule) {
  const visibility = module.getLeadActionVisibility({
    _entityType: 'lead',
    _leadId: 22,
    partner_id: false,
  } as any);

  assert.deepEqual(visibility, {
    showData: true,
    showSale: false,
    showNoSale: false,
  });
}

function testLeadWithPartnerShowsAllActions(module: LeadVisitModule) {
  const visibility = module.getLeadActionVisibility({
    _entityType: 'lead',
    partner_id: [51090, 'S12922'],
  });

  assert.deepEqual(visibility, {
    showData: true,
    showSale: true,
    showNoSale: true,
  });
}

function testApplyLeadUpsertPromotesStopToSellable(module: LeadVisitModule) {
  const nextStop = module.applyLeadUpsertToStop({
    id: 4333,
    customer_id: 111,
    customer_name: 'Lead Ruta',
    state: 'pending',
    source_model: 'gf.route.stop',
    _entityType: 'lead',
    _leadId: 55,
  }, {
    id: 55,
    partner_id: [51090, 'S12922'],
  });

  assert.equal(nextStop.customer_id, 51090);
  assert.equal(nextStop._partnerId, 51090);
}

async function main() {
  const module = await import(
    new URL('../src/services/leadVisit.ts', import.meta.url).pathname
  ) as LeadVisitModule;

  testLeadWithoutPartnerOnlyShowsData(module);
  testLeadWithPartnerShowsAllActions(module);
  testApplyLeadUpsertPromotesStopToSellable(module);
  console.log('lead visit tests: ok');
}

void main();
