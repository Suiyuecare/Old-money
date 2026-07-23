# Plan Review Log: LIGNÉE 當代英倫莊園生活風格商城
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## Round 1 — Codex

The plan is a strong product brief, but `PLAN.md` is not yet deterministic enough to implement safely.

1. **Architecture is unresolved:** Next.js, styling, routing mode, state ownership, package manager, and test stack remain unspecified, so implementers can produce incompatible structures.

   **Fix:** Freeze the App Router/server-client boundary, styling approach, package manager, cart provider, and test tools before implementation.

2. **The product model lacks SKU semantics:** “Variants” do not define valid combinations, price overrides, required axes, stable identifiers, or what constitutes one cart line.

   **Fix:** Specify `Product`, `Variant/SKU`, and `CartLine` schemas with stable IDs, integer TWD prices, allowed option combinations, and build-time referential-integrity validation.

3. **Material claims contradict the stated evidence policy:** Names such as “真皮皮帶,” “黃銅原子筆,” and “珍珠耳環” assert materials that the plan says are unconfirmed.

   **Fix:** Rename them as explicitly provisional concept products or remove material-specific names until sourcing is verified.

4. **Cart persistence is underspecified:** Raw `localStorage` can cause SSR hydration flicker, malformed-state crashes, stale prices, duplicate variant merging, and lost updates across tabs.

   **Fix:** Persist only versioned product/variant IDs and quantities, validate on load, recompute prices from canonical data, gate hydration, and define multi-tab behavior.

5. **Search and filters have no URL contract:** Local-only filters will break sharing, refresh, browser navigation, and deterministic testing; normalization and combined-filter semantics are also undefined.

   **Fix:** Define canonical query parameters, AND/OR rules, price boundaries, Unicode/diacritic normalization, invalid-parameter handling, and back-button behavior.

6. **The “no personal-data processing” claim is false as written:** Contact, address, newsletter, and appointment fields still invite users to enter real personal data even if it remains client-side.

   **Fix:** Warn users not to enter real data, use conspicuously fictional defaults, retain values only in memory, prevent native submission, and test that no fetch/XHR/beacon/navigation transmits them.

7. **The checkout state machine is undefined:** Direct visits, refresh, back navigation, duplicate submission, empty-cart checkout, and post-completion cart behavior have no prescribed result.

   **Fix:** Define guarded checkout states and require direct/reloaded completion URLs to show a non-order demo state with no persistent order identifier.

8. **Apple Pay presentation risks impersonating a real payment capability:** A branded control can look operational despite there being no merchant validation or payment integration.

   **Fix:** Use clearly disabled, non-interactive demo payment choices and do not render an official Apple Pay button or load Apple payment APIs.

9. **`noindex` is being treated as access control:** It does not prevent access, scraping, screenshots, or accidental omission from one route.

   **Fix:** Apply fail-closed global robots metadata plus `X-Robots-Tag: noindex, nofollow, noarchive`, retain a persistent prototype banner, and enable Vercel deployment protection where sharing requirements permit.

10. **Product structured data conflicts with fictional inventory:** Even a “safe prototype” can expose fake prices, availability, and product claims to crawlers or downstream consumers.

    **Fix:** Disable Product/Offer JSON-LD entirely in prototype mode and enable it only behind an explicit production flag after factual validation.

11. **Variant imagery is internally inconsistent:** Products offer multiple colors while receiving only one image, so selecting a color may leave a contradictory photograph.

    **Fix:** Record the pictured variant in the asset manifest and either generate matching variant media or state that imagery is representative without changing it on selection.

12. **The asset pipeline has no enforceable acceptance criteria:** “Suitable web size,” originality, likeness review, crop safety, and cross-image consistency are subjective and unmeasurable.

    **Fix:** Add an asset manifest containing ownership/provenance, prompt source, depicted SKU, dimensions, aspect ratios, crop focal points, alt policy, file-size limits, and human QA status.

13. **Accessibility requirements omit the hardest interactions:** Drawers, mobile filters, variant swatches, dynamic result counts, validation summaries, and route changes need explicit focus and announcement behavior.

    **Fix:** Target WCAG 2.2 AA and specify focus trapping/restoration, Escape handling, labelled swatches, live regions, error-summary focus, and automated axe plus keyboard testing.

14. **Verification is too weak for the scope:** One happy-path E2E will not catch totals, malformed storage, invalid variants, privacy leakage, inaccessible overlays, or broken content references.

    **Fix:** Add unit tests for pricing/filter/cart reducers, data-integrity tests, and Playwright scenarios for refresh/direct navigation, boundary totals, invalid storage, no-network form submission, and keyboard-only checkout.

15. **Several “implementation-time” decisions remain open:** Font licensing, dependencies, deployment credentials, and bundle impact cannot remain unresolved in a supposedly locked work order.

    **Fix:** Select licensed fonts and dependencies now, record their sources, add performance budgets, and define a local-only handoff if Vercel credentials or project access are unavailable.

VERDICT: REVISE

### Codex orchestrator's response

Accepted and revised:

- Froze Next.js App Router, RSC/client boundaries, `pnpm`, CSS Modules, minimal production dependencies, client state ownership, font choices and the complete test stack.
- Added deterministic `Product`, `SKU` and persisted `CartLine` semantics, integer TWD money, explicit variant combinations and build-time referential-integrity checks.
- Added a versioned, validated cart persistence contract, hydration behavior, canonical price recomputation, quantity rules, storage failure fallback and multi-tab last-valid-write synchronization.
- Defined canonical search query parameters, normalization, AND/OR semantics, price boundaries, canonicalization and browser navigation behavior.
- Replaced the vague no-PII promise with concrete warnings, `.invalid` examples, memory-only form state, prohibited transport mechanisms and network assertions.
- Defined guarded checkout transitions, refresh/direct-navigation behavior, duplicate-submit locking, cart clearing and a one-time demo-completion flag with no fake order ID.
- Reduced Apple Pay and card presentation to static “future production” text; no official button, card inputs or payment API.
- Made prototype safety fail-closed with global robots metadata, `X-Robots-Tag`, a persistent banner, optional Vercel protection and no Product/Offer JSON-LD.
- Added a complete asset manifest, file budgets, pictured-SKU behavior, representative-color disclosure and mandatory human QA.
- Expanded the target to WCAG 2.2 AA with overlay, swatch, live-region, error-summary and route-focus rules.
- Expanded verification to unit, integrity, Playwright, axe, keyboard, privacy-network, invalid-state and boundary tests, plus explicit viewport and performance budgets.
- Selected OFL Cormorant Garamond plus a system Traditional Chinese stack, required a notices file, and added a local-only fallback if Vercel credentials are unavailable.

Partially rejected with rationale:

- The user explicitly requested leather belt, brass pen and pearl earrings as concept directions, so those categories were not deleted. Instead, the plan now classifies all such words as provisional development targets, forbids material claims in final product names, and requires the UI to label them “concept material / planned specification” until sourcing is verified.
- Exact package version numbers are not invented before the empty project is scaffolded. The package list and architecture are frozen; the implementation must resolve current stable versions once, immediately commit `pnpm-lock.yaml`, and prohibit floating upgrades during the work.

## Round 2 — Codex

Most prior findings are addressed in the revised `PLAN.md`, but several cross-feature conflicts remain.

1. **Privacy wording remains inaccurate:** React still processes user-entered contact data in memory, even though it does not transmit or persist it.

   **Fix:** Replace “不處理／不收集個資” with the narrower promise “不傳輸或持久化個資，只在當次頁面記憶體中暫時處理.”

2. **SKU pricing semantics remain undefined:** Base prices and SKU overrides do not specify what cards display or which value filtering, sorting, and shipping calculations use.

   **Fix:** Define effective SKU price, card range presentation, PDP selection updates, price-filter matching, sort keys, and subtotal calculation explicitly.

3. **The product-to-SKU relationship is internally inconsistent:** A product with many variants is specified as containing a singular “SKU ID” while each SKU also references its product.

   **Fix:** Remove SKU IDs from `Product` and derive them by `SKU.productId`, avoiding duplicated bidirectional state.

4. **Related-product cycle rejection is unjustified:** Reciprocal recommendations such as A→B and B→A are legitimate, and the UI only needs to render one level.

   **Fix:** Reject unknown, duplicate, and self-references but allow cycles while explicitly limiting related-product rendering to one level.

5. **Accessibility focus behavior conflicts with filtering:** Every `router.replace` query update is a route transition, so moving focus to the heading would eject keyboard users from filters and interrupt debounced typing.

   **Fix:** Move focus only after pathname/document navigation; retain focus and announce result counts for query-only updates.

6. **The zero-network test is incompatible with App Router:** Client navigation can legitimately issue first-party RSC requests, making “no fetch/XHR” flaky or impossible.

   **Fix:** Permit first-party framework requests while asserting that no request contains form values and no request, beacon, or navigation targets an external origin.

7. **Checkout routing contradicts itself:** Completion is both part of a same-route state machine and a separately navigated page, while consuming `sessionStorage` is fragile during remounts and Strict Mode.

   **Fix:** Define `/checkout` and `/checkout/complete` explicitly, keep completion eligibility in a checkout-layout memory provider, and treat direct access or reload as invalid without using `sessionStorage`.

8. **Favorites still lack the resilience specified for the cart:** Its storage schema, validation, migration, cross-tab behavior, and unavailable-storage fallback remain undefined.

   **Fix:** Give favorites a versioned product-ID schema with validation, hydration gating, storage-event synchronization, and memory fallback.

9. **The no-exfiltration claim lacks browser-level enforcement:** Tests alone will not prevent a future dependency or accidental form action from transmitting data.

   **Fix:** Add preview/production security headers with a compatible CSP restricting connections to self and forms to none, plus `frame-ancestors`, `Referrer-Policy`, and `X-Content-Type-Options`.

VERDICT: REVISE

### Codex orchestrator's response

Accepted all nine findings and revised the plan:

- Narrowed every privacy promise to “not transmitted or persisted; temporarily processed in current-page memory.”
- Defined effective SKU pricing, product-card ranges, PDP updates, inclusive price filtering, sort keys, subtotals and shipping-threshold inputs.
- Removed duplicated SKU references from `Product`; SKU membership is derived only by `SKU.productId`.
- Allowed reciprocal related-product cycles while rejecting unknown, duplicate and self IDs; rendering is one level only.
- Split focus behavior between pathname/document navigation and query-only updates so filtering retains keyboard focus and announces counts.
- Adjusted privacy tests to allow first-party Next.js RSC requests while forbidding form values in any request and all external-origin transport.
- Defined `/checkout` and `/checkout/complete` under a memory-only checkout layout provider; direct access/reload is invalid and no `sessionStorage` completion token is used.
- Added a complete versioned favorites storage, validation, hydration, multi-tab and fallback contract.
- Added CSP and security-header requirements for preview/production with a separate localhost-only HMR allowance in development.

No finding was rejected in this round.

## Round 3 — Codex

All nine findings from the previous round are addressed. Four new implementation risks remain in `PLAN.md`.

1. **Debounced query updates can lose filters:** A delayed search update created from stale parameters can overwrite a color/category change, and rapid facet toggles can similarly clobber each other.

   **Fix:** Route every query mutation through one coordinator holding the latest draft state, cancel or sequence stale debounce callbacks, serialize atomically, and test rapid mixed updates.

2. **The CSP is still underspecified:** “Minimize as Next.js requires” permits an accidentally permissive policy, while the test only establishes that headers exist.

   **Fix:** Define an exact production baseline including `default-src 'self'` and `object-src 'none'`, prohibit wildcards/external origins/`unsafe-eval`, document unavoidable exceptions, and assert parsed directive values.

3. **Performance acceptance is not reproducible:** Lighthouse scores vary by cache and environment, and a page-load audit alone does not establish the stated INP threshold.

   **Fix:** Specify production `next start`, fixed mobile throttling, cold-cache runs, a three-run median, and either a scripted interaction measurement for INP or an explicit lab proxy.

4. **There is no page-level visual QA gate:** Asset approval and three viewport test runs do not detect typography regressions, awkward crops, overflow, or editorial-layout failures.

   **Fix:** Capture and manually approve full-page screenshots of every route at the three target viewports, recording failures for overflow, cropping, hierarchy, spacing, and fallback fonts.

VERDICT: REVISE

### Codex orchestrator's response

Accepted all four findings and revised the plan:

- Added a single `CatalogQueryCoordinator` with latest-draft ownership, atomic serialization, debounce cancellation, stale sequence rejection and rapid mixed-mutation tests.
- Replaced the open-ended CSP with an exact nonce-based preview/production baseline, a single documented inline-style exception, prohibited wildcard/external origins/`unsafe-eval`, added complementary security headers and required directive-value assertions. Development has a separate localhost-only policy.
- Made performance runs reproducible against `pnpm build && pnpm start` with fixed viewport, throttling, cold cache, three-run median and recorded environment. Replaced the unprovable prototype INP claim with TBT plus scripted interaction latency as lab proxies; real INP is deferred to production RUM.
- Added a route manifest and a manual full-page screenshot approval gate for every concrete route at all three target viewports, with results recorded in `VISUAL-QA.md`.

No finding was rejected in this round.

## Round 4 — Codex

All four prior findings are addressed in `PLAN.md`:

- Query mutations are atomic and protected against stale debounce callbacks.
- CSP directives are explicit, fail-closed, and tested semantically.
- Performance measurements now have a reproducible protocol.
- Route-wide visual QA has concrete approval criteria.

The revised additions remain consistent with the existing privacy, checkout, storage, accessibility, and deployment boundaries. I found no new material blocker; remaining details are normal implementation choices covered by the tests and acceptance gates.

VERDICT: APPROVED
