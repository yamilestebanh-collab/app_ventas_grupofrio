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

// IVA is no longer added client-side in the sales flow. Prices shown to
// the operator should match the active pricelist as-is.
export const IVA_RATE = 0.16;

/** Legacy helper retained for compatibility with existing imports. */
export function priceWithIVA(basePrice: number): number {
  const safe = typeof basePrice === 'number' && !isNaN(basePrice) ? basePrice : 0;
  return safe;
}

export function formatCatalogPrice(price: number): string {
  const safe = typeof price === 'number' && !isNaN(price) ? price : 0;
  return formatCurrency(safe);
}

/** Legacy helper retained for compatibility with existing imports. */
export function formatPriceWithIVA(basePrice: number): string {
  return formatCatalogPrice(basePrice);
}
