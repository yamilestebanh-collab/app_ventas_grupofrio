# 46 — Impacto Colateral: gfLogistics.ts

## Fecha: 2026-04-03

## Resumen

Se analizaron TODOS los consumidores directos e indirectos de `gfLogistics.ts`.
El cambio de `wrapRpc()` a `postRest()` NO cambia la firma de ninguna funcion exportada.
Todos los consumidores siguen funcionando sin modificaciones.

---

## ARBOL DE DEPENDENCIAS

```
gfLogistics.ts (MODIFICADO — wrapRpc → postRest)
├── getMyPlan()
│   └── useRouteStore.ts → loadPlan()
│       ├── app/(tabs)/index.tsx → Home screen (llama loadPlan on mount)
│       ├── app/(tabs)/route.tsx → Lista de paradas (lee stops)
│       ├── app/map.tsx → Mapa con markers (lee stops)
│       ├── app/checkin/[stopId].tsx → Busca stop por ID (lee stops)
│       └── app/checkout/[stopId].tsx → Busca stop por ID (lee stops)
│
├── getPlanStops()
│   └── useRouteStore.ts → loadPlan() (despues de getMyPlan)
│       └── (mismos consumidores de arriba)
│
├── checkIn()
│   └── app/checkin/[stopId].tsx → handleCheckIn() (directo)
│
├── checkOut()
│   └── app/checkout/[stopId].tsx → handleCheckout() (directo)
│
├── signOut()
│   └── useAuthStore.ts → logout()
│       └── app/_layout.tsx → (indirecto via auth state)
│
├── getStopLines() — NO tiene consumidores activos en el codebase
├── reportIncident() — NO tiene consumidores activos en el codebase
└── uploadStopImage() — NO tiene consumidores activos en el codebase
```

**Nota:** `getStopLines`, `reportIncident`, `uploadStopImage` estan definidos pero
sus consumidores directos no se encontraron en los screens actuales. Se usan
indirectamente via `useSyncStore.ts` que tiene su PROPIA implementacion (payload plano).

---

## ANALISIS POR PANTALLA

### Home (`app/(tabs)/index.tsx`)
- **Dependencia:** useRouteStore.stops, plan, progress
- **Flujo:** Monta → llama loadPlan() → muestra stats
- **Impacto:** NINGUNO (loadPlan lee de gfLogistics, que ahora envia payload correcto)
- **Riesgo:** Si getMyPlan() falla, muestra "Sin plan" → MISMO comportamiento que antes (pero antes SIEMPRE fallaba por wrapRpc)

### Ruta (`app/(tabs)/route.tsx`)
- **Dependencia:** useRouteStore.stops
- **Flujo:** Lee stops del store, renderiza lista
- **Impacto:** NINGUNO (solo lee datos del store)
- **Riesgo:** Ninguno

### Mapa (`app/map.tsx`)
- **Dependencia:** useRouteStore.stops (filtrado por coordenadas)
- **Flujo:** Filtra stops con lat/lon → MapView con Markers + Polyline
- **Impacto:** POSITIVO — ahora stops tendra datos reales, markers se mostraran
- **Riesgo:** Si stops vienen con coordenadas invalidas (null, 0), se filtran correctamente

### Check-in (`app/checkin/[stopId].tsx`)
- **Dependencia directa:** checkIn() de gfLogistics
- **Flujo:** GPS → geofence → checkIn() → visit timer
- **Impacto:** POSITIVO — checkIn() ahora envia payload correcto
- **Cambio adicional:** Guard anti double-tap agregado (checkingIn state)
- **Riesgo:** Ninguno — firma de checkIn(stopId, lat, lon) identica

### Check-out (`app/checkout/[stopId].tsx`)
- **Dependencia directa:** checkOut() de gfLogistics
- **Flujo:** Resumen → checkOut() → navigate next
- **Impacto:** POSITIVO — checkOut() ahora envia payload correcto
- **Cambio adicional:** Guard anti double-tap agregado (checkingOut state)
- **Riesgo:** Ninguno — firma de checkOut(stopId, lat, lon) identica

### Alertas (`app/(tabs)/alerts.tsx`)
- **Dependencia:** Indirecta via KOLD store (cargado durante loadPlan)
- **Impacto:** NINGUNO — alertas no dependen de gfLogistics
- **Riesgo:** Ninguno

### Layout (`app/_layout.tsx`)
- **Dependencia:** Indirecta via rehydrate (lee plan/stops persistidos)
- **Impacto:** NINGUNO — rehydrate lee datos de AsyncStorage
- **Riesgo:** Si datos persistidos previos tenian formato corrupto, se ignoran

### Auth (`src/stores/useAuthStore.ts`)
- **Dependencia directa:** signOut() de gfLogistics
- **Impacto:** NINGUNO — signOut() es fire-and-forget, errors ya se ignoraban
- **Riesgo:** Ninguno

### Sync Queue (`src/stores/useSyncStore.ts`)
- **Dependencia:** NINGUNA de gfLogistics (tiene su propia implementacion)
- **Impacto:** NINGUNO — sin cambios
- **Riesgo:** Ninguno

---

## FLUJOS COLATERALES NO AFECTADOS

| Flujo | Endpoint | Protocolo | Estado |
|-------|----------|-----------|--------|
| Login | /api/employee-sign-in | JSON-RPC | Sin cambios |
| Lectura Odoo | /get_records | JSON-RPC | Sin cambios |
| Crear/Editar Odoo | /api/create_update | JSON-RPC | Sin cambios |
| RPC directo | /jsonrpc | JSON-RPC | Sin cambios |
| Ranking | /get_records | JSON-RPC | Sin cambios |
| Sync: sale_order | /api/create_update | JSON-RPC | Sin cambios |
| Sync: payment | /api/create_update | JSON-RPC | Sin cambios |
| Sync: gps | /api/create_update | JSON-RPC | Sin cambios |
| Sync: checkin | gf/.../stop/checkin | REST plano | Sin cambios |
| Sync: checkout | gf/.../stop/checkout | REST plano | Sin cambios |
| Sync: incidents | gf/.../stop/incidents | REST plano | Sin cambios |
| Sync: photos | gf/.../stop/images | REST plano | Sin cambios |

---

## FUNCIONES SIN CONSUMIDOR ACTIVO

Estas funciones estan en gfLogistics.ts pero ningun screen las llama directamente:

| Funcion | Proposito | Equivalente en useSyncStore |
|---------|-----------|---------------------------|
| getStopLines() | Obtener lineas de una parada | No tiene equivalente |
| reportIncident() | Reportar incidente | `no_sale` case (linea 249) |
| uploadStopImage() | Subir foto | `photo` case (linea 280) |

**Esto es correcto:** las pantallas de venta, no-venta y foto usan la cola de sync
para enviar datos (offline-first). Las funciones en gfLogistics son para uso directo
online-only, disponibles para pantallas futuras.

---

## CONCLUSION DE IMPACTO

| Categoria | Impacto | Detalle |
|-----------|---------|---------|
| Flujo principal (plan + mapa) | POSITIVO | Antes no funcionaba, ahora si |
| Check-in / check-out | POSITIVO | Antes no funcionaba online, ahora si |
| Cola offline (sync) | NEUTRO | Sin cambios, sigue funcionando |
| Login / auth | NEUTRO | Sin cambios |
| Endpoints Odoo JSON-RPC | NEUTRO | Sin cambios |
| Ranking | NEUTRO | Sin cambios |
| Hardening (double-tap) | POSITIVO | Reduccion de riesgo |

**No se identificaron regresiones.**
