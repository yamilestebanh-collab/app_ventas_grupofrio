export function isVirtualStopId(stopId: number | null | undefined): boolean {
  return typeof stopId === 'number' && stopId < 0;
}

export function shouldSkipStopCheckout(stopId: number | null | undefined): boolean {
  return isVirtualStopId(stopId);
}
