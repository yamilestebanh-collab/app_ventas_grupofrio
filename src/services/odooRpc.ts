/**
 * Odoo JSON-RPC wrapper.
 * From KOLD_FIELD_SPEC.md section 5 — generic endpoints.
 */

import { api } from './api';

interface OdooRpcResult<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Read records from Odoo via get_records endpoint.
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
    const response = await api.post('/get_records', {
      jsonrpc: '2.0',
      params: { model, domain, fields, limit, offset, order },
    });
    const result = response.data?.result;
    return Array.isArray(result) ? result : [];
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
  const response = await api.post('/api/create_update', {
    jsonrpc: '2.0',
    params: { model, method, dict },
  });
  return response.data?.result;
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
  const response = await api.post('/jsonrpc', {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
  });
  if (response.data?.error) {
    throw new Error(response.data.error.data?.message || 'Odoo RPC error');
  }
  return response.data?.result as T;
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
