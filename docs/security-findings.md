# Hallazgos de seguridad — KOLD Field

> **Documento informativo. No incluye fixes implementados.** Cada hallazgo aquí debe convertirse en un PR independiente con su propia validación. Las credenciales reales están redactadas a propósito — el repo no debe contener secretos en texto claro fuera del código fuente original auditado.
>
> Fecha de auditoría: 2026-04-29
> Branch auditada: `main` @ `cd01d4b`

## H-001 (CRÍTICO) — Credenciales de cuenta administrativa Odoo embebidas en el bundle JS

**Ubicación**: `app/_layout.tsx:70` y `app/_layout.tsx:118`

```ts
setServiceCredentials('direccion@grupofrio.mx', '[REDACTED]');
```

**Riesgo**: el bundle JS de un APK Android es trivialmente recuperable (descomprimir el APK, leer `assets/index.android.bundle`). Cualquier persona con acceso a un APK distribuido puede obtener un usuario administrativo de Odoo de producción y su contraseña. El usuario `direccion@grupofrio.mx` aparenta ser cuenta de alto privilegio.

### Respuesta de Sebastián / backend (2026-04-29)

El backend ya cuenta con flujos seguros autenticados por `gf_employee_token` para todas las lecturas y escrituras que la app móvil necesita:

| Necesidad del cliente | Endpoint seguro existente | Estado |
|-----------------------|---------------------------|--------|
| Catálogo + stock vendible del camión | `truck_stock` | Disponible |
| Precios por cliente | `pricing/by_partner` | Disponible |
| Crear venta con cálculo server-side | `sales/create` (recalcula precios; **ignora `price_unit` enviado por el cliente**) | Disponible |
| Pricelist por parada | El payload de `stop` / `route` ya incluye `pricelist_id` y `pricelist_name` | Disponible |

**Conclusión**: ya **no hay justificación funcional** para mantener usuario / contraseña Odoo en el cliente móvil. La solución correcta es eliminar la dependencia y consumir los endpoints seguros que ya existen.

### Por qué `EXPO_PUBLIC_*` NO es solución

- Las variables `EXPO_PUBLIC_*` se compilan dentro del bundle JS al hacer build. Mover el password ahí no oculta nada — sigue siendo recuperable del APK.
- `EXPO_PUBLIC_*` está pensado para valores **no sensibles**: URLs base, feature flags, build profile labels.

### Solución correcta

1. Mapear todos los usos en el frontend de la cuenta de servicio (ver tabla de búsqueda más abajo).
2. Reemplazar cada uso por el endpoint REST autenticado con `Api-Key + X-GF-Employee-Token + X-GF-Token` correspondiente, según los sustitutos confirmados por Sebastián.
3. Eliminar `setServiceCredentials` y la lógica de `odooSession` que dependa de esa cuenta.
4. Coordinar rotación o restricción de la credencial antigua con Sebastián / dirección **una vez que el cliente ya no dependa de ella**.

### Tabla de símbolos / patrones a mapear

| Patrón | Tipo | Por qué buscarlo |
|--------|------|------------------|
| `setServiceCredentials` | función | entry point de la cuenta de servicio |
| `odooRpc` | módulo / servicio | usa la cuenta de servicio para JSON-RPC |
| `odooSession` | módulo / servicio | maneja la cookie de sesión web |
| `/web/dataset/call_kw` | path Odoo legacy | requiere sesión web (la única razón por la que existe `setServiceCredentials`) |
| `direccion@grupofrio.mx` | identificador | usuario admin embebido |
| `password` / `passwd` / `apiKey` / `Api-Key` literales | string sensible | otros secretos potenciales (auditoría amplia) |

> Para el inventario detallado, los comandos de búsqueda y la tabla de mapeo accionable, ver [`odoo-credential-removal-plan.md`](odoo-credential-removal-plan.md).

### Plan por fases

1. **Fase 1** — Inventario exacto de usos en frontend (grep + revisión manual).
2. **Fase 2** — Confirmar sustitutos existentes con Sebastián por cada uso.
3. **Fase 3** — Reemplazar llamadas directas a Odoo por endpoints seguros, una pantalla / flujo a la vez.
4. **Fase 4** — Eliminar `setServiceCredentials` y password del bundle.
5. **Fase 5** — Coordinar rotación / restricción de la credencial antigua con Sebastián / dirección.
6. **Fase 6** — Agregar test que falle si vuelve a aparecer una service credential hardcoded en el repo (guard en CI).

### Sobre la rotación de la contraseña

> La rotación puede afectar cualquier flujo que necesite renovar sesión o volver a autenticarse con esa cuenta. Antes de rotarla en producción, confirmar con Sebastián exactamente qué pantallas / servicios dependen de esa credencial y coordinar una ventana de cambio. **No se rota desde código**. Aun así, la credencial debe **eliminarse del cliente móvil** como solución definitiva.

**No tocar en este batch**: este documento es informativo. El plan de eliminación tiene su propio documento (`odoo-credential-removal-plan.md`). Toda acción requiere PR aparte y coordinación con Sebastián.

---

## H-002 (MEDIO) — Google Maps API Key embebida en `app.json`

**Ubicación**: `app.json:19,36,95` (campos `ios.config.googleMapsApiKey`, `android.config.googleMaps.apiKey`, `extra.googleMapsApiKey`)

```json
"googleMapsApiKey": "AIzaSy[REDACTED_GOOGLE_MAPS_KEY]"
```

**Riesgo**: si la key no tiene restricciones de package + SHA-1 fingerprint en GCP, cualquiera la puede usar para hacer requests cargados a la cuenta de Google del Grupo. Como `app.json` viaja en el APK, la key es pública por diseño — la única defensa son las restricciones del lado de GCP.

**Acción recomendada**:

1. En GCP Console → APIs & Services → Credentials, verificar que la key tenga:
   - **Application restrictions**: Android apps.
   - **Package name**: `mx.grupofrio.koldfield` (verificado en `app.json`).
   - **SHA-1 fingerprint**: pendiente de obtener vía `eas credentials` cuando se haga el primer build con EAS. Hasta entonces, si hubo builds locales de Sebastián, la SHA-1 es la del keystore que él haya usado.
   - **API restrictions**: limitada a Maps SDK for Android (no a todas las APIs).
2. Si la key tiene fugas históricas o estuvo sin restricciones, **rotarla** en GCP y actualizar `app.json` en un PR aparte (con el valor nuevo igualmente redactado en commits / docs externos).
3. Documentar el SHA-1 oficial del keystore de release (pendiente del primer `eas credentials`).

**No tocar en este batch**: la verificación es en GCP Console, no en el repo.

---

## H-003 (BAJO / informativo) — Tests con rutas absolutas hardcoded

**Ubicación**: 9 archivos en `tests/` que tenían el prefijo `/Users/sebis/Desktop/app-ventas-v2/`.

**Riesgo**: bajo. Solo afectaba CI y a developers que no fueran Sebastián. Los tests fallaban con `ENOENT` en cualquier máquina distinta.

**Estado**: **CORREGIDO en este batch** mediante reemplazo por `resolve(REPO_ROOT, 'ruta/relativa')` con `process.cwd()` (resolviendo además que `import.meta.url` requiere `module: nodenext` en `tsconfig`, fuera de alcance). El runner `scripts/run-tests.mjs` fija `cwd` al repo root para garantizar la resolución correcta. No se tocaron aserciones.

---

## Reglas de oro para futuras decisiones de seguridad

1. **No** mover passwords, tokens privados, ni service credentials a `EXPO_PUBLIC_*`. Una variable `EXPO_PUBLIC_*` es **público por contrato** — termina dentro del APK.
2. **Sí** usar `EXPO_PUBLIC_*` para: BASE_URL pública, build profile label, feature flags públicos, sentry DSN público.
3. Toda credencial que deba ser secreta **no debe vivir en la app móvil**. Si hace falta, va al backend, y la app obtiene tokens de corta duración por endpoint autenticado del usuario.
4. Toda key de tercero (Google Maps, Sentry, Firebase…) debe tener restricciones de paquete + fingerprint en el provider. Sin restricciones, equivale a no tener key.
5. **Nunca** copiar el valor real de un secreto a documentación, README, comentarios, commits ni logs. Usa `[REDACTED]` o prefijo parcial (`AIzaSy****`).
6. Si se descubre un secreto expuesto, **coordinar la mitigación antes de actuar** — no rotar a ciegas si rompe producción; restringir y planear la ventana de cambio.
