/**
 * Route plan and stop types.
 * From KOLD_FIELD_ADDENDUM.md Bloque 3 — GFPlan, GFStop.
 */

import { OdooId } from './odoo';
import { KoldScoreData, KoldForecastData } from './kold';

export type PlanState = 'draft' | 'confirmed' | 'in_progress' | 'done';

export interface GFPlan {
  plan_id: OdooId;
  name: string;
  date: string; // "2026-03-25"
  state: PlanState;
  route?: string;
  generation_mode?: string;
  selected_count?: number;
  eligible_count?: number;
  capacity_status?: string;
  driver_employee_id?: number;
  driver_employee_name?: string;
  warehouse_id?: number;
  warehouse_name?: string;
}

export type StopState =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'not_visited'
  | 'no_stock'
  | 'rejected'
  | 'closed';

/**
 * BLD-20260410-BACKEND: gf.route.stop now supports mixed stops in the
 * backend (see Sebastián's "Plan 2 — Route Leads Mixed Stops" changeset).
 * A stop can be:
 *   - 'customer' → bound to an existing res.partner (customer_id)
 *   - 'lead'     → bound to a crm.lead (lead_id), no partner yet
 * After a field conversion via /employee/lead/convert, the stop keeps
 * lead_id AND gets customer_id populated in place (same stop identity).
 */
export type StopKind = 'customer' | 'lead';

export interface GFStop {
  id: OdooId;
  customer_id: number;
  customer_name: string;
  customer_ref?: string;
  customer_latitude?: number;
  customer_longitude?: number;
  google_maps_url?: string;
  state: StopState;
  route_sequence?: number;
  source_model: 'gf.route.stop';

  // BLD-20260410-BACKEND: canonical lead markers from backend plan/stops.
  // stop_kind drives UI branches (lead conversion modal, sale result selector).
  // lead_id is the original crm.lead record; preserved even after conversion
  // so the server can mark the lead as "won" at plan close.
  stop_kind?: StopKind;
  lead_id?: number;

  // BLD-20260410: Customer classification (legacy fallback).
  // customer_rank > 0 = confirmed customer; 0 or missing = lead/prospect.
  // New code should prefer stop_kind when available.
  customer_rank?: number;
  is_lead?: boolean;

  // BLD-20260410: Off-route / lead metadata (client-side, for audit).
  // is_offroute = added via offroute screen (virtual stop).
  // origin_lead_id = original lead ID when a lead was just converted.
  is_offroute?: boolean;
  origin_lead_id?: number;

  // Enriched client-side (not from API):
  _koldScore?: KoldScoreData | null;
  _koldForecast?: KoldForecastData | null;
  _distanceMeters?: number;
  _geoFenceOk?: boolean;
}
