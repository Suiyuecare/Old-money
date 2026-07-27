# Threat model — launch baseline

## Protected assets

Customer PII, payment receipts, inventory, refunds, invoice/logistics actions, admin sessions, provider credentials, logical keys, media rights/tombstones, backups, and runtime controls.

## Principal threats

- client-tampered price/quantity/tax/shipping or stale price replay
- reservation abuse, distributed Sybil holds, oversell and negative inventory
- forged/replayed/out-of-order provider callbacks
- remote success with lost local response causing duplicate effects
- admin session theft, last-Owner lockout, privilege drift, BFF bypass
- direct Data API/private schema access and RLS owner bypass
- PII/token/secret leakage through logs, URLs, RSC, referrers, Email or analytics
- unsafe upload/inbound MIME, EXIF and active-content payloads
- stale catalog/legal/media caches after recall
- old deployment or restored clone using production credentials
- backup/control-plane loss and missing key escrow

## Local mitigations

Server recomputation, immutable snapshots, exact state machines, idempotency, forced RLS, function-owner matrix, signature primitives, strict CSP/noindex/no-store, redaction, envelope encryption contracts, negative tests, asset/secret/copy/SQL gates, and explicit production-disabled operational routes.

## Residual/live-gated risk

AWS/Vercel/Supabase broker semantics, static egress, Edge-before-cache media safety, abuse envelope, real provider deadlines/reports, vendor DPAs, two Owners/three custodians, dead-man monitors, load/cost limits, and full source-unavailable recovery require external proof.

