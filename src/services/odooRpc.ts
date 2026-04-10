/**
 * Odoo JSON-RPC wrapper.
 * From KOLD_FIELD_SPEC.md section 5 — generic endpoints.
 */

import { postJsonRpc, postRpc } from './api';

interface OdooRpcResult<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Read records from Odoo via get_records endpoint.
 *
 * BLD-20260410-DEBUG: log raw response shape so operator-reported empty
 * searches can be diagnosed in production without a new build. Low
 * volume (only called from search flows) and no PII.
 */
export async function odooRead<T = unknown>(
  model: string,
  domain: unknown[] = [],
  fields: string[] = [],
  limit = 100,
  offset = 0,
  order?: string
): Promise<T[]> {
  try {
    // BLD-20260404-007: Backend may return either a plain array or
    // a wrapped object { status, count, response: [...], message }.
    const result = await postRpc<any>('/get_records', { model, domain, fields, limit, offset, order });

    // Diagnostics: what shape did we get back?
    const shape = Array.isArray(result)
      ? `array[${result.length}]`
      : (result && typeof result === 'object'
          ? `object{${Object.keys(result).join(',')}}`
          : typeof result);
    console.log(`[odooRead] ${model} → shape=${shape}`);

    if (Array.isArray(result)) return result as T[];
    if (result && Array.isArray(result.response)) {
      console.log(`[odooRead] ${model} → wrapped.response length=${result.response.length}` +
        (result.status !== undefined ? ` status=${result.status}` : '') +
        (result.message !== undefined ? ` message=${result.message}` : ''));
      return result.response as T[];
    }

    // Unknown shape — surface it for debug.
    console.warn(`[odooRead] ${model} → unknown shape, returning []. raw=${
      (() => { try { return JSON.stringify(result).slice(0, 300); } catch { return String(result); } })()
    }`);
    return [];
  } catch (error) {
    console.warn(`[odooRead] ${model} failed:`, error);
    return [];
  }
}

/**
 * Create or update record in Odoo.
 */
export async function odooWrite(
  model: string,
  method: 'create' | 'write',
  dict: Record<string, unknown>
): Promise<number | boolean> {
  const result = await postRpc<number | boolean>('/api/create_update', { model, method, dict });
  return result;
}

/**
 * Direct JSON-RPC call to Odoo.
 */
export async function odooRpc<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  return await postJsonRpc<T>('/jsonrpc', { model, method, args, kwargs });
}

/**
 * Defensively try to read from a KOLD OS module.
 * Returns null if the module is not installed.
 */
export async function koldRead<T = unknown>(
  model: string,
  domain: unknown[] = [],
  fields: string[] = [],
  limit = 100
): Promise<T[] | null> {
  try {
    return await odooRead<T>(model, domain, fields, limit);
  } catch {
    // Module not installed or model doesn't exist
    return null;
  }
}
