# Backend Requests — KOLD Field V2 pilot

Peticiones al equipo de backend (Sebastián) para desbloquear capacidades
del piloto. Cada sección es una unidad cerrada: contrato propuesto,
motivación, y cómo la app lo va a consumir.

---

## REQ-01 — Endpoint dedicado para búsqueda de partners y leads

**Estado:** pendiente
**Prioridad:** P1 — bloquea la venta fuera de ruta
**Relacionado:** Plan 2 (route leads mixed stops), BLD-20260410-FALLBACK

### Problema

La pantalla **Fuera de ruta** (`/offroute`) permite buscar clientes o
leads/prospectos para crear una venta fuera de plan. Hoy esa búsqueda
pasa por `POST /get_records` sobre `res.partner` con un dominio que
filtra por `customer_rank`. En producción vuelve **vacío** incluso
cuando el contacto existe.

Causas candidatas (en orden de probabilidad):

1. `/get_records` tiene una allowlist de modelos y `res.partner` no
   está habilitado (o está pero con columnas restringidas).
2. `customer_rank` es un campo computed/stored en algunos módulos
   custom y no es searchable por dominio externo.
3. El scope del empleado del camión no le da read sobre `res.partner`
   fuera de su sucursal.
4. Plan 2 ahora trae **leads del CRM** mezclados en el plan, pero el
   buscador actual sólo ve `res.partner` — NO puede encontrar un
   `crm.lead` suelto.

La app ya tiene un fallback chain por 3 rutas
(`/get_records` → `/jsonrpc search_read` → `search_read` sin
`customer_rank`) + filtro cliente, que en el mejor caso resuelve
1–3. Pero **no resuelve el punto 4** y encima cada búsqueda dispara
hasta 3 round-trips, lo cual es lento en 4G rural.

### Contrato propuesto

```
POST /gf/logistics/api/employee/partners/search
Auth: sesión de employee (x-api-key + cookie actuales)

Request:
{
  "q": "juan panificadora",        // texto libre, min 3 chars
  "mode": "customers" | "leads" | "all",  // default 'all'
  "limit": 30,                     // default 30, max 100
  "include_crm_leads": true,       // default false; si true, además de
                                    //   res.partner busca en crm.lead
                                    //   y los devuelve unificados
  "warehouse_scope": true          // default true; si true, restringe a
                                    //   partners/leads asignables al
                                    //   warehouse del employee
}

Response:
{
  "ok": true,
  "data": {
    "query": "juan panificadora",
    "mode": "all",
    "count": 3,
    "results": [
      {
        "source": "res.partner",       // 'res.partner' | 'crm.lead'
        "id": 4821,                    // id del registro origen
        "partner_id": 4821,            // res.partner id (null si source=crm.lead)
        "lead_id": null,               // crm.lead id (null si source=res.partner)
        "name": "Panificadora Juan SA",
        "customer_rank": 1,            // 0 = lead / prospect, >0 = cliente
        "phone": "3339871234",
        "mobile": "",
        "vat": "PJU010101ABC",
        "street": "Av. Juárez 123",
        "street2": "Centro",
        "city": "Guadalajara",
        "latitude": 20.6736,           // opcional, para mostrar distancia
        "longitude": -103.344,
        "last_sale_date": "2026-03-28", // opcional, ayuda a deduplicar
        "stop_kind_hint": "customer"   // 'customer' | 'lead' — pista para
                                        //   el shape que tendrá el gf.route.stop
                                        //   si se crea un virtual stop
      },
      {
        "source": "crm.lead",
        "id": 99,
        "partner_id": null,
        "lead_id": 99,
        "name": "Tienda Don José (prospecto)",
        "customer_rank": 0,
        "phone": "3341112222",
        "mobile": "",
        "vat": "",
        "street": "Col. Libertad",
        "city": "Guadalajara",
        "stop_kind_hint": "lead"
      }
    ]
  }
}

Error:
{ "ok": false, "message": "scope denied" }
```

### Comportamiento esperado

- Busca por `ilike` en `name`, `phone`, `mobile`, `vat` unificando
  `res.partner` y (si `include_crm_leads=true`) `crm.lead`.
- `mode='customers'`: sólo `res.partner` con `customer_rank > 0`.
- `mode='leads'`: `res.partner` con `customer_rank = 0` +
  (si `include_crm_leads`) todos los `crm.lead` activos, no won,
  no perdidos.
- `mode='all'`: unión de ambos.
- `warehouse_scope=true`: restringe a partners cuya zona/polígono o
  última venta pertenezca al warehouse del employee. Para `crm.lead`,
  restringe por `team_id` del employee o por polígono origen si lo
  tiene. Si el backend no puede resolver el scope, devuelve todos
  (fail-open) y agrega `warning: "scope not applied"` en el body.
- Ordena por relevancia: (a) prefijo exacto de `name`, (b)
  `last_sale_date` reciente, (c) `customer_rank` desc.
- Deduplica si un `crm.lead` ya fue convertido a `res.partner`
  (mismo `vat` o `phone`): devuelve solo la versión `res.partner`.
- Soporta paginación vía `limit` (sin offset por ahora; si el vendor
  no encuentra nada con 30, es mejor que afine el texto).

### Cómo la app lo va a consumir

En `src/services/partners.ts` agrego `searchPartnersV2()` que pega
directo al endpoint nuevo. `searchPartners()` queda como wrapper:

```typescript
export async function searchPartners(q, mode, limit) {
  // Prefer V2 endpoint if available
  const v2 = await searchPartnersV2(q, mode, limit);
  if (v2 !== null) return v2;  // null = endpoint unavailable
  // Legacy fallback chain (3 paths already implemented)
  return legacySearchPartners(q, mode, limit);
}
```

En la UI de `/offroute` agrego un toggle extra:

- **Cliente** (res.partner con rank>0)
- **Lead / Prospecto** (res.partner con rank=0 + crm.lead si
  `include_crm_leads=true`)

Cuando el vendor seleccione un resultado con `source='crm.lead'`, el
virtual stop creado ya llevará `lead_id` poblado y `stop_kind='lead'`,
alineado con Plan 2. Al cerrar la venta, `/lead/convert` promueve el
`crm.lead` a `res.partner` y el resto del pipeline (marcado won,
exclusión del mapa de prospectos) corre igual que con un lead del plan.

### Aceptación

- [ ] Llamada con `q='test' mode=all` devuelve < 600 ms en instancia
  de pruebas.
- [ ] Retorna al menos un `res.partner` y un `crm.lead` conocidos del
  seed data.
- [ ] `warehouse_scope=true` filtra correctamente a la zona del
  employee de prueba.
- [ ] Dedup de lead convertido funciona: no aparece dos veces.
- [ ] La app consume sin cambios en el flujo de venta.

---

## REQ-02 — Allowlist explícita de `res.partner` en `/get_records`

**Estado:** pendiente
**Prioridad:** P2 — útil pero REQ-01 lo vuelve innecesario

Si REQ-01 no es viable a corto plazo, al menos confirmar que
`res.partner` está en la allowlist de `/get_records` con los campos:

```
id, name, street, street2, city, phone, mobile, vat,
customer_rank, comment, email, latitude, longitude
```

Y que los dominios con `['customer_rank', '>', 0]` /
`['customer_rank', '=', 0]` funcionan bajo el scope del empleado.

---

## REQ-03 — Campos `x_kold_*` en control tower

**Estado:** pendiente de verificar
**Prioridad:** P1 — necesario para trazabilidad sale ↔ stop ↔ lead

La app ya manda los siguientes campos custom en el dispatch de
`sale_order` (vía `/api/create_update` sobre `sale.order`):

| Campo | Tipo | Propósito |
|---|---|---|
| `gf_stop_id` | m2o `gf.route.stop` | Stop real (null si offroute) |
| `x_kold_employee_id` | m2o `hr.employee` | Chofer/vendedor |
| `x_kold_payment_method` | char | 'cash' / 'credit' |
| `x_kold_is_offroute` | bool | Venta fuera de plan |
| `x_kold_origin_lead_id` | m2o `crm.lead` | Lead de origen (Plan 2) |
| `x_kold_lead_result` | char | 'sale' / 'muestra' / 'consignacion' |
| `x_kold_operation_id` | char | idempotency key (UUID del cliente) |

Confirmar con el equipo de `gf_control_tower_v2`:

- [ ] Los 7 campos existen en `sale.order` o están siendo ignorados
  silenciosamente por create_update.
- [ ] El dashboard de control tower puede filtrar / agrupar por al
  menos: `gf_stop_id`, `x_kold_employee_id`, `x_kold_is_offroute`,
  `x_kold_lead_result`.
- [ ] `x_kold_operation_id` está indexado para dedup server-side
  (second line of defense contra duplicados de cola offline).

Si algún campo no existe, **avisar a la app** antes de cualquier
refactor — la app los manda como best-effort, no depende de que
existan, pero el control tower sí.

---

## REQ-04 — Endpoint `/lead/convert` — shape de `updates`

**Estado:** desplegado en Plan 2, pendiente validar shape exacta
**Prioridad:** P1 — consume de la app ya está en `convertLeadStop()`

La app llama:

```
POST /gf/logistics/api/employee/lead/convert
{
  "stop_id": 1234,
  "lead_id": 99,
  "updates": {
    "name": "Razón Social SA de CV",
    "phone": "3331234567",
    "email": "contacto@razon.mx",
    "street": "Av. Juárez 123",
    "street2": "Centro",
    "city": "Guadalajara",
    "zip": "44100",
    "vat": "RSC010101ABC",
    "l10n_mx_edi_fiscal_regime": "601",
    "l10n_mx_edi_usage": "G03",
    "x_kold_requiere_factura": true,
    "x_kold_conservador_capacidad": "120 lt",
    "comment": "Conservador: 120 lt · Ref: contacto Juan"
  }
}
```

Confirmar:

- [ ] `updates.zip` se mapea a `res.partner.zip` (no a custom field).
- [ ] Los campos `l10n_mx_edi_*` se escriben sólo si el módulo está
  instalado; si no, se ignoran sin error.
- [ ] Los `x_kold_*` pasan tal cual al write de `res.partner`.
- [ ] Si `stop_id` existe pero no tiene `lead_id`, el endpoint
  actualiza igual el `res.partner` vinculado (update-only path).
- [ ] Si `lead_id` pasa pero el `crm.lead` ya fue convertido, no
  duplica: hace write al partner existente y devuelve su id.
- [ ] La respuesta incluye `customer_rank` actualizado para que la
  app pueda validar sin recargar el plan.

Respuesta esperada:

```
{
  "ok": true,
  "data": {
    "partner_id": 501,
    "stop_id": 1234,
    "lead_id": 99,
    "customer_rank": 1
  }
}
```

---

## Notas de coordinación

- La app tolera que REQ-01, REQ-02 y REQ-03 estén ausentes — cae a
  rutas legacy o ignora campos desconocidos. Pero el **piloto gana
  velocidad y trazabilidad real** con los 4 aterrizados.
- REQ-04 ya está desplegado según el changelog de Sebastián del
  2026-04-10; sólo falta validar shape en runtime.
- Cualquier cambio breaking en estos contratos debe avisarse con
  bump de versión en el header `x-kold-api-version` (hoy la app no
  lo envía; lo agregamos si el backend lo pide).
