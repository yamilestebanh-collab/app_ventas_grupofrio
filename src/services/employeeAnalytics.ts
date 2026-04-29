import { odooRpc, odooRead } from './odooRpc';
import {
  extractEmployeeAnalyticPlaza,
  type EmployeeAnalyticPlaza,
} from './extractEmployeeAnalyticPlaza';

export { extractEmployeeAnalyticPlaza };
export type { EmployeeAnalyticPlaza };

export async function fetchEmployeeAnalyticPlaza(employeeId: number): Promise<EmployeeAnalyticPlaza> {
  // Strategy 1: Odoo web session (call_kw / execute_kw)
  try {
    const rows = await odooRpc<Array<Record<string, unknown>>>(
      'hr.employee',
      'read',
      [[employeeId]],
      { fields: ['x_analytic_account_id'] },
    );
    const result = extractEmployeeAnalyticPlaza(rows?.[0] ?? {});
    if (result.id) return result;
  } catch { /* session not available */ }

  // Strategy 2: /get_records via API key (no Odoo session needed)
  const rows = await odooRead<Record<string, unknown>>(
    'hr.employee',
    [['id', '=', employeeId]],
    ['x_analytic_account_id'],
    1,
  );
  return extractEmployeeAnalyticPlaza(rows?.[0] ?? {});
}
