# app_ventas - diseno de ambientes, builds y staging para React Native

**Fecha:** 2026-08-28  
**Estado:** Diseno validado en conversacion; pendiente de revision final del usuario  
**Objetivo:** definir una estrategia practica y rapida de implementar para manejar `development`, `staging` y `production` en `app_ventas`, evitando pruebas nuevas en produccion y separando con claridad la arquitectura de ambientes del proceso de releases.

## 1. Contexto

`app_ventas` es una aplicacion React Native con Expo usada en Android e iOS.

- Android se distribuye hoy por APK.
- iOS ya tiene una version operativa distribuida por TestFlight.
- El backend principal vive en Odoo.
- El equipo es pequeno: 3 personas.
- Existe o esta en proceso un ambiente de staging en Odoo.sh.
- El objetivo operativo es dejar de probar cambios nuevos directamente en produccion.

La revision del repo del 28 de agosto de 2026 confirma estos puntos:

- `app.json` declara una sola identidad nativa actual:
  - iOS `bundleIdentifier = mx.grupofrio.koldfield`
  - Android `package = mx.grupofrio.koldfield`
- `eas.json` ya tiene perfiles `development`, `preview` y `production`, pero hoy los tres apuntan al mismo backend de produccion mediante:
  - `EXPO_PUBLIC_KF_DEFAULT_BASE_URL = https://grupofrio-gf.odoo.com`
  - `EXPO_PUBLIC_KF_ODOO_DB = grupofrio-gf-main-34980678`
- El codigo ya esta preparado para leer `EXPO_PUBLIC_KF_DEFAULT_BASE_URL` y `EXPO_PUBLIC_KF_ODOO_DB`, por lo que existe una base tecnica para separar ambientes sin rehacer la capa de red.

Esto deja claro que el problema real no es solo "sacar otro build", sino separar correctamente:

1. **Arquitectura de builds/ambientes**
2. **Proceso de releases/promocion**

Esa separacion es obligatoria en esta propuesta.

## 2. Decision principal recomendada

Se recomienda manejar tres niveles distintos, con roles diferentes:

1. **`development`**
2. **`staging`**
3. **`production`**

Pero no como tres "sabores" equivalentes para negocio. La recomendacion concreta es:

- `development`: canal tecnico para desarrollo local y depuracion.
- `staging`: app instalable separada para QA interno del equipo.
- `production`: app instalable oficial para operacion real.

La recomendacion final es usar:

- **app separada para `staging`**
- **app separada para `production`**
- **`development` solo como build tecnico**, no como canal de pruebas funcionales formales

## 3. Alternativas evaluadas

### Opcion A - Recomendada

**Apps separadas para `production` y `staging`, con `development` tecnico**

Caracteristicas:

- `production` apunta solo a Odoo produccion.
- `staging` apunta solo a Odoo staging.
- `development` usa dev client o build de desarrollo y puede apuntar por defecto a staging.
- `production` y `staging` tienen distinto nombre visible, distinto icono o badge, y distinto identificador nativo.

Ventajas:

- Minimiza confusion humana.
- Permite instalar `production` y `staging` en el mismo telefono.
- Evita contaminar datos por login en ambiente equivocado.
- Hace mas claro el proceso de QA para un equipo pequeno.
- Mantiene simetria entre Android e iOS.

Costos:

- Requiere configurar bundle IDs y package names separados.
- Requiere una app de staging separada en App Store Connect / TestFlight y una variante separada en Android.
- Requiere decidir una convencion de branding por ambiente.

### Opcion B

**Una sola app con selector interno de ambiente**

Caracteristicas:

- Un binario unico cambia entre produccion y staging por config interna o selector oculto.

Ventajas:

- Menor esfuerzo inicial de configuracion nativa.
- Puede parecer mas rapido en el corto plazo.

Desventajas:

- Alto riesgo de confusion.
- Facil mezclar credenciales, sesiones y datos.
- Es dificil garantizar que una prueba se hizo en el ambiente correcto.
- Hace mas peligroso el soporte cuando alguien reporta un bug.

Veredicto:

No recomendada para `app_ventas`, porque el costo de un error operativo es mayor que el ahorro de configuracion.

### Opcion C

**Flavors/variants solo en Android y manejo especial separado para iOS**

Caracteristicas:

- Android queda bien resuelto con flavors.
- iOS se resuelve con targets/schemes o con otro flujo menos uniforme.

Ventajas:

- En Android encaja bien con APKs.

Desventajas:

- Crea dos procesos mentales distintos entre plataformas.
- Aumenta la carga operativa del equipo.
- La documentacion y la promocion de builds se vuelven mas confusas.

Veredicto:

Aceptable tecnicamente, pero inferior a una estrategia simetrica entre Android e iOS.

## 4. Recomendacion final

La recomendacion final es adoptar la **Opcion A**.

### 4.1 Arquitectura de ambientes

Se define:

- `development`
  - uso: desarrollo local, pruebas tecnicas, debugging
  - backend por defecto: Odoo staging
  - distribucion: no para usuarios finales ni QA formal
- `staging`
  - uso: QA interno de las 3 personas del equipo
  - backend: Odoo staging
  - distribucion: interna y controlada
- `production`
  - uso: operacion real
  - backend: Odoo produccion
  - distribucion: canal operativo vigente

### 4.2 Identidad por ambiente

`production` y `staging` deben ser apps distintas a nivel nativo.

Propuesta inicial:

- Android
  - `production`: `mx.grupofrio.koldfield`
  - `staging`: `mx.grupofrio.koldfield.staging`
- iOS
  - `production`: `mx.grupofrio.koldfield`
  - `staging`: `mx.grupofrio.koldfield.staging`

Nombre visible:

- `production`: `KOLD Field`
- `staging`: `KOLD Field Staging`

Branding minimo obligatorio en `staging`:

- icono con badge o marca visual `STG`
- splash distinto o con etiqueta visible
- cinta o etiqueta persistente en login o pantalla principal indicando `STAGING`
- color acento distinto del de produccion en puntos criticos

Objetivo:

- que nadie pueda confundir una captura, login o build de staging con produccion.

### 4.3 Android

Para Android se recomienda:

- mantener `production` con el flujo actual oficial
- crear una variante `staging` instalable por APK
- permitir instalar `staging` y `production` al mismo tiempo por tener distinto `applicationId`

Uso recomendado:

- `staging APK` para pruebas internas rapidas
- `production APK` o `production AAB` para release real, segun el canal vigente

### 4.4 iOS

Para iOS se recomienda:

- conservar la app actual de produccion/TestFlight para `production`
- crear una app separada en App Store Connect para `staging`
- distribuir `staging` mediante TestFlight interno

Como solo son 3 personas, no hace falta un programa complejo de testers:

- basta con testers internos controlados
- no se necesita abrir esto a negocio ni a vendedores por ahora

### 4.5 Base URL, credenciales y storage

Cada ambiente debe tener configuracion explicita y aislada:

- `development` -> Odoo staging
- `staging` -> Odoo staging
- `production` -> Odoo produccion

La app debe recibir al menos estas variables:

- `APP_ENV`
- `EXPO_PUBLIC_APP_VARIANT`
- `EXPO_PUBLIC_APP_NAME`
- `EXPO_PUBLIC_KF_DEFAULT_BASE_URL`
- `EXPO_PUBLIC_KF_ODOO_DB`

Ademas, se recomienda aislar datos locales por ambiente cuando aplique:

- sesiones
- tokens
- caches sensibles
- overrides de base URL si existen

Esto reduce el riesgo de:

- reusar un token de produccion en staging
- arrastrar configuraciones entre apps
- confundir diagnosticos locales

## 5. Separacion obligatoria: builds/ambientes vs releases

### 5.1 Arquitectura de builds y ambientes

Esta capa define:

- que app existe por ambiente
- que backend usa cada una
- que identidad nativa tiene
- como se ve visualmente
- como se instala junto a otras sin conflicto
- que variables y secrets usa

### 5.2 Proceso de releases

Esta capa define:

- que ramas alimentan cada build
- cuando se genera un build de staging
- quien lo prueba
- que condiciones permiten promover a produccion
- que evidencia minima se exige antes de release

Estas dos capas no deben mezclarse.

Error a evitar:

- "Tenemos `preview` en EAS, entonces ya tenemos staging".

No basta con el nombre del perfil. Si apunta al mismo backend, comparte la misma identidad o se prueba sin guardrails, no es una estrategia de staging real.

## 6. Flujo de ramas recomendado

Se recomienda un flujo simple:

- `main` -> `production`
- `develop` o `staging` -> `staging`
- feature branches -> integran primero a `develop`

Regla de promocion:

- nada nuevo pasa directo a `main` sin haber sido probado primero en `staging`

Para un equipo de 3 personas, esto es suficiente y evita sobreproceso.

## 7. Flujo de pruebas y promociones

### 7.1 Cuando generar build de staging

Generar build de `staging` cuando:

- entra una feature terminada o casi terminada
- hay un fix relevante
- cambia integracion con Odoo
- cambia login, sync o almacenamiento local
- se necesita validar algo en dispositivo real

No hace falta generar un build por cada commit.

Cadencia recomendada:

- bajo demanda
- y antes de cualquier promocion a produccion

### 7.2 Cuando promover a produccion

Promover a produccion solo si:

- el cambio ya fue probado en `staging`
- apunta al backend correcto
- no hay errores criticos abiertos
- el flujo afectado fue validado en Android y, si aplica, en iOS
- el cambio de backend requerido ya existe y fue validado en Odoo correspondiente

### 7.3 Que nunca probar en produccion

Nunca debutar directamente en produccion con:

- features nuevas
- cambios de autenticacion
- cambios de sync o colas offline
- cambios de pricing o reglas comerciales
- cambios de endpoints o contratos Odoo
- cambios de cierre, cobro, inventario o liquidacion
- migraciones de storage local
- cambios que alteren permisos nativos o comportamiento en background

Produccion solo debe recibir cambios ya validados.

## 8. Configuracion minima recomendada en el repo

### 8.1 Expo config

Se recomienda migrar de `app.json` a `app.config.ts` para poder derivar dinamicamente:

- nombre visible
- slug
- scheme
- `bundleIdentifier`
- `android.package`
- iconos/splash por ambiente
- variables `extra` por ambiente

`app.json` es suficiente para un solo ambiente fuerte, pero `app.config.ts` simplifica una estrategia multi-ambiente real.

### 8.2 EAS profiles

Se recomienda dejar perfiles claros:

- `development`
- `staging`
- `production`

Y retirar ambiguedad del perfil `preview` actual, renombrando o redefiniendolo como `staging`.

Propuesta:

- `development`
  - dev client o build tecnico
  - backend por defecto: staging
- `staging`
  - Android: APK interna
  - iOS: internal TestFlight path
  - backend: Odoo staging
- `production`
  - Android: release oficial
  - iOS: release/TestFlight de produccion
  - backend: Odoo produccion

### 8.3 Guardrails de runtime

Agregar protecciones visibles:

- etiqueta persistente de ambiente
- pantalla de diagnostico mostrando ambiente y base URL
- logs y reportes incluyendo `APP_ENV`
- nombre del build exportado siguiendo convencion fija

Convencion sugerida:

- `KOLD-Field-staging-vX.Y.Z-YYYYMMDD.apk`
- `KOLD-Field-production-vX.Y.Z-YYYYMMDD.apk`

## 9. Plan de adopcion por fases

### Fase 1 - Separacion logica

Objetivo: separar configuracion sin romper distribucion actual.

Cambios:

- introducir `APP_ENV`
- redefinir perfiles EAS
- apuntar `staging` a Odoo staging
- dejar `production` apuntando a Odoo produccion
- documentar ramas y reglas

Resultado esperado:

- ya existe distincion real de backend y proceso, aunque todavia no haya branding completo.

### Fase 2 - Separacion nativa

Objetivo: permitir coexistencia de apps y eliminar confusion.

Cambios:

- bundle ID/package name de `staging`
- nombre visible distinto
- icono/splash diferenciados
- app separada de iOS staging en App Store Connect

Resultado esperado:

- `staging` y `production` se instalan juntas sin conflicto.

### Fase 3 - Endurecimiento operativo

Objetivo: hacer que el flujo sea repetible.

Cambios:

- checklists por ambiente
- criterio de promocion `staging -> production`
- convencion fija de nombre de builds
- evidencia minima de QA

Resultado esperado:

- el equipo deja de depender de memoria o mensajes de chat para saber que build se esta probando.

### Fase 4 - Integracion con backend staging

Objetivo: consolidar el circuito completo con Odoo staging.

Cambios:

- validar endpoints clave contra Odoo staging
- definir set minimo de datos de prueba
- coordinar con el chat/backend conectado a Odoo staging solo para resolver huecos operativos o tecnicos

Resultado esperado:

- `app_ventas staging` y `Odoo staging` quedan alineados como circuito real de QA.

## 10. Decisiones tecnicas concretas pendientes

Estas decisiones deben tomarse explicitamente en el repo antes de implementar:

1. Si se migra ya a `app.config.ts`.
2. Nombre final del ambiente intermedio: `staging` o mantener `preview` solo como alias transitorio.
3. Bundle IDs y package names definitivos de staging.
4. Si `development` apunta siempre a staging o si admite override local.
5. Como se aislaran sesiones, tokens y caches entre ambientes.
6. Si el `scheme` deep link de staging tambien sera distinto.
7. Iconografia final de staging.
8. Rama que alimenta staging: `develop` o `staging`.
9. Canal exacto de distribucion de APK staging.
10. App separada en App Store Connect para iOS staging.
11. Checklist minimo obligatorio antes de promover a produccion.

## 11. Criterios de aceptacion del diseno

La estrategia queda bien definida cuando:

1. `staging` y `production` apuntan a backends distintos.
2. `staging` y `production` pueden coexistir en el mismo telefono.
3. el usuario puede identificar visualmente en que ambiente esta.
4. el equipo sabe que rama genera cada build.
5. existe un punto claro de promocion de `staging` a `production`.
6. queda prohibido probar cambios nuevos directamente en produccion.
7. el repo tiene una lista cerrada de decisiones tecnicas a implementar.

## 12. Recomendacion operativa inmediata

El siguiente paso no es tocar `main` ni hacer cambios sueltos de configuracion.

El siguiente paso recomendado es:

1. cerrar y aprobar esta spec;
2. crear el plan de implementacion tecnico separado;
3. ejecutar la implementacion en una rama dedicada, nunca en `main`;
4. si hace falta, usar el chat conectado a Odoo staging para validar datos, dominios, endpoints y restricciones reales del backend antes de fijar valores definitivos.

## 13. Estado actual del repo relevante para esta iniciativa

Al momento de escribir esta spec, el worktree revisado no esta posicionado en `main`, sino en `HEAD` desprendido. Eso evita mezclar cambios accidentalmente con `main`, pero tambien implica que cualquier implementacion posterior debe moverse primero a una rama de trabajo explicita antes de hacer configuraciones duraderas.
