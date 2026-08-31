import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const { buildExpoConfig } = await import('../app.config.ts');

test('production keeps the official Grupo Frio icon assets', () => {
  const config = buildExpoConfig({
    EXPO_PUBLIC_APP_ENV: 'production',
  });

  assert.equal(config.icon, './assets/grupofrio-icon.png');
  assert.equal(config.splash?.image, './assets/grupofrio-splash.png');
  assert.equal(
    config.android?.adaptiveIcon?.foregroundImage,
    './assets/grupofrio-adaptive-foreground.png',
  );
  assert.equal(
    config.android?.adaptiveIcon?.monochromeImage,
    './assets/grupofrio-adaptive-monochrome.png',
  );
  assert.equal(config.web?.favicon, './assets/grupofrio-favicon.png');
});

test('staging uses impossible-to-confuse icon assets', () => {
  const config = buildExpoConfig({
    EXPO_PUBLIC_APP_ENV: 'staging',
    EXPO_PUBLIC_KF_DEFAULT_BASE_URL:
      'https://grupofrio-gf-staging280826-37235488.dev.odoo.com',
    EXPO_PUBLIC_KF_ODOO_DB: 'grupofrio-gf-staging280826-37235488',
  });

  assert.equal(config.icon, './assets/grupofrio-staging-icon.png');
  assert.equal(
    config.android?.adaptiveIcon?.foregroundImage,
    './assets/grupofrio-staging-adaptive-foreground.png',
  );
  assert.equal(config.web?.favicon, './assets/grupofrio-staging-favicon.png');
});

test('icon assets required by both variants exist on disk', () => {
  for (const asset of [
    'assets/grupofrio-icon.png',
    'assets/grupofrio-splash.png',
    'assets/grupofrio-adaptive-foreground.png',
    'assets/grupofrio-adaptive-monochrome.png',
    'assets/grupofrio-favicon.png',
    'assets/grupofrio-staging-icon.png',
    'assets/grupofrio-staging-adaptive-foreground.png',
    'assets/grupofrio-staging-favicon.png',
  ]) {
    assert.equal(existsSync(resolve(REPO_ROOT, asset)), true, `${asset} debe existir`);
  }
});
