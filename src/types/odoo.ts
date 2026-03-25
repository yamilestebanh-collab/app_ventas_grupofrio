/**
 * Odoo base types — shared across all domain types.
 * From KOLD_FIELD_ADDENDUM.md Bloque 3.
 */

export type OdooId = number;
export type OdooMany2one = [number, string] | false;

/** Extract ID from Many2one field safely */
export function m2oId(field: OdooMany2one): number | null {
  return Array.isArray(field) ? field[0] : null;
}

/** Extract name from Many2one field safely */
export function m2oName(field: OdooMany2one): string {
  return Array.isArray(field) ? field[1] : '';
}
