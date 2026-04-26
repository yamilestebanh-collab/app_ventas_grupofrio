function toSafePrice(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function getVisiblePricelistPrice(basePrice: number): number {
  return toSafePrice(basePrice);
}

export function getDisplayPriceWithIva(basePrice: number, _ivaRate = 0.16): number {
  return getVisiblePricelistPrice(basePrice);
}

export function normalizeSaleLineBasePrice(price: number): number {
  return Math.round(toSafePrice(price) * 100) / 100;
}
