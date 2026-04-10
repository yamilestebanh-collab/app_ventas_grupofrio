/**
 * BLD-20260410: Customer / lead service.
 *
 * Handles:
 *   - Search customers and leads (res.partner with customer_rank toggle)
 *   - Create new customer in field (res.partner create)
 *   - Convert lead → customer (res.partner write, sets customer_rank=1)
 *
 * Uses odooWrite / odooRead wrappers. All calls require network; the caller
 * is responsible for gating on isOnline.
 *
 * Minimum fields for new customer (pilot):
 *   - name          (required)
 *   - phone / mobile
 *   - street / street2 / city
 *   - vat (RFC, optional)
 *   - comment (free text, stores colonia/referencia)
 *
 * Creation always sets customer_rank=1 so the partner is immediately usable
 * for future sales.
 */

import { odooRead, odooRpc, odooWrite } from './odooRpc';

export interface PartnerSearchResult {
  id: number;
  name: string;
  street?: string;
  street2?: string;
  city?: string;
  phone?: string;
  mobile?: string;
  vat?: string;
  customer_rank?: number;
  comment?: string;
}

export interface NewPartnerInput {
  name: string;
  phone?: string;
  mobile?: string;
  street?: string;
  street2?: string;
  city?: string;
  vat?: string;
  comment?: string;
  // Optional: mark provenance so the supervisor can audit in Odoo.
  _createdFromLeadId?: number;
}

const SEARCH_FIELDS = [
  'id', 'name', 'street', 'street2', 'city',
  'phone', 'mobile', 'vat', 'customer_rank', 'comment',
];

export type PartnerSearchMode = 'customers' | 'leads' | 'all';

/**
 * Search res.partner by free text (name / phone / vat).
 * @param mode 'customers' = customer_rank > 0, 'leads' = customer_rank = 0, 'all' = both
 *
 * BLD-20260410-DEBUG: Verbose logging to diagnose why the offroute search
 * returns empty lists in production. Logs domain, raw response and the
 * parsed result so we can confirm whether:
 *   (a) the backend allowlist on /get_records blocks res.partner
 *   (b) the customer_rank filter is silently eating the results
 *   (c) the auth scope of the employee limits visibility
 *   (d) there really are zero matches
 *
 * Safe to keep on: only uses console.log in __DEV__-style sections via
 * console.warn (always shown) and console.info (only in dev).
 */
export async function searchPartners(
  query: string,
  mode: PartnerSearchMode = 'customers',
  limit = 30,
): Promise<PartnerSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  // Build domain: text match on (name | phone | mobile | vat)
  const textDomain: unknown[] = [
    '|', '|', '|',
    ['name', 'ilike', q],
    ['phone', 'ilike', q],
    ['mobile', 'ilike', q],
    ['vat', 'ilike', q],
  ];

  let domain: unknown[];
  if (mode === 'customers') {
    domain = ['&', ['customer_rank', '>', 0], ...textDomain];
  } else if (mode === 'leads') {
    // Leads: customer_rank = 0 AND not a company parent contact (optional).
    domain = ['&', ['customer_rank', '=', 0], ...textDomain];
  } else {
    domain = textDomain;
  }

  console.log(
    `[partners.search] mode=${mode} q="${q}" limit=${limit}\n` +
    `  domain=${JSON.stringify(domain)}`,
  );

  // ── Attempt 1: /get_records (existing path) ──
  // Some GF backends whitelist res.partner here; some don't.
  let results: PartnerSearchResult[] = [];
  try {
    const r = await odooRead<PartnerSearchResult>(
      'res.partner',
      domain,
      SEARCH_FIELDS,
      limit,
    );
    results = r || [];
    console.log(
      `[partners.search] /get_records → ${results.length} result(s)` +
      (results.length > 0
        ? ` — first: ${JSON.stringify({
            id: results[0].id,
            name: results[0].name,
            customer_rank: results[0].customer_rank,
          })}`
        : ''),
    );
  } catch (err) {
    console.warn(`[partners.search] /get_records FAILED mode=${mode} q="${q}":`, err);
  }

  if (results.length > 0) return results;

  // ── Attempt 2: JSON-RPC search_read fallback ──
  //
  // BLD-20260410-FALLBACK: pricelist.ts already proves that
  // odooRpc('res.partner', 'search_read', ...) works in production even
  // when /get_records returns empty (the legacy endpoint has a custom
  // allowlist / can't resolve property/computed fields). We retry the
  // same query via the native ORM path before giving up.
  try {
    const fallback = await odooRpc<PartnerSearchResult[]>(
      'res.partner',
      'search_read',
      [domain],
      {
        fields: SEARCH_FIELDS,
        limit,
      },
    );
    const list = Array.isArray(fallback) ? fallback : [];
    console.log(
      `[partners.search] /jsonrpc search_read → ${list.length} result(s)` +
      (list.length > 0
        ? ` — first: ${JSON.stringify({
            id: list[0].id,
            name: list[0].name,
            customer_rank: list[0].customer_rank,
          })}`
        : ''),
    );
    if (list.length > 0) return list;
  } catch (err) {
    console.warn(`[partners.search] /jsonrpc search_read FAILED mode=${mode} q="${q}":`, err);
  }

  // ── Attempt 3: relax the customer_rank filter ──
  //
  // Last-resort: if mode='customers' or mode='leads' returns zero, try the
  // same text query WITHOUT the customer_rank filter. customer_rank is a
  // computed field and some Odoo setups cannot filter by it from an
  // external endpoint; we still want the vendor to be able to find the
  // contact even if the classification has to happen client-side.
  if (mode !== 'all') {
    try {
      const relaxed = await odooRpc<PartnerSearchResult[]>(
        'res.partner',
        'search_read',
        [
          [
            '|', '|', '|',
            ['name', 'ilike', q],
            ['phone', 'ilike', q],
            ['mobile', 'ilike', q],
            ['vat', 'ilike', q],
          ],
        ],
        {
          fields: SEARCH_FIELDS,
          limit,
        },
      );
      const list = Array.isArray(relaxed) ? relaxed : [];
      console.log(
        `[partners.search] relaxed search_read → ${list.length} result(s)`,
      );
      if (list.length > 0) {
        // Filter client-side by customer_rank to honor the requested mode.
        const wantLeads = mode === 'leads';
        const filtered = list.filter((p) => {
          const rank = p.customer_rank ?? 0;
          return wantLeads ? rank === 0 : rank > 0;
        });
        console.log(
          `[partners.search] relaxed → client-filtered to ${filtered.length} for mode=${mode}`,
        );
        return filtered;
      }
    } catch (err) {
      console.warn(`[partners.search] relaxed search_read FAILED mode=${mode}:`, err);
    }
  }

  console.log(`[partners.search] ALL PATHS EXHAUSTED — returning empty for mode=${mode} q="${q}"`);
  return [];
}

/**
 * Create a new partner in Odoo.
 * Returns the created partner's id or null on failure.
 *
 * IMPORTANT: Online-only. Caller must check isOnline beforehand.
 * Sets customer_rank=1 so the partner is immediately usable.
 */
export async function createPartner(input: NewPartnerInput): Promise<number | null> {
  const dict: Record<string, unknown> = {
    name: input.name.trim(),
    customer_rank: 1, // Immediately usable for sales
    company_type: 'person', // Default; backend may override
  };

  if (input.phone && input.phone.trim()) dict.phone = input.phone.trim();
  if (input.mobile && input.mobile.trim()) dict.mobile = input.mobile.trim();
  if (input.street && input.street.trim()) dict.street = input.street.trim();
  if (input.street2 && input.street2.trim()) dict.street2 = input.street2.trim();
  if (input.city && input.city.trim()) dict.city = input.city.trim();
  if (input.vat && input.vat.trim()) dict.vat = input.vat.trim().toUpperCase();

  // Stitch notes: provenance + free text.
  const noteParts: string[] = [];
  if (input.comment && input.comment.trim()) noteParts.push(input.comment.trim());
  noteParts.push('[KOLD Field] Alta en campo.');
  if (input._createdFromLeadId) {
    noteParts.push(`Convertido desde lead #${input._createdFromLeadId}.`);
  }
  dict.comment = noteParts.join('\n');

  try {
    const result = await odooWrite('res.partner', 'create', dict);
    // Odoo create returns the new record ID as a number.
    if (typeof result === 'number' && result > 0) {
      console.log(`[partners] Created partner ${result}: ${input.name}`);
      return result;
    }
    // Some wrappers may return { id: N } — defensive handling.
    if (result && typeof result === 'object' && typeof (result as any).id === 'number') {
      return (result as any).id;
    }
    console.warn('[partners] createPartner: unexpected response shape', result);
    return null;
  } catch (err) {
    console.warn('[partners] createPartner failed:', err);
    return null;
  }
}

/**
 * Fields we accept as pass-through when converting a lead. Any key in this
 * set (or matching the prefix rules below) is forwarded to Odoo verbatim so
 * the LeadConversionModal can send fiscal/custom fields without a service
 * update. Unknown keys on the backend are ignored by create_update.
 */
const CONVERT_PASS_THROUGH = new Set<string>([
  'name', 'phone', 'mobile', 'email',
  'street', 'street2', 'city', 'zip', 'state_id', 'country_id',
  'vat', 'comment',
  'l10n_mx_edi_fiscal_regime', 'l10n_mx_edi_usage',
  'property_account_position_id',
  'company_type',
]);

function isCustomKoldField(k: string): boolean {
  return k.startsWith('x_kold_') || k.startsWith('x_studio_');
}

/**
 * Convert an existing lead (customer_rank=0) into a real customer by
 * updating fields and setting customer_rank=1. Returns true on success.
 *
 * Online-only. Used when a stop in the route was a lead and the vendor
 * completes the data + makes a sale.
 *
 * BLD-20260410-CRIT: accepts an arbitrary `updates` dict so LeadConversionModal
 * can push fiscal fields (zip, l10n_mx_edi_*, x_kold_*) without having to
 * extend NewPartnerInput. Only whitelisted keys (+ custom `x_kold_*` /
 * `x_studio_*`) are forwarded; anything else is dropped defensively.
 */
export async function convertLeadToCustomer(
  partnerId: number,
  updates: Record<string, unknown>,
): Promise<boolean> {
  const dict: Record<string, unknown> = {
    customer_rank: 1, // Promote to customer
  };

  for (const [key, rawVal] of Object.entries(updates || {})) {
    if (rawVal === undefined || rawVal === null) continue;
    if (!(CONVERT_PASS_THROUGH.has(key) || isCustomKoldField(key))) continue;

    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if (!trimmed) continue;
      dict[key] = key === 'vat' ? trimmed.toUpperCase() : trimmed;
    } else {
      dict[key] = rawVal;
    }
  }

  // Tag the comment so supervisors can audit the conversion in Odoo.
  if (typeof dict.comment === 'string') {
    dict.comment = `${dict.comment}\n[KOLD Field] Lead convertido a cliente en campo.`;
  } else {
    dict.comment = '[KOLD Field] Lead convertido a cliente en campo.';
  }

  try {
    // Odoo write needs the record ID in the dict or via args. odooWrite wrapper
    // sends {model, method, dict} — we include id inside dict as Odoo expects
    // for the custom /api/create_update endpoint.
    await odooWrite('res.partner', 'write', { id: partnerId, ...dict });
    console.log(`[partners] Converted lead ${partnerId} to customer`);
    return true;
  } catch (err) {
    console.warn('[partners] convertLeadToCustomer failed:', err);
    return false;
  }
}

/**
 * Load a single partner by ID with all fields needed by the app.
 * Useful to pre-fill conversion forms with existing lead data.
 */
export async function getPartner(partnerId: number): Promise<PartnerSearchResult | null> {
  try {
    const results = await odooRead<PartnerSearchResult>(
      'res.partner',
      [['id', '=', partnerId]],
      SEARCH_FIELDS,
      1,
    );
    return results && results.length > 0 ? results[0] : null;
  } catch (err) {
    console.warn('[partners] getPartner failed:', err);
    return null;
  }
}
