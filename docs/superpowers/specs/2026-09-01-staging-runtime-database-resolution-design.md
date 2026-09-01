# App Ventas - resolucion segura de DB de staging

**Fecha:** 2026-09-01  
**Estado:** Diseno aprobado; pendiente de implementacion  
**Alcance:** solo `app_ventas_grupofrio`, ambiente `staging`. Produccion no se modifica.

## Objetivo

Evitar que la app de staging mantenga una DB fija de Odoo y garantizar que ninguna operacion de escritura se ejecute si la identidad del backend no esta confirmada.

La identidad de backend se compone de:

- ambiente Expo: `staging`
- host configurado para staging
- DB activa resuelta en tiempo de ejecucion

## Contrato externo

El backend expondra una ruta publica, estrictamente de lectura:

```http
GET /current_database
Accept: application/json
```

Respuesta valida:

```json
{ "db": "grupofrio-gf-staging280826-37235488" }
```

Errores esperados:

- `503` con `DATABASE_UNAVAILABLE` cuando no sea posible resolver la DB.
- `500` para fallo interno inesperado.
- Cualquier respuesta no JSON, DB vacia o estructura distinta se considera no verificada.

El endpoint no requiere sesion ni credenciales y no debe crear datos. La garantia de que el host corresponda al build correcto de Odoo.sh depende de la asignacion externa de `odoo-staging.grupofrio.com`.

## Decision

Se adopta una politica estricta para staging:

1. La DB se consulta antes del login mediante `GET <baseUrl>/current_database`.
2. El valor se mantiene solamente en memoria para la sesion actual; no se persiste en SecureStore ni se incorpora como DB fija en un build.
3. El login y las llamadas Odoo de staging usan la DB resuelta para esa sesion.
4. Las operaciones con escritura requieren una identidad verificada.
5. Si la identidad no se puede verificar, la app debe impedir crear o modificar datos y explicar el motivo.

No se usara una DB fija como fallback. Un fallback haria que un rebuild de Odoo.sh pudiera dirigir operaciones hacia una DB anterior o equivocada.

## Arquitectura propuesta

### Resolucion de identidad

Un modulo aislado resolvera y validara el backend de staging. Recibira la URL configurada, llamara a `current_database` y producira un estado tipado:

- `verified`: ambiente staging, host permitido y DB no vacia resuelta por el endpoint.
- `unverified`: endpoint inaccesible, error HTTP, JSON invalido, DB invalida o host no permitido.

El estado incluira host efectivo, DB, momento de resolucion y razon de fallo, sin secretos.

### Integracion con sesion

La capa de autenticacion recibira la DB resuelta para el intento de login. El flujo existente de produccion conserva su comportamiento y valores actuales; no consulta `current_database` como parte de este bloque.

Al cerrar sesion, reiniciar la app o cambiar la URL de staging, se invalida el estado en memoria. La siguiente sesion debe resolver nuevamente la DB.

### Guarda de escritura

Las operaciones de venta, pago y cualquier mutacion Odoo pasan por una guarda comun antes de salir a red. La guarda solo permite continuar si el estado es `verified`.

Esto se aplica exclusivamente a staging. Si el backend todavia devuelve `500`, la app puede mostrar diagnostico y permitir navegacion de lectura que no dependa de autenticacion, pero no puede ejecutar una escritura.

### Diagnostico visible

La app staging mantiene el badge `STAGING` y agrega una vista o bloque de diagnostico accesible antes de una prueba funcional. Debe mostrar:

- ambiente
- host efectivo
- DB activa o ausencia de resolucion
- estado `Verificado` o `No verificado`
- motivo seguro del fallo, cuando exista

No se tratara el badge por si solo como prueba de que el backend es staging.

## Transicion del dominio

Mientras `odoo-staging.grupofrio.com` no exista o `current_database` responda error, no se cambia la URL de los perfiles EAS. La implementacion se prueba con mocks y no habilita escrituras reales.

Cuando Sebastian confirme DNS, HTTPS y la asignacion del dominio a la rama activa, se cambia solo la URL de los perfiles `development` y `staging`. La DB no se vuelve a fijar en configuracion de build.

## Pruebas

Pruebas unitarias sin trafico a Odoo:

- respuesta `200` con `{ "db": "..." }` valida identidad.
- `503`, `500`, timeout y error de red dejan identidad no verificada.
- JSON invalido o DB vacia dejan identidad no verificada.
- host no permitido deja identidad no verificada.
- una mutacion staging se bloquea si la identidad no esta verificada.
- la DB resuelta no se escribe en almacenamiento persistente.
- produccion mantiene su flujo actual y no usa el resolvedor.

Validacion posterior, cuando la infraestructura este lista:

1. Abrir la APK staging y confirmar host, DB y estado `Verificado`.
2. Iniciar sesion y realizar lecturas.
3. Con evidencia de host/DB, ejecutar una sola escritura controlada en staging.
4. Confirmar el resultado solamente en Odoo staging.
5. Repetir despues de un rebuild de Odoo.sh para comprobar que el mismo dominio resuelve la DB activa.

## Fuera de alcance

- Configurar DNS, dominio o ramas en Odoo.sh.
- Corregir el controlador backend `current_database`.
- PWA, Vercel u otros repositorios.
- Cambios de dominio, variables o comportamiento de produccion.
