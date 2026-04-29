export interface EmployeeAnalyticPlaza {
  id: number | null;
  name: string;
}

function extractId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (typeof value === 'number' && value > 0) return value;
  return null;
}

function extractName(value: unknown): string {
  if (Array.isArray(value) && value.length > 1) return String(value[1] ?? '');
  if (typeof value === 'string') return value;
  return '';
}

export function extractEmployeeAnalyticPlaza(payload: Record<string, unknown>): EmployeeAnalyticPlaza {
  const raw =
    payload.x_analytic_un_id ??
    payload.x_analytic_account_id ??
    payload.employee_analytic_plaza_id ??
    payload.analytic_plaza_id ??
    payload.plaza_analytic_id ??
    payload.plaza_id ??
    null;

  return {
    id: extractId(raw),
    name: extractName(raw),
  };
}
