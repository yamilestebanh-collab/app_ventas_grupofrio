/**
 * Rehydration service — restores app state on startup.
 *
 * Called once from _layout.tsx after auth check.
 * Loads persisted data back into Zustand stores.
 *
 * Order matters:
 * 1. Sync queue (so pending ops aren't lost)
 * 2. Route plan + stops
 * 3. Products
 * 4. KOLD intelligence (if cached)
 */

import { storeLoad, storeRemove, STORAGE_KEYS } from '../persistence/storage';
import { useSyncStore } from '../stores/useSyncStore';
import { useRouteStore } from '../stores/useRouteStore';
import { useProductStore } from '../stores/useProductStore';
import { useAuthStore } from '../stores/useAuthStore';
import { GFPlan, GFStop } from '../types/plan';
import { TruckProduct } from '../stores/useProductStore';
// V2: Error persistence & periodic flush
import { loadPersistedErrors, startErrorPersistence } from '../utils/logger';

export async function rehydrateAppState(): Promise<{
  queueSize: number;
  hasPlan: boolean;
  productCount: number;
}> {
  let queueSize = 0;
  let hasPlan = false;
  let productCount = 0;

  try {
    // 0. V2: Restore persisted error logs + start periodic flush
    await loadPersistedErrors();
    startErrorPersistence();

    // 1. Sync queue — CRITICAL: don't lose pending operations
    await useSyncStore.getState().rehydrateQueue();
    queueSize = useSyncStore.getState().pendingCount;

    // 2. Route plan
    const plan = await storeLoad<GFPlan>(STORAGE_KEYS.PLAN);
    const stops = await storeLoad<GFStop[]>(STORAGE_KEYS.STOPS);

    if (plan && stops) {
      const today = new Date().toISOString().split('T')[0];
      const currentEmployeeId = useAuthStore.getState().employeeId;
      const isTodayPlan = plan.date === today;
      const isCurrentEmployeePlan = plan.driver_employee_id === currentEmployeeId;

      if (isTodayPlan && isCurrentEmployeePlan) {
        const completed = stops.filter((s) =>
          ['done', 'not_visited', 'no_stock', 'rejected', 'closed'].includes(s.state)
        ).length;
        const total = stops.length;

        useRouteStore.setState({
          plan,
          stops,
          stopsCompleted: completed,
          stopsTotal: total,
          progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
          lastSync: Date.now(),
        });
        hasPlan = true;
      } else {
        await Promise.all([
          storeRemove(STORAGE_KEYS.PLAN),
          storeRemove(STORAGE_KEYS.STOPS),
        ]);
      }
    }

    // 3. Products
    const products = await storeLoad<TruckProduct[]>(STORAGE_KEYS.PRODUCTS);
    if (products && products.length > 0) {
      const totalKg = products.reduce((sum, p) => sum + p._totalKg, 0);
      useProductStore.setState({
        products,
        totalStockKg: Math.round(totalKg),
        productCount: products.length,
        lastSync: Date.now(),
      });
      productCount = products.length;
    }

    console.log(
      `[rehydrate] Done: queue=${queueSize}, plan=${hasPlan}, products=${productCount}`
    );
  } catch (error) {
    console.error('[rehydrate] Error:', error);
  }

  return { queueSize, hasPlan, productCount };
}
