import { postRest } from './api';
import { normalizeGiftErrorMessage } from './giftPayload';

export interface GiftCreateResponseData {
  gift_id?: number;
  gift_name?: string;
  picking_id?: number;
  state?: string;
}

export interface GiftCreateResult {
  userMessage: string;
  data: GiftCreateResponseData | null;
  code: string | null;
}

export async function createGift(
  payload: Record<string, unknown>,
): Promise<GiftCreateResult> {
  try {
    const result = await postRest<any>('/gf/salesops/gift/create', payload);
    const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const data = record.data && typeof record.data === 'object'
      ? record.data as GiftCreateResponseData
      : null;
    const userMessage = typeof record.user_message === 'string' && record.user_message.trim().length > 0
      ? record.user_message.trim()
      : 'Regalo registrado';
    const code = typeof record.code === 'string' ? record.code : null;

    return { userMessage, data, code };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(normalizeGiftErrorMessage({ message }));
  }
}
