/**
 * Visit store — manages the active visit flow state.
 * Tracks: current stop, check-in time, visit timer, sale data, photos.
 *
 * State machine:
 *   idle → checked_in → (sale | no_sale) → checked_out
 */

import { create } from 'zustand';
import { GFStop } from '../types/plan';

export type VisitPhase = 'idle' | 'checked_in' | 'selling' | 'no_selling' | 'checked_out';

export interface SaleLineItem {
  productId: number;
  productName: string;
  price: number;
  qty: number;
  stock: number;
  weight: number; // kg per unit
}

interface VisitState {
  // Current visit
  phase: VisitPhase;
  currentStopId: number | null;
  currentStop: GFStop | null;

  // Check-in data
  checkInTime: number | null; // timestamp ms
  checkInLat: number | null;
  checkInLon: number | null;
  elapsedSeconds: number;

  // Sale data
  saleLines: SaleLineItem[];
  salePaymentMethod: 'cash' | 'credit' | null;
  salePhotoTaken: boolean;
  salePhotoUri: string | null;

  // No-sale data
  noSaleReasonId: number | null;
  noSaleReasonLabel: string;
  noSaleCompetitor: string | null;
  noSaleNotes: string;
  noSalePhotoTaken: boolean;
  noSalePhotoUri: string | null;

  // Actions
  startVisit: (stop: GFStop, lat: number, lon: number) => void;
  endVisit: (lat: number, lon: number) => void;
  setPhase: (phase: VisitPhase) => void;

  // Sale actions
  addSaleLine: (line: SaleLineItem) => void;
  updateSaleQty: (productId: number, qty: number) => void;
  removeSaleLine: (productId: number) => void;
  setSalePayment: (method: 'cash' | 'credit') => void;
  setSalePhoto: (uri: string) => void;

  // No-sale actions
  setNoSaleReason: (id: number, label: string) => void;
  setNoSaleCompetitor: (brand: string | null) => void;
  setNoSaleNotes: (notes: string) => void;
  setNoSalePhoto: (uri: string) => void;

  // Timer
  tickTimer: () => void;

  // Reset
  resetVisit: () => void;

  // V1.2: Anti-duplicate
  saleConfirmed: boolean;        // Prevents double-tap
  saleOperationId: string | null; // Idempotency key for this sale

  // Computed
  saleSubtotal: () => number;
  saleTax: () => number;
  saleTotal: () => number;
  saleTotalKg: () => number;

  // V1.2: Stock validation
  hasStockIssues: () => boolean;
  getStockIssues: () => Array<{ productId: number; name: string; requested: number; available: number }>;

  // V1.2: Confirm lock
  lockSaleConfirm: () => string; // Returns operationId
  unlockSaleConfirm: () => void;
}

const initialState = {
  phase: 'idle' as VisitPhase,
  currentStopId: null as number | null,
  currentStop: null as GFStop | null,
  checkInTime: null as number | null,
  checkInLat: null as number | null,
  checkInLon: null as number | null,
  elapsedSeconds: 0,
  saleLines: [] as SaleLineItem[],
  salePaymentMethod: null as 'cash' | 'credit' | null,
  salePhotoTaken: false,
  salePhotoUri: null as string | null,
  noSaleReasonId: null as number | null,
  noSaleReasonLabel: '',
  noSaleCompetitor: null as string | null,
  noSaleNotes: '',
  noSalePhotoTaken: false,
  noSalePhotoUri: null as string | null,
  // V1.2
  saleConfirmed: false,
  saleOperationId: null as string | null,
};

export const useVisitStore = create<VisitState>((set, get) => ({
  ...initialState,

  startVisit: (stop, lat, lon) => set({
    phase: 'checked_in',
    currentStopId: stop.id,
    currentStop: stop,
    checkInTime: Date.now(),
    checkInLat: lat,
    checkInLon: lon,
    elapsedSeconds: 0,
  }),

  endVisit: (_lat, _lon) => set({
    phase: 'checked_out',
  }),

  setPhase: (phase) => set({ phase }),

  // Sale
  addSaleLine: (line) => {
    const existing = get().saleLines.find((l) => l.productId === line.productId);
    if (existing) {
      set({
        saleLines: get().saleLines.map((l) =>
          l.productId === line.productId ? { ...l, qty: l.qty + line.qty } : l
        ),
      });
    } else {
      set({ saleLines: [...get().saleLines, line] });
    }
  },

  updateSaleQty: (productId, qty) => set({
    saleLines: qty <= 0
      ? get().saleLines.filter((l) => l.productId !== productId)
      : get().saleLines.map((l) =>
          l.productId === productId ? { ...l, qty: Math.min(qty, l.stock) } : l
        ),
  }),

  removeSaleLine: (productId) => set({
    saleLines: get().saleLines.filter((l) => l.productId !== productId),
  }),

  setSalePayment: (method) => set({ salePaymentMethod: method }),
  setSalePhoto: (uri) => set({ salePhotoTaken: true, salePhotoUri: uri }),

  // No-sale
  setNoSaleReason: (id, label) => set({ noSaleReasonId: id, noSaleReasonLabel: label }),
  setNoSaleCompetitor: (brand) => set({ noSaleCompetitor: brand }),
  setNoSaleNotes: (notes) => set({ noSaleNotes: notes }),
  setNoSalePhoto: (uri) => set({ noSalePhotoTaken: true, noSalePhotoUri: uri }),

  // Timer
  tickTimer: () => {
    const { checkInTime } = get();
    if (checkInTime) {
      set({ elapsedSeconds: Math.floor((Date.now() - checkInTime) / 1000) });
    }
  },

  // Reset
  resetVisit: () => set({ ...initialState }),

  // Computed
  saleSubtotal: () => get().saleLines.reduce((sum, l) => sum + l.price * l.qty, 0),
  saleTax: () => get().saleSubtotal() * 0.16,
  saleTotal: () => get().saleSubtotal() * 1.16,
  saleTotalKg: () => get().saleLines.reduce((sum, l) => sum + l.weight * l.qty, 0),

  // V1.2: Stock validation — checks if any line exceeds available stock
  hasStockIssues: () => {
    return get().saleLines.some((l) => l.qty > l.stock);
  },

  getStockIssues: () => {
    return get().saleLines
      .filter((l) => l.qty > l.stock)
      .map((l) => ({
        productId: l.productId,
        name: l.productName,
        requested: l.qty,
        available: l.stock,
      }));
  },

  // V1.2: Anti-duplicate — lock confirm button, generate operation ID
  lockSaleConfirm: () => {
    const opId = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set({ saleConfirmed: true, saleOperationId: opId });
    return opId;
  },

  unlockSaleConfirm: () => {
    set({ saleConfirmed: false, saleOperationId: null });
  },
}));
