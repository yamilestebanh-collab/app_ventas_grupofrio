import assert from 'node:assert/strict';
import { runRefreshTask } from '../src/hooks/useAsyncRefresh';

async function testRefreshLifecycleSuccess() {
  const states: boolean[] = [];

  await runRefreshTask(
    async () => {
      states.push(true);
    },
    (value) => states.push(value)
  );

  assert.deepEqual(
    states,
    [true, true, false],
    'debe activar refreshing antes de ejecutar y apagarlo al terminar'
  );
}

async function testRefreshLifecycleError() {
  const states: boolean[] = [];
  const errors: string[] = [];

  await runRefreshTask(
    async () => {
      throw new Error('network');
    },
    (value) => states.push(value),
    (error) => errors.push(error instanceof Error ? error.message : String(error))
  );

  assert.deepEqual(states, [true, false], 'debe apagar refreshing aunque falle');
  assert.deepEqual(errors, ['network'], 'debe reportar el error al callback opcional');
}

async function main() {
  await testRefreshLifecycleSuccess();
  await testRefreshLifecycleError();
  console.log('useAsyncRefresh tests: ok');
}

void main();
