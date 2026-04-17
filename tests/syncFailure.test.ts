import assert from 'node:assert/strict';

function testRetriesNetworkFailures(
  isRetryableSyncErrorMessage: (message: string | null | undefined) => boolean,
) {
  assert.equal(isRetryableSyncErrorMessage('Network request failed'), true);
  assert.equal(isRetryableSyncErrorMessage('HTTP 503'), true);
  assert.equal(isRetryableSyncErrorMessage('The Internet connection appears to be offline.'), true);
}

function testDoesNotRetryBusinessFailures(
  isRetryableSyncErrorMessage: (message: string | null | undefined) => boolean,
) {
  assert.equal(isRetryableSyncErrorMessage('Error interno en API logística.'), false);
  assert.equal(isRetryableSyncErrorMessage('Estás fuera de radio para check-in. Distancia: 5271.39 m / Límite: 50.00 m'), false);
  assert.equal(isRetryableSyncErrorMessage('HTTP 404'), false);
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const syncFailure = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/utils/syncFailure.ts', import.meta.url).pathname
  );

  testRetriesNetworkFailures(syncFailure.isRetryableSyncErrorMessage);
  testDoesNotRetryBusinessFailures(syncFailure.isRetryableSyncErrorMessage);
  console.log('sync failure tests: ok');
}

void main();
