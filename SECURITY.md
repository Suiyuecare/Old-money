# Security and privacy boundary

LIGNÉE is production-shaped and fail-closed. The local Demo can exercise
deterministic commerce contracts. A dedicated Production database can persist
authenticated admin/catalog/operations work, but no real payment, new order,
Email, invoice, shipment or other external provider call is enabled until its
reviewed adapter, credentials and launch evidence are present.

## Immutable upper bounds

- `COMMERCE_CAPABLE` defaults to false.
- Production defaults to `production-disabled`.
- Production runtime controls come only from the durable database RPC. Owner
  controls can tighten the deployment boundary, but cannot exceed it.
- Catalog, legal and canary environment values are expected-value bindings,
  not approval evidence. They must exactly match the latest append-only
  database attestations or the corresponding capability resolves closed.
- Only `https://estatelignee.com` may eventually create live commands. Localhost, Preview, `www`, and provider deployment URLs cannot.
- Checkout-only failures do not disable verified callbacks or existing-order work; each readiness predicate checks only its required dependencies.
- A configured live mode never falls back to mock adapters.

## Boundaries

- The browser stores only stable product/SKU identifiers, quantities, and non-authoritative last-seen price hints.
- Names, prices, totals, tax, shipping, status, and inventory are recomputed server-side.
- Card data and Apple Pay tokens never enter LIGNÉE. The payment contract is a hosted ECPay redirect.
- Guest, worker, admin, Auth broker, migration, backup, and crypto principals are separate.
- Admin authorization requires same-origin BFF session validation, AAL2, active database membership, and command scope; proxy/UI hiding is never authorization.
- Private schemas are not exposed through Data API. `supabase/config.toml` exposes only `api`.

## Data protection

Structured PII and free text use AES-256-GCM envelopes with 96-bit nonces and context-bound AAD. Lookup values use purpose-scoped HMACs. No real KEK, HMAC key, provider key, or SCRAM credential is present in the repository. Production key unwrap and privileged broker infrastructure remain a launch gate.

Logging must use `redactForLog`; request bodies and secrets are never logged. Audit diffs carry field names/change markers, not copied plaintext.

## Payment safety

ECPay CheckMacValue canonicalization uses Node crypto and constant-time
comparison. A valid callback is acknowledged only after a redacted provider
event and a unique QueryTradeInfo operation are durably committed together.
Callback claims never directly mark payment successful. The browser-return
route ignores provider fields and shows confirmation pending.

Refund, invoice, shipment and Email operations use stable operation keys,
leases, bounded retry budgets and reconciliation. An immutable database fence
is committed immediately before every remote-effect call. A timeout after that
fence becomes `unknown`/manual review and neither completion nor lease recovery
can queue it again; only a proven pre-dispatch failure may retry.
Production provider adapters remain disabled until credentials and canary
evidence are supplied.

## CSP and browser controls

Production baseline:

```text
default-src 'self'; script-src 'self' 'nonce-{requestNonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

Checkout adds only the exact environment ECPay host. Admin routes add only the
validated dedicated Supabase origin to `connect-src` for signed private
uploads. Sandbox and live payment hosts are never allowed together.
`unsafe-eval` is development-only. All HTML and sensitive routes are
private/no-store/noindex.

## Security verification

`pnpm check:launch` runs asset, copy, static SQL, and secret gates. Unit tests cover state transitions, totals/tax residuals, idempotency, inventory, ECPay verification, invoice matrices, encryption, readiness, and JSON-LD escaping. Supabase SQL tests prove catalog counts, forced RLS, negative privileges, and inventory idempotency when Docker is available.

## Reporting

No production security mailbox or staffed incident channel has been approved. Do not submit credentials or personal information through site forms. A real reporting channel, two staffed incident paths, dead-man monitoring, and tested rotation runbooks are launch gates.
