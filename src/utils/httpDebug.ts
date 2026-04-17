export interface BuildHttpTraceInput {
  phase: 'request' | 'response' | 'error';
  channel: string;
  method: string;
  url: string;
  requestId?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  status?: number;
  durationMs?: number;
  errorMessage?: string;
}

const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 25;
const MAX_DEPTH = 4;

const SENSITIVE_HEADER_NAMES = new Set([
  'api-key',
  'authorization',
  'cookie',
  'set-cookie',
  'x-gf-employee-token',
]);

function isSensitiveBodyKey(key: string): boolean {
  return /(token|password|secret|api[-_]?key|authorization|cookie)/i.test(key);
}

function isLargeBinaryLikeKey(key: string): boolean {
  return /(base64|blob|attachment|file_content|image_data|photo_data)/i.test(key);
}

function sanitizeString(value: string, keyHint?: string): string {
  if (keyHint && isSensitiveBodyKey(keyHint)) {
    return '[REDACTED]';
  }

  if (value.length <= MAX_STRING_LENGTH && !(keyHint && isLargeBinaryLikeKey(keyHint))) {
    return value;
  }

  return `[TRUNCATED ${value.length} chars]`;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    sanitized[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase())
      ? '[REDACTED]'
      : sanitizeString(value, name);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, keyHint?: string, depth = 0): unknown {
  if (
    value === null
    || value === undefined
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value, keyHint);
  }

  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) {
      return `[TRUNCATED array(${value.length})]`;
    }
    return '[TRUNCATED object]';
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, keyHint, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }

    return items;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj);
    const sanitized: Record<string, unknown> = {};

    for (const [key, nested] of entries.slice(0, MAX_OBJECT_KEYS)) {
      sanitized[key] = sanitizeValue(nested, key, depth + 1);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      sanitized._truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }

    return sanitized;
  }

  return String(value);
}

export function buildHttpTraceData(input: BuildHttpTraceInput): Record<string, unknown> {
  const trace: Record<string, unknown> = {
    phase: input.phase,
    channel: input.channel,
    method: input.method,
    url: input.url,
  };

  if (input.requestId) trace.requestId = input.requestId;
  if (input.status !== undefined) trace.status = input.status;
  if (input.durationMs !== undefined) trace.durationMs = input.durationMs;
  if (input.errorMessage) trace.errorMessage = input.errorMessage;
  if (input.requestHeaders) trace.requestHeaders = sanitizeHeaders(input.requestHeaders);
  if (input.requestBody !== undefined) trace.requestBody = sanitizeValue(input.requestBody);
  if (input.responseBody !== undefined) trace.responseBody = sanitizeValue(input.responseBody);

  return trace;
}
