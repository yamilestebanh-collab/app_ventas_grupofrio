const RETRYABLE_PATTERNS = [
  /network request failed/i,
  /\bnetwork error\b/i,
  /the internet connection appears to be offline/i,
  /failed to fetch/i,
  /load failed/i,
  /\btimeout\b/i,
  /timed out/i,
  /connection (?:was )?(?:lost|reset|refused|closed)/i,
  /^http 5\d\d\b/i,
];

export function isRetryableSyncErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.trim();
  if (!normalized) return false;
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(normalized));
}
