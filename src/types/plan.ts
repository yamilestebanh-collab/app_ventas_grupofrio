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
  // Enriched client-side (not from API):
  _koldScore?: KoldScoreData | null;
  _koldForecast?: KoldForecastData | null;
  _distanceMeters?: number;
  _geoFenceOk?: boolean;
}
