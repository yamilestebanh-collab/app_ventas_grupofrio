import type { GFStop } from '../types/plan';

interface LocationLike {
  customer_name: string;
  google_maps_url?: string;
  customer_latitude?: number;
  customer_longitude?: number;
}

export function buildStopNavigationUrls(stop: LocationLike): {
  primaryUrl: string | null;
  fallbackUrl: string | null;
} {
  const lat = stop.customer_latitude;
  const lon = stop.customer_longitude;
  const fallbackUrl = lat != null && lon != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    : null;

  if (stop.google_maps_url) {
    return {
      primaryUrl: stop.google_maps_url,
      fallbackUrl,
    };
  }

  if (lat == null || lon == null) {
    return {
      primaryUrl: null,
      fallbackUrl: null,
    };
  }

  const label = encodeURIComponent(stop.customer_name);
  return {
    primaryUrl: `${fallbackUrl}&destination_place_id=${label}`,
    fallbackUrl,
  };
}
