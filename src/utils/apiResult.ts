export function unwrapRestResult(parsed: unknown, status: number): unknown {
  const envelope = parsed as Record<string, unknown> | null;
  const payload = envelope && typeof envelope === 'object' && 'result' in envelope
    ? envelope.result
    : parsed;

  const result = payload as Record<string, unknown> | null;
  if (result && typeof result === 'object' && result.ok === false) {
    const message = typeof result.message === 'string' && result.message.trim().length > 0
      ? result.message
      : `HTTP ${status}`;
    throw new Error(message);
  }

  return payload;
}
