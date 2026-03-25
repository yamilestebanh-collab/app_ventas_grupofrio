/**
 * Auth store — GlobalUser equivalent from xVan.
 * From KOLD_FIELD_SPEC.md section 4 + xvan_audit.md.
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

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  error: null,
  employeeId: null,
  employeeName: '',
  companyId: null,
  companyName: '',
  warehouseId: null,
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

      const emp = result.employee || {};
      set({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        employeeId: emp.employeeId || emp.id,
        employeeName: emp.employeeName || emp.name || '',
        companyId: emp.companyId || null,
        companyName: emp.companyName || '',
        warehouseId: emp.warehouseId || null,
        parentId: emp.parentId || null,
        isSupervisor: !!emp.isSupervisor,
        allowCreateCustomer: !!emp.allowCreateCustomer,
        allowFreeVisitsMode: !!emp.allowFreeVisitsMode,
        allowConfirmPayment: !!emp.allowConfirmPayment,
        allowDeliveryScreen: !!emp.allowDeliveryScreen,
        allowSalesDirectInvoice: !!emp.allowSalesDirectInvoice,
        allowOffDateVisits: !!emp.allowOffDateVisits,
        allowOffDistanceVisits: !!emp.allowOffDistanceVisits,
        maxCashLimit: emp.maxCashLimit || 0,
        stockValueLimit: emp.stockValueLimit || 0,
        mustTakePhotosToEndVisit: true, // ALWAYS TRUE
        blockSaleIfUnpaidInvoices: false, // WARNING only
        defaultPaymentJournalId: emp.defaultPaymentJournalId || null,
        defaultCashAccountId: emp.defaultCashAccountId || null,
        customerIds: emp.customerIds || [],
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
        warehouseId: null,
        customerIds: [],
      });
    }
  },
}));
