# Regalo / Muestra Design

**Fecha:** 2026-04-26

## Objetivo

Agregar un flujo de `Regalo / Muestra` en la app móvil para que el chofer pueda registrar producto entregado sin cobro durante una visita activa. El flujo debe consumir `POST /gf/salesops/gift/create`, volver a la visita en éxito y quedar disponible en el mismo bloque de acciones donde hoy aparece `Venta`.

## Contexto del codebase

- Navegación: `expo-router` con pantallas por archivo bajo `app/`.
- Estado global: `zustand`.
- API REST: `postRest()` en `src/services/api.ts` con headers `Api-Key` y `X-GF-Employee-Token`.
- Catálogo/inventario: `useProductStore`, cargado por sucursal/almacén y reutilizable para buscar productos.
- Visita activa: `useVisitStore`.
- Stops/ruta: `useRouteStore`, tipados en `src/types/plan.ts`.

## Requerimientos UX

1. Desde la visita, el usuario toca `Regalo` en el mismo bloque donde hoy está `Venta`.
2. Se abre una pantalla nueva con una sola sección de líneas: producto + cantidad.
3. Debe existir al menos una línea válida para confirmar.
4. Las observaciones son opcionales.
5. El botón final muestra `loading` mientras espera al backend.
6. En éxito, vuelve a la visita y muestra confirmación.
7. En error, muestra el mensaje del backend.

## Reglas de negocio

- Debe permitirse abrir la pantalla desde customers y leads.
- En leads/oportunidades sin `partner_id`, la pantalla abre pero el botón `Registrar Regalo` queda deshabilitado.
- Si falta `mobile_location_id`, el formulario abre pero el submit queda deshabilitado con aviso persistente.
- `visit_line_id` se manda si el backend lo expone; si no existe, se envía `null` solo porque el contrato lo marca opcional.
- No se debe inferir `mobile_location_id` por nombre de almacén en el frontend.

## Integración backend requerida

El frontend necesita dos campos explícitos para no introducir heurísticas inestables:

- `mobile_location_id?: number | null`
- `visit_line_id?: number | null`

La recomendación es exponerlos en el payload que alimenta el stop activo o la visita activa. El frontend debe consumir nombres JSON explícitos y tiparlos en `GFStop`.

## Payload frontend

```json
{
  "meta": {
    "analytic_account_id": 820,
    "idempotency_key": "uuid"
  },
  "data": {
    "mobile_location_id": 1234,
    "partner_id": 51090,
    "visit_line_id": 9876,
    "lines": [
      { "product_id": 760, "qty": 1.0 }
    ],
    "notes": "Entrega de muestra",
    "validate": true
  }
}
```

## Diseño técnico

### Navegación

- Nueva ruta: `app/gift/[stopId].tsx`
- Nuevo acceso `🎁 Regalo` en `app/stop/[stopId].tsx`

### Estado

- Estado local con `useState` para:
  - líneas del formulario
  - observaciones
  - loading del submit
  - error local

No se crea store nuevo. No se integra a `useSyncStore` en esta iteración.

### Servicio API

- Nuevo helper REST dedicado para regalo/muestra.
- Debe encapsular payload y normalización de errores conocidos:
  - `VALIDATION_ERROR`
  - `FORBIDDEN`
  - `SERVER_MISCONFIG`
  - `LOCK_BUSY`

### Productos

- El selector debe filtrar del catálogo existente en `useProductStore`.
- No conviene reutilizar `ProductPicker` tal cual porque hoy muta `saleLines` en `useVisitStore`.
- Se requiere una versión local/reusable que solo devuelva el producto seleccionado.

## Manejo de estados bloqueantes

La pantalla debe mostrar avisos persistentes cuando:

- falta `partner_id`
- falta `mobile_location_id`
- falta plaza analítica del empleado

En esos casos se permite capturar líneas, pero el botón final queda deshabilitado.

## Verificación

- Test de builder de payload
- Test de mapeo de errores
- Test de visibilidad del botón `Regalo`
- Test de gating para lead sin `partner_id`
- Verificación TypeScript de archivos tocados
