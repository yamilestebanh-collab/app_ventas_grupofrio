/**
 * HTTP helpers for KOLD Field.
 * Login still uses Axios, but postRest/postRpc use fetch on Android
 * to avoid native XHR failures that surfaced as generic "Network Error".
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const STORE_KEYS = {
  BASE_URL: 'kf_base_url',
  API_KEY: 'kf_api_key',
  GF_TOKEN: 'kf_gf_token',
} as const;

export const DEFAULT_BASE_URL = 'https://grupofrio.odoo.com';

let _baseUrl = DEFAULT_BASE_URL;

// BLD-20260405-022 (Fase 1): shared service-user api_key injected at build
// time via app.config.js → Constants.expoConfig.extra.gfSvcApiKey. When
// present, this value takes precedence over whatever /api/employee-sign-in
// returned per employee, so every vendor uses the SAME Odoo account
// (kold_field_svc, uid=21) and we consume exactly 1 internal license total
// instead of 1 per vendor. Falls back to SecureStore in dev/local flows
// where the env var is not set, preserving the legacy behaviour.
//
// Read once at module load; the value cannot change during an app session
// without a full reload (which matches how Expo constants work).
const _buildTimeSvcApiKey: string | null =
  ((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.gfSvcApiKey as
    | string
    | null
    | undefined) || null;

if (_buildTimeSvcApiKey && __DEV__) {
  // Never log the value itself; just confirm the source is populated.
  console.log(
    `[api] BLD-022 build-time GF_SVC_API_KEY active (len=${_buildTimeSvcApiKey.length}, ` +
    `head=${_buildTimeSvcApiKey.slice(0, 4)}***)`,
  );
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

/**
 * BLD-022 Fase 1 — resolve the Api-Key header for outgoing Odoo RPC calls.
 * Precedence:
 *   1. Build-time env (Constants.expoConfig.extra.gfSvcApiKey) — production.
 *   2. SecureStore (legacy per-employee api_key from /api/employee-sign-in)
 *      — dev / fallback while the fast-track APK is rolling out.
 * Returns `null` when neither source has a value.
 */
async function resolveApiKey(): Promise<string | null> {
  if (_buildTimeSvcApiKey) return _buildTimeSvcApiKey;
  const stored = await SecureStore.getItemAsync(STORE_KEYS.API_KEY);
  return stored || null;
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

  // BLD-022 Fase 1 — build-time service key wins over SecureStore.
  const apiKey = await resolveApiKey();
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

    // BLD-022 Fase 1 — same precedence as buildHeaders(): build-time
    // service key wins over SecureStore so axios-based calls (login,
    // legacy endpoints) also hit Odoo as kold_field_svc when the APK
    // was built with GF_SVC_API_KEY populated.
    const apiKey = await resolveApiKey();
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
