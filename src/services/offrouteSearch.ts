import { odooRead, odooRpc } from './odooRpc';
import {
  OffrouteCustomerRecord,
  OffrouteLeadRecord,
  OffrouteSearchResult,
  buildOffrouteResults,
} from './offrouteSearchLogic';

const CUSTOMER_FIELDS = ['id', 'name', 'street', 'city', 'phone', 'mobile', 'vat'];
const LEAD_FIELDS = ['id', 'name', 'partner_name', 'phone', 'mobile', 'email_from', 'street', 'city', 'partner_id'];

export type { OffrouteCustomerRecord, OffrouteLeadRecord, OffrouteSearchResult };
export { buildOffrouteResults };

type OffrouteSearchOptions = {
  analyticPlazaId?: number | null;
};

/**
 * Append an analytic-plaza filter for res.partner.
 * Field is `x_analytic_un_id` (Studio many2one → account.analytic.account).
 * crm.lead does NOT have this field — use withoutAnalyticFilter for leads.
 */
function withPartnerAnalyticFilter(domain: unknown[], analyticPlazaId?: number | null): unknown[] {
  if (typeof analyticPlazaId !== 'number' || analyticPlazaId <= 0) {
    return domain;
  }
  return ['&', ['x_analytic_un_id', '=', analyticPlazaId], ...domain];
}

async function searchCustomers(domain: unknown[]): Promise<OffrouteCustomerRecord[]> {
  try {
    return await odooRpc<OffrouteCustomerRecord[]>('res.partner', 'search_read', [domain], {
      fields: CUSTOMER_FIELDS,
      limit: 20,
      order: 'name asc',
    });
  } catch {
    return await odooRead<OffrouteCustomerRecord>('res.partner', domain, CUSTOMER_FIELDS, 20, 0, 'name asc');
  }
}

async function searchLeads(domain: unknown[]): Promise<OffrouteLeadRecord[]> {
  try {
    return await odooRpc<OffrouteLeadRecord[]>('crm.lead', 'search_read', [domain], {
      fields: LEAD_FIELDS,
      limit: 20,
      order: 'name asc',
    });
  } catch {
    return await odooRead<OffrouteLeadRecord>('crm.lead', domain, LEAD_FIELDS, 20, 0, 'name asc');
  }
}

export async function searchOffrouteEntities(
  query: string,
  options: OffrouteSearchOptions = {},
): Promise<OffrouteSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const customerDomain = withPartnerAnalyticFilter([
    '&',
    ['customer_rank', '>', 0],
    '|', '|',
    ['name', 'ilike', q],
    ['phone', 'ilike', q],
    ['vat', 'ilike', q],
  ], options.analyticPlazaId);

  // crm.lead does NOT have x_analytic_un_id — no analytic filter applied.
  const leadDomain = [
    '|', '|', '|', '|',
    ['name', 'ilike', q],
    ['partner_name', 'ilike', q],
    ['phone', 'ilike', q],
    ['mobile', 'ilike', q],
    ['email_from', 'ilike', q],
  ];

  const [customersResult, leadsResult] = await Promise.allSettled([
    searchCustomers(customerDomain),
    searchLeads(leadDomain),
  ]);

  const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
  const leads = leadsResult.status === 'fulfilled' ? leadsResult.value : [];
  return buildOffrouteResults(customers, leads);
}
