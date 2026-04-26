import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mapScreen = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/map.tsx',
  'utf8',
);
const topBar = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/components/ui/TopBar.tsx',
  'utf8',
);
const pricelistCache = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/services/pricelistCache.ts',
  'utf8',
);
const offrouteSearch = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/services/offrouteSearch.ts',
  'utf8',
);
const routeStore = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/stores/useRouteStore.ts',
  'utf8',
);
const visitStore = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/stores/useVisitStore.ts',
  'utf8',
);

function main() {
  assert.match(
    topBar,
    /onBack\?: \(\) => void;/,
    'TopBar debe permitir navegación custom para cortar el stack después de la venta',
  );

  assert.match(
    mapScreen,
    /Hacer venta/,
    'el mapa debe ofrecer acción de venta al tocar un pin',
  );
  assert.match(
    mapScreen,
    /Abrir Maps/,
    'el mapa debe seguir ofreciendo navegación a Maps al tocar un pin',
  );

  assert.match(
    pricelistCache,
    /34:\s*104/,
    'el fallback de pricelist para la compañía 34 debe ser 104',
  );

  assert.match(
    offrouteSearch,
    /x_analytic_account_id/,
    'la búsqueda de visita especial debe filtrar por plaza analítica',
  );

  assert.match(
    routeStore,
    /_koldScore:\s*score \?\? s\._koldScore \?\? undefined/,
    'la ruta debe preservar el Kold Score que ya venga del backend',
  );

  assert.match(
    visitStore,
    /saleTax:\s*\(\)\s*=>\s*0/,
    'la venta no debe seguir sumando IVA client-side si Odoo ya entrega el precio final esperado',
  );
  assert.match(
    visitStore,
    /saleTotal:\s*\(\)\s*=>\s*get\(\)\.saleSubtotal\(\)/,
    'el total de venta debe coincidir con la suma directa de la lista de precios',
  );

  console.log('route ux and kold wiring tests: ok');
}

main();
