# Implementation status

The application is a dynamic, production-disabled commerce backoffice. Code
paths are complete enough for local/Preview acceptance, but no live provider or
new Production database has been authorized yet.

## Implemented

- Separate storefront/admin route groups and an ivory/olive responsive admin
  shell using Ming type for Chinese copy.
- Password, invite confirmation, dual TOTP enrollment/challenge, AAL2,
  membership/session revalidation, same-origin mutations, recent-AAL2 gates,
  four roles, last-Owner protection, and two-Owner recovery with durable
  session-revocation work. Invite confirmation supports both the custom hosted
  token-hash template and Supabase's default fragment hand-off.
- Role-sliced dashboard projections, responsive navigation, strict RPC response
  validation, order detail workbenches, conflict/empty/error states, and
  keyboard-operable Owner controls. Merchandisers never receive order,
  customer, or revenue aggregates.
- Dynamic async `CatalogRepository` with versioned snapshots, static/compare/
  database modes, exact Estate No. 01 fixture parity, and fail-closed database
  behavior.
- Product drafts, SKU facts, append-only price versions, inventory movements,
  media links, readiness gates, immutable publication, archive, revisions,
  audit, release-batch publication, taxonomy management, and cache invalidation
  contracts.
- Private signed image upload, MIME/size verification, metadata removal,
  normalized SHA-256, 800/1200/1600 WebP/AVIF derivatives, and same-origin
  approved-media delivery. The private source candidate is committed with the
  upload intent, and all six derivative cleanup candidates are committed
  before the first Storage write; a delayed leased worker removes only
  unregistered content, while exact-source/SHA registration, quarantine and
  re-upload fencing prevent deletion of an existing asset.
- Durable operations contracts for orders, payment reconciliation, invoices,
  shipments, returns, refunds, support, provider events, outbox, leases, dead
  letters, and reconciliation. Mutation timeouts become unknown/manual review;
  safe provider queries alone may retry within a budget. Every remote effect
  records an immutable dispatch-start fence immediately before the provider
  call; only failures proven to occur before that fence may return to the
  queue.
- Invoice issue commands and durable jobs retain only an opaque invoice UUID
  and non-PII totals. The worker resolves the encrypted order invoice envelope
  after leasing, decrypts it in memory, and never writes plaintext Email back
  to command, job, evidence, or provider-result storage.
- `/api/internal/jobs/reconcile` now leases a bounded batch of reconciliation
  safe queries with the shared evidence/completion contract. It never claims
  an unknown remote-effect job, and live execution remains fail closed until
  production provider adapters are provisioned.
- ECPay callback verification and durable-before-ACK behavior.
- Guest order access with anti-enumeration request responses, HMAC lookup,
  single-use link tokens, short-lived HttpOnly sessions, and revocation.
- Support-case attachments can be listed and streamed only through an AAL2
  Owner/Support boundary; private Storage coordinates and signed URLs never
  enter the browser.
- Appointment queues and newsletter consent/campaign administration use
  role-scoped, versioned RPCs. Contact envelopes and recipient identifiers are
  excluded from general list projections.
- Immutable catalog/legal approval revisions and a verified production-canary
  evidence digest are recorded in an append-only Owner ledger and must exactly
  match the deployed expected values. Database runtime switches cannot enable
  public money movement without all three.
- Production-only privileged staff invitation is preceded by a durable intent;
  missing RPCs fail before Auth Admin is called.

## Still launch-gated

- Creation and linking of the dedicated Tokyo Supabase project.
- Applying and executing SQL migrations/tests/advisors on that project.
- Inviting and enrolling two real Owners.
- Real company, product, inventory, legal, ECPay, invoice, Black Cat, and Resend
  facts/credentials.
- Live provider adapters and a controlled real-money canary.
- Enabling checkout, commerce, Apple Pay, indexing, or public caching.

Until those items are evidenced, `COMMERCE_CAPABLE=false`, live provider calls
fail closed, and Production remains `noindex`.
