# Spec — Módulo Producto a Consignación

> **Estado**: spec en revisión incorporando respuesta de Sebastián (2026-04-29). **No implementado.**
> **Owner frontend**: Yamil + Claude
> **Owner backend Odoo**: Sebastián
> **Última actualización**: 2026-04-29

## 0. Alcance y restricciones

- Este documento es **únicamente** una especificación técnica. No autoriza implementación de pantallas, stores, rutas ni sync hasta que el contrato con backend esté validado.
- La decisión final del modelo de datos backend, de los endpoints y de la atomicidad de la liquidación **le toca a Sebastián**. Las propuestas aquí están alineadas con su input del 2026-04-29.
- **No se implementará frontend real de consignación hasta tener contrato backend validado**. Mientras eso no exista, frontend solo puede avanzar con fixtures, helpers de cálculo, validaciones y pantallas mock — sin sync productivo.
- La liquidación **debe ser atómica en backend** (movement + `sale.order` + `account.payment` si aplica, todo en una transacción). El frontend **no orquesta** los tres pasos por separado: encola una sola operación `consignment_settlement` y deja que backend haga la composición.

## 1. Flujo operativo para vendedor

### Caso 1 — Cliente nuevo en consignación (DELIVERY)

1. Vendedor entra al stop del cliente.
2. Cliente acepta consignación. Vendedor toca "Consignación → Entregar".
3. Selecciona productos y cantidades del catálogo del camión.
4. Captura observaciones opcionales.
5. Confirma con resumen ("vas a dejar X cajas a este cliente, sin cobro hoy").
6. Operación entra en cola de sync. Stock del camión baja localmente. Saldo de consignación del cliente sube localmente.
7. Backend congela el `precio_unitario_congelado` por línea (precio del pricelist vigente al momento de la entrega) — ese precio es el que aplicará en la futura liquidación.

### Caso 2 — Visita a cliente con saldo (SETTLEMENT / liquidación)

1. Vendedor entra al stop. Ve "Saldo consignación: 24 cajas".
2. Toca "Consignación → Liquidar".
3. Pantalla muestra una tabla SKU por SKU con `saldo_inicial` precargada **del servidor** (servidor es fuente de verdad).
4. Para cada producto el vendedor captura:
   - `conteo_fisico_en_cliente` — lo que cuenta físicamente al llegar, **antes de mover producto**.
   - `producto_devuelto` — parte del conteo que recoge para el camión.
   - `merma` — lo que falta y se autoriza como pérdida.
   - `producto_nuevo_dejado` — cantidad nueva que deja al cliente.
5. Sistema calcula automáticamente:
   - `producto_vendido = saldo_inicial - conteo_fisico_en_cliente - merma`
   - `saldo_final = conteo_fisico_en_cliente - producto_devuelto + producto_nuevo_dejado`
   - `importe_a_cobrar = sum(producto_vendido × precio_unitario_congelado)` — precio del momento de entrega, no del día de liquidación.
6. Vendedor revisa resumen, captura firma + fotos de evidencia.
7. Confirma. **Frontend encola UNA sola operación** `consignment_settlement` (no DAG de tres). Backend la procesa atómicamente: crea movement + (si `producto_vendido > 0`) `sale.order` + (si se cobró efectivo en la visita) `account.payment`, todo en una transacción. Si algo falla, rollback completo en backend.
8. Stock del camión local: `+ producto_devuelto`, `- producto_nuevo_dejado`. Saldo consignación del cliente recalculado tras respuesta del backend.

### Caso 3 — Recolección final (PICKUP)

Como liquidación con `producto_nuevo_dejado = 0`. Resultado: `saldo_final = conteo_fisico_en_cliente - producto_devuelto`. Si la intención es cerrar el acuerdo, `producto_devuelto = conteo_fisico_en_cliente` para dejar saldo en cero.

### Caso 4 — Mismatch entre app y servidor

Si el `saldo_inicial` que la app trae en cache no coincide con el que el servidor tiene al momento de la liquidación:

- **Servidor manda**.
- Backend responde con `mismatch: true` y devuelve el saldo correcto.
- Frontend muestra **flujo de ajuste / aprobación**: explica al vendedor que el saldo cambió, ofrece re-capturar `conteo_fisico_en_cliente` con el saldo correcto, o cancelar y reintentar.
- No se completa la liquidación con datos divergentes.

## 2. Pantallas necesarias

| Ruta | Pantalla | Propósito |
|------|----------|-----------|
| `app/stop/[stopId].tsx` (modificada) | acción nueva "Consignación" | Entrada al flujo si `partner.has_consignment` |
| `app/consignment/[partnerId].tsx` | Dashboard del cliente | Saldo total, historial reciente, CTAs grandes |
| `app/consignment/deliver/[partnerId].tsx` | Form entrega | Selecciona productos+qty para dejar |
| `app/consignment/settle/[partnerId].tsx` | Form liquidación | Tabla SKU × captura física, con manejo de mismatch |
| `app/consignment/history/[partnerId].tsx` | Historial | Listado paginado de movimientos pasados |

## 3. Campos por pantalla

### Dashboard `consignment/[partnerId]`

Solo lectura: `partner_name`, total saldo, total kg, total valor, `last_movement_at`, lista resumida de productos con saldo.

### Form entrega `consignment/deliver/[partnerId]`

Editable: lista de líneas `{product_id, qty}` (qty = `producto_nuevo_dejado`), `notes` (opcional).
Auto-calculado: total kg, total productos, qty disponible en camión por línea (validación).
Backend asigna `precio_unitario_congelado` por línea al momento de crear la entrega.

### Form liquidación `consignment/settle/[partnerId]`

Una línea por SKU con saldo o que se va a dejar nuevo:

| Campo | Tipo | Origen | Editable | Default |
|-------|------|--------|----------|---------|
| `product_id` | int | catálogo | NO (excepto líneas nuevas) | — |
| `saldo_inicial` | decimal | servidor (autoritativo) | NO | del saldo del cliente |
| `precio_unitario_congelado` | decimal | servidor (de la entrega original) | NO | del lote correspondiente |
| `conteo_fisico_en_cliente` | decimal | captura | SÍ | `saldo_inicial` |
| `producto_devuelto` | decimal | captura | SÍ | 0 |
| `merma` | decimal | captura | SÍ | 0 |
| `producto_nuevo_dejado` | decimal | captura | SÍ | 0 |
| `producto_vendido` | decimal | calculado | NO | — |
| `saldo_final` | decimal | calculado | NO | — |
| `subtotal` | decimal | calculado | NO | `producto_vendido × precio_unitario_congelado` |

Footer: total `producto_vendido` (qty + kg), `importe_a_cobrar`, `payment_method` (efectivo / crédito / pendiente), `signature_uri`, `evidence_photos[]`, `notes`.

### Historial `consignment/history/[partnerId]`

Lista paginada por fecha desc. Cada item: tipo, fecha, vendedor responsable, total qty, total amount, link a detalle.

## 4. Modelo de datos frontend (`src/types/consignment.ts`)

```ts
export type ConsignmentMovementType = 'delivery' | 'settlement' | 'pickup';

export interface ConsignmentBalance {
  partner_id: number;
  company_id: number;            // backend agrupa saldo por partner+company
  partner_name: string;
  by_product: Array<{
    product_id: number;
    product_name: string;
    qty: number;                 // saldo vivo
    weight_kg: number;
    last_unit_price: number;     // último precio congelado conocido
  }>;
  total_qty: number;
  total_kg: number;
  total_value: number;
  last_movement_at: string | null;
}

export interface ConsignmentMovementLine {
  product_id: number;
  saldo_inicial?: number;
  precio_unitario_congelado?: number;  // del lote correspondiente, fijado en delivery
  conteo_fisico_en_cliente?: number;
  producto_devuelto?: number;
  merma?: number;
  producto_nuevo_dejado?: number;
  producto_vendido?: number;     // calculado: saldo_inicial - conteo_fisico_en_cliente - merma
  saldo_final?: number;          // calculado: conteo_fisico_en_cliente - producto_devuelto + producto_nuevo_dejado
  subtotal?: number;             // producto_vendido × precio_unitario_congelado
}

export interface ConsignmentMovement {
  id: string;                    // local UUID, también idempotency key
  type: ConsignmentMovementType;
  partner_id: number;
  company_id: number;
  employee_id: number;           // vendedor responsable de este movimiento
  date: string;                  // ISO
  warehouse_id: number;          // del camión
  lines: ConsignmentMovementLine[];
  importe_a_cobrar?: number;
  payment_method?: 'cash' | 'credit' | 'pending' | null;
  amount_paid_now?: number;      // 0 si crédito o pendiente; igual a importe si cash
  notes?: string;
  signature_uri?: string;
  evidence_photos?: string[];
}

export interface ConsignmentHistoryEntry {
  id: number;                    // server id
  type: ConsignmentMovementType;
  date: string;
  employee_name: string;         // vendedor responsable
  total_qty: number;
  total_amount: number;
  state: 'draft' | 'confirmed' | 'cancelled';
}

export interface ConsignmentSettlementResponse {
  movement_id: number;
  sale_id: number | null;        // null si producto_vendido = 0
  payment_id: number | null;     // null si no se cobró en la visita
  balance: ConsignmentBalance;   // saldo nuevo tras la liquidación
  user_message: string;
  mismatch?: boolean;            // true si el saldo en cache estaba desactualizado
}
```

Store nuevo: `src/stores/useConsignmentStore.ts` con:

- `balanceByPartner: Record<number, ConsignmentBalance>`
- `historyByPartner: Record<number, ConsignmentHistoryEntry[]>`
- `loadBalance(partnerId)`, `loadHistory(partnerId)`
- `optimisticUpdateBalance(partnerId, delta)` para sync optimista
- `revertBalance(partnerId, delta)` para rollback

## 5. Modelo de datos backend (recomendación de Sebastián)

> Sebastián decide la estructura final. Esta es la propuesta alineada con su recomendación del 2026-04-29.

### Módulo recomendado: `gf_consignment_ops`

- Módulo Odoo **separado**, controlador propio.
- **No** meterlo en `gf_api.py`.
- **No** seguir creciendo `gf_logistics_ops`.
- Reusa el auth móvil existente: `gf_employee_token` + headers GF (`Api-Key`, `X-GF-Employee-Token`, `X-GF-Token`).

### `gf.consignment.agreement`

Cabecera del acuerdo. Aquí viven las **reglas comerciales y límites** (no en `res.partner`).

- `partner_id` (M2O `res.partner`)
- `company_id` (M2O `res.company`)
- `default_employee_id` (M2O `hr.employee`, opcional, vendedor por defecto)
- `state`: draft / active / closed
- `start_date`, `close_date`
- `merma_tolerance_pct` (Float)
- `credit_limit` (Float, opcional)
- `notes`

### `gf.consignment.movement` (ledger inmutable)

Cabecera de cada operación. **Ledger inmutable** — una vez confirmado, no se edita; los ajustes se hacen como movimientos compensatorios.

- `agreement_id` (M2O)
- `partner_id`, `company_id` (denormalizados para reportes)
- `type`: delivery / settlement / pickup
- `date`, `employee_id` (vendedor **responsable** del movimiento), `warehouse_id`
- `state`: draft / confirmed / cancelled
- `importe_a_cobrar` (Float)
- `amount_paid_now` (Float)
- `payment_method`: cash / credit / pending
- `linked_sale_id` (M2O `sale.order`, set por backend en la transacción atómica de settlement)
- `linked_payment_id` (M2O `account.payment`, set por backend solo si se cobró en la visita)
- `signature_attachment_id`, `evidence_attachment_ids` (M2M `ir.attachment`)
- `client_operation_id` (Char, idempotency desde frontend)
- `notes`

### `gf.consignment.movement.line`

- `movement_id` (M2O)
- `product_id` (M2O)
- `saldo_inicial`, `conteo_fisico_en_cliente`, `producto_devuelto`, `merma`, `producto_nuevo_dejado`
- `producto_vendido` (Computed Stored)
- `saldo_final` (Computed Stored)
- `precio_unitario_congelado` (Float, capturado al momento de la entrega original — ver sección 6)
- `subtotal` (Computed Stored)
- `delivery_lot_id` (M2O `gf.consignment.movement.line`, link a la línea de delivery original — para resolver FIFO/promedio/lote ver Sección 7)

### `gf.consignment.balance` (snapshot materializado)

Saldo vivo por (partner, company, product). Recalculado automáticamente por el módulo cada vez que se confirma un movimiento. **No se edita manualmente** — siempre es derivado del ledger.

- `partner_id` (M2O)
- `company_id` (M2O)
- `product_id` (M2O)
- `qty` (Float)
- `last_unit_price` (Float, último precio congelado)
- `last_movement_id` (M2O)
- Restricción de unicidad: `(partner_id, company_id, product_id)`

### `res.partner` — extensiones mínimas

- `has_consignment` (Boolean)
- `consignment_default_employee_id` (M2O `hr.employee`, opcional)

**Nada más vive en `res.partner`**. Las reglas comerciales (límites, merma autorizada, etc.) viven en `gf.consignment.agreement`.

## 6. Endpoints (POST JSON, según Sebastián)

Bajo el módulo `gf_consignment_ops`. **Todos POST con body JSON**, no GET con path params.

| Método | Path | Body | Respuesta | Estado |
|--------|------|------|-----------|--------|
| POST | `/gf/logistics/api/employee/consignment/balance` | `{partner_id, company_id}` | `ConsignmentBalance` | propuesto |
| POST | `/gf/logistics/api/employee/consignment/history` | `{partner_id, company_id, limit, offset, from?, to?}` | `{items: ConsignmentHistoryEntry[], next_offset}` | propuesto |
| POST | `/gf/logistics/api/employee/consignment/delivery/create` | `{partner_id, company_id, mobile_location_id, lines, notes, client_operation_id}` | `{movement_id, balance, user_message}` | propuesto |
| POST | `/gf/logistics/api/employee/consignment/settlement/create` | `{partner_id, company_id, mobile_location_id, lines, signature_b64, evidence_b64[], notes, payment_method, amount_paid_now, client_operation_id}` | `ConsignmentSettlementResponse` | propuesto |
| POST | `/gf/logistics/api/employee/consignment/pickup/create` | igual a settlement con `producto_nuevo_dejado=0` por línea | igual a settlement | propuesto |

Headers obligatorios para todos: `Api-Key`, `X-GF-Employee-Token`, `X-GF-Token`.

### Atomicidad de `settlement/create`

Operación atómica server-side dentro de **una sola transacción**:

1. Crear `gf.consignment.movement` (estado draft).
2. Validar `saldo_inicial` contra `gf.consignment.balance` actual. Si no coincide → responder `mismatch: true` con saldo correcto. **No avanzar.**
3. Si `producto_vendido > 0`: crear `sale.order` linkeado.
4. Si `payment_method === 'cash'` y `amount_paid_now > 0`: crear `account.payment` linkeado.
5. Confirmar movement (state → confirmed) y recalcular `gf.consignment.balance`.

Si **cualquiera** falla, rollback completo. Frontend recibe error y la cola reintenta.

## 7. Precio congelado al momento de entrega

Decisión aceptada con Sebastián (2026-04-29):

- **La consignación se liquida al precio congelado al momento de la entrega.** No al pricelist vigente del día de liquidación.
- `delivery/create` guarda `precio_unitario_congelado` por línea, capturado del pricelist vigente al momento de la entrega.
- `settlement/create` usa ese precio congelado para calcular `subtotal` por línea.

### Pregunta abierta para Sebastián — varias entregas del mismo SKU con distintos precios

Si el cliente tiene saldo de un mismo SKU compuesto por varias entregas (ej. 4 cajas a $100 + 6 cajas a $110 = saldo total 10 cajas), ¿cómo se determina qué precio aplica a cada caja consumida en una liquidación parcial?

**Opciones**:

1. **FIFO** (first in, first out): primero se consume el lote más antiguo. Recomendado por **auditabilidad**.
2. **Promedio ponderado**: cada caja consumida cuesta el promedio de los lotes activos.
3. **Lote específico**: el vendedor (o backend) elige el lote a consumir.

**Recomendación inicial de la spec**: FIFO. Razón: deja trazabilidad línea a línea (qué entrega exacta se está liquidando), facilita la auditoría y es la regla más simple de explicar al vendedor.

**Decisión final**: pendiente de Sebastián.

## 8. Saldo por (partner, company), no por (partner, vendedor)

- El saldo de consignación es del **cliente con la compañía**, no del cliente con el vendedor.
- **Cualquier vendedor con permiso** puede liquidar el saldo de un cliente, no solo el que originalmente entregó.
- El **vendedor responsable** queda registrado en cada `gf.consignment.movement` (campo `employee_id`), para trazabilidad y reportes.
- Esto permite cubrir caso de cambio de vendedor entre entrega y liquidación, y vacaciones / rotaciones.

## 9. Venta y cobro automáticos

Manejo del cobro en `settlement/create`:

| Caso | `producto_vendido` | Cash en visita | `sale.order` automática | `account.payment` automático | Notas |
|------|--------------------|--------------------|--------------------------|------------------------------|-------|
| Solo entrega | 0 | n/a | NO | NO | Es un pickup o re-entrega sin consumo |
| Consumió pero pagará después | > 0 | NO | SÍ | NO | Se crea factura / venta a crédito; cobro queda pendiente |
| Consumió y pagó efectivo en visita | > 0 | SÍ | SÍ | SÍ | Frontend manda `payment_method=cash` y `amount_paid_now` |

- **Venta automática**: SÍ siempre que `producto_vendido > 0`.
- **Cobro automático**: SÍ solo si efectivamente se cobró en la visita. Frontend lo indica con `payment_method` y `amount_paid_now`.
- Si el pago queda **pendiente o crédito**, el frontend lo marca explícitamente. La `sale.order` se crea pero `account.payment` NO.

## 10. Integración con sync offline

Tipo nuevo en `src/types/sync.ts`:

- `consignment_delivery` (P1)
- `consignment_settlement` (P1)
- `consignment_pickup` (P1)

`src/stores/useSyncStore.ts` agrega los tres casos en el switch de `processSyncItem`. **Cada operación es una sola entrada en la cola** — no hay DAG porque la atomicidad la maneja backend. Rollback equivalente al de `sale_order` (restaurar stock local en caso de dead).

## 11. Validaciones por campo

| Validación | Mensaje al vendedor |
|------------|---------------------|
| `saldo_inicial >= 0` | (no debería pasar — viene del backend) |
| `conteo_fisico_en_cliente >= 0` | "Conteo no puede ser negativo" |
| `producto_devuelto >= 0` | "Devolución no puede ser negativa" |
| `merma >= 0` | "Merma no puede ser negativa" |
| `producto_nuevo_dejado >= 0` | "Cantidad nueva no puede ser negativa" |
| `conteo_fisico_en_cliente <= saldo_inicial` | "Cliente tiene más producto del que debería. Confirma con supervisor." (autorizable) |
| `producto_devuelto <= conteo_fisico_en_cliente` | "No puedes recoger más de lo que hay" |
| `producto_vendido >= 0` | (calculado — si sale negativo, error de captura, bloquear) |
| `saldo_final >= 0` | (calculado — bloquear si negativo) |
| `producto_nuevo_dejado <= stock_disponible_camion` | "No tienes suficiente producto en el camión" |
| `merma > merma_tolerance_pct (del agreement)` | "Merma alta — requiere autorización del supervisor" (gating con permiso) |
| `signature_uri` requerido si `importe_a_cobrar > 0` | "Falta firma del cliente" |
| `payment_method` requerido si `producto_vendido > 0` | "Indica si cobraste en efectivo, crédito o pendiente" |
| `amount_paid_now <= importe_a_cobrar` | "Monto cobrado no puede ser mayor al importe" |
| Idempotencia | enforced por `client_operation_id` (UUID local) |
| `partner.has_consignment === true` | "Este cliente no maneja consignación" |

## 12. Manejo de errores

Mismo patrón que `gift` y `sale`:

- Errores de red → cola encolada, retry con backoff.
- Errores 4xx → `normalizeConsignmentErrorMessage` con mapping de códigos a mensajes humanos.
- Caso especial `mismatch: true` → no marca como dead; redirige a flujo de ajuste descrito en sección 1, caso 4.
- Rollback automático tras `MAX_RETRIES` (3) que restaura stock + saldo.
- Si la liquidación falla a nivel transaccional en backend, **no hay venta ni payment** colgados (lo asegura la atomicidad). Frontend reintenta limpio.

## 13. Casos borde

- **Cliente cambia de vendedor entre entrega y liquidación**: el saldo es del partner+company, cualquier vendedor con permiso puede liquidar. El movement registra al vendedor responsable de cada operación específica.
- **Producto descontinuado entre entrega y liquidación**: la línea aparece en el saldo y se permite liquidar (devolver / cobrar consumido). No se permite agregar nueva qty.
- **Pricelist cambió entre entrega y liquidación**: irrelevante — la liquidación usa `precio_unitario_congelado` capturado en la entrega.
- **Sin red durante varias visitas**: cola crece. Stock local se va recalculando. Cuando reconecta, drena.
- **Conflicto de saldo entre app y servidor**: ver caso 4 de sección 1. Servidor manda; app muestra ajuste.
- **Cliente devuelve más de lo que tenía** (debería ser imposible): bloquear en validación cliente y servidor.
- **Merma > saldo_inicial**: imposible matemáticamente — bloquear.
- **Múltiples entregas del mismo SKU con precios distintos**: aplicar regla de la sección 7 (FIFO recomendado, decisión final de Sebastián).

## 14. Qué se puede hacer SOLO en frontend (mientras backend no esté listo)

- Pantallas + tipos + store (con fixtures locales para QA visual).
- Validaciones de form, fórmulas, cálculos.
- Wireframes navegables sin red.
- Tests TDD de validaciones y cálculos puros.

**No** se puede hacer sin backend: sync productivo, persistencia real de saldos, generación de venta/cobro, historial real, atomicidad de settlement.

## 15. Qué REQUIERE backend / Odoo

- Módulo `gf_consignment_ops` con modelos, controladores y migraciones.
- Endpoints REST POST JSON listados en sección 6.
- ACLs (driver puede leer su propio saldo y el de partners en su ruta; supervisor puede leer todos).
- Configuración del campo `has_consignment` en `res.partner`.
- Lógica atómica que cree movement + `sale.order` + `account.payment` desde la liquidación.
- Reportes Odoo de saldo por cliente y por vendedor responsable.
- Resolución FIFO / promedio / lote de precio congelado (decisión pendiente).

## 16. Qué debe revisar Sebastián

- Estructura final de tablas `gf.consignment.*` (sección 5).
- Forma exacta del payload de cada endpoint POST (sección 6).
- Algoritmo final de imputación de precio cuando hay varias entregas del mismo SKU (sección 7): FIFO vs promedio ponderado vs lote específico.
- Campos exactos de `gf.consignment.agreement` (qué reglas comerciales se modelan ahí: límite de crédito, tolerancia de merma, etc.).
- Detalles de la transacción atómica de `settlement/create` (orden de operaciones, qué se hace antes del lock, etc.).

## 17. Validación de fórmulas — ejemplo numérico

**Escenario**: cliente "Abarrotes Don Lalo" con saldo de 10 cajas de un SKU. El vendedor llega y:

| Campo | Valor |
|-------|-------|
| `saldo_inicial` | 10 |
| `conteo_fisico_en_cliente` | 6 |
| `producto_devuelto` | 2 |
| `producto_nuevo_dejado` | 5 |
| `merma` | 0 |

Aplicación de fórmulas:

```
producto_vendido = saldo_inicial - conteo_fisico_en_cliente - merma
                 = 10 - 6 - 0
                 = 4

saldo_final      = conteo_fisico_en_cliente - producto_devuelto + producto_nuevo_dejado
                 = 6 - 2 + 5
                 = 9
```

Verificación de balance de masa (sanity check, no es campo persistido):

| Cantidad | Origen | Destino |
|----------|--------|---------|
| 10 | `saldo_inicial` (cliente) | — |
| 4 | `producto_vendido` | consumido / cobrable |
| 0 | `merma` | pérdida |
| 6 | físico al llegar | distribuido entre devuelto + queda |
| 2 | de los 6, devuelto | camión |
| 4 | de los 6, queda | cliente |
| 5 | `producto_nuevo_dejado` | cliente (sale del camión) |
| 9 | `saldo_final` | cliente |

Cliente: 10 (inicial) − 4 (vendido) − 0 (merma) − 2 (devuelto al camión) + 5 (nuevo) = **9** ✅
Camión neto: +2 (recibe devolución) − 5 (entrega nuevo) = **−3** (sale del camión)

**Importe a cobrar**: si el SKU tiene `precio_unitario_congelado = $100` (de la entrega original), entonces `importe_a_cobrar = 4 × 100 = $400`.

## 18. Nota sobre interpretación alternativa

Algunas operaciones de campo definen "conteo físico" como **lo que queda con el cliente DESPUÉS** de retirar la devolución, no antes. Si se adoptara esa convención, las fórmulas se vuelven:

```
producto_vendido = saldo_inicial - (conteo_fisico_en_cliente + producto_devuelto) - merma
saldo_final      = conteo_fisico_en_cliente + producto_nuevo_dejado
```

**No se recomienda esta convención para campo** porque:

1. El vendedor cuenta primero, luego decide qué se lleva. Si se le pide capturar el conteo "después" de decidir, se pierde el dato del estado real.
2. Confunde al vendedor — el "conteo" debería ser un hecho objetivo, no afectado por una decisión posterior.
3. Hace más difícil auditar discrepancias.

**Convención adoptada en esta spec**: `conteo_fisico_en_cliente` = lo que el vendedor cuenta físicamente al llegar, **antes** de mover producto.

## 19. Responsabilidades

### Claude / frontend (cuando se apruebe implementación)

- Pantallas (`app/consignment/*`).
- Tipos (`src/types/consignment.ts`).
- Helpers de cálculo (`consignmentMath`).
- Validaciones de form y de payload.
- Store (`useConsignmentStore`).
- Integración con la cola de sync — **una sola operación por flujo** (delivery / settlement / pickup), no DAG.
- UX para vendedor en ruta: botones grandes, tabla legible, alertas claras.
- Manejo del caso `mismatch: true` con flujo de ajuste / aprobación.
- Tests TDD de helpers, validaciones, wiring.

### Sebastián / backend / Odoo

- Módulo `gf_consignment_ops` (controlador separado, no dentro de `gf_api.py` ni de `gf_logistics_ops`).
- Modelos Odoo (`gf.consignment.agreement`, `.movement`, `.movement.line`, `.balance`).
- Endpoints REST POST JSON (sección 6).
- ACLs / permisos por grupo.
- **Idempotencia server-side** por `client_operation_id`.
- **Creación atómica** de `movement + sale.order + account.payment` en `settlement/create`.
- Pricelists y captura de **precio congelado** al momento de la entrega.
- Algoritmo de imputación cuando hay varias entregas (FIFO recomendado).
- Reconciliación de saldos divergentes (responder `mismatch` con saldo correcto).
- Reglas de merma y autorización (almacenadas en `gf.consignment.agreement`).
- Campo `has_consignment` (y opcional `consignment_default_employee_id`) en `res.partner`.
- Reportes Odoo: saldo por (cliente, compañía) y movimientos por vendedor responsable.

## 20. Plan de implementación (cuando se apruebe)

Misma metodología TDD que `gift` (ver `docs/superpowers/plans/2026-04-26-regalo-muestra.md`):

1. **Task 1**: tipos + helpers puros + tests (`consignmentMath`, `consignmentValidation`, `consignmentPayload`).
2. **Task 2**: services REST (`gfConsignment.ts`) + store (`useConsignmentStore.ts`).
3. **Task 3**: action en `stop/[stopId]` + dashboard `consignment/[partnerId]`.
4. **Task 4**: pantalla delivery + form + tests wiring.
5. **Task 5**: pantalla settlement con tabla, signature, photos + manejo de `mismatch`.
6. **Task 6**: integración sync queue (3 nuevos tipos + rollback).
7. **Task 7**: pantalla history + paginación.
8. **Task 8**: integración con `newcustomer` (checkbox `has_consignment`).
9. **Task 9**: validación end-to-end con backend de Sebastián.
10. **Task 10**: documentación de usuario para vendedores.

Estimación rough: 5–8 días de frontend cuando el backend esté listo. Si el backend tarda, los Tasks 1–7 se pueden hacer con fixtures sin bloquear, pero **no se mergea a main hasta que haya contrato backend validado**.
