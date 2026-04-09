/**
 * Time formatting utilities.
 */

/** Format seconds as M:SS or H:MM:SS */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format currency as $X,XXX.XX — guards NaN/undefined/null */
export function formatCurrency(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `$${safe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format currency compact as $X.Xk — guards NaN */
export function formatCurrencyCompact(amount: number): string {
  const safe = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  if (safe >= 1000) {
    return `$${(safe / 1000).toFixed(1)}k`;
  }
  return `$${safe.toFixed(0)}`;
}

/** Format kg with unit */
export function formatKg(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

// ═══════════════════════════════════════════
// PRECIO VISIBLE CON IVA
// ═══════════════════════════════════════════

/**
 * IVA rate used throughout the app.
 * Odoo `list_price` is the base price WITHOUT IVA.
 * The driver sees the final price WITH IVA (list_price * 1.16).
 *
 * IMPORTANT: This is ONLY for display. The internal sale calculations
 * in useVisitStore continue using base price for subtotal/tax/total
 * and the sync payload sends price_unit = base price to Odoo.
 */
export const IVA_RATE = 0.16;

/** Calculate price with IVA included for display purposes */
export function priceWithIVA(basePrice: number): number {
  const safe = typeof basePrice === 'number' && !isNaN(basePrice) ? basePrice : 0;
  return safe * (1 + IVA_RATE);
}

/** Format price with IVA as currency string */
export function formatPriceWithIVA(basePrice: number): string {
  return formatCurrency(priceWithIVA(basePrice));
}
