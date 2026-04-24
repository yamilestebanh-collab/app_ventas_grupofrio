/**
 * GF Logistics REST API endpoints.
 *
 * IMPORTANT: These are REST endpoints (gf_logistics_ops module), NOT JSON-RPC.
 * They expect plain payloads like { stop_id: 123, latitude: ... }.
 * Checkout now also sends result_status so Odoo can close the stop.
 * Do NOT wrap with jsonrpc/params — that causes 400 errors.
 *
 * For Odoo JSON-RPC endpoints (/jsonrpc, /get_records, /api/create_update),
 * use odooRpc.ts or postRpc() from api.ts instead.
 *
 * Reference: useSyncStore.ts uses these same endpoints with plain payloads
 * and works correctly in production.
 */

import { postRest } from './api';
import { GFPlan, GFStop } from '../types/plan';
import { CheckoutResultStatus } from './checkoutResult';
// BLD-008: optional client event metadata. Feature-flagged inside the
// helper — safe to pass from anywhere.
import { ClientEventMeta, attachClientMetaToRestPayload } from '../utils/clientEvent';

const GF_BASE = 'gf/logistics/api/employee';

// ═══ Plan & Route ═══

export async function getMyPlan(): Promise<GFPlan | null> {
  try {
    // BLD-20260404-007: Backend wraps response in { ok, message, data }.
    // When found=false, the employee has no plan assigned for today.
    const result = await postRest<any>(`${GF_BASE}/my_plan`);
    if (!result || typeof result !== 'object') return null;
    if (result.ok === false) {
      console.warn('[gfLogistics] my_plan returned ok=false:', result.message);
      return null;
    }
    // Support both wrapped ({ok, data}) and unwrapped (GFPlan direct) responses.
    const data = result.data !== undefined ? result.data : result;
    if (!data || data.found === false) return null;
    // data may be the plan itself or wrap it in data.plan.
    return (data.plan ?? data) as GFPlan;
  } catch (error) {
    console.warn('[gfLogistics] my_plan failed:', error);
    return null;
  }
}

export async function getPlanStops(planId: number): Promise<GFStop[]> {
  try {
    // BLD-20260405-021: backend wraps the response in
    //   { ok, message, data: { found, plan, stops: [...] } }
    // just like /my_plan (see BLD-20260404-007). The previous impl
    // expected a bare array and silently returned [] against every
    // wrapped payload, leaving the driver without visible stops
    // (symptom: route appears in the app but "0 paradas" counter).
    // We support both shapes so older backends still work.
    const result = await postRest<any>(`${GF_BASE}/plan/stops`, {
      plan_id: planId,
    });
    if (Array.isArray(result)) return result as GFStop[];
    if (!result || typeof result !== 'object') return [];
    if (result.ok === false) {
      console.warn('[gfLogistics] plan/stops returned ok=false:', result.message);
      return [];
    }
    const data = result.data !== undefined ? result.data : result;
    if (data && Array.isArray(data.stops)) return data.stops as GFStop[];
    if (Array.isArray(data)) return data as GFStop[];
    return [];
  } catch (error) {
    console.warn('[gfLogistics] plan/stops failed:', error);
    return [];
  }
}

// ═══ Stop Operations ═══

export async function checkIn(
  stopId: number,
  latitude: number,
  longitude: number,
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const payload = attachClientMetaToRestPayload(
    { stop_id: stopId, latitude, longitude },
    meta ?? null,
  );
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/checkin`, payload);
  return !!result;
}

export async function checkOut(
  stopId: number,
  latitude: number,
  longitude: number,
  resultStatus: CheckoutResultStatus,
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const payload = attachClientMetaToRestPayload(
    { stop_id: stopId, latitude, longitude, result_status: resultStatus },
    meta ?? null,
  );
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/checkout`, payload);
  return !!result;
}

export async function getStopLines(stopId: number): Promise<unknown[]> {
  try {
    const result = await postRest<unknown[]>(`${GF_BASE}/stop/lines`, {
      stop_id: stopId,
    });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function reportIncident(
  stopId: number,
  incidentTypeId: number,
  notes: string,
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const payload = attachClientMetaToRestPayload(
    { stop_id: stopId, incident_type_id: incidentTypeId, notes },
    meta ?? null,
  );
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/incidents`, payload);
  return !!result;
}

export async function uploadStopImage(
  stopId: number,
  imageBase64: string,
  imageType: string = 'visit',
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const payload = attachClientMetaToRestPayload(
    { stop_id: stopId, image_base64: imageBase64, image_type: imageType },
    meta ?? null,
  );
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/images`, payload);
  return !!result;
}

// ═══ Sales & Payments (gf_logistics_ops) ═══
//
// Replaces the legacy `/api/create_update` path over `sale.order` /
// `account.payment`, which required ACLs the driver user doesn't have
// and had no server-side tolerance for obsolete stop_id.
//
// Backend contract (already deployed):
//   POST /gf/logistics/api/employee/sales/create
//     Body:  { operation_id|x_operation_id, partner_id, lines,
//              stop_id?, warehouse_id?, pricelist_id?, note?, _client_meta? }
//     Line:  { product_id, quantity, price_unit?, discount? }
//
//   POST /gf/logistics/api/employee/payments/create
//     Body:  { operation_id|x_operation_id, amount,
//              sale_order_id|partner_id, payment_method_line_id?,
//              stop_id?, journal_id?, payment_date?, reference?, currency_id? }

export async function createSale(
  payload: Record<string, unknown>,
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const body = attachClientMetaToRestPayload(payload, meta ?? null);
  const result = await postRest<{ success?: boolean }>(
    `${GF_BASE}/sales/create`,
    body,
  );
  return !!result;
}

export async function createPayment(
  payload: Record<string, unknown>,
  meta?: ClientEventMeta | null,
): Promise<boolean> {
  const body = attachClientMetaToRestPayload(payload, meta ?? null);
  const result = await postRest<{ success?: boolean }>(
    `${GF_BASE}/payments/create`,
    body,
  );
  return !!result;
}

export async function fetchAnalyticsOptions(
  payload: { partner_id?: number | null; partner_ids?: number[] } = {},
): Promise<Record<string, unknown> | null> {
  try {
    const body: Record<string, unknown> = {};
    if (typeof payload.partner_id === 'number' && payload.partner_id > 0) {
      body.partner_id = payload.partner_id;
    }
    if (Array.isArray(payload.partner_ids) && payload.partner_ids.length > 0) {
      body.partner_ids = payload.partner_ids.filter((id) => typeof id === 'number' && id > 0);
    }

    const result = await postRest<Record<string, unknown>>(
      `${GF_BASE}/analytics/options`,
      body,
    );
    return result;
  } catch (error) {
    if (__DEV__) console.warn('[gfLogistics] analytics/options unavailable, falling back:', error);
    return null;
  }
}

export async function fetchLeadStages(
  companyId?: number | null,
): Promise<Array<{ id: number; name: string; sequence?: number }>> {
  const body: Record<string, unknown> = {};
  if (typeof companyId === 'number' && companyId > 0) {
    body.company_id = companyId;
  }

  const result = await postRest<any>(`${GF_BASE}/lead/stages`, body);
  if (!result || typeof result !== 'object') return [];
  const data = result.data !== undefined ? result.data : result;
  if (Array.isArray(data?.stages)) return data.stages;
  if (Array.isArray(data)) return data;
  return [];
}

export async function upsertLeadData(
  payload: Record<string, unknown>,
  meta?: ClientEventMeta | null,
): Promise<Record<string, unknown> | null> {
  const body = attachClientMetaToRestPayload(payload, meta ?? null);
  const result = await postRest<any>(`${GF_BASE}/lead/upsert`, body);
  if (!result || typeof result !== 'object') return null;
  const data = result.data !== undefined ? result.data : result;
  const lead = data?.lead ?? data;
  return lead && typeof lead === 'object' ? lead : null;
}

export async function startOffrouteVisit(
  payload: Record<string, unknown>,
  meta?: ClientEventMeta | null,
): Promise<Record<string, unknown> | null> {
  const body = attachClientMetaToRestPayload(payload, meta ?? null);
  const result = await postRest<any>(`${GF_BASE}/offroute/visit/start`, body);
  if (!result || typeof result !== 'object') return null;
  const data = result.data !== undefined ? result.data : result;
  const visit = data?.visit ?? data;
  return visit && typeof visit === 'object' ? visit : null;
}

export async function closeOffrouteVisit(
  payload: Record<string, unknown>,
  meta?: ClientEventMeta | null,
): Promise<Record<string, unknown> | null> {
  const body = attachClientMetaToRestPayload(payload, meta ?? null);
  const result = await postRest<any>(`${GF_BASE}/offroute/visit/close`, body);
  if (!result || typeof result !== 'object') return null;
  const data = result.data !== undefined ? result.data : result;
  const visit = data?.visit ?? data;
  return visit && typeof visit === 'object' ? visit : null;
}

// ═══ Session ═══

export async function signOut(): Promise<void> {
  try {
    await postRest(`${GF_BASE}/sign_out`);
  } catch {
    // Best effort
  }
}

// ═══ BLD-20260404-013 — Truck stock by warehouse ═══
//
// Tries the new gf_logistics_ops endpoint `/truck_stock` which returns
// products scoped by the chofer's assigned warehouse. If the endpoint
// does not exist yet (HTTP 404, gateway error, or empty/invalid payload)
// the caller is expected to fall back to the legacy `odooRead` path.
//
// Contract (expected from Sprint 3 P4, still not deployed in backend):
//   POST /gf/logistics/api/employee/truck_stock
//   Body: { warehouse_id?: number }
//   Response: {
//     ok: true,
//     data: {
//       warehouse_id: number,
//       products: [
//         { id, name, default_code, list_price, qty_available,
//           sale_ok, product_tmpl_id, weight, categ_id }, ...
//       ]
//     }
//   }
//
// Returns `null` when the endpoint is unavailable — caller must treat
// `null` as "fall back to existing behaviour". NEVER throws.
export async function fetchTruckStock(
  warehouseId: number | null | undefined,
): Promise<unknown[] | null> {
  try {
    const body: Record<string, unknown> = {};
    if (warehouseId && warehouseId > 0) body.warehouse_id = warehouseId;
    const result = await postRest<any>(`${GF_BASE}/truck_stock`, body);
    if (!result || typeof result !== 'object') return null;
    if (result.ok === false) return null;
    const data = result.data !== undefined ? result.data : result;
    const products = (data && Array.isArray(data.products)) ? data.products : null;
    if (!products) return null;
    return products;
  } catch (error) {
    // Endpoint not deployed yet, auth issue, offline, etc.
    // We swallow so the caller transparently falls back.
    if (__DEV__) console.warn('[gfLogistics] truck_stock unavailable, falling back:', error);
    return null;
  }
}
