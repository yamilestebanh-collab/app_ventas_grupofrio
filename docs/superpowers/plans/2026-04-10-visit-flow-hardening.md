# Visit Flow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix visit-state consistency, off-route lead/customer discovery, and lead capture so the app and Odoo reflect route execution reliably.

**Architecture:** Treat `stop.state` plus a persisted active visit snapshot as the source of truth for what the user can do. Expand off-route search to return customers and leads with explicit typing, and replace the post-visit placeholder with a real lead/prospection form wired into existing sync infrastructure.

**Tech Stack:** Expo Router, React Native, Zustand, TypeScript, Odoo RPC/REST, node:assert tests

---

### Task 1: Guard Visit Actions By Stop State

**Files:**
- Modify: `app/stop/[stopId].tsx`
- Modify: `app/checkin/[stopId].tsx`
- Test: `tests/visitGuards.test.ts`

- [ ] **Step 1: Write a failing test for visit action derivation**

Create a pure helper test covering:
- `pending` => can start
- `in_progress` => can continue, cannot restart
- `done/not_visited/closed` => cannot start or continue operational actions

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/visitGuards.test.ts`
Expected: missing helper / failing assertions

- [ ] **Step 3: Implement minimal helper and wire screens**

Create a helper in `src/services/visitGuards.ts` and use it in:
- `app/stop/[stopId].tsx` to change button labels/disabled states
- `app/checkin/[stopId].tsx` to block duplicate check-ins for completed or active stops

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/visitGuards.test.ts`
Expected: `visit guards tests: ok`

- [ ] **Step 5: Smoke-check TypeScript on touched files**

Run: `npx tsc --noEmit`
Expected: no new errors from these files

### Task 2: Persist And Rehydrate Active Visit State

**Files:**
- Modify: `src/stores/useVisitStore.ts`
- Modify: `src/services/rehydrate.ts`
- Modify: `app/_layout.tsx` only if startup wiring is required
- Test: `tests/visitPersistence.test.ts`

- [ ] **Step 1: Write a failing test for serializing/restoring active visit state**

Cover:
- active visit snapshot preserves `phase`, `currentStopId`, `checkInTime`, GPS
- reset clears persisted snapshot

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/visitPersistence.test.ts`
Expected: missing persistence helpers / failing assertions

- [ ] **Step 3: Implement minimal persistence**

Add a persisted visit snapshot using existing storage helpers. Rehydrate only if the related stop is still `in_progress`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/visitPersistence.test.ts`
Expected: `visit persistence tests: ok`

- [ ] **Step 5: Manually verify reopen behavior**

Scenario:
- Start visit
- Reload app state via rehydrate path
- Confirm the stop still presents “continue visit” behavior instead of “start visit”

### Task 3: Keep Checkout Reflected In App And Route State

**Files:**
- Modify: `app/checkout/[stopId].tsx`
- Modify: `app/nosale/[stopId].tsx`
- Modify: `src/services/gfLogistics.ts`
- Modify: `src/stores/useRouteStore.ts` if refresh helper is needed
- Test: `tests/checkoutResult.test.ts`

- [ ] **Step 1: Extend the failing/coverage test around checkout status**

Add expectations for:
- sale checkout
- no-sale checkout
- route state staying non-operable after completion

- [ ] **Step 2: Run the test to verify coverage fails first**

Run: `node tests/checkoutResult.test.ts`
Expected: failing assertion before implementation

- [ ] **Step 3: Implement minimal route-state hardening**

Ensure successful checkout and no-sale closure keep the stop in a completed state in-app and never surface “start visit” again, even after refresh/rehydrate.

- [ ] **Step 4: Re-run checkout tests**

Run: `node tests/checkoutResult.test.ts`
Expected: `checkout result tests: ok`

- [ ] **Step 5: Verify sync path**

Run a focused inspection of queued `checkout` items and confirm `result_status` survives offline enqueue + sync dispatch.

### Task 4: Expand Off-Route Search To Customers And Leads

**Files:**
- Modify: `app/offroute.tsx`
- Modify: `src/types/plan.ts` if stop typing needs lead metadata
- Test: `tests/offrouteSearch.test.ts`

- [ ] **Step 1: Write a failing search-normalization test**

Cover:
- customer results are labeled as customer
- lead results are labeled as lead
- mixed search results preserve type and render label text

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/offrouteSearch.test.ts`
Expected: missing mapper / failing assertions

- [ ] **Step 3: Implement minimal mixed search**

Replace the `customer_rank > 0` filter with a domain that returns both sellable customers and leads/prospects, normalize result type, and show visual badges in the list.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/offrouteSearch.test.ts`
Expected: `offroute search tests: ok`

- [ ] **Step 5: Manual search verification**

Try a known customer and a known lead term and confirm both appear.

### Task 5: Implement Lead/Post-Visit Form

**Files:**
- Modify: `app/postvisit/[stopId].tsx`
- Modify: `src/stores/useSyncStore.ts` only if payload shape needs a helper
- Add: `src/services/postvisitPayload.ts`
- Test: `tests/postvisitPayload.test.ts`

- [ ] **Step 1: Write a failing payload test**

Cover required fields for lead/prospección capture and the payload shape expected by the queue.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/postvisitPayload.test.ts`
Expected: missing helper / failing assertions

- [ ] **Step 3: Implement the minimal form**

Replace placeholder UI with fields such as:
- lead/customer type
- competitor
- freezer/equipment
- interest level
- notes

Enqueue the result through `prospection`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/postvisitPayload.test.ts`
Expected: `postvisit payload tests: ok`

- [ ] **Step 5: Manual save verification**

Submit the form and confirm a `prospection` item appears in sync.

### Task 6: Surface Route Type In UI

**Files:**
- Modify: `app/(tabs)/route.tsx`
- Modify: `src/components/domain/StopCard.tsx`
- Modify: `app/stop/[stopId].tsx`
- Test: `tests/routePresentation.test.ts`

- [ ] **Step 1: Write a failing presentation test**

Cover derivation of route/stop badges from available metadata (`generation_mode`, lead/customer markers, virtual stops).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/routePresentation.test.ts`
Expected: missing helper / failing assertions

- [ ] **Step 3: Implement minimal presentation helper**

Add helper-driven labels/badges for:
- route type
- stop type (lead/customer/off-route)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/routePresentation.test.ts`
Expected: `route presentation tests: ok`

- [ ] **Step 5: Final verification**

Run:
- `node tests/visitGuards.test.ts`
- `node tests/visitPersistence.test.ts`
- `node tests/checkoutResult.test.ts`
- `node tests/offrouteSearch.test.ts`
- `node tests/postvisitPayload.test.ts`
- `node tests/routePresentation.test.ts`

Then run: `npx tsc --noEmit`

Expected: all targeted tests pass; any remaining TypeScript errors must be pre-existing and explicitly called out.
