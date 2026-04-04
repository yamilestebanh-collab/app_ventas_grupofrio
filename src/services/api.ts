/**
 * HTTP helpers for KOLD Field.
 * Login still uses Axios, but postRest/postRpc use fetch on Android
 * to avoid native XHR failures that surfaced as generic "Network Error".
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const STORE_KEYS = {
  BASE_URL: 'kf_base_url',
  API_KEY: 'kf_api_key',
  GF_TOKEN: 'kf_gf_token',
} as const;

export const DEFAULT_BASE_URL = 'https://grupofrio.odoo.com';

let _baseUrl = DEFAULT_BASE_URL;

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

function safeParseJson(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function buildAbsoluteUrl(url: string): Promise<string> {
  if (url.startsWith('http')) return url;
  const baseUrl = await getBaseUrl();
  return `${baseUrl}/${url.replace(/^\//, '')}`;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = await SecureStore.getItemAsync(STORE_KEYS.API_KEY);
  const gfToken = await SecureStore.getItemAsync(STORE_KEYS.GF_TOKEN);

  if (apiKey) {
    headers['Api-Key'] = sanitizeHeaderValue(apiKey);
  }
  if (gfToken) {
    headers['X-GF-Employee-Token'] = sanitizeHeaderValue(gfToken);
  }

  return headers;
}

export async function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/+$/, '') || DEFAULT_BASE_URL;
  await SecureStore.setItemAsync(STORE_KEYS.BASE_URL, _baseUrl);
}

export async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;
  _baseUrl = (await SecureStore.getItemAsync(STORE_KEYS.BASE_URL)) || DEFAULT_BASE_URL;
  return _baseUrl;
}

export async function setAuthTokens(apiKey: string, gfToken: string) {
  await SecureStore.setItemAsync(STORE_KEYS.API_KEY, apiKey);
  await SecureStore.setItemAsync(STORE_KEYS.GF_TOKEN, gfToken);
}

export async function clearAuthTokens() {
  _baseUrl = DEFAULT_BASE_URL;
  await SecureStore.deleteItemAsync(STORE_KEYS.API_KEY);
  await SecureStore.deleteItemAsync(STORE_KEYS.GF_TOKEN);
  await SecureStore.deleteItemAsync(STORE_KEYS.BASE_URL);
}

export async function hasAuthTokens(): Promise<boolean> {
  const [apiKey, gfToken] = await Promise.all([
    SecureStore.getItemAsync(STORE_KEYS.API_KEY),
    SecureStore.getItemAsync(STORE_KEYS.GF_TOKEN),
  ]);

  return !!apiKey && !!gfToken;
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
      config.headers.set('Api-Key', sanitizeHeaderValue(apiKey));
    }
    if (gfToken) {
      config.headers.set('X-GF-Employee-Token', sanitizeHeaderValue(gfToken));
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
  const response = await fetch(await buildAbsoluteUrl(url), {
    method: 'POST',
    headers: await buildHeaders(),
    body: JSON.stringify(data),
  });

  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok) {
    const msg = parsed?.error?.data?.message || parsed?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  // gf_logistics_ops REST endpoints may return data directly or in .result
  return (parsed?.result ?? parsed) as T;
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
  const response = await fetch(await buildAbsoluteUrl(url), {
    method: 'POST',
    headers: await buildHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      params,
    }),
  });

  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok) {
    const errMsg = parsed?.error?.data?.message || parsed?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }
  if (parsed?.error) {
    const errMsg = parsed.error?.data?.message || parsed.error?.message || 'Odoo RPC error';
    throw new Error(errMsg);
  }
  return parsed?.result as T;
}

/**
 * POST to the legacy /jsonrpc endpoint using method: "call".
 */
export async function postJsonRpc<T = any>(
  url: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(await buildAbsoluteUrl(url), {
    method: 'POST',
    headers: await buildHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params,
    }),
  });

  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok) {
    const errMsg = parsed?.error?.data?.message || parsed?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }
  if (parsed?.error) {
    const errMsg = parsed.error?.data?.message || parsed.error?.message || 'Odoo RPC error';
    throw new Error(errMsg);
  }
  return parsed?.result as T;
}
