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
    opts?: { entityType?: 'customer' | 'lead'; leadId?: number | null },
  ) => number;
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
   * BLD-20260408-P0: Create a virtual stop for off-route sales.
   * Uses negative IDs to distinguish from real backend stops.
   * Returns the virtual stop ID for navigation.
   */
  addVirtualStop: (customerId, customerName, opts) => {
    const virtualId = -(Date.now() % 1000000); // negative to avoid collision
    const virtualStop: GFStop = {
      id: virtualId,
      customer_id: customerId,
      customer_name: customerName,
      state: 'pending',
      source_model: 'gf.route.stop',
      route_sequence: 999,
      _entityType: opts?.entityType ?? 'customer',
      _isOffroute: true,
      _leadId: opts?.leadId ?? null,
    };
    const stops = [...get().stops, virtualStop];
    set({ stops, stopsTotal: stops.length });
    return virtualId;
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
