/**
 * BLD-20260404-009 — Truck inventory reconciliation (SCAFFOLD ONLY).
 *
 * This store is **visibility-first**. It captures a local snapshot of
 * the chofer's truck inventory at route-start ("opening") and at
 * route-end ("closing"), then exposes a read-only diff so the driver /
 * supervisor can see how stock moved during the day.
 *
 * STRICT RULES for this scaffold (carried over from Sprint 4 guardrails):
 *   1. NEVER writes to Odoo. Never emits a sync op. Never calls any
 *      reconciliation endpoint.
 *   2. NEVER mutates `useProductStore`. It reads once and stores a copy.
 *   3. Diff is strictly informational — it does NOT try to correct,
 *      reconcile, post transfers, or push stock adjustments.
 *   4. If the chofer doesn't have a warehouse assigned yet (Sebastián
 *      hasn't validated in Odoo), the snapshot still captures whatever
 *      the local product store has and tags it as `warehouseUnknown`,
 *      so the flow is stable regardless of tomorrow's Odoo validation.
 *   5. Snapshots live only on the device and in AsyncStorage. The
 *      Sprint 3 P3 backend / stock.quant truck locations are NOT
 *      required for this module to work.
 *
 * When the backend side of BLD-009 lands, this store becomes the
 * client-side source for the server reconciliation call. Until then
 * it exists purely to *see* the problem.
 */

import { create } from 'zustand';
import { storeLoad, storeSave, STORAGE_KEYS } from '../persistence/storage';
import { useProductStore } from './useProductStore';

export type SnapshotKind = 'opening' | 'closing';

export interface TruckInventoryLine {
  productId: number;
  name: string;
  defaultCode?: string | null;
  qty: number;
  weight: number;
}

export interface TruckInventorySnapshot {
  id: string; // uuid
  kind: SnapshotKind;
  capturedAt: number; // epoch ms
  warehouseId: number | null; // null = unknown / not assigned yet
  lines: TruckInventoryLine[];
  totalUnits: number;
  totalKg: number;
  note?: string;
}

export interface TruckInventoryDiffRow {
  productId: number;
  name: string;
  openingQty: number;
  closingQty: number;
  delta: number; // closing - opening (negative = sold / lost)
}

export interface TruckInventoryDiff {
  openingId: string;
  closingId: string;
  rows: TruckInventoryDiffRow[];
  totalDeltaUnits: number;
  totalDeltaKg: number;
  generatedAt: number;
}

interface TruckInventoryState {
  snapshots: TruckInventorySnapshot[];
  isBusy: boolean;
  lastError: string | null;

  // Actions
  captureSnapshot: (kind: SnapshotKind, warehouseId?: number | null, note?: string) => Promise<string | null>;
  getLatest: (kind: SnapshotKind) => TruckInventorySnapshot | null;
  computeDiff: (openingId?: string, closingId?: string) => TruckInventoryDiff | null;
  clearAll: () => Promise<void>;
  rehydrate: () => Promise<void>;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Hard cap: keep only last N snapshots to avoid unbounded growth.
// Covers ~25 route days (2 snapshots/day).
const MAX_SNAPSHOTS = 50;

export const useTruckInventoryStore = create<TruckInventoryState>((set, get) => ({
  snapshots: [],
  isBusy: false,
  lastError: null,

  captureSnapshot: async (kind, warehouseId, note) => {
    set({ isBusy: true, lastError: null });
    try {
      const products = useProductStore.getState().products;
      const lines: TruckInventoryLine[] = products.map((p) => ({
        productId: p.id,
        name: p.name,
        defaultCode: p.default_code ?? null,
        qty: p.qty_available ?? 0,
        weight: p.weight ?? 1,
      }));
      const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
      const totalKg = Math.round(
        lines.reduce((s, l) => s + l.qty * (l.weight || 1), 0),
      );
      const snap: TruckInventorySnapshot = {
        id: uuid(),
        kind,
        capturedAt: Date.now(),
        warehouseId: warehouseId && warehouseId > 0 ? warehouseId : null,
        lines,
        totalUnits,
        totalKg,
        note,
      };

      const current = get().snapshots;
      // Trim to MAX_SNAPSHOTS keeping the most recent ones.
      const next = [snap, ...current].slice(0, MAX_SNAPSHOTS);
      set({ snapshots: next, isBusy: false });
      await storeSave(STORAGE_KEYS.TRUCK_INVENTORY_SNAPSHOTS, next);
      if (__DEV__) {
        console.log(
          `[truck-inventory] captured ${kind} snapshot (${lines.length} lines, ${totalUnits} units, ${totalKg} kg)`,
        );
      }
      return snap.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'snapshot failed';
      set({ isBusy: false, lastError: msg });
      console.warn('[truck-inventory] capture failed:', msg);
      return null;
    }
  },

  getLatest: (kind) => {
    const matching = get().snapshots.filter((s) => s.kind === kind);
    if (matching.length === 0) return null;
    return matching.reduce((acc, s) => (s.capturedAt > acc.capturedAt ? s : acc));
  },

  computeDiff: (openingId, closingId) => {
    const opening = openingId
      ? get().snapshots.find((s) => s.id === openingId)
      : get().getLatest('opening');
    const closing = closingId
      ? get().snapshots.find((s) => s.id === closingId)
      : get().getLatest('closing');
    if (!opening || !closing) return null;

    const openingByProduct = new Map<number, TruckInventoryLine>();
    opening.lines.forEach((l) => openingByProduct.set(l.productId, l));
    const closingByProduct = new Map<number, TruckInventoryLine>();
    closing.lines.forEach((l) => closingByProduct.set(l.productId, l));

    const productIds = new Set<number>([
      ...openingByProduct.keys(),
      ...closingByProduct.keys(),
    ]);

    const rows: TruckInventoryDiffRow[] = [];
    let totalDeltaUnits = 0;
    let totalDeltaKg = 0;
    productIds.forEach((pid) => {
      const o = openingByProduct.get(pid);
      const c = closingByProduct.get(pid);
      const openingQty = o?.qty ?? 0;
      const closingQty = c?.qty ?? 0;
      const delta = closingQty - openingQty;
      if (delta !== 0 || o || c) {
        rows.push({
          productId: pid,
          name: (c ?? o)!.name,
          openingQty,
          closingQty,
          delta,
        });
      }
      totalDeltaUnits += delta;
      totalDeltaKg += delta * ((c ?? o)?.weight ?? 1);
    });

    // Stable sort: largest absolute movement first — most informative for UI.
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
      openingId: opening.id,
      closingId: closing.id,
      rows,
      totalDeltaUnits,
      totalDeltaKg: Math.round(totalDeltaKg),
      generatedAt: Date.now(),
    };
  },

  clearAll: async () => {
    set({ snapshots: [] });
    await storeSave(STORAGE_KEYS.TRUCK_INVENTORY_SNAPSHOTS, []);
  },

  rehydrate: async () => {
    const saved = await storeLoad<TruckInventorySnapshot[]>(
      STORAGE_KEYS.TRUCK_INVENTORY_SNAPSHOTS,
    );
    if (saved && Array.isArray(saved)) {
      set({ snapshots: saved });
      if (__DEV__) {
        console.log(`[truck-inventory] rehydrated ${saved.length} snapshots`);
      }
    }
  },
}));
