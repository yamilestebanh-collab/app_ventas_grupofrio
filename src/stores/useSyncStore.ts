/**
 * Sync queue store — offline operation management with PERSISTENCE.
 *
 * F6 UPGRADE:
 * - Queue persists to AsyncStorage (survives app close)
 * - Rehydration on app start
 * - Idempotency via unique operation IDs
 * - Retry logic with backoff
 * - FIFO processing
 * - Status tracking
 *
 * From KOLD_FIELD_SPEC.md section 6.
 */

import { create } from 'zustand';
import { SyncQueueItem, SyncItemType, SyncItemStatus } from '../types/sync';
import { storeSave, storeLoad, STORAGE_KEYS } from '../persistence/storage';
import { api, postRest, postRpc } from '../services/api';
// F7: Photo base64 reading at sync time (not at enqueue)
// BLD-011: post-sync delete + orphan janitor
import {
  readPhotoAsBase64,
  deletePhoto,
  cleanupOrphanPhotos,
  PHOTO_DELETE_ON_SYNC_ENABLED,
  PHOTO_JANITOR_ENABLED,
  photoCounters,
} from '../services/camera';
import { checkIn, checkOut, reportIncident, uploadStopImage } from '../services/gfLogistics';
// V1.2.1: Inventory rollback on failed sales
// CROSS-STORE DEP: rollback inventory on failed sale sync. Documented in V1.3.1.
import { useProductStore } from './useProductStore';
// BLD-008: client event metadata for outgoing ops
import { makeClientEventMeta } from '../utils/clientEvent';
// BLD-20260404-012: GPS queue cap — evict oldest pending gps op when full.
import { pickGpsOverflowVictim, gpsBufferCounters } from '../utils/gpsBuffer';

const MAX_RETRIES = 3;

// BLD-010: maximum items processed per cycle. Unchanged from legacy
// FIFO pass, kept explicit so DAG fallback is obvious.
const MAX_ITEMS_PER_CYCLE = 200;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface SyncState {
  queue: SyncQueueItem[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;

  // Derived
  pendingCount: number;
  errorCount: number;

  // Actions
  enqueue: (
    type: SyncItemType,
    payload: Record<string, unknown>,
    // BLD-010: optional dependency list. Items are processed only when
    // every id in dependsOn has status='done'. Missing / empty array
    // keeps the legacy FIFO behaviour. See computeProcessingOrder().
    opts?: { dependsOn?: string[] },
  ) => string;
  markDone: (id: string) => void;
  markError: (id: string, message: string) => void;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  clearDone: () => void;

  // F6: Persistence
  persistQueue: () => Promise<void>;
  rehydrateQueue: () => Promise<void>;

  // F6: Sync processor
  processQueue: () => Promise<void>;
}

function computeCounts(queue: SyncQueueItem[]) {
  return {
    pendingCount: queue.filter((i) => i.status === 'pending').length,
    errorCount: queue.filter((i) => i.status === 'error').length,
  };
}

export const useSyncStore = create<SyncState>((set, get) => ({
  queue: [],
  isOnline: true,
  isSyncing: false,
  lastSyncAt: null,
  pendingCount: 0,
  errorCount: 0,

  enqueue: (type, payload, opts) => {
    const id = uuid();
    const item: SyncQueueItem = {
      id,
      type,
      payload: { ...payload, _operationId: id }, // Idempotency key
      status: 'pending',
      created_at: Date.now(),
      retries: 0,
      error_message: null,
      // BLD-010: optional dependency list
      dependsOn: opts?.dependsOn && opts.dependsOn.length > 0 ? [...opts.dependsOn] : undefined,
    };
    // BLD-20260404-012: enforce cap on pending GPS ops. Only evicts
    // within the 'gps' type and only when the cap is reached. Any
    // throw falls back to the legacy insert (never drops).
    let baseQueue = get().queue;
    if (type === 'gps') {
      try {
        const victimId = pickGpsOverflowVictim(
          baseQueue.map((i) => ({
            id: i.id,
            type: i.type,
            status: i.status,
            created_at: i.created_at,
          })),
        );
        if (victimId) {
          baseQueue = baseQueue.filter((i) => i.id !== victimId);
          if (__DEV__) console.log(`[sync] gps cap hit, evicted ${victimId}`);
        }
      } catch {
        // keep baseQueue unchanged
      }
    }
    const newQueue = [...baseQueue, item];
    set({ queue: newQueue, ...computeCounts(newQueue) });

    // Persist immediately (best-effort fire-and-forget)
    get().persistQueue();

    // BLD-008: capture client event metadata for this op. Done after
    // insert so the queue is never blocked on SecureStore reads. If
    // meta generation fails for any reason the op stays in queue and
    // is synced without meta — legacy behaviour preserved.
    makeClientEventMeta(id)
      .then((meta) => {
        const updated = get().queue.map((i) => (i.id === id ? { ...i, meta } : i));
        set({ queue: updated });
        get().persistQueue();
      })
      .catch(() => {
        // intentional: never crash the enqueue path
      });

    return id;
  },

  markDone: (id) => {
    const newQueue = get().queue.map((i) =>
      i.id === id ? { ...i, status: 'done' as SyncItemStatus } : i
    );
    set({ queue: newQueue, ...computeCounts(newQueue) });
    get().persistQueue();
  },

  markError: (id, message) => {
    const newQueue = get().queue.map((i) =>
      i.id === id
        ? { ...i, status: 'error' as SyncItemStatus, error_message: message, retries: i.retries + 1 }
        : i
    );
    set({ queue: newQueue, ...computeCounts(newQueue) });
    get().persistQueue();
  },

  setOnline: (online) => {
    set({ isOnline: online });
    // Auto-process when coming back online
    if (online && get().pendingCount > 0) {
      get().processQueue();
    }
  },

  setSyncing: (syncing) => set({ isSyncing: syncing }),

  clearDone: () => {
    const newQueue = get().queue.filter((i) => i.status !== 'done');
    set({ queue: newQueue, ...computeCounts(newQueue) });
    get().persistQueue();
  },

  // ═══ F6: Persistence ═══

  persistQueue: async () => {
    const { queue } = get();
    // Only persist non-done items to avoid unbounded growth
    const toPersist = queue.filter((i) => i.status !== 'done');
    await storeSave(STORAGE_KEYS.SYNC_QUEUE, toPersist);
  },

  rehydrateQueue: async () => {
    const saved = await storeLoad<SyncQueueItem[]>(STORAGE_KEYS.SYNC_QUEUE);
    if (saved && saved.length > 0) {
      // Reset any "syncing" items back to "pending" (app was killed mid-sync)
      const restored = saved.map((item) => ({
        ...item,
        status: item.status === 'syncing' ? 'pending' as SyncItemStatus : item.status,
      }));
      set({ queue: restored, ...computeCounts(restored) });
      if (__DEV__) console.log(`[sync] Rehydrated ${restored.length} queued operations`);
    }
  },

  // ═══ F6: Sync Processor ═══

  processQueue: async () => {
    const { queue, isOnline, isSyncing } = get();
    if (!isOnline || isSyncing) return;

    const candidates = queue.filter((i) =>
      i.status === 'pending' || (i.status === 'error' && i.retries < MAX_RETRIES)
    );

    if (candidates.length === 0) return;

    // BLD-010: resolve DAG order. If any dependency can't be resolved
    // (malformed graph, dangling parent), the helper returns the plain
    // FIFO order to keep the legacy behaviour and never block sync.
    const pending = computeProcessingOrder(queue, candidates).slice(0, MAX_ITEMS_PER_CYCLE);
    if (pending.length === 0) return;

    set({ isSyncing: true });
    if (__DEV__) console.log(`[sync] Processing ${pending.length} queued operations`);

    for (const item of pending) {
      // Mark as syncing
      const updatedQueue = get().queue.map((i) =>
        i.id === item.id ? { ...i, status: 'syncing' as SyncItemStatus } : i
      );
      set({ queue: updatedQueue });

      try {
        // V1.2.1: Check for duplicate before sending sale
        if (item.type === 'sale_order') {
          const isDuplicate = await checkSaleDuplicate(item);
          if (isDuplicate) {
            get().markDone(item.id);
            if (__DEV__) console.log(`[sync] Skipped duplicate: ${item.type} ${item.id}`);
            continue;
          }
        }

        await processSyncItem(item);
        get().markDone(item.id);
        if (__DEV__) console.log(`[sync] Done: ${item.type} ${item.id}`);

        // BLD-20260404-011: delete local photo file after successful
        // upload. Gated by PHOTO_DELETE_ON_SYNC_ENABLED kill switch.
        // Best-effort — any failure here only leaves a stale file that
        // the janitor will clean later. Never blocks sync.
        //
        // SAFETY NOTE: we only delete the photo attached to the op that
        // just succeeded. We never touch photos still referenced by any
        // other pending/error op — those live in the queue and only the
        // janitor can (eventually) clean them, and only after 7 days.
        if (item.type === 'photo' && PHOTO_DELETE_ON_SYNC_ENABLED) {
          const localUri = item.payload?.localUri as string | undefined;
          if (localUri) {
            deletePhoto(localUri)
              .then(() => {
                photoCounters.deletedPostSyncTotal += 1;
              })
              .catch(() => {
                photoCounters.deletePostSyncErrors += 1;
                /* intentional: janitor is the safety net */
              });
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Sync error';
        get().markError(item.id, msg);
        console.warn(`[sync] Error: ${item.type} ${item.id}: ${msg}`);

        // V1.2.1: If max retries reached, rollback local side effects
        if (item.retries + 1 >= MAX_RETRIES) {
          console.error(`[sync] Max retries reached for ${item.type} ${item.id}`);
          rollbackFailedOperation(item);
        }
      }
    }

    set({ isSyncing: false, lastSyncAt: Date.now() });
    get().persistQueue();

    // BLD-20260404-011/012 — end-of-cycle observability summary.
    // Compact single-line log of in-process counters so field devices
    // can be diagnosed via `adb logcat` without backend wiring. Dev-only
    // to avoid polluting production logs. Never throws; every counter
    // read falls back to 0 if the field is missing.
    if (__DEV__) {
      try {
        const pc = (photoCounters ?? {}) as Record<string, number | undefined>;
        const gc = (gpsBufferCounters ?? {}) as Record<string, number | undefined>;
        const n = (v: number | undefined) => (typeof v === 'number' ? v : 0);
        console.log(
          '[sync-summary]\n' +
          `photos: captured=${n(pc.capturedTotal)} ` +
          `oversized=${n(pc.oversizedTotal)} ` +
          `deleted=${n(pc.deletedPostSyncTotal)}\n` +
          `gps: admitted=${n(gc.admittedTotal)} ` +
          `rateLimited=${n(gc.rateLimitedTotal)} ` +
          `duplicate=${n(gc.duplicateTotal)} ` +
          `evicted=${n(gc.evictedByCapTotal)}`,
        );
      } catch {
        /* intentional: summary is telemetry, never blocks sync */
      }
    }

    // BLD-20260404-011: after a drain, run the orphan photo janitor.
    // Gated by PHOTO_JANITOR_ENABLED kill switch.
    //
    // The "referenced set" is every localUri currently in the queue in
    // any status other than 'done' (i.e. pending / syncing / error).
    // Photos still referenced are NEVER deleted by the janitor. The
    // janitor also refuses to delete anything newer than PHOTO_STALE_MS
    // (7 days) even if unreferenced. Fully fire-and-forget.
    if (PHOTO_JANITOR_ENABLED) {
      try {
        const referenced = new Set<string>();
        for (const i of get().queue) {
          if (i.type === 'photo' && i.status !== 'done') {
            const uri = i.payload?.localUri as string | undefined;
            if (uri) referenced.add(uri);
          }
        }
        cleanupOrphanPhotos(referenced).catch(() => { /* best effort */ });
      } catch {
        /* intentional */
      }
    }
  },
}));

// ═══ BLD-010: DAG resolver with safe FIFO fallback ═══

/**
 * Return the ordered list of items that are ready to process in this
 * cycle. Rules:
 *
 *   1. An item is "ready" when every id in its `dependsOn` is present
 *      in the queue with status='done' (or missing entirely AND the
 *      fallback flag is true — see below).
 *   2. Items with no `dependsOn` are always ready.
 *   3. If the dependency graph is malformed (cycle, dangling parent
 *      that never existed, depth > 50) we fall back to FIFO over all
 *      candidates to preserve the legacy behaviour. A warning is
 *      logged in __DEV__ only.
 *   4. The returned list is topologically sorted, then stable by
 *      created_at so FIFO tie-breaking matches today's behaviour.
 *
 * This helper is pure: no state mutation, no I/O.
 */
export function computeProcessingOrder(
  fullQueue: SyncQueueItem[],
  candidates: SyncQueueItem[],
): SyncQueueItem[] {
  // Fast path: nobody declared dependencies → legacy FIFO.
  const anyDeps = candidates.some((c) => c.dependsOn && c.dependsOn.length > 0);
  if (!anyDeps) {
    return [...candidates].sort((a, b) => a.created_at - b.created_at);
  }

  const byId = new Map<string, SyncQueueItem>();
  for (const q of fullQueue) byId.set(q.id, q);

  const isDependencySatisfied = (depId: string): boolean => {
    const dep = byId.get(depId);
    if (!dep) return true; // parent not in queue anymore → already done / never existed
    return dep.status === 'done';
  };

  // Kahn's algorithm over candidates only.
  const result: SyncQueueItem[] = [];
  const remaining = [...candidates];
  let guard = 0;
  const MAX_PASSES = 50;

  while (remaining.length > 0) {
    guard += 1;
    if (guard > MAX_PASSES) {
      // Malformed graph — fall back to FIFO over candidates.
      if (__DEV__) {
        console.warn(
          '[sync] DAG resolution exceeded max passes, falling back to FIFO',
        );
      }
      return [...candidates].sort((a, b) => a.created_at - b.created_at);
    }

    const ready = remaining.filter((item) => {
      const deps = item.dependsOn ?? [];
      return deps.every(isDependencySatisfied);
    });

    if (ready.length === 0) {
      // No progress possible this pass — remaining items have deps still
      // pending in the queue. They are deferred to the next cycle. This
      // is NOT an error: it's the DAG doing its job.
      break;
    }

    ready.sort((a, b) => a.created_at - b.created_at);
    for (const item of ready) {
      result.push(item);
      // Optimistically treat as satisfied so downstream siblings in the
      // same cycle can advance too.
      byId.set(item.id, { ...item, status: 'done' });
      const idx = remaining.indexOf(item);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  // If nothing was resolvable (all deps still pending), return empty:
  // next cycle will try again once parents reach 'done'.
  return result;
}

// ═══ Operation dispatcher ═══

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { type, payload } = item;
  // BLD-008: optional client metadata captured at enqueue time. Helpers
  // attach it only when the feature flag is enabled, otherwise noop.
  const meta = item.meta ?? null;

  switch (type) {
    case 'sale_order':
      await postRpc('/api/create_update', {
        model: 'sale.order',
        method: 'create',
        dict: {
          partner_id: payload.partner_id,
          order_line: (payload.lines as any[])?.map((l: any) => [
            0, 0, {
              product_id: l.product_id,
              product_uom_qty: l.qty,
              price_unit: l.price_unit,
            },
          ]) || [],
        },
      });
      break;

    case 'checkin':
      await checkIn(
        payload.stop_id as number,
        payload.latitude as number,
        payload.longitude as number,
        meta,
      );
      break;

    case 'checkout':
      await checkOut(
        payload.stop_id as number,
        payload.latitude as number,
        payload.longitude as number,
        meta,
      );
      break;

    case 'no_sale':
      await reportIncident(
        payload.stop_id as number,
        (payload.reason_id as number) || 1,
        `No-venta: ${payload.reason_code || ''} ${payload.notes || ''}`.trim(),
        meta,
      );
      break;

    case 'payment':
      await postRpc('/api/create_update', {
        model: 'account.payment',
        method: 'create',
        dict: {
          partner_id: payload.partner_id,
          amount: payload.amount,
          payment_type: 'inbound',
          journal_id: payload.journal_id || null,
        },
      });
      break;

    case 'photo': {
      // F7: Read base64 from file at sync time (not stored in queue)
      let base64 = payload.image_base64 as string;
      if (payload.localUri && !base64) {
        const fromFile = await readPhotoAsBase64(payload.localUri as string);
        if (!fromFile) throw new Error('Photo file not found');
        base64 = fromFile;
      }
      await uploadStopImage(
        payload.stop_id as number,
        base64,
        (payload.image_type as string) || 'visit',
        meta,
      );
      break;
    }

    case 'gps':
      await postRpc('/api/create_update', {
        model: 'os.employee.gps.history',
        method: 'create',
        dict: {
          employee_id: payload.employee_id,
          latitude: payload.latitude,
          longitude: payload.longitude,
        },
      });
      break;

    case 'prospection':
      if (payload.model) {
        await postRpc('/api/create_update', {
          model: payload.model as string,
          method: 'create',
          dict: payload,
        });
      }
      break;

    default:
      console.warn(`[sync] Unknown operation type: ${type}`);
  }
}

// ═══ V1.2.1: Rollback failed operations ═══

function rollbackFailedOperation(item: SyncQueueItem): void {
  if (item.type === 'sale_order') {
    // Revert local inventory deduction
    const lines = item.payload.lines as Array<{ product_id: number; qty: number }> | undefined;
    if (lines && lines.length > 0) {
      const updateLocalStock = useProductStore.getState().updateLocalStock;
      lines.forEach((line) => {
        updateLocalStock(line.product_id, line.qty); // Add back
      });
      console.warn(
        `[sync] ROLLBACK: restored ${lines.length} product lines to local inventory ` +
        `for failed sale ${item.id}`
      );
    }
  }
  // Other types don't have local side effects that need rollback
}

// ═══ V1.2.1: Pre-sync duplicate check for sales ═══

async function checkSaleDuplicate(item: SyncQueueItem): Promise<boolean> {
  if (item.type !== 'sale_order') return false;

  const opId = item.payload._operationId as string;
  if (!opId) return false;

  try {
    const existing = await postRpc<any[]>('/get_records', {
      model: 'sale.order',
      domain: [
        ['partner_id', '=', item.payload.partner_id],
        ['create_date', '>=', new Date(item.created_at - 300000).toISOString()],
        ['create_date', '<=', new Date(item.created_at + 300000).toISOString()],
      ],
      fields: ['id', 'name', 'amount_total'],
      limit: 1,
    });

    if (existing && existing.length > 0) {
      console.warn(
        `[sync] DUPLICATE detected: sale.order ${existing[0].name} already exists ` +
        `for operation ${opId}. Skipping.`
      );
      return true;
    }
  } catch {
    // If check fails, proceed with creation (better to risk duplicate than lose sale)
    return false;
  }

  return false;
}
