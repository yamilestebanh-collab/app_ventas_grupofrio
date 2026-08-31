import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ui/TopBar.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /buildEnvironmentLabel|getRuntimeAppEnvironment/,
  'TopBar must derive the active environment before rendering the title chrome',
);

assert.match(
  source,
  /STAGING|DEV|environmentBadge/,
  'TopBar must render a visible non-production environment badge',
);

console.log('app environment banner tests: ok');
