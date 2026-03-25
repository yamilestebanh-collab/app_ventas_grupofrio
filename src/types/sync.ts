/**
 * Sync queue types for offline operations.
 * From KOLD_FIELD_SPEC.md section 6.
 */

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
  id: string; // uuid
  type: SyncItemType;
  payload: Record<string, unknown>;
  status: SyncItemStatus;
  created_at: number; // timestamp ms
  retries: number;
  error_message: string | null;
}
