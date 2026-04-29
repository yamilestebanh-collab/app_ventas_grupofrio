export interface GiftDraftLine {
  key: string;
  productId: number | null;
  qtyText: string;
}

export interface GiftPayloadLine {
  productId: number;
  qty: number;
}

interface BuildGiftPayloadInput {
  analyticAccountId: number;
  idempotencyKey: string;
  mobileLocationId: number;
  partnerId: number;
  visitLineId?: number | null;
  lines: GiftPayloadLine[];
  notes?: string;
}

interface GetGiftSubmitIssuesInput {
  lines: GiftDraftLine[];
  partnerId: number | null;
  mobileLocationId: number | null | undefined;
  analyticAccountId: number | null | undefined;
}

interface NormalizeGiftErrorInput {
  code?: string | null;
  message?: string | null;
  userMessage?: string | null;
}

function toPositiveNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function toGiftPayloadLines(lines: GiftDraftLine[]): GiftPayloadLine[] {
  return lines.flatMap((line) => {
    if (!line.productId || line.productId <= 0) return [];
    const qty = toPositiveNumber(line.qtyText);
    if (!qty) return [];
    return [{ productId: line.productId, qty }];
  });
}

export function buildGiftPayload({
  analyticAccountId,
  idempotencyKey,
  mobileLocationId,
  partnerId,
  visitLineId = null,
  lines,
  notes,
}: BuildGiftPayloadInput) {
  return {
    meta: {
      analytic_account_id: analyticAccountId,
      idempotency_key: idempotencyKey,
    },
    data: {
      mobile_location_id: mobileLocationId,
      partner_id: partnerId,
      visit_line_id: visitLineId,
      lines: lines.map((line) => ({
        product_id: line.productId,
        qty: line.qty,
      })),
      notes: notes?.trim() || '',
      validate: true,
    },
  };
}

export function getGiftSubmitIssues({
  lines,
  partnerId,
  mobileLocationId,
  analyticAccountId,
}: GetGiftSubmitIssuesInput): string[] {
  const issues: string[] = [];

  if (!partnerId || partnerId <= 0) {
    issues.push('missing_partner');
  }
  if (!mobileLocationId || mobileLocationId <= 0) {
    issues.push('missing_mobile_location');
  }
  if (!analyticAccountId || analyticAccountId <= 0) {
    issues.push('missing_analytic_account');
  }

  const selectedProductIds = lines
    .map((line) => line.productId)
    .filter((productId): productId is number => !!productId && productId > 0);
  const uniqueProductIds = new Set(selectedProductIds);
  if (selectedProductIds.length !== uniqueProductIds.size) {
    issues.push('duplicate_products');
  }

  if (toGiftPayloadLines(lines).length === 0) {
    issues.push('no_valid_lines');
  }

  return issues;
}

export function normalizeGiftErrorMessage({
  code,
  message,
  userMessage,
}: NormalizeGiftErrorInput): string {
  if (userMessage && userMessage.trim().length > 0) return userMessage.trim();

  const fallbackCode = (message || '').trim();
  const effectiveCode = code || fallbackCode;

  switch (effectiveCode) {
    case 'VALIDATION_ERROR':
      return 'Revisa los productos y cantidades antes de registrar el regalo.';
    case 'FORBIDDEN':
      return 'La unidad móvil no pertenece a la sucursal activa.';
    case 'SERVER_MISCONFIG':
      return 'Falta configuración en Odoo para registrar el regalo. Contacta al administrador.';
    case 'LOCK_BUSY':
      return 'Otro movimiento está usando la unidad. Reintenta en unos segundos.';
    default:
      return message && message.trim().length > 0
        ? message.trim()
        : 'No se pudo registrar el regalo.';
  }
}
