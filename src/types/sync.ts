/**
 * Sync queue types for offline operations.
 * From KOLD_FIELD_SPEC.md section 6.
 *
 * BLD-008 — `meta` holds client-side event timing (optional).
 * BLD-010 — `dependsOn` holds ids of queue items that must reach `done`
 *           before this item is processed. Optional; empty/missing keeps
 *           current FIFO behaviour.
 */

import { ClientEventMeta } from '../utils/clientEvent';

export type SyncItemType =
  | 'sale_order'
  | 'checkin'
  | 'checkout'
  | 'photo'
  | 'no_sale'
  | 'payment'
  | 'prospection'
  | 'gps';

export type SyncItemStatus = 'pending' | 'syncing' | 'done' | 'error';

export interface SyncQueueItem {
  id: string; // uuid — also used as x_client_op_uuid
  type: SyncItemType;
  payload: Record<string, unknown>;
  status: SyncItemStatus;
  created_at: number; // timestamp ms
  retries: number;
  error_message: string | null;

  // BLD-008: captured at enqueue time, survives offline, sent on sync
  // only if the client-meta feature flag is enabled.
  meta?: ClientEventMeta;

  // BLD-010: ids of other queue items that must be `done` before this
  // item is processed. Missing / empty array = legacy FIFO behaviour.
  dependsOn?: string[];
}
