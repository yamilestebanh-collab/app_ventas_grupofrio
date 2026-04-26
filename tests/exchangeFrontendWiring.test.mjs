import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkinScreen = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/checkin/[stopId].tsx',
  'utf8',
);
const exchangeScreen = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/exchange/[stopId].tsx',
  'utf8',
);
const gfLogistics = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/services/gfLogistics.ts',
  'utf8',
);

function main() {
  assert.match(
    checkinScreen,
    /router\.push\(`\/exchange\/\$\{stop\.id\}` as never\)/,
    'la visita activa debe navegar a la pantalla de cambio de producto',
  );

  assert.match(
    checkinScreen,
    /Registrar Cambio/,
    'la visita activa debe mostrar el CTA Registrar Cambio',
  );

  assert.match(
    exchangeScreen,
    /Producto Nuevo \(Entrega\)/,
    'la pantalla de cambio debe renderizar la sección de entrega',
  );

  assert.match(
    exchangeScreen,
    /Producto Dañado \(Merma\)/,
    'la pantalla de cambio debe renderizar la sección de merma',
  );

  assert.match(
    gfLogistics,
    /exchange\/create/,
    'gfLogistics debe exponer el endpoint de cambio de producto',
  );

  console.log('exchange frontend wiring tests: ok');
}

main();
