import assert from 'node:assert/strict';

function testUnwrapsSuccessfulWrappedRestResult(
  unwrapRestResult: (parsed: unknown, status: number) => unknown,
) {
  const result = unwrapRestResult({
    jsonrpc: '2.0',
    result: {
      ok: true,
      message: 'OK',
      data: { found: true, plan_id: 28 },
    },
  }, 200);

  assert.deepEqual(result, {
    ok: true,
    message: 'OK',
    data: { found: true, plan_id: 28 },
  });
}

function testThrowsWhenWrappedRestResultReportsOkFalse(
  unwrapRestResult: (parsed: unknown, status: number) => unknown,
) {
  assert.throws(
    () => unwrapRestResult({
      jsonrpc: '2.0',
      result: {
        ok: false,
        message: 'Error interno en API logística.',
        data: {},
      },
    }, 200),
    /Error interno en API logística\./,
  );
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const apiResult = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/utils/apiResult.ts', import.meta.url).pathname
  );

  testUnwrapsSuccessfulWrappedRestResult(apiResult.unwrapRestResult);
  testThrowsWhenWrappedRestResultReportsOkFalse(apiResult.unwrapRestResult);
  console.log('api result tests: ok');
}

void main();
