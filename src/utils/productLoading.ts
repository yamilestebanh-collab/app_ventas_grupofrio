export function shouldAutoLoadProducts(
  warehouseId: number | null | undefined,
  productCount: number,
  isLoading: boolean,
): boolean {
  return !!warehouseId && warehouseId > 0 && productCount === 0 && !isLoading;
}
