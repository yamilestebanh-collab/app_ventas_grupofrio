import assert from 'node:assert/strict';

function testAutoloadWhenWarehousePresentAndStoreEmpty(
  shouldAutoLoadProducts: (warehouseId: number | null | undefined, productCount: number, isLoading: boolean) => boolean,
) {
  assert.equal(shouldAutoLoadProducts(12, 0, false), true);
}

function testSkipsAutoloadWithoutWarehouse(
  shouldAutoLoadProducts: (warehouseId: number | null | undefined, productCount: number, isLoading: boolean) => boolean,
) {
  assert.equal(shouldAutoLoadProducts(null, 0, false), false);
  assert.equal(shouldAutoLoadProducts(0, 0, false), false);
}

function testSkipsAutoloadWhenAlreadyLoadedOrLoading(
  shouldAutoLoadProducts: (warehouseId: number | null | undefined, productCount: number, isLoading: boolean) => boolean,
) {
  assert.equal(shouldAutoLoadProducts(12, 4, false), false);
  assert.equal(shouldAutoLoadProducts(12, 0, true), false);
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const productLoading = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/utils/productLoading.ts', import.meta.url).pathname
  );

  testAutoloadWhenWarehousePresentAndStoreEmpty(productLoading.shouldAutoLoadProducts);
  testSkipsAutoloadWithoutWarehouse(productLoading.shouldAutoLoadProducts);
  testSkipsAutoloadWhenAlreadyLoadedOrLoading(productLoading.shouldAutoLoadProducts);
  console.log('product loading tests: ok');
}

void main();
