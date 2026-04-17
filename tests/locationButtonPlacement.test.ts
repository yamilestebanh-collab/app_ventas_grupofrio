import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function main() {
  const checkinScreen = readFileSync(
    '/Users/sebis/Desktop/app-ventas-v2/app/checkin/[stopId].tsx',
    'utf8',
  );
  const postvisitScreen = readFileSync(
    '/Users/sebis/Desktop/app-ventas-v2/app/postvisit/[stopId].tsx',
    'utf8',
  );

  assert.match(
    checkinScreen,
    /Abrir ubicación/,
    'el botón debe existir en la pantalla de check-in',
  );
  assert.doesNotMatch(
    postvisitScreen,
    /Abrir ubicación/,
    'el botón no debe quedarse en la pantalla de prospección',
  );

  console.log('location button placement tests: ok');
}

main();
