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

### v2 Round 3 — Codex orchestrator's response

Accepted all eleven findings and revised `PLAN.md`:

- Replaced implied Auth-only and worker Supabase secrets with an exact privilege boundary: workers use a SCRAM `worker_rpc_caller` with EXECUTE-only grants, while the unavoidable Auth Admin secret lives in a separate AWS Lambda trust domain with SigV4 ingress, durable idempotency and network-enforced Auth-only egress.
- Replaced the contradictory zero-table-grant function owners with a migration-verified per-function owner／table／column／sequence privilege matrix; callers retain EXECUTE-only access.
- Converted bootstrap, invitation, suspension, session revocation, MFA recovery and credential rotation into recoverable Auth sagas with provisional memberships, explicit invitation delivery, stable operation IDs, partial-success reconciliation and crash tests after every remote success.
- Kept the exact `connect-src 'self'` CSP by routing login, refresh, MFA and recovery entirely through same-origin BFF endpoints; the admin browser never connects directly to Supabase.
- Made the QueryTradeInfo-confirmed `succeeded` transaction the sole producer of sale inventory, invoice and fulfillment outbox work; callbacks and return pages remain non-authoritative.
- Removed generic `proven_absent`: only authenticated provider evidence of terminal non-application after the maximum propagation window may become `retry_safe`; ambiguous absence remains in manual review indefinitely.
- Canonicalized reservation completion as `consumed`, defined exact `on_hand`／`reserved` deltas and made `sale` only an inventory movement.
- Replaced same-control-plane Blob backups with client-encrypted database and private-object backups in a separate AWS account using S3 Object Lock, 30-day immutable retention, age X25519 recovery encryption and 2-of-3 independent custody; quarterly restore assumes Supabase and Vercel are unavailable.
- Fixed Blob regions to `hnd1` at creation and expanded the residency register to every actual storage／processing country and subprocessor, including Resend's US metadata／log storage despite Tokyo sending.
- Added a disposable Tokyo Supabase rehearsal project for every release touching Auth, Vault, grants, Cron, extensions or migrations, with external effects disabled, evidence captured and the project destroyed within 24 hours.
- Froze a reproducible legitimate-traffic fixture, five deterministic seeds, a 20,000-command minimum, an exact false-positive denominator and a one-sided 95% Wilson upper bound of 1%.

Also incorporated the independent cross-checks: all public responses perform a no-store DB／Edge safety-revision check before cache access; critical mutations use restrictive Edge-first fencing; one uncompromised AAL2 Owner can quarantine immediately while 2-of-3 break-glass is recovery-only; logical KEK／HMAC values have an independently encrypted offline escrow; public analytics has a positive CSP test or is disabled; ECPay queries share a durable token bucket and 403 circuit breaker; backlog lag starts at `available_at`; Email OTP is HMAC-only, bounded and atomically consumed; and checkout consent is bound to a server-owned legal bundle with `409 TERMS_CHANGED` on publish races.

No finding was rejected in this round.

### Canonical v2 review index after Round 3

This index is the sole authority for identifying v2 review blocks. SHA-256 is calculated over the exact UTF-8 bytes emitted by `sed -n '<start>,<end>p' PLAN-REVIEW-LOG.md`, including each emitted newline:

| Block | Immutable line span | SHA-256 |
|---|---:|---|
| v2 Round 1 review and verdict | 331–415 | `48e5b5a635b6b12217147541be1cb623d8e04a3b31619e6f638556d0e0e2dbbd` |
| v2 Round 1 response | 421–443 | `f9616645d4e40c75adf12517f34f798cfb604e2e97fe75a77434af0a4e9124ca` |
| v2 Round 2 review and verdict | 445–501 | `9e897bf471fa1eed07ec230ebe9a5374a43d364d4711bd2512bd09861f793d95` |
| v2 Round 2 response | 503–523 | `b8da2be88d08b8836be772ddb706dd800c0bf98b493262e5955948b63a2a4404` |
| v2 Round 3 review and verdict | 525–573 | `374b4ca1332f0504f6b62d29bc4cb22b0dc92f48daf17649e64a46a2aeb239ac` |
| v2 Round 3 response | 575–593 | `d4fe937c87b44d464de1035863d35d42e94b3a0776a707abb6f917ef129d3e4a` |

Lines 1–327 are legacy prototype history or misplaced append attempts and are explicitly **non-authoritative for the v2 plan**, including every earlier heading named `v2 Round 1`, `v2 Round 2`, or `v2 Round 3` and every response beneath those headings. Lines 417–419 are append-only correction context, not a review or response. Future v2 rounds are authoritative only when a later canonical index appends their exact line span and SHA-256; an unindexed duplicate heading has no authority.

### Log placement correction — v2 Round 1

The earlier block headed `### Codex orchestrator's response` immediately after the legacy prototype Round 1 was accidentally appended at the wrong matching `VERDICT: REVISE`. It describes the v2 Round 1 response, not the prototype review. To preserve this file's append-only history, that misplaced block is not deleted or rewritten. The authoritative v2 Round 1 response is repeated immediately below, after its matching verdict.

### v2 Round 1 — Codex orchestrator's response

Accepted all twenty findings and revised `PLAN.md`:

- Split immutable deployment capability from audited shared runtime controls, added canonical-host enforcement and Deployment Protection for generated／old deployment URLs, and defined separate readiness predicates so stopping checkout cannot disable callbacks or existing-order operations.
- Clarified that Preview and Production use the same reviewed commit but separate environment-bound builds; live decisions are runtime-only.
- Routed every admin and PII operation through a Next.js BFF using least-privilege roles／RPCs, field-level access audit and hardened `SECURITY DEFINER` functions; `service_role` is isolated to verified machine work.
- Added SKU／cart／order and active-hold quotas, escalating bot controls, verified Email before reservation, non-authoritative last-seen cart price versions, and an audited manual paid-order recovery process.
- Reworked the 20-minute hold into a customer deadline plus `release_pending`: no stock is released while ECPay may still accept payment. A provider-confirmed hard deadline／cancellation semantic is now a launch gate, with query and callback grace before release.
- Made the inventory ledger authoritative through one locked atomic command, constraints and scheduled three-way reconciliation.
- Made the Apple Pay runtime flag control the actual ECPay payload with `IgnorePayment=ApplePay`, not only storefront copy.
- Encoded the complete paperless invoice option matrix and made an unsupported paperless company-invoice route a launch blocker.
- Added pre-payment cartonization, parcel／value／restricted-goods checks, versioned carrier profiles, a three-parcel cap and a customer-first loss／damage policy.
- Added complete field／blob classification, envelope encryption, nonce／AAD／purpose-key rules, dual-key HMAC rotation and audited decryption.
- Added provider-operation `unknown` recovery, stable correlation IDs, locked compare-and-set transitions, reconciliation and crash-injection tests for every remote-success／local-commit boundary.
- Added scheduler leases, advisory locks, heartbeats and an independent external dead-man monitor.
- Made cache invalidation a transactional, versioned outbox operation, imposed a five-minute catalog ISR ceiling and added audited emergency purge／no-cache behavior.
- Defined a signed Resend inbound pipeline with threading, quarantine and staff BFF access; removed paid repair transactions from V1 while retaining Care & Repair inquiries and normal defect support.
- Added one-shot Owner bootstrap, exact Auth redirect URLs, two-Owner live minimum, recovery codes, session revocation and final-Owner protections.
- Replaced mutable consent-version references with immutable locale-specific legal snapshots and hashes.
- Added a one-workday build-versus-buy ADR comparing the locked must-haves against managed Taiwan commerce platforms. It does not silently change the user’s chosen stack: if a managed option fully meets the non-negotiables at materially lower risk, implementation pauses and returns the evidence to the user; otherwise the custom plan proceeds.

No finding was rejected in this round.

## v2 Round 2 — Codex

Material problems remain:

1. **The admin credential model is contradictory.** Owner invitations and Auth-factor recovery require a privileged Supabase Auth Admin client, but [PLAN.md:57](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:57>) reserves `service_role` for webhooks/workers and defines no privileged admin path. Supabase’s Auth Admin methods are server-only, while service-role/secret keys bypass RLS. [Supabase Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [service-role behavior](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)

   Fix: Specify an isolated Auth control-plane client, its credential lifecycle, exact Owner+AAL2 authorization, audit requirements, and prohibit its use by ordinary BFF or worker code.

2. **Concurrent payment attempts can double-charge an order.** The plan permits three attempts but only constrains the eventual number of successful database rows; two simultaneously payable hosted forms may both settle before either callback wins the local constraint ([PLAN.md:178](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:178>), [PLAN.md:189](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:189>)).

   Fix: Enforce one nonterminal/payable attempt per order or reservation with a partial unique constraint, aggregate lock, and provider-confirmed termination before issuing a replacement form.

3. **Manual recovery trusts a phone number that was never verified.** Checkout verifies only Email possession, yet recovery calls the “verified phone” and treats it as evidence for changing the order Email ([PLAN.md:165](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:165>), [PLAN.md:238](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:238>)).

   Fix: Either verify the phone independently before payment or explicitly treat it as untrusted and require independent provider-backed proof plus dual-Owner approval.

4. **The two-Owner invariant blocks emergency containment.** With exactly two Owners, [PLAN.md:264](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:264>) forbids suspending either one—even when an account is demonstrably compromised.

   Fix: Apply the two-Owner minimum only to enabling commerce and add an emergency transaction that disables commerce, revokes sessions, and suspends a compromised Owner immediately.

5. **The provider-operation state machine contradicts its recovery prose.** [PLAN.md:271](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:271>) defines `unknown → reconciled`, while the next line requires reconciliation to produce success, retry, or manual review; `reconciled` records no actual outcome and `manual_review` is not a state.

   Fix: Define explicit transitions from `unknown` to `succeeded`, `failed_retryable`, `failed_terminal`, or `manual_review`, including who may resolve each state and with what evidence.

6. **Automatic catalog fail-safe changes are unauthorized by the runtime-control rules.** Every control change requires an Owner, while the incident actor may mutate only two commerce flags, yet cache failure supposedly sets `catalog_emergency_no_cache=true` automatically ([PLAN.md:21](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:21>), [PLAN.md:22](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:22>), [PLAN.md:312](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:312>)).

   Fix: Authorize a narrowly scoped incident principal to perform this monotonic safety transition using the same transactional CAS and audit controls, or remove the automatic claim.

7. **Key rotation is incompatible with “instant” deployment rollback.** Encryption/HMAC keys live in deployment environment configuration, but an old deployment may lack newly introduced reader keys and become unable to process newer records after rollback ([PLAN.md:41](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:41>), [PLAN.md:287](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:287>), [PLAN.md:369](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:369>)). Vercel states environment changes apply only to new deployments and rollback can restore stale configuration. [Environment variables](https://vercel.com/docs/environment-variables), [Instant Rollback](https://vercel.com/docs/instant-rollback)

   Fix: Use a versioned external keyring and reader-before-writer rotation, and rebuild the previous commit with current keys instead of rolling traffic to a key-incompatible deployment.

8. **The advertised support address will not reach the configured inbound domain.** The site advertises `care@estatelignee.com`, but Resend MX is configured only for `reply.estatelignee.com` ([PLAN.md:243](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:243>), [PLAN.md:244](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:244>)); subdomain MX does not receive apex-domain mail. [Resend receiving-domain documentation](https://resend.com/docs/dashboard/receiving/custom-domains)

   Fix: Provision apex mail reception/forwarding for `care@estatelignee.com` or consistently publish an address under the verified receiving subdomain.

9. **Public-page CSP, ISR, and JSON-LD have no compatible implementation decision.** Public CSP conditionally forbids `dangerouslySetInnerHTML`, while server-generated JSON-LD normally requires an inline script; per-request nonces would also undermine static/ISR caching ([PLAN.md:302](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:302>), [PLAN.md:311](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:311>), [PLAN.md:324](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:324>)).

   Fix: Choose a cache-compatible nonce/hash strategy and mandate a serializer that escapes `<`, script terminators, and Unicode separators, with malicious catalog-content fixtures.

10. **Sensitive-route analytics exclusion is an assertion, not an enforceable design.** The plan neither specifies route-group-only mounting nor a fail-closed event filter, and its test suite lacks a browser-network assertion proving zero analytics requests on checkout, order-token, and admin pages ([PLAN.md:321](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:321>), [PLAN.md:346](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:346>)).

   Fix: Mount analytics only inside an explicitly public route group and add E2E network tests that fail on any analytics request from sensitive routes.

11. **The abuse acceptance criterion is impossible to prove.** Per-Email/session/IP quotas do not stop an attacker using many mailboxes and distributed IPs, yet the test claims it will prove that one source “cannot” monopolize inventory ([PLAN.md:177](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:177>), [PLAN.md:340](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:340>)).

   Fix: Define a bounded threat model and measurable limits for attack load, reserved-stock fraction, hold duration, false-positive rate, and recovery instead of an absolute non-monopolization claim.

12. **Scheduler observability detects missed invocations, not a live-but-stuck commerce pipeline.** A worker can continue emitting heartbeats while `unknown`, `release_pending`, retry, or dead-letter backlogs grow indefinitely ([PLAN.md:279](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:279>), [PLAN.md:280](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:280>)).

   Fix: Alert on oldest-job age, queue depth, lease churn, `unknown`/`release_pending` age, reconciliation lag, and dead-letter growth independently of scheduler heartbeats.

13. **The review log is not append-only as claimed.** The response to the current twenty findings appears inside the older prototype-review section at [PLAN-REVIEW-LOG.md:70](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN-REVIEW-LOG.md:70>), while the current v2 Round 1 ends without a following response at [PLAN-REVIEW-LOG.md:309](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN-REVIEW-LOG.md:309>).

   Fix: Place each response immediately after its matching v2 round with explicit round identifiers so the review history is chronologically auditable.

VERDICT: REVISE

### Codex orchestrator's response

Accepted all twenty findings and revised `PLAN.md`:

- Split immutable deployment capability from audited shared runtime controls, added canonical-host enforcement and Deployment Protection for generated／old deployment URLs, and defined separate readiness predicates so stopping checkout cannot disable callbacks or existing-order operations.
- Clarified that Preview and Production use the same reviewed commit but separate environment-bound builds; live decisions are runtime-only.
- Routed every admin and PII operation through a Next.js BFF using least-privilege roles／RPCs, field-level access audit and hardened `SECURITY DEFINER` functions; `service_role` is isolated to verified machine work.
- Added SKU／cart／order and active-hold quotas, escalating bot controls, verified Email before reservation, non-authoritative last-seen cart price versions, and an audited manual paid-order recovery process.
- Reworked the 20-minute hold into a customer deadline plus `release_pending`: no stock is released while ECPay may still accept payment. A provider-confirmed hard deadline／cancellation semantic is now a launch gate, with query and callback grace before release.
- Made the inventory ledger authoritative through one locked atomic command, constraints and scheduled three-way reconciliation.
- Made the Apple Pay runtime flag control the actual ECPay payload with `IgnorePayment=ApplePay`, not only storefront copy.
- Encoded the complete paperless invoice option matrix and made an unsupported paperless company-invoice route a launch blocker.
- Added pre-payment cartonization, parcel／value／restricted-goods checks, versioned carrier profiles, a three-parcel cap and a customer-first loss／damage policy.
- Added complete field／blob classification, envelope encryption, nonce／AAD／purpose-key rules, dual-key HMAC rotation and audited decryption.
- Added provider-operation `unknown` recovery, stable correlation IDs, locked compare-and-set transitions, reconciliation and crash-injection tests for every remote-success／local-commit boundary.
- Added scheduler leases, advisory locks, heartbeats and an independent external dead-man monitor.
- Made cache invalidation a transactional, versioned outbox operation, imposed a five-minute catalog ISR ceiling and added audited emergency purge／no-cache behavior.
- Defined a signed Resend inbound pipeline with threading, quarantine and staff BFF access; removed paid repair transactions from V1 while retaining Care & Repair inquiries and normal defect support.
- Added one-shot Owner bootstrap, exact Auth redirect URLs, two-Owner live minimum, recovery codes, session revocation and final-Owner protections.
- Replaced mutable consent-version references with immutable locale-specific legal snapshots and hashes.
- Added a one-workday build-versus-buy ADR comparing the locked must-haves against managed Taiwan commerce platforms. It does not silently change the user’s chosen stack: if a managed option fully meets the non-negotiables at materially lower risk, implementation pauses and returns the evidence to the user; otherwise the custom plan proceeds.

No finding was rejected in this round.

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

---

# Plan Review Log: LIGNÉE 正式營運商城 v2
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## Round 1 — Codex

Material problems remain:

1. **The emergency kill switch is not actually runtime-safe.** The plan treats `CHECKOUT_ENABLED` as both deployment configuration and something incidents can automatically change ([PLAN.md:249](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:249>)); Vercel environment changes affect only new deployments, while older deployment URLs retain old values. [Vercel documentation](https://vercel.com/docs/environment-variables)

   **Fix:** Use the environment flag only as an immutable upper bound, AND it with an audited shared runtime switch, fail closed when that switch is unreadable, reject commerce on non-canonical hosts, and protect old deployment URLs.

2. **“Fail closed” can accidentally disable post-payment operations.** Global configuration validation in [PLAN.md:17](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:17>) conflicts with the requirement that callbacks, refunds, invoices, and fulfillment continue after checkout is disabled.

   **Fix:** Define separate readiness predicates for checkout, payment callbacks, fulfillment, refunds, invoicing, and admin so a missing checkout-only dependency cannot take down existing-order processing.

3. **The deployment artifact policy is contradictory.** Preview builds must use demo adapters without production secrets, yet production is supposed to use the same artifact ([PLAN.md:324](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:324>)); static metadata, adapters, and flags can be baked at build time.

   **Fix:** Require the same reviewed commit, not the Preview artifact, and build a production-disabled artifact with production environment bindings while keeping all live-state decisions runtime-only.

4. **The admin/PII access architecture cannot work as written.** Admin browsers call Supabase RPCs directly ([PLAN.md:46](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:46>)), but the key needed to decrypt PII exists only in the Next.js server ([PLAN.md:253](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:253>)); meanwhile `service_role` always bypasses RLS. [Supabase documentation](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)

   **Fix:** Route every PII operation through a Next.js BFF using dedicated least-privilege database roles/RPCs, audited field-level decryption, isolated no-cookie clients, and hardened `SECURITY DEFINER` functions with empty `search_path`.

5. **Anonymous reservations permit trivial stock denial-of-service.** Rate limiting exists, but there are no per-SKU quantity limits, cart/order caps, or concurrent-reservation quotas before 20-minute holds are created.

   **Fix:** Add SKU/cart/order limits, per-checkout and per-identity active-hold quotas, escalating bot controls, and tests proving distributed reservation spam cannot monopolize launch inventory.

6. **Reservation expiry is not synchronized with ECPay’s payment window.** A reservation may be released while the hosted payment remains payable, deliberately creating the `paid_exception` path in [PLAN.md:166](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:166>).

   **Fix:** Establish a provider-confirmed payment deadline, stop creating payable attempts beyond it, query pending attempts before release, and retain a bounded grace hold for callbacks already in flight.

7. **Inventory counters and the movement ledger can diverge.** `on_hand`, `reserved`, and `safety_stock` are mutable counters beside an append-only ledger, but no database invariants make either representation authoritative.

   **Fix:** Permit inventory changes through one locked database command that writes movement and counters atomically, with CHECK constraints and scheduled ledger-to-balance reconciliation.

8. **The cart cannot detect old versus new prices after reload.** It persists only SKU/product identifiers ([PLAN.md:151](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:151>)﻿) but promises to display the previous price when pricing changes ([PLAN.md:153](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:153>)).

   **Fix:** Persist a non-authoritative last-seen price-version snapshot beside each SKU, using it only for change disclosure while always charging the server value.

9. **A mistyped email permanently strands a paid guest order.** Email possession is the only authentication mechanism, ordinary email/phone cannot perform recovery, and no verified alternate recovery process exists.

   **Fix:** Verify the email before redirect or require confirmation entry, then define a rate-limited, audited manual recovery procedure for paid orders whose original mailbox is inaccessible.

10. **The Apple Pay flag does not control the provider page.** ECPay states that `ChoosePayment=Credit` automatically displays Apple Pay; hiding only the storefront label still exposes it. [ECPay announcement](https://www.ecpay.com.tw/Announcement/DetailAnnouncement?nID=5599)

   **Fix:** When the flag is false, send and contract-test `IgnorePayment=ApplePay`; when true, verify merchant capability, device behavior, and the exact production payload.

11. **Invoice choices lack ECPay’s required compatibility matrix.** Tax-ID, carrier, donation, `Print`, company name, and invoice address have mutually dependent rules; the current “no paper” promise and absence of a separate invoice address do not define a valid company-invoice path. [ECPay invoice specification](https://developers.ecpay.com.tw/53662/)

   **Fix:** Encode the provider’s complete option matrix in server validation and either require a compatible carrier for paperless tax-ID invoices or collect the required company name/address and disclose printing.

12. **Shipping eligibility is checked too late.** Dimensions and weights are stored, but flat-rate checkout never performs cartonization, parcel-count, carrier weight/size, restricted-goods, declared-value, or insurance validation before payment.

   **Fix:** Add server-side shipment planning before reservation/payment, with hard parcel and order-value limits plus an explicit multi-parcel pricing and compensation policy.

13. **The PII classification and encryption design is incomplete.** Gift messages, order notes, appointments, support text, audit diffs, and uploaded image content can contain PII, while the AES plan omits nonce uniqueness, AAD binding, key separation, and searchable-HMAC rotation.

   **Fix:** Create a field-level data classification and envelope-encryption specification covering every free-text/blob field, per-purpose keys, unique nonces, row/column AAD, decrypt-only old keys, rotation/backfill, and audited access.

14. **External side-effect recovery remains underspecified.** “Query before retry” does not resolve refund, invoice, or shipping calls that succeeded remotely but crashed before local commit, nor races such as cancellation versus pickup or two Owner actions.

   **Fix:** Define provider-operation states including `unknown`, stable external correlation IDs, locked compare-and-set transitions, reconciliation rules, and crash-injection tests after every remote-success/local-commit boundary.

15. **Cron failure can remain silent.** Vercel may duplicate or overlap invocations and does not retry failed cron jobs; `SKIP LOCKED` protects individual jobs but does not provide scheduler health or missed-run detection. [Vercel cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

   **Fix:** Add scheduler advisory locks, bounded claims with lease recovery, per-schedule heartbeats, and an external dead-man alert independent of the application database and Resend.

16. **Publishing and ISR invalidation form an unhandled dual write.** The database can publish/archive a product successfully while tag invalidation fails, leaving stale pricing or even recalled content publicly cached.

   **Fix:** Emit versioned cache-invalidation jobs transactionally, retry them through the outbox, impose a maximum ISR TTL, and provide an emergency global purge/no-cache mode.

17. **The promised support and repair workflows are not operationally complete.** `care@` is declared as an inbound channel without MX/webhook, threading, spam, attachment, or staff-access handling, and paid repair quotes have no service-order, payment, refund, or invoice lifecycle. Resend inbound requires explicit receiving-domain and webhook setup. [Resend documentation](https://resend.com/docs/knowledge-base/how-can-i-receive-emails-with-resend)

   **Fix:** Specify and test the inbound mail pipeline—including attachment quarantine—or choose a staffed mailbox provider, and either add a complete repair-service commerce lifecycle or remove paid repairs from V1.

18. **Admin bootstrap and recovery are missing.** Owner invitation, lost TOTP recovery, last-Owner lockout, password reset, session revocation, and production redirect allowlists are undefined; wildcard production Auth redirects would expose recovery sessions. [Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls)

   **Fix:** Require two recoverable Owners or an audited break-glass process, exact production Auth redirect URLs, isolated provisioning credentials, recovery codes, session revocation tests, and a prohibition on removing the final Owner.

19. **Consent evidence stores references, not immutable evidence.** Saving only “terms/privacy/return versions” does not prove what content was shown if a document is edited in place.

   **Fix:** Store immutable legal-document records containing locale, rendered-body hash, publication timestamp, and exact document snapshot referenced by each consent.

20. **The custom platform decision lacks a build-versus-buy gate.** This plan creates payment, inventory, invoicing, logistics, returns, support, CMS, IAM, encryption, backup, and incident systems for a 50-product launch without demonstrating that a managed Taiwan-commerce platform cannot satisfy the requirements.

   **Fix:** Time-box a documented managed-platform comparison and proceed with the custom stack only if specific non-negotiable requirements outweigh its security, operating, and delivery cost.

VERDICT: REVISE

### Append-only placement correction — authoritative v2 sequence

Two attempted append operations matched the legacy prototype's first `VERDICT: REVISE` rather than the v2 verdict at the end of the file. Those misplaced blocks remain untouched so the log is genuinely append-only. From this heading onward, explicit `v2` round identifiers are authoritative and chronological.

### v2 Round 1 — Codex orchestrator's response

Accepted all twenty findings and revised `PLAN.md`:

- Split immutable deployment capability from audited shared runtime controls, added canonical-host enforcement and Deployment Protection for generated／old deployment URLs, and defined separate readiness predicates so stopping checkout cannot disable callbacks or existing-order operations.
- Clarified that Preview and Production use the same reviewed commit but separate environment-bound builds; live decisions are runtime-only.
- Routed every admin and PII operation through a Next.js BFF using least-privilege roles／RPCs, field-level access audit and hardened `SECURITY DEFINER` functions; machine and human access are isolated.
- Added SKU／cart／order and active-hold quotas, escalating bot controls, verified Email before reservation, non-authoritative last-seen cart price versions, and an audited manual paid-order recovery process.
- Reworked the 20-minute hold into a customer deadline plus `release_pending`: no stock is released while ECPay may still accept payment. A provider-confirmed hard deadline／cancellation semantic is now a launch gate.
- Made the inventory ledger authoritative through one locked atomic command, constraints and scheduled three-way reconciliation.
- Made the Apple Pay runtime flag control the actual ECPay payload with `IgnorePayment=ApplePay`, not only storefront copy.
- Encoded the paperless invoice option matrix and made an unsupported paperless company-invoice route a launch blocker.
- Added pre-payment cartonization, parcel／value／restricted-goods checks, versioned carrier profiles, a three-parcel cap and a customer-first loss／damage policy.
- Added field／blob classification, envelope encryption, nonce／AAD／purpose-key rules, HMAC rotation and audited decryption.
- Added provider-operation `unknown` recovery, stable correlation IDs, locked compare-and-set transitions, reconciliation and crash-injection tests.
- Added scheduler leases, advisory locks, heartbeats and an independent external dead-man monitor.
- Made cache invalidation a transactional, versioned outbox operation, imposed a five-minute data ceiling and added emergency purge／no-cache behavior.
- Defined a signed Resend inbound pipeline with threading, quarantine and staff BFF access; removed paid repair transactions from V1.
- Added Owner bootstrap, exact Auth redirect URLs, two-Owner live minimum, recovery codes, session revocation and final-Owner protections.
- Replaced mutable consent-version references with immutable locale-specific legal snapshots and hashes.
- Added a one-workday build-versus-buy ADR that returns any qualifying managed-platform evidence to the user rather than silently changing the chosen stack.

No finding was rejected in this round.

## v2 Round 2 — Codex

Material problems remain:

1. **The admin credential model is contradictory.** Owner invitations and Auth-factor recovery require a privileged Supabase Auth Admin client, but [PLAN.md:57](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:57>) reserves `service_role` for webhooks/workers and defines no privileged admin path. Supabase’s Auth Admin methods are server-only, while service-role/secret keys bypass RLS. [Supabase Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [service-role behavior](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)

   Fix: Specify an isolated Auth control-plane client, its credential lifecycle, exact Owner+AAL2 authorization, audit requirements, and prohibit its use by ordinary BFF or worker code.

2. **Concurrent payment attempts can double-charge an order.** The plan permits three attempts but only constrains the eventual number of successful database rows; two simultaneously payable hosted forms may both settle before either callback wins the local constraint ([PLAN.md:178](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:178>), [PLAN.md:189](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:189>)).

   Fix: Enforce one nonterminal/payable attempt per order or reservation with a partial unique constraint, aggregate lock, and provider-confirmed termination before issuing a replacement form.

3. **Manual recovery trusts a phone number that was never verified.** Checkout verifies only Email possession, yet recovery calls the “verified phone” and treats it as evidence for changing the order Email ([PLAN.md:165](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:165>), [PLAN.md:238](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:238>)).

   Fix: Either verify the phone independently before payment or explicitly treat it as untrusted and require independent provider-backed proof plus dual-Owner approval.

4. **The two-Owner invariant blocks emergency containment.** With exactly two Owners, [PLAN.md:264](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:264>) forbids suspending either one—even when an account is demonstrably compromised.

   Fix: Apply the two-Owner minimum only to enabling commerce and add an emergency transaction that disables commerce, revokes sessions, and suspends a compromised Owner immediately.

5. **The provider-operation state machine contradicts its recovery prose.** [PLAN.md:271](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:271>) defines `unknown → reconciled`, while the next line requires reconciliation to produce success, retry, or manual review; `reconciled` records no actual outcome and `manual_review` is not a state.

   Fix: Define explicit transitions from `unknown` to `succeeded`, `failed_retryable`, `failed_terminal`, or `manual_review`, including who may resolve each state and with what evidence.

6. **Automatic catalog fail-safe changes are unauthorized by the runtime-control rules.** Every control change requires an Owner, while the incident actor may mutate only two commerce flags, yet cache failure supposedly sets `catalog_emergency_no_cache=true` automatically ([PLAN.md:21](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:21>), [PLAN.md:22](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:22>), [PLAN.md:312](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:312>)).

   Fix: Authorize a narrowly scoped incident principal to perform this monotonic safety transition using the same transactional CAS and audit controls, or remove the automatic claim.

7. **Key rotation is incompatible with “instant” deployment rollback.** Encryption/HMAC keys live in deployment environment configuration, but an old deployment may lack newly introduced reader keys and become unable to process newer records after rollback ([PLAN.md:41](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:41>), [PLAN.md:287](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:287>), [PLAN.md:369](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:369>)). Vercel states environment changes apply only to new deployments and rollback can restore stale configuration. [Environment variables](https://vercel.com/docs/environment-variables), [Instant Rollback](https://vercel.com/docs/instant-rollback)

   Fix: Use a versioned external keyring and reader-before-writer rotation, and rebuild the previous commit with current keys instead of rolling traffic to a key-incompatible deployment.

8. **The advertised support address will not reach the configured inbound domain.** The site advertises `care@estatelignee.com`, but Resend MX is configured only for `reply.estatelignee.com` ([PLAN.md:243](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:243>), [PLAN.md:244](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:244>)); subdomain MX does not receive apex-domain mail. [Resend receiving-domain documentation](https://resend.com/docs/dashboard/receiving/custom-domains)

   Fix: Provision apex mail reception/forwarding for `care@estatelignee.com` or consistently publish an address under the verified receiving subdomain.

9. **Public-page CSP, ISR, and JSON-LD have no compatible implementation decision.** Public CSP conditionally forbids `dangerouslySetInnerHTML`, while server-generated JSON-LD normally requires an inline script; per-request nonces would also undermine static/ISR caching ([PLAN.md:302](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:302>), [PLAN.md:311](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:311>), [PLAN.md:324](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:324>)).

   Fix: Choose a cache-compatible nonce/hash strategy and mandate a serializer that escapes `<`, script terminators, and Unicode separators, with malicious catalog-content fixtures.

10. **Sensitive-route analytics exclusion is an assertion, not an enforceable design.** The plan neither specifies route-group-only mounting nor a fail-closed event filter, and its test suite lacks a browser-network assertion proving zero analytics requests on checkout, order-token, and admin pages ([PLAN.md:321](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:321>), [PLAN.md:346](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:346>)).

   Fix: Mount analytics only inside an explicitly public route group and add E2E network tests that fail on any analytics request from sensitive routes.

11. **The abuse acceptance criterion is impossible to prove.** Per-Email/session/IP quotas do not stop an attacker using many mailboxes and distributed IPs, yet the test claims it will prove that one source “cannot” monopolize inventory ([PLAN.md:177](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:177>), [PLAN.md:340](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:340>)).

   Fix: Define a bounded threat model and measurable limits for attack load, reserved-stock fraction, hold duration, false-positive rate, and recovery instead of an absolute non-monopolization claim.

12. **Scheduler observability detects missed invocations, not a live-but-stuck commerce pipeline.** A worker can continue emitting heartbeats while `unknown`, `release_pending`, retry, or dead-letter backlogs grow indefinitely ([PLAN.md:279](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:279>), [PLAN.md:280](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:280>)).

   Fix: Alert on oldest-job age, queue depth, lease churn, `unknown`/`release_pending` age, reconciliation lag, and dead-letter growth independently of scheduler heartbeats.

13. **The review log is not append-only as claimed.** The response to the current twenty findings appears inside the older prototype-review section at [PLAN-REVIEW-LOG.md:70](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN-REVIEW-LOG.md:70>), while the current v2 Round 1 ends without a following response at [PLAN-REVIEW-LOG.md:309](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN-REVIEW-LOG.md:309>).

   Fix: Place each response immediately after its matching v2 round with explicit round identifiers so the review history is chronologically auditable.

VERDICT: REVISE

### v2 Round 2 — Codex orchestrator's response

Accepted all thirteen findings and revised `PLAN.md`:

- Added an isolated, server-only Supabase Auth control-plane client with a dedicated credential lifecycle, Owner+AAL2 intent authorization, immutable audit, import isolation and no Data API use.
- Enforced one nonterminal／payable ECPay attempt per order with a partial unique constraint; replacement attempts require an order lock and provider-confirmed termination. Safe release evaluates every attempt.
- Explicitly classified the order phone as unverified; changing the sole authentication Email now needs provider-backed payment proof, new-Email verification and two Owner approvals.
- Changed the two-Owner rule into a live gate and added a fail-safe emergency quarantine command plus offline dual-control break-glass recovery.
- Replaced the ambiguous provider-operation terminal with executable `unknown`, `proven_absent`, retry and `manual_review` transitions, stable identity across retries and evidence-based Owner resolution.
- Authorized only monotonic safe transitions for the incident principal and added a restrictive DB／Vercel Edge Config merge so old deployments, indexing and public cache fail safe.
- Moved KEK／HMAC versions to a Supabase Vault keyring, added reader-before-writer rotation and prohibited key-incompatible Instant Rollback; rollback rebuilds the prior commit with current secrets and validates reader capability.
- Configured apex-domain Resend receiving for `care@estatelignee.com` with opaque case reply aliases and a tested fallback mailbox path.
- Chose dynamic nonce rendering for all HTML instead of ISR HTML; added an exact Production CSP and nonce-bearing `SafeJsonLd` serializer with malicious-content tests. Only data and fingerprinted assets remain cached.
- Mounted Analytics／Speed Insights only in the public route group, added a fail-closed event schema and browser-network tests proving sensitive routes send no analytics requests.
- Replaced the impossible abuse claim with a bounded 30-minute threat model, hard `active | release_pending` quotas, SKU hold budgets／circuit breakers and measurable false-positive／recovery limits; larger Sybil attacks are a documented residual risk.
- Added per-schedule dead-man monitors plus independent oldest-job, queue-depth, lease-churn, reconciliation-lag and dead-letter alarms.
- Preserved the misplaced log text and appended an explicit authoritative v2 chronology instead of rewriting history.

Also incorporated the cross-check findings: callbacks enter `verification_pending` and require ECPay QueryTradeInfo agreement before consuming stock; published legal documents and order consents are DB-enforced append-only; the platform ADR has hard gates, weighted scoring and a deterministic `NEEDS_USER_DECISION`; live-capable deployment and rollback sequences are explicit.

No finding was rejected in this round.

## v2 Round 3 — Codex

The authoritative v2 log sequence is now chronological, but the plan still has material defects:

1. **Credential least privilege is not enforceable as written.** The worker credential type is unspecified, while the purported Auth-only Supabase secret in [PLAN.md:62](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:62>) cannot actually be scoped to Auth: Supabase secret keys use `service_role`, have full data access, and bypass RLS. [Supabase API-key documentation](https://supabase.com/docs/guides/getting-started/api-keys)

   Fix: Specify the exact worker authentication mechanism and isolate the unavoidable full Auth Admin secret behind a separate service/egress boundary instead of treating code-level prohibitions as credential permissions.

2. **The RPC-owner privilege model cannot execute its own functions.** [PLAN.md:59](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:59>) says the `SECURITY DEFINER` owners have no table read/write grants, but those functions execute as their owner and require explicit privileges on their underlying private tables.

   Fix: Define a per-function-owner table/sequence privilege matrix granting only the operations each allowlisted function needs, while callers retain EXECUTE-only access.

3. **Auth bootstrap and recovery still assume cross-system atomicity.** Creating two Supabase Auth users, database memberships, invitations, audits, and credential rotation cannot be one atomic operation, and Auth actions are absent from the side-effect fault-injection list ([PLAN.md:62](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:62>), [PLAN.md:265](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:265>), [PLAN.md:361](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:361>)).

   Fix: Model every Auth Admin action as an idempotent provider-operation saga with provisional memberships, partial-success reconciliation, explicit invitation-email delivery, and crash tests after each remote success.

4. **The CSP blocks the stated browser authentication path.** Admin browsers use Supabase Auth directly, but the fixed CSP permits only `connect-src 'self'`, which excludes the Supabase project origin ([PLAN.md:58](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:58>), [PLAN.md:318](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:318>)).

   Fix: Either proxy login, refresh, MFA, and recovery entirely through same-origin BFF routes or add the exact Supabase Auth origin to admin-only `connect-src` and test that no broader origin is allowed.

5. **Invoice issuance still bypasses the new payment-verification rule.** The callback is explicitly prohibited from marking payment successful, yet invoices are queued after a “successful payment webhook” rather than after QueryTradeInfo-confirmed `succeeded` ([PLAN.md:198](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:198>), [PLAN.md:199](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:199>), [PLAN.md:212](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:212>)).

   Fix: Emit the invoice outbox job only in the transaction that commits the query-verified payment attempt and order as `succeeded`.

6. **`proven_absent` is unsafe under provider eventual consistency.** A signed query authenticates its response but does not prove that an earlier request cannot appear later; automatically retrying from `proven_absent` can duplicate refunds, invoices, or shipments ([PLAN.md:284](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:284>), [PLAN.md:285](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:285>)).

   Fix: Allow automatic retry only after a provider-specific terminal-not-applied guarantee and maximum propagation window; otherwise retain `manual_review` indefinitely.

7. **The reservation schema uses contradictory terminal states.** The allowed state machine ends in `consumed`, payment text says the reservation becomes `sold`, and the query worker again says it consumes the reservation ([PLAN.md:184](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:184>), [PLAN.md:189](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:189>), [PLAN.md:199](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:199>)).

   Fix: Canonicalize the reservation terminal state as `consumed`, represent `sale` solely as an inventory movement, and specify exact `on_hand`/`reserved` deltas.

8. **The backup is neither administratively independent nor deletion-resistant.** The nightly dump goes to another store in the same Vercel control plane, with no immutable retention, object lock, backup-encryption recipient, or separate recovery-key custody defined ([PLAN.md:46](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:46>)).

   Fix: Store encrypted dumps in a separate account/provider with immutable retention, use a named KMS/age recovery-key scheme under dual custody, and test recovery after production and Vercel credentials are revoked.

9. **The data-residency disclosure is factually incomplete.** Blob region is unspecified even though its region is immutable after creation, while Resend states that account data, email metadata, logs, and API records remain in the US; [PLAN.md:314](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:314>) mentions only cross-border processing to Japan. [Vercel Blob regions](https://vercel.com/docs/vercel-blob), [Resend regions](https://resend.com/docs/dashboard/domains/regions)

   Fix: Freeze every Blob store region before creation and disclose every actual processing/storage country, retention path, and subprocessor—not only Japan.

10. **Production-only integrations lack a safe release-rehearsal environment.** Local Supabase and mocks cannot validate managed Auth, Vault root-key portability, Edge Config propagation, production grants, or managed cron, while the only remote database is Production ([PLAN.md:45](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:45>), [PLAN.md:359](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:359>)).

   Fix: Require a disposable Supabase branch or restore-to-new-project rehearsal for every release touching Auth, Vault, grants, cron, or migrations, then destroy it after evidence capture. [Supabase restore-to-new-project documentation](https://supabase.com/docs/guides/platform/clone-project)

11. **The abuse false-positive criterion remains statistically undefined.** “≤1%” has no population, sample size, traffic distribution, random seed, or confidence threshold, so contradictory test runs can all claim compliance ([PLAN.md:357](</Users/seniorlifepr/Documents/Quiet Luxury website/PLAN.md:357>)).

   Fix: Freeze the legitimate-traffic workload, minimum sample size, deterministic seed, classification denominator, and confidence interval used to accept the ≤1% threshold.

VERDICT: REVISE

### v2 Round 3 — Codex orchestrator's response

Accepted all eleven findings and revised `PLAN.md`:

- Replaced implied Auth-only and worker Supabase secrets with an exact privilege boundary: workers use a SCRAM `worker_rpc_caller` with EXECUTE-only grants, while the unavoidable Auth Admin secret lives in a separate AWS Lambda trust domain with SigV4 ingress, durable idempotency and network-enforced Auth-only egress.
- Replaced the contradictory zero-table-grant function owners with a migration-verified per-function owner／table／column／sequence privilege matrix; callers retain EXECUTE-only access.
- Converted bootstrap, invitation, suspension, session revocation, MFA recovery and credential rotation into recoverable Auth sagas with provisional memberships, explicit invitation delivery, stable operation IDs, partial-success reconciliation and crash tests after every remote success.
- Kept the exact `connect-src 'self'` CSP by routing login, refresh, MFA and recovery entirely through same-origin BFF endpoints; the admin browser never connects directly to Supabase.
- Made the QueryTradeInfo-confirmed `succeeded` transaction the sole producer of sale inventory, invoice and fulfillment outbox work; callbacks and return pages remain non-authoritative.
- Removed generic `proven_absent`: only authenticated provider evidence of terminal non-application after the maximum propagation window may become `retry_safe`; ambiguous absence remains in manual review indefinitely.
- Canonicalized reservation completion as `consumed`, defined exact `on_hand`／`reserved` deltas and made `sale` only an inventory movement.
- Replaced same-control-plane Blob backups with client-encrypted database and private-object backups in a separate AWS account using S3 Object Lock, 30-day immutable retention, age X25519 recovery encryption and 2-of-3 independent custody; quarterly restore assumes Supabase and Vercel are unavailable.
- Fixed Blob regions to `hnd1` at creation and expanded the residency register to every actual storage／processing country and subprocessor, including Resend's US metadata／log storage despite Tokyo sending.
- Added a disposable Tokyo Supabase rehearsal project for every release touching Auth, Vault, grants, Cron, extensions or migrations, with external effects disabled, evidence captured and the project destroyed within 24 hours.
- Froze a reproducible legitimate-traffic fixture, five deterministic seeds, a 20,000-command minimum, an exact false-positive denominator and a one-sided 95% Wilson upper bound of 1%.

Also incorporated the independent cross-checks: all public responses perform a no-store DB／Edge safety-revision check before cache access; critical mutations use restrictive Edge-first fencing; one uncompromised AAL2 Owner can quarantine immediately while 2-of-3 break-glass is recovery-only; logical KEK／HMAC values have an independently encrypted offline escrow; public analytics has a positive CSP test or is disabled; ECPay queries share a durable token bucket and 403 circuit breaker; backlog lag starts at `available_at`; Email OTP is HMAC-only, bounded and atomically consumed; and checkout consent is bound to a server-owned legal bundle with `409 TERMS_CHANGED` on publish races.

No finding was rejected in this round.

### Canonical v2 review index after Round 3 — superseding all earlier indexes

This is the sole authority for identifying v2 review blocks. SHA-256 is calculated over the exact UTF-8 bytes emitted by `sed -n '<start>,<end>p' PLAN-REVIEW-LOG.md`, including each emitted newline:

| Block | Immutable line span | SHA-256 |
|---|---:|---|
| v2 Round 1 review and verdict | 346–430 | `48e5b5a635b6b12217147541be1cb623d8e04a3b31619e6f638556d0e0e2dbbd` |
| v2 Round 1 response | 436–458 | `f9616645d4e40c75adf12517f34f798cfb604e2e97fe75a77434af0a4e9124ca` |
| v2 Round 2 review and verdict | 460–516 | `9e897bf471fa1eed07ec230ebe9a5374a43d364d4711bd2512bd09861f793d95` |
| v2 Round 2 response | 518–538 | `b8da2be88d08b8836be772ddb706dd800c0bf98b493262e5955948b63a2a4404` |
| v2 Round 3 review and verdict | 540–588 | `374b4ca1332f0504f6b62d29bc4cb22b0dc92f48daf17649e64a46a2aeb239ac` |
| v2 Round 3 response | 590–608 | `d4fe937c87b44d464de1035863d35d42e94b3a0776a707abb6f917ef129d3e4a` |

Lines 1–342 are legacy prototype history, misplaced append attempts or a superseded index and are explicitly **non-authoritative for the v2 plan**, including every heading named `v2 Round 1`, `v2 Round 2`, or `v2 Round 3` and every response／index beneath those headings. Lines 432–434 are append-only correction context, not a review or response. Future v2 rounds are authoritative only when a later canonical index appends their exact line span and SHA-256; an unindexed duplicate heading or earlier index has no authority.

### Pre-v2 Round 4 — orchestrator cross-audit supplement (not a formal review round)

Before spending the next formal Codex round, three independent read-only cross-audits stress-tested the revised plan. Their material findings were accepted and `PLAN.md` was tightened as follows:

- Made `payment_receipts` authoritative, added an authenticated QueryTradeInfo-only `provider_success_override`, canonical `paid_after_release`, exact full-receipt anomaly refunds for `duplicate_receipt | paid_after_release`, and reconcile-only handling for other attempts after the first applied receipt.
- Split approved-cancellation refund and invoice-adjustment lanes so invoice uncertainty cannot trap a legally approved refund; added committed `cancel_approved`, terminal carrier cancellation plus warehouse custody, exact-once `cancel_restock`, and pickup-race states/tests.
- Replaced assumed `BYPASSRLS` backup access with a disposable-project-proven NOBYPASSRLS／official-export fallback and fail-closed gate.
- Added Production-only, deployment-attested asset backup ingest; fragment-safe admin invite exchange; shared canary checkout CSP; and recovery-artifact retention tied to dependent ciphertext.
- Moved Ed25519 verification to the recovery gateway and added a versioned, DB-verifiable HMAC assertion with reader-before-writer rotation and draining prior verifiers.
- Added a manifest-bound AWS migration broker／runner path, including zero-Owner bootstrap, a unique per-run login, direct non-pooled sessions, strict timeouts, full backend termination by session user, and negative tests for unreported connections.
- Kept the Apple Pay canary off unless SKU #30's launch-approved immutable price is actually NT$2,200; otherwise a user-approved plan／ADR revision must select another exact in-catalog SKU and price.
- Explicitly froze Supabase Data API exposure to the `api` schema because current project defaults are configurable rather than a safe invariant.

All three cross-audits ended `APPROVED`; local checks confirmed 26 ordered sections, exactly 50 products, category totals `16/10/9/5/10`, chapter totals `13/9/11/7/10`, unchanged prior-block hashes and a clean `git diff --check`.

## v2 Round 4 — Codex

The prior payment/reservation findings are resolved, and the canonical review-log hashes match the referenced plan spans. Material blockers remain:

- **Vercel identity claims are invalid:** The Auth broker and asset-backup trust policies require attested deployment IDs and commits, but Vercel’s documented OIDC claims include project and environment—not deployment ID or commit—while the proposed fallback is unspecified. **Fix:** Define one concrete independently issued, short-lived deployment capability with issuance, binding, expiry, replay prevention, and revocation, and use it for both AWS paths. [Vercel OIDC claims](https://vercel.com/docs/oidc/reference)
- **The production crypto credential has a cross-deployment race:** Temporarily changing an environment-wide credential can expose it to any concurrent automatic, dashboard, or deploy-hook build; a mutex does not technically exclude those builds, and the database cannot distinguish deployments sharing the credential. **Fix:** Disable every competing production-deployment path or replace the environment mutation with a post-creation, deployment-specific brokered credential that is revoked if another deployment appears.
- **Recovery certificate enrollment is circular:** The gateway requires mTLS, but the plan never defines how custodians submit and authenticate the CSR/challenge before they possess the client certificate. **Fix:** Specify a separate hardware-signature-authenticated enrollment protocol with CSR binding, nonce expiry, replay protection, two-custodian approval, and auditable certificate issuance.
- **Partial returns lack an executable money/inventory/invoice model:** Cumulative quantity and refund caps do not define per-line accepted/refunded quantities, shipping allocation, rounding residuals, tax treatment, or allowance uniqueness under concurrent returns and manual refunds. **Fix:** Add a locked per-order/per-line return ledger and deterministic snapshot-based allocation rules, including one-time shipping refunds and unique refund/allowance operations.
- **Mixed multi-parcel cancellation is undefined:** If one parcel is picked up while others are successfully cancelled, the order-level “pickup wins and enters return” rule does not specify custody, restocking, fulfillment suppression, or refund timing for the unpicked parcels. **Fix:** Define a hybrid per-parcel/per-line saga that cancels and restocks unpicked parcels while independently returning and refunding picked-up parcels.
- **Chargebacks and provider reversals have no state machine:** Daily report reconciliation can detect them, but the plan defines no dispute ledger, fulfillment freeze, evidence deadline, accounting treatment, or invoice correction. **Fix:** Add idempotent dispute/chargeback/reversal events and transitions covering evidence, deadlines, order effects, accounting entries, and invoice adjustments.
- **Published media cannot reliably be revoked:** Fingerprinted media bypasses the safety revision and is cached immutably after one manifest check, so an exposed PII, rights-violating, or otherwise unsafe asset may remain accessible through its old URL. **Fix:** Give revocable media bounded caching plus tombstones and purge support, with an acceptance test proving the original URL becomes inaccessible after emergency revocation.

VERDICT: REVISE

### v2 Round 4 — Codex orchestrator's response

Accepted all seven findings and revised `PLAN.md`:

- Replaced nonexistent Vercel deployment／commit OIDC claims with one independently issued, DPoP-bound `deployment_capability`. An AWS release controller now obtains exact deployment facts through a credential-isolating L7 `VercelReleaseProxy`, challenges the immutable protected deployment URL, binds the reviewed SHA and per-deployment key in DynamoDB, and issues ≤5-minute scoped capabilities with nonce／`jti` replay prevention, generation checks and immediate revocation. Auth submission, immutable asset ingest and crypto unwrap all require official project／Production OIDC **plus** that capability and their own DB intent／job assertion.
- Removed the environment-wide crypto credential race. Vercel envs and artifacts never receive a `crypto_reader` SCRAM secret; a post-enrollment AWS broker creates one release role through hash-pinned, least-privilege lifecycle RPCs, keeps the credential only in its Secrets Manager, and proxies unwrap calls only for the matching active generation. Production auto-deploy, dashboard promotion, deploy hooks and env mutation are disabled or release-service-only. Promotion／rollback creates new bindings and roles, revokes memberships and old bindings, terminates every backend by exact `session_user`, and never revives an old credential. A separate lifecycle principal, recoverable rotation saga and disposable-Supabase privilege tests make role creation／rotation／revocation executable without sharing the Migration tenant-admin.
- Broke the recovery certificate cycle with a separate server-TLS `RecoveryCertificateEnrollment` service. The workstation creates a non-exportable key and CSR; two distinct hardware custodians sign a five-minute nonce manifest bound to the CSR hash, SPKI, purpose and operation. The enrollment service verifies proof-of-possession, atomically consumes the challenge and issues only a fixed 15-minute client-auth certificate. The privileged gateway then rechecks serial／SPKI／operation state plus the manifest and one-time recovery assertion; terminal, failed or expired certificates are rejected immediately.
- Added immutable `order_item_units` with checkout-time gross／net／tax residual allocation, immutable shipping allocation and one shared unique `order_unit_credits` ledger across cancellation and returns. Return disposition, settlement, refund allocation, invoice adjustment and inventory movement now operate under a fixed lock order. Partial returns never recompute 5% tax or claw back free shipping; original paid shipping is credited exactly once only when every sold unit is ultimately credited. Refund and invoice lanes remain independent, and V1 monetary goodwill cannot consume the explicitly calculated outstanding return liability.
- Added immutable `parcel_units` and a hybrid `mixed_parcel_recovery` saga. Never-claimed or terminal-cancelled parcels can be credited and restocked per unit immediately after warehouse custody, while picked parcels must complete physical return inspection. Picked units cannot use cancel restock, cancelled units cannot resume fulfillment, every credit／movement is exact-once, and shipping is refunded only if all units are eventually credited.
- Added append-only chargeback／reversal disputes, debit／recredit adjustments, evidence and deadline states, independent dispute accounting, fulfillment fencing and exact recovery-budget rules. Open reserve excludes already confirmed debit; immutable dispute-recovery allocations cover accepted customer credits, and a later recredit atomically releases the allocation and creates the missing shortfall refund. Financial-reversal cancellation credits all units／shipping, refunds any amount not covered by the debit, adjusts the full invoice and only then permits custody-proven restock. Provider events are always preserved even when they create over-recovery.
- Replaced immutable public-image caching with private Blob origins, same-origin `/media/{sha}/{variant}` routes, bounded revalidation, monotonic media revisions and append-only SHA tombstones checked before cache lookup. Emergency revocation fences Edge first, purges every public／internal／legacy derivative, removes all future references and disables incomplete SKUs. Tombstoned URLs return `410` with no bytes for normal, conditional, range and cache-busting requests; rollback and DR restore tombstones before objects, and unproven Edge／purge behavior falls back to `no-store`.

No finding was rejected. Three final independent read-only audits—security, commerce state machines and cross-section／media consistency—each ended `APPROVED`. Local checks again confirmed 26 ordered sections, exactly 50 products with category totals `16/10/9/5/10`, unchanged hashes for all six previously indexed v2 review／response blocks and a clean `git diff --check`.

## v2 Round 5 — Codex

Round 4 resolves the earlier media, parcel, dispute, credential-race, and enrollment design gaps, but these material blockers remain:

- [Deployment enrollment](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:55) returns only a public-key thumbprint, which is insufficient to verify an Ed25519 signature. **Fix:** Return the canonical public JWK, verify the challenge signature, derive its RFC 7638 thumbprint, and bind both to the deployment facts.
- [Cross-service assertions](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:57) remain non-executable: the Auth broker must verify a Vault-only HMAC, the asset ingest service receives an assertion with no defined verifier, and the initial recovery-HMAC provisioning step is absent. **Fix:** Specify durable trust bootstrap and rotation—e.g. DB consume RPC for Auth, KMS-signed tokens for asset jobs, and atomic AWS/Vault provisioning of recovery HMAC v1 before enabling assertions.
- [RecoveryGateway](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:81) enables mTLS only on the custom domain but never disables or tests the default `execute-api` endpoint; AWS explicitly warns that endpoint otherwise remains invocable. **Fix:** Disable the default endpoint and add negative tests proving direct `execute-api` requests cannot reach the authorizer or backend. [AWS API Gateway mTLS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-mutual-tls.html)
- [Open disputes versus accepted returns](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:225) can deadlock: an open full-amount dispute consumes all refund budget, but only confirmed debits can satisfy a return’s dispute allocation, leaving no valid settlement transition. **Fix:** Add a deadline-bound branch that accepts/closes the dispute into a confirmed allocation or releases its reserve and submits the statutory refund.
- [Migration recovery](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:430) lacks phase checkpoints, so a crash after committed expand DDL or a backfill chunk but before the final schema-version row can make the exact migration neither safely repeatable nor cleanly resumable. **Fix:** Persist digest-bound phase and backfill-cursor checkpoints transactionally, require idempotent phases, and fault-test recovery after every commit boundary.
- [Production canary sequencing](/Users/seniorlifepr/Documents/Quiet%20Luxury%20website/PLAN.md:431) is contradictory: the canary requires the canonical host and canonical callback, but it is scheduled before the candidate’s alias promotion in the following step. **Fix:** Promote and activate the candidate while commerce remains fail-closed, run and settle the canonical-host canary, then separately enable public commerce and indexing.

VERDICT: REVISE

### v2 Round 5 — Codex orchestrator's response

Accepted all six findings and revised `PLAN.md`:

- Deployment enrollment now returns a canonical Ed25519 public JWK, verifies the domain-separated challenge signature with that key, derives the RFC 7638 thumbprint locally and binds both the JWK and `jkt`; wrong curves, private fields, noncanonical encodings, substitutions and thumbprint mismatches are negative-tested.
- Cross-service authority is now executable without a copied Vault HMAC. Auth operations are claimed through a least-privilege DB RPC after capability／DPoP verification; asset jobs use a DB-claimed, KMS ES256-signed short-lived token whose pinned verifier set rotates reader-before-writer; initial recovery trust uses a separate mTLS＋2-of-3 Ed25519 `install_recovery_trust_v1` entrypoint, deterministic Secrets Manager Name／version token, persisted AWS ARN／VersionId and sealed package, then activates the same HMAC v1 only after the Vault copy and end-to-end fixture agree.
- `PrivilegedRecoveryGateway` now sets `disableExecuteApiEndpoint=true`; only the custom mTLS domain is valid, and tests prove direct `execute-api` requests with either valid or invalid certificates never reach the authorizer or backend.
- Accepted cancellations／returns now freeze `customer_refund_due_at` and an earlier `refund_priority_at`. Case-level dispute acceptance is exact-once and keeps an explicit `accepted_pending_debit` reserve; at the priority deadline, a uniquely bounded case／credit release creates the statutory refund. Late debits follow separate unknown／succeeded／terminal-not-applied branches, preserve externally caused over-recovery and cannot trap or duplicate the customer credit. A minute-level priority queue, reserved worker capacity and independent dead-man enforce the deadline.
- Migration execution now records release／digest-bound run, phase and backfill checkpoints in the same transactions as each DDL phase or data chunk, resumes only after catalog／cursor verification and commits the final version atomically. Destructive contract work is a separate later-release digest／run after at least two compatible deployments; fault injection covers every phase, chunk and final commit boundary.
- Release sequencing now performs protected candidate smoke first, then a fail-closed technical alias／binding promotion with all public flags off, then a one-order canonical-host canary whose admission closes immediately while the order settles, and only afterwards a separate AAL2 command publishes 50/50 and enables commerce／checkout／indexing.

No finding was rejected. Three independent read-only cross-audits—security trust bootstrap, commerce recovery state machines, and migration／canary consistency—found additional implementation details during revision; after those details were incorporated, all three ended `APPROVED`. Local checks confirmed 26 ordered sections, exactly 50 products with category totals `16/10/9/5/10`, chapter totals `13/9/11/7/10`, unchanged hashes for all six previously indexed v2 Round 1–3 blocks, and a clean `git diff --check`.

The formal same-session review remains `VERDICT: REVISE` because Round 5 is the skill's hard cap and no Round 6 is permitted. These fixes are orchestrator-integrated and independently cross-audited, but they have not received a later formal Codex `APPROVED`; the user must explicitly choose whether to accept this residual review status, stop, or start a new independent review workflow.

No application code, provider configuration, deployment, merge, push or live commerce flag was changed.

### Final canonical v2 review index after Round 5 — superseding all earlier indexes

| Canonical block | Exact line span | SHA-256 |
|---|---:|---|
| v2 Round 1 review and verdict | 346–430 | `48e5b5a635b6b12217147541be1cb623d8e04a3b31619e6f638556d0e0e2dbbd` |
| v2 Round 1 orchestrator response | 436–458 | `f9616645d4e40c75adf12517f34f798cfb604e2e97fe75a77434af0a4e9124ca` |
| v2 Round 2 review and verdict | 460–516 | `9e897bf471fa1eed07ec230ebe9a5374a43d364d4711bd2512bd09861f793d95` |
| v2 Round 2 orchestrator response | 518–538 | `b8da2be88d08b8836be772ddb706dd800c0bf98b493262e5955948b63a2a4404` |
| v2 Round 3 review and verdict | 540–588 | `374b4ca1332f0504f6b62d29bc4cb22b0dc92f48daf17649e64a46a2aeb239ac` |
| v2 Round 3 orchestrator response | 590–608 | `d4fe937c87b44d464de1035863d35d42e94b3a0776a707abb6f917ef129d3e4a` |
| v2 Round 4 review and verdict | 640–652 | `68328c4fb394948ad5359d8490ebb1a176e64534243935759bd2092204689aae` |
| v2 Round 4 orchestrator response | 654–666 | `43602280c24ed266102c2c3a0b6c3e889fcb58797f0ee5c06f6f5809546de2e2` |
| v2 Round 5 review and verdict | 668–679 | `e5453c9628d6eb9dbfde69134c76eea88ea1c497e03a1d4f1f5d7d0e13bb23a8` |
| v2 Round 5 orchestrator response | 681–696 | `539135848b30ea614e82f38754e3d2803b9ee40c8b32304bcbcd721771399042` |

Only the ten spans above are canonical formal-review／response blocks for v2. Lines 1–342 are legacy prototype history or superseded append attempts; lines 432–434 are correction context; lines 609–623 are a superseded earlier index; and lines 625–638 are a pre-Round-4 cross-audit supplement, not a formal review round.

Round 5's canonical verdict is `REVISE`. Because it is the fifth and final permitted same-session round, the revised plan has **not** reached formal `APPROVED`; independent cross-audit approvals recorded in the Round 5 response do not rewrite that verdict. Implementation requires an explicit user tie-break accepting the residual status, or a new independent review workflow.
