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
import { logInfo } from '../utils/logger';

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

/**
 * BLD-20260424-BUGB: Inferir `_entityType` client-side cuando el backend
 * /plan/stops todavía no lo manda.
 *
 * Operadores reportaron "ruta de solo leads y no sale el botón de Datos".
 * Causa raíz: el botón "📋 Datos" (getLeadActionVisibility en leadVisit.ts)
 * solo se pinta si `stop._entityType === 'lead'`. Como el backend aún no
 * etiqueta ese campo en la respuesta de /plan/stops, todos los stops
 * llegan con _entityType undefined y el app los trata como customers.
 *
 * Este helper aplica una heurística conservadora:
 *   1. Respeta _entityType explícito si el backend ya lo envía (forward-compat).
 *   2. Si hay `lead_id` / `_leadId` > 0, o `entity_type === 'lead'`
 *      (snake_case) → marca como 'lead'.
 *   3. Cualquier otra cosa                                → marca 'customer'.
 *
 * También normaliza `_leadId` y `_partnerId` a partir de los alias en
 * snake_case / tuple de Odoo para que leadVisit.ts y la sale screen
 * puedan operar sin asumir un shape específico.
 *
 * Seguro: si el backend ya manda _entityType correcto, este helper es
 * idempotente — devuelve el stop tal cual.
 */
function inferEntityType(stop: any): any {
  if (!stop || typeof stop !== 'object') return stop;
  if (stop._entityType === 'lead' || stop._entityType === 'customer') {
    return stop;
  }

  const entityTypeRaw =
    typeof stop.entity_type === 'string' ? stop.entity_type.toLowerCase() : '';

  const leadIdRaw = stop._leadId ?? stop.lead_id ?? null;
  const leadId = typeof leadIdRaw === 'number' && leadIdRaw > 0 ? leadIdRaw : null;

  const partnerRaw = stop._partnerId ?? stop.partner_id ?? null;
  let partnerId: number | null = null;
  if (Array.isArray(partnerRaw) && typeof partnerRaw[0] === 'number' && partnerRaw[0] > 0) {
    partnerId = partnerRaw[0];
  } else if (typeof partnerRaw === 'number' && partnerRaw > 0) {
    partnerId = partnerRaw;
  }

  const looksLikeLead = leadId !== null || entityTypeRaw === 'lead';

  return {
    ...stop,
    _entityType: looksLikeLead ? 'lead' : 'customer',
    _leadId: leadId ?? stop._leadId ?? null,
    _partnerId: partnerId ?? stop._partnerId ?? null,
  };
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

    const pickStops = (): any[] => {
      if (Array.isArray(result)) return result as any[];
      if (!result || typeof result !== 'object') return [];
      if (result.ok === false) {
        console.warn('[gfLogistics] plan/stops returned ok=false:', result.message);
        return [];
      }
      const data = result.data !== undefined ? result.data : result;
      if (data && Array.isArray(data.stops)) return data.stops as any[];
      if (Array.isArray(data)) return data as any[];
      return [];
    };

    const rawStops = pickStops();

    // BLD-20260424-BUGB: log diagnóstico temporal. Imprime los campos
    // relevantes de los primeros 3 stops para que podamos confirmar en
    // campo qué está mandando /plan/stops (especialmente si incluye
    // _entityType o alguna señal de lead). Eliminar cuando el backend
    // esté confirmado mandando _entityType en todos los casos.
    try {
      logInfo('general', 'plan_stops_sample', {
        plan_id: planId,
        count: rawStops.length,
        sample: rawStops.slice(0, 3).map((s: any) => ({
          id: s?.id,
          _entityType: s?._entityType,
          entity_type: s?.entity_type,
          _leadId: s?._leadId,
          lead_id: s?.lead_id,
          _partnerId: s?._partnerId,
          partner_id: s?.partner_id,
          customer_id: s?.customer_id,
        })),
      });
    } catch {
      // logger defensivo: nunca debe romper el plan
    }

    // BLD-20260424-BUGB: inferir _entityType por cada stop antes de devolver.
    return rawStops.map(inferEntityType) as GFStop[];
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
