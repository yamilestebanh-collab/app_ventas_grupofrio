export type OffrouteVisitResultStatus = 'sale' | 'no_sale' | 'lead_data' | 'cancelled';

export interface OffrouteVisitRecord {
  id: number;
  state?: string;
  result_status?: string | null;
  is_offroute?: boolean;
  partner_id?: [number, string] | number | false | null;
  lead_id?: [number, string] | number | false | null;
  company_id?: [number, string] | number | false | null;
  started_at?: string;
  closed_at?: string | false | null;
}

export function extractOffrouteVisitId(
  value: number | null | undefined,
): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}
