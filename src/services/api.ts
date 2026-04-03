/**
 * Axios instance with KOLD Field interceptors.
 * From KOLD_FIELD_SPEC.md section 4 + xvan_audit.md.
 *
 * Headers required by gf_logistics_ops:
 *   Api-Key, api_key, X-GF-Employee-Token, Content-Type
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const STORE_KEYS = {
  BASE_URL: 'kf_base_url',
  API_KEY: 'kf_api_key',
  GF_TOKEN: 'kf_gf_token',
} as const;

let _baseUrl = '';

export async function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/+$/, '');
  await SecureStore.setItemAsync(STORE_KEYS.BASE_URL, _baseUrl);
}

export async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;
  _baseUrl = (await SecureStore.getItemAsync(STORE_KEYS.BASE_URL)) || '';
  return _baseUrl;
}

export async function setAuthTokens(apiKey: string, gfToken: string) {
  await SecureStore.setItemAsync(STORE_KEYS.API_KEY, apiKey);
  await SecureStore.setItemAsync(STORE_KEYS.GF_TOKEN, gfToken);
}

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(STORE_KEYS.API_KEY);
  await SecureStore.deleteItemAsync(STORE_KEYS.GF_TOKEN);
  await SecureStore.deleteItemAsync(STORE_KEYS.BASE_URL);
}

export async function hasAuthTokens(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(STORE_KEYS.API_KEY);
  return !!key;
}

/**
 * Create configured Axios instance.
 * Interceptor auto-adds auth headers from SecureStore.
 */
export function createApiClient(): AxiosInstance {
  const client = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Request interceptor: add auth headers + base URL
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const baseUrl = await getBaseUrl();
    if (baseUrl && config.url && !config.url.startsWith('http')) {
      config.url = `${baseUrl}/${config.url.replace(/^\//, '')}`;
    }

    const apiKey = await SecureStore.getItemAsync(STORE_KEYS.API_KEY);
    const gfToken = await SecureStore.getItemAsync(STORE_KEYS.GF_TOKEN);

    if (apiKey) {
      config.headers.set('Api-Key', apiKey);
      config.headers.set('api_key', apiKey);
    }
    if (gfToken) {
      config.headers.set('X-GF-Employee-Token', gfToken);
    }

    return config;
  });

  // Response interceptor: extract Odoo result
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Log for debugging but don't crash
      console.warn('[API Error]', error?.response?.status, error?.message);
      return Promise.reject(error);
    }
  );

  return client;
}

// Singleton instance
export const api = createApiClient();

// ═══════════════════════════════════════════════════════════════
// PROTOCOL HELPERS — Use these instead of raw api.post()
// ═══════════════════════════════════════════════════════════════

/**
 * POST to a REST endpoint (e.g. gf/logistics/api/employee/*).
 * Sends payload as-is, no JSON-RPC wrapping.
 * Response data is returned directly — caller decides how to parse.
 */
export async function postRest<T = any>(
  url: string,
  data: Record<string, unknown> = {}
): Promise<T> {
  const response = await api.post(url, data);
  // gf_logistics_ops REST endpoints may return data directly or in .result
  return (response.data?.result ?? response.data) as T;
}

/**
 * POST to an Odoo JSON-RPC endpoint (e.g. /jsonrpc, /get_records, /api/create_update).
 * Wraps params in { jsonrpc: '2.0', params: {...} }.
 * Returns the .result from the JSON-RPC response.
 */
export async function postRpc<T = any>(
  url: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await api.post(url, {
    jsonrpc: '2.0',
    params,
  });
  if (response.data?.error) {
    const errMsg = response.data.error?.data?.message || response.data.error?.message || 'Odoo RPC error';
    throw new Error(errMsg);
  }
  return response.data?.result as T;
}
