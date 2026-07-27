# Implementation status

This repository is a production-shaped, production-disabled foundation. It
contains a deterministic public Sandbox storefront, pure commerce-domain
contracts, process-local bounded demo repositories/providers, security
primitives, static Supabase SQL, and tests. It does not contain an enable path
for live commerce.

## Implemented locally

- exact 50-product/189-SKU catalog and five editorial chapters
- server-recomputed quote, deterministic quote digest, explicit price-change
  acknowledgement, immutable TWD/tax/shipping snapshots
- bounded process-local demo order/idempotency state and global demo command
  rate limit
- state machines, inventory ledger, provider contracts and cryptographic
  ECPay canonicalization/signature verification primitives
- production-disabled route surfaces, CSP/origin validation, redaction and
  context-bound encryption primitives
- Supabase migration/seed/RLS/negative-test source files, not executed here
- governed Sandbox visual inventory and lookbook

## Deliberately unimplemented live gates

- durable Supabase repositories and the atomic order/reservation command
- guest Email OTP issuance, verification, token consumption and order access
- database plus Edge runtime-control reader/revision agreement
- live media gateway, private asset custody, tombstones and purge acknowledgement
- durable ECPay callback inbox, QueryTradeInfo reconciliation and refunds
- production e-invoice and logistics adapters
- workers, leases, outbox processing, dead letters and reconciliation
- authenticated AAL2 admin mutation paths
- production canary execution
- live SEO/index enable controls
- real private-source custody, rights clearance and approved product photography

Interfaces, schema shapes and runbooks for these areas are design foundations,
not deployed capabilities or vendor evidence. Production routes must remain
unavailable until separate implementation, review and external proof are
complete.

