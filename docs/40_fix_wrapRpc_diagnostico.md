# 40 — Diagnostico: wrapRpc en endpoints REST

## Fecha: 2026-04-03

## Causa raiz

Sebastian (commit 08758f1) agrego `wrapRpc()` a TODOS los endpoints en `gfLogistics.ts`.
Esto envolvia las llamadas en formato JSON-RPC:

```typescript
{ jsonrpc: '2.0', params: { stop_id: 123, ... } }
```

Pero los endpoints `gf/logistics/api/employee/*` son **REST** — esperan payload plano:

```typescript
{ stop_id: 123, latitude: ..., longitude: ... }
```

## Evidencia

`useSyncStore.ts` (cola offline) usa los MISMOS endpoints con payload plano y funciona:

```typescript
// useSyncStore.ts linea 232 — FUNCIONA
await api.post('gf/logistics/api/employee/stop/checkin', {
  stop_id: payload.stop_id,
  latitude: payload.latitude,
  longitude: payload.longitude,
});
```

```typescript
// gfLogistics.ts ANTES — FALLA (400 Bad Request)
await api.post(`${GF_BASE}/stop/checkin`, wrapRpc({
  stop_id: stopId,
  latitude,
  longitude,
}));
```

## Clasificacion de endpoints

### REST (NO requieren JSON-RPC) — modulo `gf_logistics_ops`

| Endpoint | Funcion | Archivo |
|----------|---------|---------|
| `gf/logistics/api/employee/my_plan` | getMyPlan() | gfLogistics.ts |
| `gf/logistics/api/employee/plan/stops` | getPlanStops() | gfLogistics.ts |
| `gf/logistics/api/employee/stop/checkin` | checkIn() | gfLogistics.ts, useSyncStore.ts |
| `gf/logistics/api/employee/stop/checkout` | checkOut() | gfLogistics.ts, useSyncStore.ts |
| `gf/logistics/api/employee/stop/lines` | getStopLines() | gfLogistics.ts |
| `gf/logistics/api/employee/stop/incidents` | reportIncident() | gfLogistics.ts, useSyncStore.ts |
| `gf/logistics/api/employee/stop/images` | uploadStopImage() | gfLogistics.ts, useSyncStore.ts |
| `gf/logistics/api/employee/sign_out` | signOut() | gfLogistics.ts |

### JSON-RPC (SI requieren wrapping) — endpoints Odoo nativos

| Endpoint | Funcion | Archivo |
|----------|---------|---------|
| `/jsonrpc` | odooRpc() | odooRpc.ts |
| `/get_records` | odooRead() | odooRpc.ts, useSyncStore.ts, ranking.tsx |
| `/api/create_update` | odooWrite() | odooRpc.ts, useSyncStore.ts |
| `/api/employee-sign-in` | login() | useAuthStore.ts |

## Cascada de fallas

1. `getMyPlan()` envia `{ jsonrpc: '2.0', params: {} }` → servidor responde 400
2. `loadPlan()` en useRouteStore recibe null → sets `stops: []`
3. `map.tsx` filtra stops con coordenadas → array vacio
4. No hay markers, no hay polyline → mapa vacio, rutas invisibles

## Componentes NO afectados (correctos)

- MapView, Markers, Polyline: implementacion correcta
- openNavigation(): funciona si hay datos
- Google Maps API key: configurada correctamente
- react-native-maps plugin: configurado correctamente
- Permisos de ubicacion: en su lugar
