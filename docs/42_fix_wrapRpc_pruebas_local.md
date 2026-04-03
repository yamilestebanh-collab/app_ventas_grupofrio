# 42 — Pruebas locales: fix wrapRpc

## Fecha: 2026-04-03

## 1. Compilacion TypeScript

| Prueba | Resultado |
|--------|-----------|
| `tsc --noEmit` — archivos modificados | PASS (0 errores) |
| `tsc --noEmit` — proyecto completo | 13 errores pre-existentes en alerts.tsx/index.tsx (no relacionados) |

## 2. Busqueda de residuos wrapRpc

| Prueba | Resultado |
|--------|-----------|
| `grep -r "wrapRpc" src/` | PASS — 0 resultados |
| `grep -r "wrapRpc" app/` | PASS — 0 resultados |

## 3. Consistencia de protocolo

| Endpoint | gfLogistics.ts | useSyncStore.ts | Consistente |
|----------|---------------|-----------------|-------------|
| stop/checkin | postRest({...}) | api.post(url, {...}) | PASS |
| stop/checkout | postRest({...}) | api.post(url, {...}) | PASS |
| stop/incidents | postRest({...}) | api.post(url, {...}) | PASS |
| stop/images | postRest({...}) | api.post(url, {...}) | PASS |

## 4. Validacion de firmas de funciones

| Consumidor | Import | Firma OK |
|-----------|--------|----------|
| useRouteStore.ts | getMyPlan, getPlanStops | PASS |
| useAuthStore.ts | signOut | PASS |
| checkin/[stopId].tsx | checkIn | PASS |
| checkout/[stopId].tsx | checkOut | PASS |

## 5. Validacion de no-regresion

| Modulo | Usa JSON-RPC | Cambio aplicado | Estado |
|--------|-------------|-----------------|--------|
| odooRpc.ts (odooRead) | Si — manual | Ninguno | PASS |
| odooRpc.ts (odooWrite) | Si — manual | Ninguno | PASS |
| odooRpc.ts (odooRpc) | Si — manual | Ninguno | PASS |
| useAuthStore.ts (login) | Si — manual | Ninguno | PASS |
| ranking.tsx | Si — manual | Ninguno | PASS |
| useSyncStore.ts (sale_order) | Si — manual | Ninguno | PASS |
| useSyncStore.ts (payment) | Si — manual | Ninguno | PASS |
| useSyncStore.ts (gps) | Si — manual | Ninguno | PASS |

## 6. Flujo de datos esperado post-fix

```
App inicio
  → loadPlan() en useRouteStore
    → getMyPlan() — postRest('gf/.../my_plan', {})
      → servidor recibe {} (payload plano) → responde con plan
    → getPlanStops(plan_id) — postRest('gf/.../plan/stops', { plan_id })
      → servidor recibe { plan_id: N } → responde con stops[]
    → useRouteStore.stops = stops (con coordenadas)
  → map.tsx
    → stopsWithCoords = stops.filter(s => s.latitude && s.longitude)
    → Markers renderizados en MapView
    → Polyline conecta las paradas
    → openNavigation() abre Google Maps externo
```

## 7. Pruebas que requieren dispositivo (pendientes)

Estas pruebas requieren la app corriendo en un dispositivo/emulador Android:

- [ ] getMyPlan() devuelve datos reales del backend
- [ ] Mapa muestra markers con coordenadas
- [ ] Polyline conecta paradas en orden
- [ ] Check-in envia datos correctamente
- [ ] Check-out envia datos correctamente
- [ ] Modo offline: sync queue sigue funcionando
- [ ] openNavigation() abre Google Maps

**Nota**: Estas pruebas necesitan `expo run:android` (dev build, no Expo Go)
porque react-native-maps requiere prebuild nativo.
