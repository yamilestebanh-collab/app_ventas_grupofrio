import { odooRpc } from './odooRpc';
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

export async function searchOffrouteEntities(query: string): Promise<OffrouteSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const customerDomain: unknown[] = [
    '&',
    ['customer_rank', '>', 0],
    '|', '|',
    ['name', 'ilike', q],
    ['phone', 'ilike', q],
    ['vat', 'ilike', q],
  ];

  const leadDomain: unknown[] = [
    '|', '|', '|', '|',
    ['name', 'ilike', q],
    ['partner_name', 'ilike', q],
    ['phone', 'ilike', q],
    ['mobile', 'ilike', q],
    ['email_from', 'ilike', q],
  ];

  const [customersResult, leadsResult] = await Promise.allSettled([
    odooRpc<OffrouteCustomerRecord[]>('res.partner', 'search_read', [customerDomain], {
      fields: CUSTOMER_FIELDS,
      limit: 20,
      order: 'name asc',
    }),
    odooRpc<OffrouteLeadRecord[]>('crm.lead', 'search_read', [leadDomain], {
      fields: LEAD_FIELDS,
      limit: 20,
      order: 'name asc',
    }),
  ]);

  const customers = customersResult.status === 'fulfilled' ? customersResult.value : [];
  const leads = leadsResult.status === 'fulfilled' ? leadsResult.value : [];
  return buildOffrouteResults(customers, leads);
}
