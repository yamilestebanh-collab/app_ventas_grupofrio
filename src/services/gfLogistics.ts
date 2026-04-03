/**
 * GF Logistics API endpoints — production-tested (from xVan).
 */

import { api } from './api';
import { GFPlan, GFStop } from '../types/plan';

const GF_BASE = 'gf/logistics/api/employee';

/**
 * Helper to wrap Odoo JSON-RPC params.
 */
function wrapRpc(params: Record<string, any> = {}) {
  return {
    jsonrpc: '2.0',
    params,
  };
}

export async function getMyPlan(): Promise<GFPlan | null> {
  try {
    // FIX: Envolver en JSON-RPC para evitar error 400
    const response = await api.post(`${GF_BASE}/my_plan`, wrapRpc());
    
    // Odoo puede devolver el resultado en .data.result o .data si es REST puro
    const result = response.data?.result || response.data;
    return result || null;
  } catch (error) {
    console.warn('[gfLogistics] my_plan failed:', error);
    return null;
  }
}

export async function getPlanStops(planId: number): Promise<GFStop[]> {
  try {
    const response = await api.post(`${GF_BASE}/plan/stops`, wrapRpc({ plan_id: planId }));
    const result = response.data?.result || response.data;
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('[gfLogistics] plan/stops failed:', error);
    return [];
  }
}

export async function checkIn(
  stopId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/checkin`, wrapRpc({
    stop_id: stopId,
    latitude,
    longitude,
  }));
  const result = response.data?.result || response.data;
  return !!result;
}

export async function checkOut(
  stopId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/checkout`, wrapRpc({
    stop_id: stopId,
    latitude,
    longitude,
  }));
  const result = response.data?.result || response.data;
  return !!result;
}

export async function getStopLines(stopId: number): Promise<unknown[]> {
  try {
    const response = await api.post(`${GF_BASE}/stop/lines`, wrapRpc({ stop_id: stopId }));
    const result = response.data?.result || response.data;
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
  const response = await api.post(`${GF_BASE}/stop/incidents`, wrapRpc({
    stop_id: stopId,
    incident_type_id: incidentTypeId,
    notes,
  }));
  const result = response.data?.result || response.data;
  return !!result;
}

export async function uploadStopImage(
  stopId: number,
  imageBase64: string,
  imageType: string = 'visit'
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/images`, wrapRpc({
    stop_id: stopId,
    image_base64: imageBase64,
    image_type: imageType,
  }));
  const result = response.data?.result || response.data;
  return !!result;
}

export async function signOut(): Promise<void> {
  try {
    await api.post(`${GF_BASE}/sign_out`, wrapRpc());
  } catch {
    // Best effort
  }
}
