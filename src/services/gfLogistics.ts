/**
 * GF Logistics REST API endpoints.
 *
 * IMPORTANT: These are REST endpoints (gf_logistics_ops module), NOT JSON-RPC.
 * They expect plain payloads: { stop_id: 123, latitude: ... }
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

const GF_BASE = 'gf/logistics/api/employee';

// ═══ Plan & Route ═══

export async function getMyPlan(): Promise<GFPlan | null> {
  try {
    const result = await postRest<GFPlan | null>(`${GF_BASE}/my_plan`);
    return result || null;
  } catch (error) {
    console.warn('[gfLogistics] my_plan failed:', error);
    return null;
  }
}

export async function getPlanStops(planId: number): Promise<GFStop[]> {
  try {
    const result = await postRest<GFStop[]>(`${GF_BASE}/plan/stops`, {
      plan_id: planId,
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('[gfLogistics] plan/stops failed:', error);
    return [];
  }
}

// ═══ Stop Operations ═══

export async function checkIn(
  stopId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/checkin`, {
    stop_id: stopId,
    latitude,
    longitude,
  });
  return !!result;
}

export async function checkOut(
  stopId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/checkout`, {
    stop_id: stopId,
    latitude,
    longitude,
  });
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
  notes: string
): Promise<boolean> {
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/incidents`, {
    stop_id: stopId,
    incident_type_id: incidentTypeId,
    notes,
  });
  return !!result;
}

export async function uploadStopImage(
  stopId: number,
  imageBase64: string,
  imageType: string = 'visit'
): Promise<boolean> {
  const result = await postRest<{ success: boolean }>(`${GF_BASE}/stop/images`, {
    stop_id: stopId,
    image_base64: imageBase64,
    image_type: imageType,
  });
  return !!result;
}

// ═══ Session ═══

export async function signOut(): Promise<void> {
  try {
    await postRest(`${GF_BASE}/sign_out`);
  } catch {
    // Best effort
  }
}
