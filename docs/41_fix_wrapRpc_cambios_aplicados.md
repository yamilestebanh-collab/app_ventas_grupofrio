# 41 — Cambios aplicados: eliminacion de wrapRpc

## Fecha: 2026-04-03

## Archivos modificados

### 1. `src/services/gfLogistics.ts` — REESCRITURA COMPLETA

**ANTES** (8 llamadas con wrapRpc):
```typescript
function wrapRpc(params: Record<string, any> = {}) {
  return { jsonrpc: '2.0', params };
}

// Cada llamada usaba wrapRpc:
const response = await api.post(`${GF_BASE}/my_plan`, wrapRpc());
const result = response.data?.result || response.data;
```

**DESPUES** (8 llamadas con postRest):
```typescript
import { postRest } from './api';

// Payload plano, sin JSON-RPC wrapping:
const result = await postRest<GFPlan | null>(`${GF_BASE}/my_plan`);
```

**Cambios por funcion:**

| Funcion | Antes | Despues |
|---------|-------|---------|
| getMyPlan() | `api.post(url, wrapRpc())` | `postRest(url)` |
| getPlanStops() | `api.post(url, wrapRpc({plan_id}))` | `postRest(url, {plan_id})` |
| checkIn() | `api.post(url, wrapRpc({...}))` | `postRest(url, {...})` |
| checkOut() | `api.post(url, wrapRpc({...}))` | `postRest(url, {...})` |
| getStopLines() | `api.post(url, wrapRpc({stop_id}))` | `postRest(url, {stop_id})` |
| reportIncident() | `api.post(url, wrapRpc({...}))` | `postRest(url, {...})` |
| uploadStopImage() | `api.post(url, wrapRpc({...}))` | `postRest(url, {...})` |
| signOut() | `api.post(url, wrapRpc())` | `postRest(url)` |

### 2. `src/services/api.ts` — NUEVOS HELPERS DE PROTOCOLO

Agregado al final del archivo:

```typescript
// postRest(url, data) — para endpoints REST (gf_logistics_ops)
//   Envia payload plano, retorna response.data.result ?? response.data

// postRpc(url, params) — para endpoints JSON-RPC (Odoo nativo)
//   Envuelve en { jsonrpc: '2.0', params }, retorna response.data.result
//   Lanza error si response.data.error existe
```

### 3. Archivos NO modificados (ya correctos)

| Archivo | Razon |
|---------|-------|
| `src/services/odooRpc.ts` | Ya usa JSON-RPC manualmente — correcto |
| `src/stores/useSyncStore.ts` | Ya usa payload plano — correcto |
| `src/stores/useAuthStore.ts` | Login usa JSON-RPC — correcto |
| `src/stores/useRouteStore.ts` | Solo llama gfLogistics — sin cambios |
| `app/ranking.tsx` | Usa JSON-RPC para /get_records — correcto |
| `app/map.tsx` | Solo renderiza datos — sin cambios |

## Validacion TypeScript

```
$ tsc --noEmit

Errores en archivos modificados: 0
Errores pre-existentes (alerts.tsx, index.tsx): 13 (no relacionados)
```

## Verificacion de imports

Todos los consumidores de gfLogistics.ts siguen funcionando:
- `useRouteStore.ts` → importa `getMyPlan`, `getPlanStops` (sin cambios en firma)
- `useAuthStore.ts` → importa `signOut` (sin cambios en firma)
- `app/checkin/[stopId].tsx` → importa `checkIn` (sin cambios en firma)
- `app/checkout/[stopId].tsx` → importa `checkOut` (sin cambios en firma)
