# 43 — Hardening: separacion REST vs JSON-RPC

## Fecha: 2026-04-03

## Problema original

El codebase no distinguia entre protocolos de comunicacion. Un solo `api.post()`
se usaba para TODO, y el desarrollador tenia que recordar cuando envolver
en JSON-RPC y cuando no. Resultado: se aplico `wrapRpc()` a endpoints REST,
rompiendo mapas y rutas.

## Solucion implementada

### Nuevos helpers en `src/services/api.ts`

```typescript
// Para endpoints REST (gf_logistics_ops)
postRest<T>(url, data?)
  → api.post(url, data)
  → retorna response.data.result ?? response.data

// Para endpoints Odoo JSON-RPC
postRpc<T>(url, params?)
  → api.post(url, { jsonrpc: '2.0', params })
  → retorna response.data.result
  → lanza Error si response.data.error
```

### Regla clara

| Si el endpoint... | Usar | Ejemplo |
|-------------------|------|---------|
| Empieza con `gf/logistics/` | `postRest()` | gfLogistics.ts |
| Es `/jsonrpc`, `/get_records`, `/api/create_update` | `postRpc()` | odooRpc.ts |
| Es `/api/employee-sign-in` | JSON-RPC manual | useAuthStore.ts |

### Documentacion inline

`gfLogistics.ts` ahora tiene un bloque docstring explicito:

```
 * IMPORTANT: These are REST endpoints (gf_logistics_ops module), NOT JSON-RPC.
 * They expect plain payloads: { stop_id: 123, latitude: ... }
 * Do NOT wrap with jsonrpc/params — that causes 400 errors.
```

## Arquitectura de servicios actual

```
src/services/
  api.ts            → Axios singleton + postRest() + postRpc()
  gfLogistics.ts    → REST endpoints (usa postRest)
  odooRpc.ts        → JSON-RPC endpoints (JSON-RPC manual, puede migrar a postRpc)
```

```
src/stores/
  useSyncStore.ts   → Offline queue (api.post directo — historicamente correcto)
  useAuthStore.ts   → Login (JSON-RPC manual — correcto)
```

## Mejora futura recomendada

Migrar `odooRpc.ts` y `useAuthStore.ts` para usar `postRpc()`:

```typescript
// ANTES (odooRpc.ts)
const response = await api.post('/get_records', {
  jsonrpc: '2.0',
  params: { model, domain, fields, limit, offset, order },
});
return response.data?.result;

// DESPUES
return await postRpc('/get_records', { model, domain, fields, limit, offset, order });
```

Esto centralizaria TODO el wrapping JSON-RPC en un solo lugar,
eliminando la posibilidad de error.

---

## RIESGO FUTURO Y PREVENCION

### Como evitar mezclar REST y JSON-RPC otra vez

1. **Nunca usar `api.post()` directamente para llamadas nuevas.**
   Siempre usar `postRest()` o `postRpc()`.

2. **Regla de decision simple:**
   - URL contiene `gf/logistics/` → `postRest()`
   - URL empieza con `/` (endpoints Odoo) → `postRpc()`

3. **Si un endpoint nuevo devuelve 400:**
   - NO agregar wrapRpc o JSON-RPC wrapping como fix
   - Verificar primero: que espera el servidor? REST o JSON-RPC?
   - Revisar `useSyncStore.ts` como referencia de protocolo correcto

4. **Code review checklist:**
   - [ ] Nuevo endpoint REST usa postRest()?
   - [ ] Nuevo endpoint Odoo usa postRpc() o JSON-RPC manual?
   - [ ] No se mezclan protocolos?

### Mejores practicas para este proyecto

1. **gfLogistics.ts es SOLO para endpoints REST de logistica.**
   Nunca agregar llamadas a `/jsonrpc` o `/get_records` aqui.

2. **odooRpc.ts es SOLO para endpoints JSON-RPC de Odoo.**
   Nunca agregar llamadas a `gf/logistics/*` aqui.

3. **useSyncStore.ts es la referencia canonica.**
   Si hay duda sobre el protocolo de un endpoint,
   ver como lo usa la cola offline — esa es la verdad.
