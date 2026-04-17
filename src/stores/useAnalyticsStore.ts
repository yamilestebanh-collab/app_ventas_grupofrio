import { create } from 'zustand';
import { fetchAnalyticsOptions } from '../services/gfLogistics';
import {
  AnalyticsDefaults,
  AnalyticOption,
  buildFallbackAnalyticsSnapshot,
  normalizeAnalyticsOptionsPayload,
} from '../services/saleAnalytics';

interface AnalyticsState {
  plazaOptions: AnalyticOption[];
  unOptions: AnalyticOption[];
  globalDefaults: AnalyticsDefaults;
  defaultsByPartner: Record<string, AnalyticsDefaults>;
  isLoading: boolean;
  lastLoadedAt: number | null;
  source: 'fallback' | 'server';
  loadOptions: (partnerIds?: number[]) => Promise<void>;
  getDefaultsForPartner: (partnerId: number | null | undefined) => AnalyticsDefaults;
}

const fallback = buildFallbackAnalyticsSnapshot();

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  plazaOptions: fallback.plazaOptions,
  unOptions: fallback.unOptions,
  globalDefaults: fallback.globalDefaults,
  defaultsByPartner: fallback.defaultsByPartner,
  isLoading: false,
  lastLoadedAt: null,
  source: 'fallback',

  loadOptions: async (partnerIds = []) => {
    if (get().isLoading) return;
    set({ isLoading: true });

    const uniquePartnerIds = [...new Set(partnerIds.filter((id) => typeof id === 'number' && id > 0))];
    const response = await fetchAnalyticsOptions({ partner_ids: uniquePartnerIds });
    const normalized = normalizeAnalyticsOptionsPayload(response?.data ?? response ?? null);

    set({
      plazaOptions: normalized.plazaOptions,
      unOptions: normalized.unOptions,
      globalDefaults: normalized.globalDefaults,
      defaultsByPartner: normalized.defaultsByPartner,
      isLoading: false,
      lastLoadedAt: Date.now(),
      source: response ? 'server' : 'fallback',
    });
  },

  getDefaultsForPartner: (partnerId) => {
    if (typeof partnerId === 'number' && partnerId > 0) {
      return get().defaultsByPartner[String(partnerId)] ?? get().globalDefaults;
    }
    return get().globalDefaults;
  },
}));
