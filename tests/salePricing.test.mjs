import assert from 'node:assert/strict';
import {
  getVisiblePricelistPrice,
  normalizeSaleLineBasePrice,
} from '../src/services/salePricing.ts';

function testCustomPricelistPriceStaysBaseForSync() {
  assert.equal(
    normalizeSaleLineBasePrice(275),
    275,
    'el precio personalizado debe enviarse tal cual viene de la lista de precios',
  );
}

function testDisplayPriceMatchesPricelist() {
  assert.equal(
    getVisiblePricelistPrice(275),
    275,
    'el precio visible debe coincidir con la lista de precios sin sumar IVA client-side',
  );
}

function main() {
  testCustomPricelistPriceStaysBaseForSync();
  testDisplayPriceMatchesPricelist();
  console.log('sale pricing tests: ok');
}

main();
