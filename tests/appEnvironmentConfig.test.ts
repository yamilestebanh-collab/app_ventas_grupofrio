import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAppEnvironment,
  buildEnvironmentLabel,
  createEnvironmentConfig,
} from '../src/config/appEnvironment.ts';

test('resolveAppEnvironment maps known values and falls back to production', () => {
  assert.equal(resolveAppEnvironment('development'), 'development');
  assert.equal(resolveAppEnvironment('staging'), 'staging');
  assert.equal(resolveAppEnvironment('production'), 'production');
  assert.equal(resolveAppEnvironment('preview'), 'staging');
  assert.equal(resolveAppEnvironment(undefined), 'production');
});

test('buildEnvironmentLabel hides production and marks non-production', () => {
  assert.equal(buildEnvironmentLabel('production'), null);
  assert.equal(buildEnvironmentLabel('staging'), 'STAGING');
  assert.equal(buildEnvironmentLabel('development'), 'DEV');
});

test('createEnvironmentConfig uses staging identity and backend for non-production builds', () => {
  const config = createEnvironmentConfig({
    EXPO_PUBLIC_APP_ENV: 'staging',
    EXPO_PUBLIC_KF_DEFAULT_BASE_URL: 'https://staging.example.com',
    EXPO_PUBLIC_KF_ODOO_DB: 'staging-db',
  });

  assert.deepEqual(config, {
    environment: 'staging',
    appName: 'KOLD Field Staging',
    appSlug: 'kold-field',
    appScheme: 'kold-field-staging',
    bundleSuffix: '.staging',
    defaultBaseUrl: 'https://staging.example.com',
    defaultOdooDb: 'staging-db',
  });
});

test('development keeps dev runtime semantics without creating a third app identity', () => {
  const config = createEnvironmentConfig({
    EXPO_PUBLIC_APP_ENV: 'development',
    EXPO_PUBLIC_KF_DEFAULT_BASE_URL: 'https://staging.example.com',
    EXPO_PUBLIC_KF_ODOO_DB: 'staging-db',
  });

  assert.deepEqual(config, {
    environment: 'development',
    appName: 'KOLD Field Staging',
    appSlug: 'kold-field',
    appScheme: 'kold-field-staging',
    bundleSuffix: '.staging',
    defaultBaseUrl: 'https://staging.example.com',
    defaultOdooDb: 'staging-db',
  });
});
