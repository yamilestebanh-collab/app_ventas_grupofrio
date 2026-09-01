# Staging Runtime Database Resolution Implementation Plan

> For agentic workers: execute task by task with checkboxes.

**Goal:** Resolve the active staging Odoo DB from GET /current_database before login and block Odoo mutations until the backend identity is verified.

**Architecture:** A pure resolver validates the configured host and JSON response. A non-persistent Zustand store holds the identity only for the current process. Login consumes that DB, while REST POST requests and the offline queue require verification. Production keeps its current behavior.

**Tech Stack:** Expo SDK 52, React Native, TypeScript, Zustand, Node test runner, fetch.

---

## File Map

Create:

- src/services/stagingBackendIdentity.ts - pure endpoint and host resolver.
- src/stores/useStagingBackendStore.ts - in-memory state and mutation guard.
- tests/stagingBackendIdentity.test.ts - endpoint contract tests.
- tests/stagingBackendGuard.test.ts - guard tests.
- tests/stagingBackendWiring.test.mjs - integration wiring checks.

Modify:

- src/services/api.ts - staging guard before postRest requests.
- src/stores/useAuthStore.ts - resolve identity before login.
- src/stores/useSyncStore.ts - defer queued writes before they change state.
- app/(auth)/login.tsx, app/profile.tsx, src/utils/healthCheck.ts - safe diagnostics.
- tests/odooDatabase.test.ts, docs/staging-release-flow.md, docs/release-checklist.md.

### Task 1: Pure resolver

Files: src/services/stagingBackendIdentity.ts and tests/stagingBackendIdentity.test.ts.

- [ ] Write failing tests: a 200 response containing db: staging-db verifies the exact configured host. An unexpected host must make zero requests and return host_not_allowed. Assert 503 maps to database_unavailable, while 500, invalid JSON, empty DB, and fetch rejection are unverified.
- [ ] Run node --test tests/stagingBackendIdentity.test.ts. Expected: FAIL because the module does not exist.
- [ ] Implement exported StagingBackendIdentity with status, baseUrl, host, db, and reason. Normalize trailing slashes, require the incoming host to equal expectedBaseUrl host, fetch baseUrl/current_database using GET and Accept application/json, and return verified only for nonempty string db. The resolver must have no Expo, storage, or Zustand import.
- [ ] Run node --test tests/stagingBackendIdentity.test.ts. Expected: PASS.
- [ ] Commit: git add src/services/stagingBackendIdentity.ts tests/stagingBackendIdentity.test.ts then git commit -m "feat: resolve staging database at runtime".

### Task 2: Runtime store and central REST guard

Files: src/stores/useStagingBackendStore.ts, src/services/api.ts, tests/stagingBackendGuard.test.ts.

- [ ] Write failing tests for a StagingBackendUnverifiedError. The guard rejects unverified identity and a URL with another origin; it accepts a URL below a verified base URL.
- [ ] Run node --test tests/stagingBackendGuard.test.ts. Expected: FAIL.
- [ ] Create a Zustand store with identity, setIdentity, clearIdentity, and assertMutationAllowed. Its initial state is unverified and it uses no persistence middleware, SecureStore, or AsyncStorage.
- [ ] In postRest, immediately after buildAbsoluteUrl, when APP_ENVIRONMENT is staging call useStagingBackendStore.getState().assertMutationAllowed(absoluteUrl). Do not guard getRest. Login remains direct fetch after Task 3 resolves identity.
- [ ] Run node --test tests/stagingBackendGuard.test.ts tests/authEnvironmentIsolation.test.ts. Expected: PASS.
- [ ] Commit: git add src/stores/useStagingBackendStore.ts src/services/api.ts tests/stagingBackendGuard.test.ts then git commit -m "feat: block unverified staging mutations".

### Task 3: Login integration and production regression

Files: src/stores/useAuthStore.ts, tests/odooDatabase.test.ts, tests/stagingBackendWiring.test.mjs.

- [ ] Add a regression assertion that production resolveOdooDatabase with no listed DB still returns grupofrio-gf-main-34980678. Run node --test tests/odooDatabase.test.ts. Expected: PASS.
- [ ] In login, read app environment from Constants.expoConfig.extra. For staging, resolve identity before setBaseUrl or credential request, using supplied baseUrl and extra.defaultBaseUrl as expected host. Store the identity; return a verification error if unverified; use identity.db for employee-sign-in. For production keep resolveOdooDatabase(baseUrl, db) unchanged.
- [ ] Clear the in-memory staging identity on logout and before a new staging login attempt. Failed verification must not persist a URL or alter existing production credentials.
- [ ] Add source checks requiring resolveStagingBackendIdentity in auth and assertMutationAllowed in api. Run node --test tests/odooDatabase.test.ts tests/stagingBackendIdentity.test.ts tests/stagingBackendGuard.test.ts tests/stagingBackendWiring.test.mjs. Expected: PASS.
- [ ] Commit: git add src/stores/useAuthStore.ts tests/odooDatabase.test.ts tests/stagingBackendWiring.test.mjs then git commit -m "feat: verify staging database before login".

### Task 4: Offline queue preflight

Files: src/stores/useSyncStore.ts and tests/stagingBackendWiring.test.mjs.

- [ ] Write a source check requiring StagingBackendUnverifiedError and assertMutationAllowed in useSyncStore.
- [ ] In processOneItemUnheld, after dependency checks but before status changes to syncing, run the staging guard with await getBaseUrl(). If it throws StagingBackendUnverifiedError, log staging_backend_unverified_deferred and return dependency_wait.
- [ ] Do not increment retries, mark error/dead, or make an HTTP request in that condition. Shared postRest guard remains the defense for direct non-queued writes.
- [ ] Run node --test tests/stagingBackendWiring.test.mjs tests/syncProcessingHolds.test.ts tests/syncProcessingHoldWiring.test.mjs. Expected: PASS.
- [ ] Commit: git add src/stores/useSyncStore.ts tests/stagingBackendWiring.test.mjs then git commit -m "fix: defer unverified staging sync".

### Task 5: Visible evidence and safe diagnostics

Files: app/(auth)/login.tsx, app/profile.tsx, src/utils/healthCheck.ts, tests/stagingBackendWiring.test.mjs.

- [ ] Add source tests requiring useStagingBackendStore in login and profile, plus BACKEND STAGING and identity.db in profile.
- [ ] On staging login show unverified status initially and verified host/DB after resolution. On Profile, show an always-visible BACKEND STAGING card with environment, host, DB, state, and a safe reason. Do not rely on the five-tap diagnostics gesture.
- [ ] Add only status, host, db, and reason to diagnostics export for staging. Never export tokens, passwords, cookies, or endpoint bodies.
- [ ] Run node --test tests/stagingBackendWiring.test.mjs and npm run typecheck. Expected: PASS.
- [ ] Commit: git add app/(auth)/login.tsx app/profile.tsx src/utils/healthCheck.ts tests/stagingBackendWiring.test.mjs then git commit -m "feat: show staging backend verification".

### Task 6: Operational release guardrails

Files: docs/staging-release-flow.md and docs/release-checklist.md.

- [ ] Require pre-write evidence: KOLD Field Staging installed, STAGING badge visible, backend verified, approved host, DB from current_database in the current session, and no queued request sent unverified.
- [ ] State that the staging URL cannot change to https://odoo-staging.grupofrio.com until DNS, HTTPS, current_database, and Odoo.sh branch mapping are verified. Then leave EXPO_PUBLIC_KF_ODOO_DB empty for staging because DB is runtime-only.
- [ ] Run npm test, npm run typecheck, and npm run config:staging. Expected: PASS; no Odoo data is created; config shows staging identity and no fixed active DB.
- [ ] Commit: git add docs/staging-release-flow.md docs/release-checklist.md then git commit -m "docs: require staging backend verification".

## Coverage

- Runtime DB and no fixed staging DB: Tasks 1 and 3.
- Host validation and safe failures: Tasks 1 and 2.
- Direct and queued write blocking: Tasks 2 and 4.
- Host, DB, and visible state: Task 5.
- Production regression and no live writes before infrastructure readiness: Tasks 3 and 6.
