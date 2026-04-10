/**
 * Odoo JSON-RPC wrapper.
 * From KOLD_FIELD_SPEC.md section 5 — generic endpoints.
 *
 * BLD-20260409: odooRpc now uses sessionRpc (Odoo web session) instead of
 * the custom Api-Key auth, because /web/dataset/call_kw requires a session
 * cookie. The Api-Key + X-GF-Employee-Token headers only work with custom
 * gf_logistics_ops endpoints (/get_records, /api/employee-sign-in, etc.)
 */

import { postRpc } from './api';
import { sessionRpc, hasServiceCredentials } from './odooSession';

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
    // BLD-20260404-007: Backend may return either a plain array or
    // a wrapped object { status, count, response: [...], message }.
    const result = await postRpc<any>('/get_records', { model, domain, fields, limit, offset, order });
    if (Array.isArray(result)) return result as T[];
    if (result && Array.isArray(result.response)) return result.response as T[];
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
 * Direct JSON-RPC call to Odoo via authenticated web session.
 *
 * Uses /web/dataset/call_kw with session cookie authentication.
 * This properly resolves property fields (property_product_pricelist)
 * and has full ORM access — unlike the custom /get_records endpoint
 * which runs as public and can't read res.partner or pricelist items.
 */
export async function odooRpc<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  if (!hasServiceCredentials()) {
    throw new Error('[odooRpc] Service credentials not configured. Call setServiceCredentials() first.');
  }
  return await sessionRpc<T>(model, method, args, kwargs);
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
