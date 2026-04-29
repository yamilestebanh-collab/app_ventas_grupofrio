import assert from 'node:assert/strict';
import {
  buildPartnerPricelistCandidates,
  computeRulePrice,
  getPreferredPartnerPricelistId,
  roundToPricelistStep,
} from '../src/services/pricelistLogic.ts';

function testBuildPartnerPricelistCandidates() {
  assert.deepEqual(
    buildPartnerPricelistCandidates({
      id: 25,
      parent_id: [9, 'Cliente Matriz'],
      commercial_partner_id: [9, 'Cliente Matriz'],
    }),
    [25, 9],
    'debe intentar primero el contacto y después el partner comercial'
  );

  assert.deepEqual(
    buildPartnerPricelistCandidates({
      id: 25,
      parent_id: [24, 'Sucursal'],
      commercial_partner_id: [9, 'Cliente Matriz'],
    }),
    [25, 24, 9],
    'debe conservar la cadena sin duplicados'
  );
}

function testFormulaPriceComputation() {
  const product = { id: 10, list_price: 100 };

  const price = computeRulePrice(product, {
    compute_price: 'formula',
    base: 'list_price',
    price_discount: -10,
    price_surcharge: 5,
    price_round: 10,
    price_min_margin: 0,
    price_max_margin: 0,
  });

  assert.equal(
    price,
    115,
    'la formula debe soportar descuento/margen, recargo y redondeo'
  );
}

function testFormulaMargins() {
  const product = { id: 10, list_price: 100 };

  const minMarginPrice = computeRulePrice(product, {
    compute_price: 'formula',
    base: 'list_price',
    price_discount: 20,
    price_surcharge: 0,
    price_round: 0,
    price_min_margin: 15,
    price_max_margin: 0,
  });

  assert.equal(minMarginPrice, 115, 'debe respetar margen minimo');

  const maxMarginPrice = computeRulePrice(product, {
    compute_price: 'formula',
    base: 'list_price',
    price_discount: -50,
    price_surcharge: 0,
    price_round: 0,
    price_min_margin: 0,
    price_max_margin: 20,
  });

  assert.equal(maxMarginPrice, 120, 'debe respetar margen maximo');
}

function testRoundToPricelistStep() {
  assert.equal(roundToPricelistStep(101.2, 10), 110);
  assert.equal(roundToPricelistStep(101.2, 0.05), 101.2);
  assert.equal(roundToPricelistStep(101.23, 0.05), 101.25);
}

function testPreferredPartnerPricelistIdPriority() {
  assert.equal(
    getPreferredPartnerPricelistId({
      pricelist_id: [93, 'IGUALA MEZCALA (MXN)'],
      property_product_pricelist: [1, 'Predeterminado (MXN)'],
    }),
    93,
    'debe priorizar pricelist_id cuando existe'
  );

  assert.equal(
    getPreferredPartnerPricelistId({
      pricelist_id: false,
      property_product_pricelist: [1, 'Predeterminado (MXN)'],
    }),
    1,
    'debe usar property_product_pricelist si no hay pricelist_id'
  );

  assert.equal(
    getPreferredPartnerPricelistId({
      pricelist_id: false,
      property_product_pricelist: false,
    }),
    null,
    'debe retornar null si ninguno está disponible'
  );
}

function main() {
  testBuildPartnerPricelistCandidates();
  testFormulaPriceComputation();
  testFormulaMargins();
  testRoundToPricelistStep();
  testPreferredPartnerPricelistIdPriority();
  console.log('pricelist logic tests: ok');
}

main();
