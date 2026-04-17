import assert from 'node:assert/strict';

function testRedactsSensitiveHeaders(
  buildHttpTraceData: (input: {
    phase: 'request' | 'response' | 'error';
    channel: string;
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
    status?: number;
    durationMs?: number;
    errorMessage?: string;
  }) => Record<string, unknown>,
) {
  const trace = buildHttpTraceData({
    phase: 'request',
    channel: 'rest',
    method: 'POST',
    url: 'https://example.com/gf/logistics/api/employee/stop/images',
    requestHeaders: {
      'Content-Type': 'application/json',
      'Api-Key': 'abc123',
      'X-GF-Employee-Token': 'secret-token',
      Authorization: 'Bearer top-secret',
      Cookie: 'session_id=123',
    },
    requestBody: {
      stop_id: 15,
      image_base64: 'a'.repeat(600),
      image_type: 'visit',
    },
  });

  const headers = trace.requestHeaders as Record<string, unknown>;
  const body = trace.requestBody as Record<string, unknown>;

  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['Api-Key'], '[REDACTED]');
  assert.equal(headers['X-GF-Employee-Token'], '[REDACTED]');
  assert.equal(headers.Authorization, '[REDACTED]');
  assert.equal(headers.Cookie, '[REDACTED]');
  assert.equal(body.stop_id, 15);
  assert.equal(body.image_type, 'visit');
  assert.equal(typeof body.image_base64, 'string');
  assert.match(String(body.image_base64), /^\[TRUNCATED /);
}

function testKeepsUsefulResponseMetadata(
  buildHttpTraceData: (input: {
    phase: 'request' | 'response' | 'error';
    channel: string;
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
    status?: number;
    durationMs?: number;
    errorMessage?: string;
  }) => Record<string, unknown>,
) {
  const trace = buildHttpTraceData({
    phase: 'error',
    channel: 'jsonrpc',
    method: 'POST',
    url: 'https://example.com/jsonrpc',
    status: 500,
    durationMs: 1842,
    requestBody: {
      jsonrpc: '2.0',
      params: { service: 'object', method: 'execute_kw' },
    },
    responseBody: {
      error: {
        message: 'Odoo Server Error',
        data: {
          message: 'Traceback...',
        },
      },
    },
    errorMessage: 'Odoo Server Error',
  });

  assert.equal(trace.phase, 'error');
  assert.equal(trace.channel, 'jsonrpc');
  assert.equal(trace.method, 'POST');
  assert.equal(trace.url, 'https://example.com/jsonrpc');
  assert.equal(trace.status, 500);
  assert.equal(trace.durationMs, 1842);
  assert.equal(trace.errorMessage, 'Odoo Server Error');
  assert.deepEqual(trace.responseBody, {
    error: {
      message: 'Odoo Server Error',
      data: {
        message: 'Traceback...',
      },
    },
  });
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const httpDebug = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/utils/httpDebug.ts', import.meta.url).pathname
  );

  testRedactsSensitiveHeaders(httpDebug.buildHttpTraceData);
  testKeepsUsefulResponseMetadata(httpDebug.buildHttpTraceData);
  console.log('http debug tests: ok');
}

void main();
