/**
 * Auth store — GlobalUser equivalent from xVan.
 * From KOLD_FIELD_SPEC.md section 4 + xvan_audit.md.
 *
 * BLD-20260404-007: Fix mapping snake_case (backend) <-> camelCase (frontend).
 * Backend returns employee fields in snake_case and many2one as [id, name] tuples.
 */

import { create } from 'zustand';
import { api } from '../services/api';
import { setAuthTokens, clearAuthTokens, setBaseUrl } from '../services/api';
import { signOut } from '../services/gfLogistics';

interface AuthState {
  // Auth status
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Employee data (GlobalUser equivalent)
  employeeId: number | null;
  employeeName: string;
  companyId: number | null;
  companyName: string;
  warehouseId: number | null;
  warehouseName: string;
  parentId: number | null; // supervisor
  isSupervisor: boolean;

  // Permissions
  allowCreateCustomer: boolean;
  allowFreeVisitsMode: boolean;
  allowConfirmPayment: boolean;
  allowDeliveryScreen: boolean;
  allowSalesDirectInvoice: boolean;
  allowOffDateVisits: boolean;
  allowOffDistanceVisits: boolean;
  maxCashLimit: number;
  stockValueLimit: number;
  mustTakePhotosToEndVisit: boolean; // ALWAYS TRUE
  blockSaleIfUnpaidInvoices: boolean; // FALSE (warning only)
  defaultPaymentJournalId: number | null;
  defaultCashAccountId: number | null;
  customerIds: number[];

  // Actions
  login: (baseUrl: string, barcode: string, pin: string, db: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

// ============================================================
// Helpers: Odoo payload normalization
// ============================================================

/**
 * Extract id from Odoo many2one tuple [id, name] or direct value.
 * Returns null if the value is falsy or invalid.
 */
function extractId(v: unknown): number | null {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'number') return v[0];
  if (typeof v === 'number') return v;
  return null;
}

/**
 * Extract name from Odoo many2one tuple [id, name] or plain string.
 */
function extractName(v: unknown): string {
  if (Array.isArray(v) && v.length > 1) return String(v[1] ?? '');
  if (typeof v === 'string') return v;
  return '';
}

/**
 * Pick the first defined value from multiple possible keys.
 * Used to support both camelCase (legacy) and snake_case (Odoo native) field names.
 */
function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

// Employee payload coming from /api/employee-sign-in.
// Accepts both casings because the field keeps evolving in the Odoo module.
interface EmployeePayload {
  [key: string]: unknown;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  employeeId: null,
  employeeName: '',
  companyId: null,
  companyName: '',
  warehouseId: null,
  warehouseName: '',
  parentId: null,
  isSupervisor: false,
  allowCreateCustomer: false,
  allowFreeVisitsMode: false,
  allowConfirmPayment: false,
  allowDeliveryScreen: false,
  allowSalesDirectInvoice: false,
  allowOffDateVisits: false,
  allowOffDistanceVisits: false,
  maxCashLimit: 0,
  stockValueLimit: 0,
  mustTakePhotosToEndVisit: true,
  blockSaleIfUnpaidInvoices: false,
  defaultPaymentJournalId: null,
  defaultCashAccountId: null,
  customerIds: [],

  setLoading: (loading) => set({ isLoading: loading }),

  login: async (baseUrl, barcode, pin, db) => {
    set({ isLoading: true, error: null });
    try {
      await setBaseUrl(baseUrl);

      const response = await api.post(`${baseUrl}/api/employee-sign-in`, {
        jsonrpc: '2.0',
        params: { barcode, pin, db },
      });

      const result = response.data?.result;
      if (!result?.api_key) {
        set({ error: 'Credenciales incorrectas', isLoading: false });
        return false;
      }

      await setAuthTokens(result.api_key, result.gf_employee_token || '');

      const emp: EmployeePayload = result.employee || {};

      // Accept both camelCase (legacy mock) and snake_case (real Odoo) field names.
      // Many-to-one fields (warehouse_id, company_id, etc.) arrive as [id, name] tuples.
      const warehouseRaw = pick(emp, 'warehouseId', 'warehouse_id');
      const companyRaw = pick(emp, 'companyId', 'company_id');
      const parentRaw = pick(emp, 'parentId', 'parent_id');
      const paymentJournalRaw = pick(emp, 'defaultPaymentJournalId', 'default_payment_journal_id');
      const cashAccountRaw = pick(emp, 'defaultCashAccountId', 'default_cash_account_id');

      set({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        employeeId: (pick<number>(emp, 'employeeId', 'id') as number) ?? null,
        employeeName: (pick<string>(emp, 'employeeName', 'name') as string) ?? '',
        companyId: extractId(companyRaw),
        companyName: (pick<string>(emp, 'companyName') as string) ?? extractName(companyRaw),
        warehouseId: extractId(warehouseRaw),
        warehouseName: (pick<string>(emp, 'warehouseName') as string) ?? extractName(warehouseRaw),
        parentId: extractId(parentRaw),
        isSupervisor: !!pick(emp, 'isSupervisor', 'is_supervisor'),
        allowCreateCustomer: !!pick(emp, 'allowCreateCustomer', 'allow_create_customer'),
        allowFreeVisitsMode: !!pick(emp, 'allowFreeVisitsMode', 'allow_free_visits_mode'),
        allowConfirmPayment: !!pick(emp, 'allowConfirmPayment', 'allow_confirm_payment'),
        allowDeliveryScreen: !!pick(emp, 'allowDeliveryScreen', 'allow_delivery_screen'),
        allowSalesDirectInvoice: !!pick(emp, 'allowSalesDirectInvoice', 'allow_sales_direct_invoice'),
        allowOffDateVisits: !!pick(emp, 'allowOffDateVisits', 'allow_offdate_visits'),
        allowOffDistanceVisits: !!pick(emp, 'allowOffDistanceVisits', 'allow_offdistance_visits', 'allow_off_distance_visits'),
        maxCashLimit: (pick<number>(emp, 'maxCashLimit', 'max_cash_limit') as number) ?? 0,
        stockValueLimit: (pick<number>(emp, 'stockValueLimit', 'stock_value_limit') as number) ?? 0,
        mustTakePhotosToEndVisit: true, // ALWAYS TRUE
        blockSaleIfUnpaidInvoices: false, // WARNING only
        defaultPaymentJournalId: extractId(paymentJournalRaw),
        defaultCashAccountId: extractId(cashAccountRaw),
        customerIds: (pick<number[]>(emp, 'customerIds', 'customer_ids') as number[]) ?? [],
      });

      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de conexion';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await signOut();
    } finally {
      await clearAuthTokens();
      set({
        isAuthenticated: false,
        employeeId: null,
        employeeName: '',
        companyId: null,
        companyName: '',
        warehouseId: null,
        warehouseName: '',
        customerIds: [],
      });
    }
  },
}));
