export type CheckoutResultStatus = 'sale' | 'no_sale';

interface CheckoutResultInput {
  saleTotal: number;
  noSaleReasonId: number | null;
}

interface BuildCheckoutPayloadInput extends CheckoutResultInput {
  stopId: number;
  latitude: number;
  longitude: number;
}

export function getCheckoutResultStatus({
  saleTotal,
  noSaleReasonId,
}: CheckoutResultInput): CheckoutResultStatus {
  if (saleTotal > 0) return 'sale';
  if (noSaleReasonId != null) return 'no_sale';
  return 'no_sale';
}

export function buildCheckoutPayload({
  stopId,
  latitude,
  longitude,
  saleTotal,
  noSaleReasonId,
}: BuildCheckoutPayloadInput) {
  return {
    stop_id: stopId,
    latitude,
    longitude,
    result_status: getCheckoutResultStatus({ saleTotal, noSaleReasonId }),
  };
}
