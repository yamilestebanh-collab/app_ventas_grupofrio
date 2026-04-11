import assert from 'node:assert/strict';

interface PostvisitPayloadModule {
  buildPostvisitPayload: (input: {
    stop: {
      customer_name: string;
      _entityType?: 'customer' | 'lead';
      _leadId?: number | null;
    };
    form: {
      contactName: string;
      phone: string;
      email: string;
      competitor: string;
      freezer: 'yes' | 'no';
      interestLevel: 'high' | 'medium' | 'low';
      notes: string;
    };
  }) => {
    model: string;
    method: 'create' | 'write';
    [key: string]: unknown;
  };
}

function testExistingLeadBuildsWritePayload(module: PostvisitPayloadModule) {
  const payload = module.buildPostvisitPayload({
    stop: {
      customer_name: 'Lead Plaza',
      _entityType: 'lead',
      _leadId: 51,
    },
    form: {
      contactName: 'Ana',
      phone: '555-111',
      email: 'ana@example.com',
      competitor: 'Crystal',
      freezer: 'yes',
      interestLevel: 'high',
      notes: 'Quiere demo esta semana',
    },
  });

  assert.equal(payload.model, 'crm.lead');
  assert.equal(payload.method, 'write');
  assert.equal(payload.id, 51);
  assert.equal(payload.contact_name, 'Ana');
  assert.equal(payload.priority, '3');
  assert.match(String(payload.description), /Competidor: Crystal/);
}

function testCustomerBuildsCreatePayload(module: PostvisitPayloadModule) {
  const payload = module.buildPostvisitPayload({
    stop: {
      customer_name: 'Abarrotes Centro',
      _entityType: 'customer',
      _leadId: null,
    },
    form: {
      contactName: '',
      phone: '',
      email: '',
      competitor: '',
      freezer: 'no',
      interestLevel: 'medium',
      notes: 'Sin decision hoy',
    },
  });

  assert.equal(payload.model, 'crm.lead');
  assert.equal(payload.method, 'create');
  assert.equal(payload.name, 'Abarrotes Centro');
  assert.equal(payload.type, 'lead');
  assert.equal(payload.priority, '2');
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/postvisitPayload.ts', import.meta.url).pathname
  ) as PostvisitPayloadModule;

  testExistingLeadBuildsWritePayload(module);
  testCustomerBuildsCreatePayload(module);
  console.log('postvisit payload tests: ok');
}

void main();
