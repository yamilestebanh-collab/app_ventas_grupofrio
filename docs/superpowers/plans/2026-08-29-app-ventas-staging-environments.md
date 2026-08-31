# App Ventas Staging Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** separar `development`, `staging` y `production` en `app_ventas` con configuracion real de backend, builds distinguibles y un flujo de promocion que impida probar cambios nuevos en produccion.

**Architecture:** la implementacion se divide en dos capas. Primero se separa la configuracion logica de ambientes con `app.config.ts`, perfiles EAS y metadatos visibles de runtime. Despues se separa la identidad nativa de `staging` para permitir coexistencia en el mismo telefono y se documenta el proceso de QA y promocion.

**Tech Stack:** Expo SDK 52, React Native, Expo Router, EAS Build, TypeScript, Node test runner

---

## File Map

**Create:**

- `app.config.ts` - configuracion Expo derivada por ambiente
- `src/config/appEnvironment.ts` - resolucion de variables de ambiente y metadatos visibles
- `tests/appEnvironmentConfig.test.ts` - pruebas unitarias de resolucion de ambientes
- `tests/appConfigVariants.test.mjs` - pruebas de configuracion Expo para `development`, `staging` y `production`
- `docs/staging-release-flow.md` - flujo operativo de QA, generacion de builds y promocion

**Modify:**

- `app.json` - reducirlo o retirarlo como fuente principal una vez migrado a `app.config.ts`
- `eas.json` - redefinir perfiles a `development`, `staging` y `production`
- `package.json` - scripts de build y chequeo por ambiente
- `src/services/api.ts` - consumir base URL canonica desde config compartida si hace falta
- `src/services/odooDatabase.ts` - consumir DB canonica desde config compartida si hace falta
- `src/stores/useAuthStore.ts` - asegurar que overrides de URL no rompan separacion por ambiente
- `src/components/ui/TopBar.tsx` o archivo equivalente visible - mostrar badge de ambiente cuando no sea `production`
- `docs/release-checklist.md` - alinear checklist con `staging` y `production`
- `docs/superpowers/specs/2026-08-28-app-ventas-staging-environments-design.md` - solo si se necesita enlazar plan final aprobado

**Potential Native/Asset Follow-up:**

- `assets/*` - iconografia de staging
- `android/` y `ios/` generados por prebuild - solo en la fase de separacion nativa, no en la fase logica inicial

### Task 1: Lock the Environment Model

**Files:**

- Create: `src/config/appEnvironment.ts`
- Test: `tests/appEnvironmentConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAppEnvironment,
  buildEnvironmentLabel,
} from '../src/config/appEnvironment';

test('resolveAppEnvironment maps known values and falls back to production', () => {
  assert.equal(resolveAppEnvironment('development'), 'development');
  assert.equal(resolveAppEnvironment('staging'), 'staging');
  assert.equal(resolveAppEnvironment('production'), 'production');
  assert.equal(resolveAppEnvironment('preview'), 'staging');
  assert.equal(resolveAppEnvironment(undefined), 'production');
});

test('buildEnvironmentLabel hides production and marks non-production', () => {
  assert.equal(buildEnvironmentLabel('production'), null);
  assert.equal(buildEnvironmentLabel('staging'), 'STAGING');
  assert.equal(buildEnvironmentLabel('development'), 'DEV');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/appEnvironmentConfig.test.ts`
Expected: FAIL with module or export missing.

- [ ] **Step 3: Write minimal implementation**

```ts
export type AppEnvironment = 'development' | 'staging' | 'production';

export function resolveAppEnvironment(raw: string | undefined): AppEnvironment {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'development') return 'development';
  if (normalized === 'staging' || normalized === 'preview') return 'staging';
  return 'production';
}

export function buildEnvironmentLabel(environment: AppEnvironment): string | null {
  if (environment === 'production') return null;
  return environment === 'staging' ? 'STAGING' : 'DEV';
}
```

- [ ] **Step 4: Extend implementation with environment metadata**

```ts
export type EnvironmentConfig = {
  environment: AppEnvironment;
  appName: string;
  appScheme: string;
  bundleSuffix: string;
  defaultBaseUrl: string;
  defaultOdooDb: string;
};

export function createEnvironmentConfig(env: Record<string, string | undefined>): EnvironmentConfig {
  const environment = resolveAppEnvironment(env.EXPO_PUBLIC_APP_ENV ?? env.EXPO_PUBLIC_BUILD_PROFILE);
  const isProduction = environment === 'production';
  return {
    environment,
    appName: isProduction ? 'KOLD Field' : 'KOLD Field Staging',
    appScheme: isProduction ? 'kold-field' : 'kold-field-staging',
    bundleSuffix: isProduction ? '' : '.staging',
    defaultBaseUrl: (env.EXPO_PUBLIC_KF_DEFAULT_BASE_URL ?? '').trim(),
    defaultOdooDb: (env.EXPO_PUBLIC_KF_ODOO_DB ?? '').trim(),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/appEnvironmentConfig.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/appEnvironmentConfig.test.ts src/config/appEnvironment.ts
git commit -m "feat: define app environment model"
```

### Task 2: Move Expo Config to app.config.ts

**Files:**

- Create: `app.config.ts`
- Modify: `app.json`
- Test: `tests/appConfigVariants.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const { default: createExpoConfig } = await import('../app.config.ts');

test('staging config uses distinct identity and name', () => {
  const config = createExpoConfig({
    config: { name: 'KOLD Field', slug: 'kold-field' },
  });
  assert.ok(config);
});
```

- [ ] **Step 2: Replace the test with environment-aware assertions**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

function loadConfig(env) {
  process.env.EXPO_PUBLIC_APP_ENV = env;
  process.env.EXPO_PUBLIC_KF_DEFAULT_BASE_URL =
    env === 'production' ? 'https://prod.example.com' : 'https://staging.example.com';
  process.env.EXPO_PUBLIC_KF_ODOO_DB =
    env === 'production' ? 'prod-db' : 'staging-db';
  const mod = require('../app.config.ts');
  return mod.default({ config: {} });
}

test('production config keeps official identity', () => {
  const config = loadConfig('production');
  assert.equal(config.name, 'KOLD Field');
  assert.equal(config.ios.bundleIdentifier, 'mx.grupofrio.koldfield');
  assert.equal(config.android.package, 'mx.grupofrio.koldfield');
});

test('staging config changes visible identity and native ids', () => {
  const config = loadConfig('staging');
  assert.equal(config.name, 'KOLD Field Staging');
  assert.equal(config.ios.bundleIdentifier, 'mx.grupofrio.koldfield.staging');
  assert.equal(config.android.package, 'mx.grupofrio.koldfield.staging');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/appConfigVariants.test.mjs`
Expected: FAIL because `app.config.ts` does not exist yet.

- [ ] **Step 4: Write minimal `app.config.ts`**

```ts
import type { ExpoConfig, ConfigContext } from 'expo/config';
import { createEnvironmentConfig } from './src/config/appEnvironment';

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = createEnvironmentConfig(process.env as Record<string, string | undefined>);
  const isProduction = env.environment === 'production';

  return {
    ...config,
    name: env.appName,
    slug: 'kold-field',
    scheme: env.appScheme,
    version: '1.4.1',
    icon: './assets/grupofrio-icon.png',
    ios: {
      ...config.ios,
      bundleIdentifier: `mx.grupofrio.koldfield${env.bundleSuffix}`,
      supportsTablet: false,
    },
    android: {
      ...config.android,
      package: `mx.grupofrio.koldfield${env.bundleSuffix}`,
    },
    extra: {
      ...config.extra,
      appEnvironment: env.environment,
      defaultBaseUrl: env.defaultBaseUrl,
      defaultOdooDb: env.defaultOdooDb,
      isProduction,
    },
  };
};
```

- [ ] **Step 5: Reduce `app.json` to a compatibility stub or remove conflicting values**

```json
{
  "expo": {
    "name": "KOLD Field",
    "slug": "kold-field"
  }
}
```

- [ ] **Step 6: Run config tests**

Run: `node --test tests/appConfigVariants.test.mjs`
Expected: PASS

- [ ] **Step 7: Manually inspect resolved Expo config**

Run: `npx expo config --type public`
Expected: output includes the active `name`, `scheme`, `ios.bundleIdentifier`, `android.package`, and `extra.appEnvironment`.

- [ ] **Step 8: Commit**

```bash
git add app.config.ts app.json src/config/appEnvironment.ts tests/appConfigVariants.test.mjs tests/appEnvironmentConfig.test.ts
git commit -m "feat: derive expo config by environment"
```

### Task 3: Redefine EAS Profiles and Build Scripts

**Files:**

- Modify: `eas.json`
- Modify: `package.json`
- Test: `tests/defaultBaseUrlEnv.test.mjs`

- [ ] **Step 1: Write the failing test for profile names**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

assert.ok(eas.build.staging, 'eas.json must define a staging build profile');
assert.equal(eas.build.preview, undefined, 'preview profile should be removed or retired');
assert.equal(
  eas.build.staging.env.EXPO_PUBLIC_APP_ENV,
  'staging',
  'staging profile must expose EXPO_PUBLIC_APP_ENV=staging'
);
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test tests/defaultBaseUrlEnv.test.mjs`
Expected: FAIL or remain incomplete because `staging` is not defined yet.

- [ ] **Step 3: Update `eas.json`**

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_APP_ENV": "development",
        "EXPO_PUBLIC_KF_DEFAULT_BASE_URL": "https://odoo-staging.example.com",
        "EXPO_PUBLIC_KF_ODOO_DB": "staging-db"
      }
    },
    "staging": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_APP_ENV": "staging",
        "EXPO_PUBLIC_KF_DEFAULT_BASE_URL": "https://odoo-staging.example.com",
        "EXPO_PUBLIC_KF_ODOO_DB": "staging-db"
      }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": {
        "EXPO_PUBLIC_APP_ENV": "production",
        "EXPO_PUBLIC_KF_DEFAULT_BASE_URL": "https://grupofrio-gf.odoo.com",
        "EXPO_PUBLIC_KF_ODOO_DB": "grupofrio-gf-main-34980678"
      }
    }
  }
}
```

- [ ] **Step 4: Update `package.json` scripts**

```json
{
  "scripts": {
    "build:dev:android": "eas build -p android --profile development",
    "build:staging:android": "eas build -p android --profile staging",
    "build:prod:android": "eas build -p android --profile production",
    "config:staging": "cross-env EXPO_PUBLIC_APP_ENV=staging npx expo config --type public",
    "config:production": "cross-env EXPO_PUBLIC_APP_ENV=production npx expo config --type public"
  }
}
```

- [ ] **Step 5: Update or extend `tests/defaultBaseUrlEnv.test.mjs`**

```js
assert.match(
  source,
  /EXPO_PUBLIC_KF_DEFAULT_BASE_URL/,
  'api.ts must keep reading EXPO_PUBLIC_KF_DEFAULT_BASE_URL'
);

assert.match(
  databaseSource,
  /EXPO_PUBLIC_KF_ODOO_DB/,
  'odooDatabase.ts must keep reading EXPO_PUBLIC_KF_ODOO_DB'
);
```

- [ ] **Step 6: Run verification**

Run: `node --test tests/defaultBaseUrlEnv.test.mjs`
Expected: PASS

Run: `npm run config:staging`
Expected: resolved Expo config shows staging base URL and staging package/bundle ids.

- [ ] **Step 7: Commit**

```bash
git add eas.json package.json tests/defaultBaseUrlEnv.test.mjs
git commit -m "build: define staging and production eas profiles"
```

### Task 4: Surface the Active Environment in the App

**Files:**

- Modify: `src/components/ui/TopBar.tsx`
- Modify: `src/theme/tokens.ts`
- Create or Modify: `src/config/appEnvironment.ts`
- Test: `tests/appEnvironmentBanner.test.mjs`

- [ ] **Step 1: Write the failing UI wiring test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ui/TopBar.tsx', import.meta.url), 'utf8');

assert.match(source, /STAGING|DEV/, 'TopBar must render the active non-production environment label');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/appEnvironmentBanner.test.mjs`
Expected: FAIL because no badge exists yet.

- [ ] **Step 3: Add the environment label helper**

```ts
export function shouldShowEnvironmentBanner(environment: AppEnvironment): boolean {
  return environment !== 'production';
}
```

- [ ] **Step 4: Render a small badge in the top bar**

```tsx
const label = buildEnvironmentLabel(environment);

{label ? (
  <View style={styles.environmentBadge}>
    <Text style={styles.environmentBadgeText}>{label}</Text>
  </View>
) : null}
```

- [ ] **Step 5: Add deterministic badge styling**

```ts
environmentBadge: {
  backgroundColor: '#B42318',
  borderRadius: 999,
  paddingHorizontal: 8,
  paddingVertical: 2,
},
environmentBadgeText: {
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: '700',
},
```

- [ ] **Step 6: Run verification**

Run: `node --test tests/appEnvironmentBanner.test.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/TopBar.tsx src/theme/tokens.ts src/config/appEnvironment.ts tests/appEnvironmentBanner.test.mjs
git commit -m "feat: show active app environment in chrome"
```

### Task 5: Protect Runtime Defaults and Overrides

**Files:**

- Modify: `src/services/api.ts`
- Modify: `src/services/odooDatabase.ts`
- Modify: `src/stores/useAuthStore.ts`
- Test: `tests/defaultBaseUrlEnv.test.mjs`
- Test: `tests/authEnvironmentIsolation.test.ts`

- [ ] **Step 1: Write the failing isolation test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvironmentStorageKey } from '../src/config/appEnvironment';

test('staging and production use different storage namespaces', () => {
  assert.notEqual(
    buildEnvironmentStorageKey('production', 'kf_base_url'),
    buildEnvironmentStorageKey('staging', 'kf_base_url')
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/authEnvironmentIsolation.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Introduce namespaced key helpers**

```ts
export function buildEnvironmentStorageKey(
  environment: AppEnvironment,
  key: string,
): string {
  return environment === 'production' ? key : `${environment}:${key}`;
}
```

- [ ] **Step 4: Apply the helper to mutable runtime keys**

```ts
const STORE_KEYS = {
  BASE_URL: buildEnvironmentStorageKey(environment, 'kf_base_url'),
  GF_TOKEN: buildEnvironmentStorageKey(environment, 'kf_gf_token'),
  SESSION_ID: buildEnvironmentStorageKey(environment, 'kf_employee_session_id'),
} as const;
```

- [ ] **Step 5: Verify existing fallbacks remain safe**

Run: `node --test tests/defaultBaseUrlEnv.test.mjs tests/authEnvironmentIsolation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/appEnvironment.ts src/services/api.ts src/services/odooDatabase.ts src/stores/useAuthStore.ts tests/defaultBaseUrlEnv.test.mjs tests/authEnvironmentIsolation.test.ts
git commit -m "fix: isolate runtime environment storage"
```

### Task 6: Prepare Staging Identity and Distribution Follow-up

**Files:**

- Modify: `app.config.ts`
- Modify: `eas.json`
- Create: `docs/staging-release-flow.md`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Write the operational doc skeleton**

```md
# KOLD Field staging release flow

## Branches
- `main` -> production
- `develop` -> staging

## Build triggers
- feature ready for QA
- backend contract change
- auth/sync/storage change
```

- [ ] **Step 2: Expand the doc with concrete rules**

```md
## Never test first in production

- login changes
- sync queue changes
- pricing changes
- route close / inventory / collection changes

## Promotion gate

1. Android staging APK validated
2. iOS staging build validated
3. backend target confirmed
4. no critical bug open
```

- [ ] **Step 3: Update `docs/release-checklist.md` to distinguish staging vs production**

```md
- [ ] Confirm the build profile is `staging` or `production`
- [ ] Confirm the app chrome visibly matches the expected environment
- [ ] Confirm the login targets the expected Odoo backend
```

- [ ] **Step 4: Add explicit iOS and Android identity notes**

```md
- iOS staging bundle id: `mx.grupofrio.koldfield.staging`
- Android staging package: `mx.grupofrio.koldfield.staging`
- Staging app name: `KOLD Field Staging`
```

- [ ] **Step 5: Review the final config before native rollout**

Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `npx expo config --type public`
Expected: staging and production identities resolve correctly depending on `EXPO_PUBLIC_APP_ENV`.

- [ ] **Step 6: Commit**

```bash
git add app.config.ts eas.json docs/staging-release-flow.md docs/release-checklist.md
git commit -m "docs: define staging release workflow"
```

## Spec Coverage Check

- Environment architecture is covered by Tasks 1-3.
- Visible differentiation and same-device coexistence are covered by Tasks 2, 4, and 6.
- Android APK and iOS TestFlight handling are covered by Tasks 3 and 6.
- Branching, QA flow, and promotion rules are covered by Task 6.
- Backend separation between Odoo staging and Odoo production is covered by Tasks 1, 3, and 5.

## Notes Before Execution

- Replace placeholder staging backend values in this plan with the real Odoo staging URL and DB name before modifying `eas.json`.
- Native asset generation for staging icons can be deferred until the logical environment split is stable.
- If the current Codex task remains attached to a worktree, execute implementation from the local repo branch `codex/app-ventas-staging-envs`, not from detached `HEAD`.
