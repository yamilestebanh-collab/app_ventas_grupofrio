/**
 * GF Logistics API endpoints — production-tested (from xVan).
 * From xvan_audit.md + KOLD_FIELD_SPEC.md section 5.
 */

import { api } from './api';
import { GFPlan, GFStop } from '../types/plan';

const GF_BASE = 'gf/logistics/api/employee';

export async function getMyPlan(): Promise<GFPlan | null> {
  try {
    const response = await api.post(`${GF_BASE}/my_plan`);
    return response.data?.result || null;
  } catch (error) {
    console.warn('[gfLogistics] my_plan failed:', error);
    return null;
  }
}

export async function getPlanStops(planId: number): Promise<GFStop[]> {
  try {
    const response = await api.post(`${GF_BASE}/plan/stops`, { plan_id: planId });
    return response.data?.result || [];
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
  const response = await api.post(`${GF_BASE}/stop/checkin`, {
    stop_id: stopId,
    latitude,
    longitude,
  });
  return !!response.data?.result;
}

export async function checkOut(
  stopId: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/checkout`, {
    stop_id: stopId,
    latitude,
    longitude,
  });
  return !!response.data?.result;
}

export async function getStopLines(stopId: number): Promise<unknown[]> {
  try {
    const response = await api.post(`${GF_BASE}/stop/lines`, { stop_id: stopId });
    return response.data?.result || [];
  } catch {
    return [];
  }
}

export async function reportIncident(
  stopId: number,
  incidentTypeId: number,
  notes: string
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/incidents`, {
    stop_id: stopId,
    incident_type_id: incidentTypeId,
    notes,
  });
  return !!response.data?.result;
}

export async function uploadStopImage(
  stopId: number,
  imageBase64: string,
  imageType: string = 'visit'
): Promise<boolean> {
  const response = await api.post(`${GF_BASE}/stop/images`, {
    stop_id: stopId,
    image_base64: imageBase64,
    image_type: imageType,
  });
  return !!response.data?.result;
}

export async function signOut(): Promise<void> {
  try {
    await api.post(`${GF_BASE}/sign_out`);
  } catch {
    // Best effort — clear local tokens regardless
  }
}
