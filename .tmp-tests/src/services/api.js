"use strict";
/**
 * HTTP helpers for KOLD Field.
 * Login still uses Axios, but postRest/postRpc use fetch on Android
 * to avoid native XHR failures that surfaced as generic "Network Error".
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.DEFAULT_BASE_URL = void 0;
exports.setBaseUrl = setBaseUrl;
exports.getBaseUrl = getBaseUrl;
exports.setAuthTokens = setAuthTokens;
exports.clearAuthTokens = clearAuthTokens;
exports.hasAuthTokens = hasAuthTokens;
exports.createApiClient = createApiClient;
exports.postRest = postRest;
exports.postRpc = postRpc;
exports.postJsonRpc = postJsonRpc;
const axios_1 = __importDefault(require("axios"));
const SecureStore = __importStar(require("expo-secure-store"));
const STORE_KEYS = {
    BASE_URL: 'kf_base_url',
    API_KEY: 'kf_api_key',
    GF_TOKEN: 'kf_gf_token',
};
exports.DEFAULT_BASE_URL = 'https://grupofrio.odoo.com';
let _baseUrl = exports.DEFAULT_BASE_URL;
function sanitizeHeaderValue(value) {
    return value.replace(/[\r\n]+/g, '').trim();
}
function safeParseJson(text) {
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text.slice(0, 200) };
    }
}
async function buildAbsoluteUrl(url) {
    if (url.startsWith('http'))
        return url;
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/${url.replace(/^\//, '')}`;
}
async function buildHeaders() {
    const headers = {
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
async function setBaseUrl(url) {
    _baseUrl = url.replace(/\/+$/, '') || exports.DEFAULT_BASE_URL;
    await SecureStore.setItemAsync(STORE_KEYS.BASE_URL, _baseUrl);
}
async function getBaseUrl() {
    if (_baseUrl)
        return _baseUrl;
    _baseUrl = (await SecureStore.getItemAsync(STORE_KEYS.BASE_URL)) || exports.DEFAULT_BASE_URL;
    return _baseUrl;
}
async function setAuthTokens(apiKey, gfToken) {
    await SecureStore.setItemAsync(STORE_KEYS.API_KEY, apiKey);
    await SecureStore.setItemAsync(STORE_KEYS.GF_TOKEN, gfToken);
}
async function clearAuthTokens() {
    _baseUrl = exports.DEFAULT_BASE_URL;
    await SecureStore.deleteItemAsync(STORE_KEYS.API_KEY);
    await SecureStore.deleteItemAsync(STORE_KEYS.GF_TOKEN);
    await SecureStore.deleteItemAsync(STORE_KEYS.BASE_URL);
}
async function hasAuthTokens() {
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
function createApiClient() {
    const client = axios_1.default.create({
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
    });
    // Request interceptor: add auth headers + base URL
    client.interceptors.request.use(async (config) => {
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
    client.interceptors.response.use((response) => response, (error) => {
        // Log for debugging but don't crash
        console.warn('[API Error]', error?.response?.status, error?.message);
        return Promise.reject(error);
    });
    return client;
}
// Singleton instance
exports.api = createApiClient();
// ═══════════════════════════════════════════════════════════════
// PROTOCOL HELPERS — Use these instead of raw api.post()
// ═══════════════════════════════════════════════════════════════
/**
 * POST to a REST endpoint (e.g. gf/logistics/api/employee/*).
 * Sends payload as-is, no JSON-RPC wrapping.
 * Response data is returned directly — caller decides how to parse.
 */
async function postRest(url, data = {}) {
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
    return (parsed?.result ?? parsed);
}
/**
 * POST to an Odoo JSON-RPC endpoint (e.g. /jsonrpc, /get_records, /api/create_update).
 * Wraps params in { jsonrpc: '2.0', params: {...} }.
 * Returns the .result from the JSON-RPC response.
 */
async function postRpc(url, params = {}) {
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
    return parsed?.result;
}
/**
 * POST to the legacy /jsonrpc endpoint using method: "call".
 */
async function postJsonRpc(url, params = {}) {
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
    return parsed?.result;
}
