import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnvironmentStorageKey,
  getRuntimeAppEnvironment,
} from '../src/config/appEnvironment.ts';

test('staging and production use different storage namespaces', () => {
  assert.notEqual(
    buildEnvironmentStorageKey('production', 'kf_base_url'),
    buildEnvironmentStorageKey('staging', 'kf_base_url'),
  );
});

test('production keeps legacy storage keys for continuity', () => {
  assert.equal(
    buildEnvironmentStorageKey('production', 'kf_base_url'),
    'kf_base_url',
  );
  assert.equal(
    buildEnvironmentStorageKey('staging', 'kf_base_url'),
    'staging_kf_base_url',
  );
});

test('non-production storage keys stay SecureStore compatible', () => {
  assert.match(
    buildEnvironmentStorageKey('staging', 'kf_base_url'),
    /^[A-Za-z0-9._-]+$/,
  );
  assert.match(
    buildEnvironmentStorageKey('development', 'kf_base_url'),
    /^[A-Za-z0-9._-]+$/,
  );
});

test('runtime environment resolves expo extra values safely', () => {
  assert.equal(getRuntimeAppEnvironment('production'), 'production');
  assert.equal(getRuntimeAppEnvironment('staging'), 'staging');
  assert.equal(getRuntimeAppEnvironment(undefined), 'production');
});
