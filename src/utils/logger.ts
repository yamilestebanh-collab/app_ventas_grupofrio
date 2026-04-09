/**
 * Structured logger for KOLD Field V2.
 *
 * RULE: Logs are NEVER gated behind __DEV__. They always go to the
 * in-memory ring buffer so production devices can be diagnosed via
 * the diagnostics export. Console output IS __DEV__-only.
 *
 * Categories: sync, gps, auth, inventory, visit, nav, health
 */

import { storeSave, storeLoad } from '../persistence/storage';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'sync' | 'gps' | 'auth' | 'inventory' | 'visit' | 'nav' | 'health' | 'general';

export interface LogEntry {
  ts: string;         // ISO 8601
  level: LogLevel;
  category: LogCategory;
  event: string;
  data?: Record<string, unknown>;
}

const RING_BUFFER_SIZE = 500;
const ERROR_PERSIST_SIZE = 100;
const PERSISTED_ERROR_CAP = 50;
const PERSIST_KEY = 'logs:errors';
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const FLUSH_THRESHOLD = 5; // Flush after 5 new errors

/** In-memory ring buffer -- last N entries, newest at end. */
const _buffer: LogEntry[] = [];

/** Persisted errors -- last N error/warn entries. */
const _errors: LogEntry[] = [];

function pushToBuffer(entry: LogEntry): void {
  _buffer.push(entry);
  if (_buffer.length > RING_BUFFER_SIZE) {
    _buffer.shift();
  }
}

function pushToErrors(entry: LogEntry): void {
  _errors.push(entry);
  if (_errors.length > ERROR_PERSIST_SIZE) {
    _errors.shift();
  }
  // Flush to disk when threshold reached (non-blocking)
  _unflushedErrorCount++;
  if (_unflushedErrorCount >= FLUSH_THRESHOLD) {
    flushErrorsToDisk();
  }
}

/**
 * Main log function. Always captures to ring buffer.
 * Console output only in __DEV__.
 */
export function log(
  level: LogLevel,
  category: LogCategory,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    category,
    event,
    data,
  };

  // Always write to ring buffer (production + dev)
  pushToBuffer(entry);

  // Persist errors/warnings
  if (level === 'error' || level === 'warn') {
    pushToErrors(entry);
  }

  // Console output only in dev
  if (__DEV__) {
    const prefix = `[${category}:${event}]`;
    switch (level) {
      case 'error':
        console.error(prefix, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, data ?? '');
        break;
      default:
        console.log(prefix, data ?? '');
    }
  }
}

// ---- Convenience helpers ----

export const logInfo = (category: LogCategory, event: string, data?: Record<string, unknown>) =>
  log('info', category, event, data);

export const logWarn = (category: LogCategory, event: string, data?: Record<string, unknown>) =>
  log('warn', category, event, data);

export const logError = (category: LogCategory, event: string, data?: Record<string, unknown>) =>
  log('error', category, event, data);

export const logDebug = (category: LogCategory, event: string, data?: Record<string, unknown>) =>
  log('debug', category, event, data);

// ---- Access for diagnostics export ----

/** Returns a shallow copy of the ring buffer (last 500 entries). */
export function getLogBuffer(): LogEntry[] {
  return [..._buffer];
}

/** Returns a shallow copy of persisted errors (last 100). */
export function getErrorLog(): LogEntry[] {
  return [..._errors];
}

/** Returns last N entries from the buffer. */
export function getRecentLogs(n: number): LogEntry[] {
  return _buffer.slice(-n);
}

// ---- Persistence to AsyncStorage ----

/** Errors accumulated since last flush. */
let _unflushedErrorCount = 0;
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _isFlushing = false;

/**
 * Flush error log to AsyncStorage. Non-blocking, fire-and-forget.
 * Keeps last PERSISTED_ERROR_CAP entries on disk.
 */
export async function flushErrorsToDisk(): Promise<void> {
  if (_isFlushing) return;
  if (_errors.length === 0) return;

  _isFlushing = true;
  try {
    const toSave = _errors.slice(-PERSISTED_ERROR_CAP);
    await storeSave(PERSIST_KEY, toSave);
    _unflushedErrorCount = 0;
  } catch {
    // Silent — persistence is best-effort
  } finally {
    _isFlushing = false;
  }
}

/**
 * Load persisted errors from AsyncStorage into memory.
 * Called once at app startup (rehydrate).
 */
export async function loadPersistedErrors(): Promise<void> {
  try {
    const persisted = await storeLoad<LogEntry[]>(PERSIST_KEY);
    if (persisted && Array.isArray(persisted) && persisted.length > 0) {
      // Prepend persisted errors (older) before in-memory (newer)
      const merged = [...persisted, ..._errors];
      _errors.length = 0;
      const capped = merged.slice(-ERROR_PERSIST_SIZE);
      capped.forEach((e) => _errors.push(e));
    }
  } catch {
    // Silent
  }
}

/**
 * Start periodic flush timer. Idempotent.
 */
export function startErrorPersistence(): void {
  if (_flushTimer) return;
  _flushTimer = setInterval(() => {
    if (_unflushedErrorCount > 0) {
      flushErrorsToDisk();
    }
  }, FLUSH_INTERVAL_MS);
}

/**
 * Stop periodic flush and do a final sync.
 */
export function stopErrorPersistence(): void {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_unflushedErrorCount > 0) {
    flushErrorsToDisk();
  }
}

/** Get persisted error count for diagnostics. */
export function getPersistedErrorCount(): number {
  return _errors.length;
}

/** Reset all in-memory state (for logout / tests). */
export function resetLogger(): void {
  _buffer.length = 0;
  _errors.length = 0;
  _unflushedErrorCount = 0;
  stopErrorPersistence();
}
