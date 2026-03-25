/**
 * KOLD OS optional types (KoldScore, KoldDemand, Loyalty).
 * These modules may not be installed — all consumers must handle null.
 * From KOLD_FIELD_ADDENDUM.md Bloque 3.
 */

import { OdooId, OdooMany2one } from './odoo';

// ═══ KoldScore ═══

export type KoldCategory =
  | 'joya' | 'premium' | 'diamante_en_bruto' | 'en_peligro'
  | 'trampa_operativa' | 'recuperacion' | 'oportunidad_inmediata'
  | 'bajo_retorno' | 'estable' | 'revisar';

export type KoldPriority = 'critica' | 'alta' | 'media' | 'baja' | 'monitoreo';

export interface KoldScoreData {
  id: OdooId;
  partner_id: OdooMany2one;
  score_master: number; // 0-100
  category: KoldCategory;
  priority: KoldPriority;
  action: string;
  explanation_text?: string;
}

// ═══ KoldDemand ═══

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ForecastLine {
  product_name: string;
  predicted_kg: number;
  predicted_units: number;
  pct_of_total: number;
}

export interface KoldForecastData {
  id: OdooId;
  partner_id: OdooMany2one;
  forecast_date: string;
  predicted_kg: number;
  predicted_revenue?: number;
  probability_of_purchase: number;
  confidence_level: ConfidenceLevel;
  confidence_score: number;
  lower_bound: number;
  upper_bound: number;
  explanation_text?: string;
  customer_family?: string;
  line_ids?: ForecastLine[];
}

// ═══ Loyalty ═══

export interface LoyaltyCard {
  id: OdooId;
  partner_id: OdooMany2one;
  points: number;
  program_id: OdooMany2one;
}

// ═══ Competitor Intelligence ═══

export interface CompetitorEvent {
  id: OdooId;
  partner_id: OdooMany2one;
  competitor_brand: string;
  detected_date: string;
  notes?: string;
}
