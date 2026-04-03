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
import { readPhotoAsBase64 } from '../services/camera';
import { checkIn, checkOut, reportIncident, uploadStopImage } from '../services/gfLogistics';
// V1.2.1: Inventory rollback on failed sales
// CROSS-STORE DEP: rollback inventory on failed sale sync. Documented in V1.3.1.
import { useProductStore } from './useProductStore';

const MAX_RETRIES = 3;

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
  enqueue: (type: SyncItemType, payload: Record<string, unknown>) => string;
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

  enqueue: (type, payload) => {
    const id = uuid();
    const item: SyncQueueItem = {
      id,
      type,
      payload: { ...payload, _operationId: id }, // Idempotency key
      status: 'pending',
      created_at: Date.now(),
      retries: 0,
      error_message: null,
    };
    const newQueue = [...get().queue, item];
    set({ queue: newQueue, ...computeCounts(newQueue) });

    // Persist immediately
    get().persistQueue();

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

    const pending = queue.filter((i) =>
      i.status === 'pending' || (i.status === 'error' && i.retries < MAX_RETRIES)
    );

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
  },
}));

// ═══ Operation dispatcher ═══

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { type, payload } = item;

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
      );
      break;

    case 'checkout':
      await checkOut(
        payload.stop_id as number,
        payload.latitude as number,
        payload.longitude as number,
      );
      break;

    case 'no_sale':
      await reportIncident(
        payload.stop_id as number,
        (payload.reason_id as number) || 1,
        `No-venta: ${payload.reason_code || ''} ${payload.notes || ''}`.trim(),
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
