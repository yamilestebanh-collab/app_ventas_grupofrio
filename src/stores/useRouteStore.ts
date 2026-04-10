/**
 * Route store — plan and stops state.
 * Loaded on login/app open. Used by Home, Route, Stop screens.
 */

import { create } from 'zustand';
import { GFPlan, GFStop } from '../types/plan';
import { getMyPlan, getPlanStops } from '../services/gfLogistics';
// CROSS-STORE DEP: loads KOLD intelligence on route load. Documented in V1.3.1.
import { useKoldStore } from './useKoldStore';
import { useSyncStore } from './useSyncStore';
import { storeSave, STORAGE_KEYS } from '../persistence/storage';

interface RouteState {
  plan: GFPlan | null;
  stops: GFStop[];
  isLoading: boolean;
  error: string | null;
  lastSync: number | null; // timestamp

  // Derived
  stopsCompleted: number;
  stopsTotal: number;
  progressPct: number;

  // Actions
  loadPlan: () => Promise<void>;
  updateStopState: (stopId: number, state: GFStop['state']) => void;
  addVirtualStop: (
    customerId: number,
    customerName: string,
    meta?: { is_lead?: boolean; is_offroute?: boolean; origin_lead_id?: number },
  ) => number;
  /** BLD-20260410: Update the partner linked to a stop (used after lead→customer conversion). */
  updateStopPartner: (stopId: number, newPartnerId: number, newPartnerName?: string) => void;
  reset: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  plan: null,
  stops: [],
  isLoading: false,
  error: null,
  lastSync: null,
  stopsCompleted: 0,
  stopsTotal: 0,
  progressPct: 0,

  loadPlan: async () => {
    if (get().isLoading) return; // Prevent concurrent calls

    if (!useSyncStore.getState().isOnline) {
      // Keep any rehydrated cached plan visible when offline.
      set({ isLoading: false, error: get().plan ? null : 'Sin conexion' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const plan = await getMyPlan();
      if (!plan) {
        set({ plan: null, stops: [], isLoading: false, error: 'Sin plan para hoy' });
        return;
      }

      const rawStops = await getPlanStops(plan.plan_id);

      // F5: Load KOLD intelligence for all route partners
      const partnerIds = [...new Set(rawStops.map((s) => s.customer_id).filter(Boolean))];
      if (partnerIds.length > 0) {
        try {
          await useKoldStore.getState().loadForPartners(partnerIds);
        } catch {
          // KOLD modules may not exist — non-blocking
        }
      }

      // Enrich stops with score + forecast
      const koldStore = useKoldStore.getState();
      const stops = rawStops.map((s) => ({
        ...s,
        _koldScore: koldStore.getScore(s.customer_id) || undefined,
        _koldForecast: koldStore.getForecast(s.customer_id) || undefined,
      }));

      const completed = stops.filter((s) =>
        ['done', 'not_visited', 'no_stock', 'rejected', 'closed'].includes(s.state)
      ).length;
      const total = stops.length;

      set({
        plan,
        stops,
        isLoading: false,
        lastSync: Date.now(),
        stopsCompleted: completed,
        stopsTotal: total,
        progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      });

      // F6: Persist for offline rehydration
      storeSave(STORAGE_KEYS.PLAN, plan);
      storeSave(STORAGE_KEYS.STOPS, stops);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error cargando plan';
      set({ error: msg, isLoading: false });
    }
  },

  /**
   * BLD-20260408-P0 / BLD-20260410: Create a virtual stop for off-route sales.
   * Uses negative IDs to distinguish from real backend stops.
   * Metadata (is_lead, is_offroute, origin_lead_id) travels with the stop so
   * the sale flow can branch (e.g. force data completion for leads).
   */
  addVirtualStop: (customerId, customerName, meta) => {
    const virtualId = -(Date.now() % 1000000); // negative to avoid collision
    const virtualStop: GFStop = {
      id: virtualId,
      customer_id: customerId,
      customer_name: customerName,
      state: 'pending',
      source_model: 'gf.route.stop',
      route_sequence: 999,
      is_offroute: meta?.is_offroute ?? true,
      is_lead: meta?.is_lead ?? false,
      origin_lead_id: meta?.origin_lead_id,
    };
    const stops = [...get().stops, virtualStop];
    set({ stops, stopsTotal: stops.length });
    return virtualId;
  },

  /**
   * BLD-20260410: Update a stop's partner binding after a lead is converted
   * into a real customer, or after a freshly-created partner gets its
   * real Odoo ID. Persists the change so a reload keeps the new binding.
   */
  updateStopPartner: (stopId, newPartnerId, newPartnerName) => {
    const stops = get().stops.map((s) =>
      s.id === stopId
        ? {
            ...s,
            customer_id: newPartnerId,
            customer_name: newPartnerName ?? s.customer_name,
            is_lead: false, // promoted
            customer_rank: 1,
          }
        : s
    );
    set({ stops });
    storeSave(STORAGE_KEYS.STOPS, stops);
  },

  updateStopState: (stopId, state) => {
    const stops = get().stops.map((s) =>
      s.id === stopId ? { ...s, state } : s
    );
    const completed = stops.filter((s) =>
      ['done', 'not_visited', 'no_stock', 'rejected', 'closed'].includes(s.state)
    ).length;
    const total = stops.length;
    set({
      stops,
      stopsCompleted: completed,
      progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    });
    // F6: Persist updated stops
    storeSave(STORAGE_KEYS.STOPS, stops);
  },

  reset: () => set({
    plan: null, stops: [], isLoading: false, error: null,
    lastSync: null, stopsCompleted: 0, stopsTotal: 0, progressPct: 0,
  }),
}));
