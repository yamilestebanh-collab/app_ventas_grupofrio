# Regalo / Muestra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated `Regalo / Muestra` visit flow with its own screen, validations, API request, and visit action entry point for customers and opportunities.

**Architecture:** Add a new `gift/[stopId]` screen under the existing Expo Router visit flow, keep form state local to that screen, and send the gift request directly through a dedicated REST helper. Extend the stop typing with explicit backend-supplied `mobile_location_id` and `visit_line_id` fields so the frontend does not infer operational identifiers.

**Tech Stack:** Expo Router, React Native, Zustand, TypeScript, fetch-based REST helpers, node:assert tests

---

### Task 1: Define Gift Payload And Error Mapping

**Files:**
- Add: `src/services/giftPayload.ts`
- Test: `tests/giftPayload.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- payload shape for valid gift submission
- `visit_line_id` allowed as `null`
- disabled-state prerequisites derivable from stop/auth context
- known backend error code/message normalization

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/giftPayload.test.ts`
Expected: missing helper / failing assertions

- [ ] **Step 3: Write minimal implementation**

Create pure helpers for:
- building `{ meta, data }`
- checking whether submit must be disabled
- mapping backend error codes to readable messages

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/giftPayload.test.ts`
Expected: `gift payload tests: ok`

- [ ] **Step 5: Smoke-check TypeScript on the helper**

Run: `npx tsc --noEmit`
Expected: no new errors from this helper

### Task 2: Add REST Service And Stop Typing

**Files:**
- Add: `src/services/gfSalesOps.ts`
- Modify: `src/types/plan.ts`
- Modify: `src/services/gfLogistics.ts` only if a shared type/helper is justified
- Test: `tests/giftPayload.test.ts`

- [ ] **Step 1: Extend the failing test if needed**

Add assertions for service-level response normalization if the pure helper needs them.

- [ ] **Step 2: Run the test to verify it still fails for the new behavior**

Run: `node tests/giftPayload.test.ts`
Expected: failing assertions before service wiring

- [ ] **Step 3: Implement minimal REST service**

Add a dedicated `createGift()` helper that:
- calls `postRest('/gf/salesops/gift/create', payload)`
- returns normalized success data and `user_message`

Also extend `GFStop` with:
- `mobile_location_id?: number | null`
- `visit_line_id?: number | null`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/giftPayload.test.ts`
Expected: `gift payload tests: ok`

- [ ] **Step 5: Verify the app still compiles with extended stop typing**

Run: `npx tsc --noEmit`
Expected: no new type errors from `GFStop` consumers

### Task 3: Add Gift Action To Visit Screen

**Files:**
- Modify: `app/stop/[stopId].tsx`
- Add: `tests/giftRouteAccess.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- `Regalo` action is shown in the same action block as `Venta`
- action remains visible for customers and leads/opportunities
- route target points to `/gift/[stopId]`

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/giftRouteAccess.test.ts`
Expected: failing assertions because the button/route do not exist

- [ ] **Step 3: Implement minimal navigation wiring**

Add the `🎁 Regalo` button next to the visit actions and route it to the new screen.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/giftRouteAccess.test.ts`
Expected: `gift route access tests: ok`

- [ ] **Step 5: Manually inspect button layout**

Open a stop with customer and a stop with lead metadata and confirm the action renders in both cases.

### Task 4: Implement Gift Screen Form

**Files:**
- Add: `app/gift/[stopId].tsx`
- Add: `src/components/domain/GiftProductPicker.tsx` if extraction is needed
- Modify: `src/stores/useProductStore.ts` only if product loading hooks need reuse
- Test: `tests/giftScreenRules.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- at least one valid line required
- qty must be numeric and `> 0`
- duplicate products are rejected or prevented
- submit disabled when `partner_id` is missing
- submit disabled when `mobile_location_id` is missing

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/giftScreenRules.test.ts`
Expected: failing assertions before screen rules exist

- [ ] **Step 3: Implement minimal screen**

Build a focused screen with:
- stop header
- persistent warnings for missing `partner_id`, `mobile_location_id`, `employeeAnalyticPlazaId`
- editable lines with product picker and qty input
- optional notes field
- submit button with loading state

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/giftScreenRules.test.ts`
Expected: `gift screen rules tests: ok`

- [ ] **Step 5: Manually verify product filtering**

Open the screen and confirm the selector filters from the loaded branch catalog.

### Task 5: Submit Flow, Success Return, And Final Verification

**Files:**
- Modify: `app/gift/[stopId].tsx`
- Modify: `app/stop/[stopId].tsx` only if success feedback needs a return param
- Test: `tests/giftPayload.test.ts`

- [ ] **Step 1: Extend the failing test for submit/success behavior if needed**

Cover:
- built payload uses `employeeAnalyticPlazaId`, `partner_id`, `mobile_location_id`, `visit_line_id`
- success message falls back to `Regalo registrado`

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/giftPayload.test.ts`
Expected: failing assertion before submit flow is complete

- [ ] **Step 3: Implement minimal submit flow**

On submit:
- validate locally
- call `createGift()`
- show confirmation
- return to the visit screen

On error:
- show normalized backend message

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run:
- `node tests/giftPayload.test.ts`
- `node tests/giftRouteAccess.test.ts`
- `node tests/giftScreenRules.test.ts`

Expected:
- `gift payload tests: ok`
- `gift route access tests: ok`
- `gift screen rules tests: ok`

- [ ] **Step 5: Final verification**

Run: `npx tsc --noEmit`

Expected: no new TypeScript errors in touched files. Any pre-existing project errors must be called out explicitly.
