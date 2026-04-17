import assert from 'node:assert/strict';

interface LocationNavigationModule {
  buildStopNavigationUrls: (stop: {
    customer_name: string;
    google_maps_url?: string;
    customer_latitude?: number;
    customer_longitude?: number;
  }) => {
    primaryUrl: string | null;
    fallbackUrl: string | null;
  };
}

function testUsesGoogleMapsUrlFirst(module: LocationNavigationModule) {
  const urls = module.buildStopNavigationUrls({
    customer_name: 'Prospecto Centro',
    google_maps_url: 'https://maps.google.com/?q=19.4,-99.1',
    customer_latitude: 19.4,
    customer_longitude: -99.1,
  });

  assert.equal(urls.primaryUrl, 'https://maps.google.com/?q=19.4,-99.1');
  assert.equal(
    urls.fallbackUrl,
    'https://www.google.com/maps/dir/?api=1&destination=19.4,-99.1',
  );
}

function testBuildsCoordsFallback(module: LocationNavigationModule) {
  const urls = module.buildStopNavigationUrls({
    customer_name: 'Prospecto Centro',
    customer_latitude: 19.4,
    customer_longitude: -99.1,
  });

  assert.equal(
    urls.primaryUrl,
    'https://www.google.com/maps/dir/?api=1&destination=19.4,-99.1&destination_place_id=Prospecto%20Centro',
  );
  assert.equal(
    urls.fallbackUrl,
    'https://www.google.com/maps/dir/?api=1&destination=19.4,-99.1',
  );
}

function testReturnsNullWhenNoLocation(module: LocationNavigationModule) {
  const urls = module.buildStopNavigationUrls({
    customer_name: 'Sin ubicación',
  });

  assert.equal(urls.primaryUrl, null);
  assert.equal(urls.fallbackUrl, null);
}

async function main() {
  // @ts-ignore -- Node v24 runs this ESM test harness directly.
  const module = await import(
    // @ts-ignore -- import.meta is only for the test runtime, not app compilation.
    new URL('../src/services/locationNavigation.ts', import.meta.url).pathname
  ) as LocationNavigationModule;

  testUsesGoogleMapsUrlFirst(module);
  testBuildsCoordsFallback(module);
  testReturnsNullWhenNoLocation(module);
  console.log('location navigation tests: ok');
}

void main();
