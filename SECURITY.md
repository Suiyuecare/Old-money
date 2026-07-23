# Security and privacy boundary

LIGNÉE is currently a non-transactional concept prototype. Its shopping flow demonstrates interaction and visual design; it is not a live commerce service.

## What this prototype does not do

- It does not take real payments or invoke a payment provider, Apple Pay API, or merchant validation.
- It does not create orders, order numbers, invoices, shipping labels, returns, or customer accounts.
- It does not manage real inventory, availability, reservations, fulfillment, or supplier data.
- It does not request card numbers and must never be used to enter payment credentials.
- It does not provide a production customer database, CRM, CMS, email service, or appointment system.
- It does not intentionally collect or persist personally identifiable information (PII).

Every public deployment must keep the visible prototype notice and must remain non-indexable. `noindex` reduces accidental discovery but is not access control; deployment protection should be enabled whenever the hosting account supports it.

## Browser-only state

The cart and wishlist are the only user state intended to survive a page refresh:

- Cart storage contains only a schema version plus canonical concept SKU IDs and quantities.
- Wishlist storage contains only a schema version plus canonical concept product IDs.
- Display names, images, options, and prices are recalculated from the local catalog rather than trusted from browser storage.
- Invalid, unknown, or malformed stored records are discarded safely.
- Neither store is intended to contain a name, email address, phone number, postal address, payment detail, or free-form text.

These values are kept in the visitor's own browser storage. They are not accounts, are not synchronized across devices, and should not be treated as durable business records.

## Checkout and demonstration forms

Checkout contact/address state is memory-only. Refreshing or directly revisiting the flow clears it. The completion screen is a local eligibility state, not proof of purchase, and no real order is generated.

Checkout, newsletter, and Private Appointment fields use visibly fictional defaults, including email addresses under the reserved `.invalid` top-level domain. Their forms prevent normal submission and do not call `fetch`, XHR, `sendBeacon`, `mailto`, an API route, or a Server Action. Values must not be written to URLs, browser storage, cookies, console output, analytics, or application logs.

Visitors are repeatedly warned not to replace the examples with real information. A local success message means only that the front-end interaction completed; it does not mean data was received or retained.

Hosting and network infrastructure may still process routine request metadata, such as IP address, timestamp, path, response status, and error diagnostics, under the provider's own terms. Form field values are not supposed to be part of those requests.

## Deployment baseline

- Keep secrets out of the repository and client bundle. This prototype should not require commerce credentials.
- Retain `noindex`, `nofollow`, and `noarchive` metadata plus an `X-Robots-Tag` response header.
- Use a restrictive Content Security Policy. In particular, keep `form-action 'none'`, block framing, external scripts, payment capabilities, camera, microphone, and geolocation.
- Serve only local application assets unless a new origin has been reviewed and documented.
- Treat the prototype banner as mandatory on every route.
- Do not add analytics, error-reporting payloads, remote fonts, embedded media, or third-party widgets without reviewing how they change this document's data boundary.

The production Content Security Policy is generated per request in `proxy.ts`
with a fresh nonce and the following baseline:

```text
default-src 'self'; script-src 'self' 'nonce-{requestNonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is the only production `unsafe-*` exception and is
retained for framework-managed styles. Local development additionally permits
`script-src 'unsafe-eval'` and localhost WebSocket connections for Next.js
developer tooling and hot reload; those tokens are selected only when
`NODE_ENV=development` and are not part of preview or production builds.

Page and App Router responses also send `Cache-Control: private, no-cache,
no-store, max-age=0, must-revalidate`. Each document has a request-specific
script nonce; opting streamed page responses out of shared, browser, and
history caches prevents a stale SSR/loading shell from being restored with an
old nonce. Fingerprinted Next assets and local images are excluded from this
rule and retain framework caching.

All routes also send `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow,
noarchive`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(),
payment=()`.

## Supply-chain verification

The accepted build pins Next.js and `eslint-config-next` to 16.2.11. Because
that Next.js line still resolves older transitive packages, the workspace
lockfile applies two narrow package-manager overrides:

- `next>sharp` is fixed at 0.35.3, above the 0.35.0 patched boundary for
  [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).
- `next>postcss` is fixed at 8.5.20, above the 8.5.10 patched boundary for
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93).

The exact accepted lockfile reports no known production vulnerabilities under
`pnpm audit --prod`. Keep `pnpm-workspace.yaml` and `pnpm-lock.yaml` together,
and rerun the production audit whenever dependencies change.

## Before real commerce is enabled

A production launch requires a new threat model and privacy review, verified supplier and product facts, authentication/authorization decisions, payment-provider integration, webhook verification and replay protection, server-side price and inventory validation, durable order storage, audit logging, customer-support controls, retention/deletion rules, and professionally reviewed Taiwan-facing legal disclosures.

The current prototype must not be incrementally connected to real payment or PII systems while retaining the claim that it is non-transactional.

## Reporting

There is no production security-response channel in this prototype. Do not submit vulnerability reports, credentials, or personal information through any website form. A formal reporting address and response policy must be published before public production use.
