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
        // BLD-20260410-CRIT: Do NOT wipe stops when the backend replies "no plan".
        // Operators reported check-in "reverting after seconds" because a stale
        // my_plan call (or a second useEffect fire) was blanking the stops store.
        // Keep whatever we already had rehydrated so the UI does not lose state.
        set({
          plan: get().plan,
          isLoading: false,
          error: get().stops.length > 0 ? null : 'Sin plan para hoy',
        });
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
      const incoming = rawStops.map((s) => ({
        ...s,
        _koldScore: koldStore.getScore(s.customer_id) || undefined,
        _koldForecast: koldStore.getForecast(s.customer_id) || undefined,
      }));

      // BLD-20260410-CRIT: MERGE strategy instead of wholesale replace.
      //
      // Root cause of "check-in reverts after seconds": loadPlan() used to
      // replace the whole `stops` array with backend data. When the sync
      // queue had not yet flushed the checkin call, the next loadPlan
      // (home screen useEffect, network flip, focus) would overwrite the
      // local `in_progress` / `done` state and ALSO delete every virtual
      // stop (offroute / new customer / leads convertidos) because the
      // backend had no knowledge of them.
      //
      // Merge rules:
      //   1. Preserve every virtual stop (id < 0).
      //   2. For real stops, take the backend stop but keep local state
      //      that is MORE ADVANCED than the backend state (client wrote
      //      first, sync flushed later). State order: done > in_progress > pending.
      //   3. Preserve local partner promotion (is_lead flipped to false,
      //      customer_rank bumped) so a converted lead doesn't bounce back.
      const prev = get().stops;
      const prevById = new Map(prev.map((s) => [s.id, s]));

      const STATE_RANK: Record<string, number> = {
        pending: 0,
        in_progress: 1,
        no_stock: 2,
        rejected: 2,
        not_visited: 2,
        closed: 2,
        done: 3,
      };

      const merged: GFStop[] = incoming.map((srv) => {
        const local = prevById.get(srv.id);
        if (!local) return srv;
        const localRank = STATE_RANK[local.state] ?? 0;
        const serverRank = STATE_RANK[srv.state] ?? 0;

        // BLD-20260410-BACKEND: lead_id is server-authoritative unless the
        // local stop was promoted offline (shouldn't happen — /lead/convert
        // requires online). stop_kind follows the server but if the local
        // copy was already promoted to 'customer' via field conversion we
        // respect that.
        const localPromoted = local.is_lead === false || local.stop_kind === 'customer';

        // Customer_id: server is authoritative UNLESS the local copy has a
        // valid partner and the server lost it (rare, but protects against
        // partial sync windows right after a field conversion).
        const resolvedCustomerId =
          (srv.customer_id && srv.customer_id > 0)
            ? srv.customer_id
            : (local.customer_id && local.customer_id > 0 ? local.customer_id : srv.customer_id);

        return {
          ...srv,
          customer_id: resolvedCustomerId,
          // Keep the more advanced state. If equal, server wins.
          state: localRank > serverRank ? local.state : srv.state,
          // Preserve local lead promotion: once the vendor converted
          // a lead in the field, never downgrade it.
          is_lead: localPromoted ? false : srv.is_lead,
          stop_kind: localPromoted ? 'customer' : (srv.stop_kind ?? local.stop_kind),
          lead_id: srv.lead_id ?? local.lead_id,
          customer_rank:
            (local.customer_rank ?? 0) > (srv.customer_rank ?? 0)
              ? local.customer_rank
              : srv.customer_rank,
          origin_lead_id: local.origin_lead_id ?? srv.origin_lead_id,
          // Keep enriched intelligence already computed
          _koldScore: srv._koldScore ?? local._koldScore,
          _koldForecast: srv._koldForecast ?? local._koldForecast,
        };
      });

      // Preserve virtual stops (id < 0) — backend never returns them.
      const virtualStops = prev.filter((s) => s.id < 0);
      const stops: GFStop[] = [...merged, ...virtualStops];

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
    const isLead = meta?.is_lead ?? false;
    const virtualStop: GFStop = {
      id: virtualId,
      customer_id: customerId,
      customer_name: customerName,
      state: 'pending',
      source_model: 'gf.route.stop',
      route_sequence: 999,
      is_offroute: meta?.is_offroute ?? true,
      is_lead: isLead,
      // BLD-20260410-BACKEND: mirror stop_kind so the sale screen treats
      // virtual lead stops identically to backend lead stops.
      stop_kind: isLead ? 'lead' : 'customer',
      lead_id: isLead ? meta?.origin_lead_id : undefined,
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
            // BLD-20260410-BACKEND: flip stop_kind to 'customer' so the next
            // plan reload merge doesn't downgrade the stop back to lead.
            // lead_id stays populated — backend uses it to mark the crm.lead
            // as won at plan close.
            stop_kind: 'customer' as const,
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
