import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gfLogistics = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/src/services/gfLogistics.ts',
  'utf8',
);
const salesTab = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/(tabs)/sales.tsx',
  'utf8',
);
const routeTab = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/(tabs)/route.tsx',
  'utf8',
);
const homeTab = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/(tabs)/index.tsx',
  'utf8',
);
const analyticsScreen = readFileSync(
  '/Users/sebis/Desktop/app-ventas-v2/app/analytics.tsx',
  'utf8',
);

function main() {
  assert.match(
    gfLogistics,
    /sales\/summary/,
    'gfLogistics debe exponer el endpoint /sales/summary',
  );
  assert.match(
    gfLogistics,
    /sales\/list/,
    'gfLogistics debe exponer el endpoint /sales/list',
  );

  assert.doesNotMatch(
    salesTab,
    /const todaySales = 0;/,
    'la tab de ventas no debe seguir usando montos hardcodeados en 0',
  );
  assert.doesNotMatch(
    salesTab,
    /const todayOrders = 0;/,
    'la tab de ventas no debe seguir usando pedidos hardcodeados en 0',
  );
  assert.doesNotMatch(
    routeTab,
    /label: 'Vendido', value: '\$0'/,
    'la ruta no debe seguir pintando Vendido como $0 fijo',
  );
  assert.doesNotMatch(
    homeTab,
    /label="VENTA HOY"[\s\S]*value="\$0"/,
    'la home no debe seguir pintando VENTA HOY en $0 fijo',
  );
  assert.doesNotMatch(
    analyticsScreen,
    /label="VENTAS" value="\$0"/,
    'analytics no debe seguir pintando VENTAS en $0 fijo',
  );

  console.log('sales frontend wiring tests: ok');
}

main();
