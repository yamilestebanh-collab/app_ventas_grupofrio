import type { SyncQueueItem } from '../types/sync';

export type SaleSyncState = {
  status: 'none' | 'pending' | 'done' | 'failed';
  message: string | null;
};

export function getSaleSyncState(
  saleOperationId: string | null,
  queue: Array<Pick<SyncQueueItem, 'id' | 'type' | 'status' | 'error_message'>>,
): SaleSyncState {
  if (!saleOperationId) {
    return { status: 'none', message: null };
  }

  const saleItem = queue.find((item) => item.id === saleOperationId && item.type === 'sale_order');
  if (!saleItem) {
    return { status: 'none', message: null };
  }

  if (saleItem.status === 'done') {
    return { status: 'done', message: null };
  }

  if (saleItem.status === 'dead' || saleItem.status === 'error') {
    return {
      status: 'failed',
      message: saleItem.error_message || 'La venta no se pudo sincronizar.',
    };
  }

  return { status: 'pending', message: null };
}
