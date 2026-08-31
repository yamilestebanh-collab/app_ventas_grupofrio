import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('app config avoids explicit TypeScript extension imports for Expo remote parsing', () => {
  const source = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /from\s+['"][^'"]+\.ts['"]/,
    'app.config.ts should avoid explicit .ts import paths to stay compatible with Expo remote config parsing',
  );
});
