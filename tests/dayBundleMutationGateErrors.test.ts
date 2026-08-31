import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DayBundleActionBlockedError,
  describeDayBundleActionBlock,
} from '../src/services/dayBundleMutationGate.ts';

test('an absent bundle is not reported as expired', () => {
  const error = new DayBundleActionBlockedError('missing');

  assert.deepEqual(describeDayBundleActionBlock(error), {
    title: 'Bundle no disponible',
    message: 'No hay un bundle del día disponible en este dispositivo. Renúevalo antes de registrar cambios.',
    canRefresh: true,
  });
});

test('an expired bundle keeps the expired message', () => {
  const error = new DayBundleActionBlockedError('expired');

  assert.deepEqual(describeDayBundleActionBlock(error), {
    title: 'Bundle vencido',
    message: 'El bundle del día venció. Renúevalo antes de registrar cambios.',
    canRefresh: true,
  });
});

test('an invalid local bundle is reported as unreadable instead of expired', () => {
  const error = new DayBundleActionBlockedError('invalid');

  assert.deepEqual(describeDayBundleActionBlock(error), {
    title: 'Bundle no disponible',
    message: 'El bundle local no se pudo validar. Renúevalo antes de registrar cambios.',
    canRefresh: true,
  });
});

test('blocked operational screens offer an explicit bundle renewal action', () => {
  for (const path of [
    'app/sale/[stopId].tsx',
    'app/checkout/[stopId].tsx',
    'app/customer/[partnerId].tsx',
    'app/nosale/[stopId].tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /useEmployeeDayBundleStore/);
    assert.match(source, /useEmployeeDayBundleStore\.getState\(\)\.prepare\(\)/);
    assert.match(source, /describeDayBundleActionBlock/);
    assert.match(source, /Renovar ahora/);
  }
});
