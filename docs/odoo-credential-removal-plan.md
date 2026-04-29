# Plan de eliminación de credenciales Odoo del cliente móvil

> **Estado**: plan informativo. **No implementado.**
> **Fecha**: 2026-04-29
> **Owner frontend**: Yamil + Claude
> **Owner backend Odoo**: Sebastián
>
> Este documento es la versión accionable del hallazgo H-001 descrito en [`security-findings.md`](security-findings.md).

## 1. Contexto

- En la auditoría de seguridad se detectó usuario y contraseña Odoo embebidos en el bundle JS de la app móvil (`app/_layout.tsx:70` y `:118`, vía `setServiceCredentials`).
- Sebastián confirmó (2026-04-29) que el backend ya cuenta con flujos seguros autenticados por `gf_employee_token` para precios, stock y ventas.
- **Objetivo de este plan**: eliminar las credenciales Odoo del cliente móvil sustituyendo cada llamada directa a Odoo (vía cuenta de servicio) por el endpoint REST seguro correspondiente.
- **Este documento NO ejecuta la eliminación**. Solo deja el inventario, plan, criterios y estrategia listos para ejecución posterior con autorización explícita.

## 2. Inventario a realizar

Patrones a buscar en el código del cliente móvil (`app/`, `src/`):

- `setServiceCredentials`
- `odooRpc`
- `odooSession`
- `/web/dataset/call_kw`
- `direccion@grupofrio.mx`
- Strings literales sensibles: `password`, `passwd`, `token`, `apiKey`, `Api-Key`

## 3. Comandos sugeridos

> **No imprimir secretos completos** en logs ni documentación. Si un grep devuelve un valor real, redactarlo (`[REDACTED]`) antes de pegarlo a cualquier doc, ticket o commit.

```bash
# Patrones de la cuenta de servicio + Odoo legacy
grep -rn "setServiceCredentials\|odooRpc\|odooSession\|call_kw\|direccion@grupofrio.mx" app src

# Otros candidatos a secreto (auditoría amplia)
grep -rn "password\|passwd\|token\|apiKey\|Api-Key" app src
```

## 4. Tabla de mapeo (a llenar en Fase 1)

Plantilla. Llenar una fila por cada uso real detectado durante la búsqueda.

| Archivo | Símbolo / función | Dato requerido | Endpoint actual | Endpoint seguro sustituto | ¿Existe hoy? | Responsable | Riesgo | Decisión |
|---------|-------------------|----------------|------------------|---------------------------|--------------|-------------|--------|----------|
| `app/_layout.tsx:70` | `setServiceCredentials` | login admin Odoo | — (configura credenciales) | — (eliminar) | n/a | Yamil/Claude | Alto | Eliminar tras Fase 3 |
| `app/_layout.tsx:118` | `setServiceCredentials` | login admin Odoo | — | — | n/a | Yamil/Claude | Alto | Eliminar tras Fase 3 |
| `src/services/odooRpc.ts` | (a inventariar funciones internas) | sesión web admin | `/web/dataset/call_kw` | depende del flujo | parcial | Yamil/Claude | Alto | Reemplazar uso por uso |
| `src/services/odooSession.ts` | `clearOdooSession`, `setServiceCredentials`, etc. | sesión web admin | — | — | n/a | Yamil/Claude | Medio | Eliminar tras Fase 3 |
| ...filas adicionales según inventario... | | | | | | | | |

> Esta tabla se llena durante Fase 1 después de ejecutar los grep. Cada fila representa un uso concreto que hay que migrar antes de poder eliminar la credencial.

## 5. Sustitutos esperados (según Sebastián)

| Necesidad | Endpoint seguro |
|-----------|-----------------|
| Catálogo + stock del camión | `truck_stock` |
| Precios por cliente | `pricing/by_partner` |
| Crear venta (server-side pricing) | `sales/create` (recalcula precios; ignora `price_unit` enviado por el cliente) |
| Pricelist por parada | viene en el payload de `stop` / `route` (`pricelist_id`, `pricelist_name`) |

Headers para todos: `Api-Key`, `X-GF-Employee-Token`, `X-GF-Token` — los mismos que usa el resto de la app.

## 6. Estrategia de refactor

- **Cambiar una pantalla / flujo a la vez** para acotar el blast radius.
- Mantener tests verdes en cada PR (o documentar el baseline pre-existente que ya rompe).
- **No romper la venta**: cualquier cambio en el camino de pricing o `sale_order` requiere validación end-to-end con backend antes de mergear.
- Validar offline / sync: la cola de sync no debe romperse.
- Considerar feature flag (e.g. `EXPO_PUBLIC_USE_SECURE_PRICING`) si conviene poder hacer rollback rápido en piloto.
- Probar con APK preview en device real **antes** de cualquier rollout a vendedores.

## 7. Criterios de aceptación

- [ ] No queda `setServiceCredentials` con password en `app/`.
- [ ] No queda password literal en `app/` o `src/`.
- [ ] No hay llamadas directas a `/web/dataset/call_kw` desde el móvil salvo justificación documentada.
- [ ] Precios se obtienen por endpoint seguro autenticado con `gf_employee_token`.
- [ ] Ventas siguen usando cálculo server-side (`sales/create`).
- [ ] Tests pasan, o el baseline pre-existente queda documentado y no empeora.
- [ ] APK preview permite el flujo mínimo de venta sin la cuenta de servicio.
- [ ] Sebastián confirma que se puede rotar / restringir la credencial antigua sin romper nada.

## 8. Fuera de alcance

- Rotar la credencial **desde código**.
- Cambios en backend / Odoo (los hace Sebastián si hace falta).
- Cambios en GCP (Google Maps, etc.).
- Implementar el módulo de consignación.

## 9. Plan por fases

| Fase | Acción | Owner | Salida |
|------|--------|-------|--------|
| 1 | Inventario exacto de usos en frontend | Claude / Yamil | Tabla de mapeo (sección 4) llena |
| 2 | Confirmar sustituto por cada uso | Yamil + Sebastián | Columna "Endpoint sustituto" decidida |
| 3 | Reemplazar llamadas directas a Odoo por endpoints seguros | Claude / Yamil | PRs por flujo |
| 4 | Eliminar `setServiceCredentials` y password del bundle | Claude / Yamil | PR final que cierra el hallazgo H-001 |
| 5 | Coordinar rotación o restricción de la credencial antigua | Yamil + Sebastián / dirección | Confirmación operativa |
| 6 | Test guard que falle si reaparece una service credential hardcoded | Claude / Yamil | Test en suite (ej. en `tests/securityGuards.test.mjs`) |

## 10. Métricas de éxito

- Bundle JS auditado por descompresión del APK preview no contiene la cadena `direccion@grupofrio.mx` ni el password literal.
- Login y venta siguen funcionando en device físico tras el cambio.
- 0 regresiones en el flujo de pricing del cliente.
- Sebastián confirma actividad esperada de la cuenta antigua después de la rotación (debería caer a 0 o quedar restringida).
