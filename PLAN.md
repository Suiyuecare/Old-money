# LIGNÉE 完整營運後台與動態商城

This is the approved implementation contract for the current release.

## Deployment posture

- Keep the existing Next.js/Vercel application and canonical domain
  `https://estatelignee.com`.
- Create a dedicated Supabase project named `lignee-commerce` in Tokyo
  (`ap-northeast-1`). Never migrate or mutate the existing HR project
  `tiorfiqiowylbnartegx`.
- Deploy first as `production-disabled`: no checkout, live provider calls, or
  indexing. Local and verified Preview deployments may use bounded Sandbox
  adapters; Production never falls back to mocks.
- Estate No. 01 remains the immutable 50-product/189-SKU migration fixture.
  The runtime catalog has no global item limit; newly created product codes
  begin at `LIG-000051`.

## Administration and security

- Admin and storefront use separate route groups and shells.
- Admin access requires password, two verified TOTP factors, AAL2, an active
  database membership, a non-revoked Auth session, same-origin mutation, and
  role authorization at every RPC.
- Roles are `owner`, `merchandiser`, `fulfillment`, and `support`. Publishing,
  price approval, refunds, staff state, recovery, and runtime controls require
  Owner plus recent AAL2.
- The server-only Supabase secret is Production-only and lazy. Data API exposes
  only the `api` schema; private schemas use forced RLS and explicit grants.
- The last active Owner cannot be removed. Owner recovery needs a second Owner
  approval and revokes the target account's sessions.

## Catalog and media

- Products support bilingual names, taxonomy, audience, chapter, story,
  description, materials, care, sizing, SEO, related products, option axes,
  variants, append-only prices, package facts, inventory, media, and readiness.
- Published content is an immutable snapshot. Saving a draft never changes the
  storefront; rollback creates another publication. Published slugs are locked
  and products are archived rather than deleted.
- Individual and release-batch publishing update publication, audit, catalog
  revision, and invalidation jobs in one transaction.
- Source images, derived product media, and support attachments live in three
  private Supabase Storage buckets. JPEG/PNG/WebP/AVIF sources are limited to
  20 MiB; the server strips metadata and generates 800/1200/1600 WebP and AVIF.
- Public product media is served only through
  `/media/{sha}/{width}.{format}` after database approval/publication/tombstone
  checks. Source and Storage URLs are never public.
- The storefront reads an async versioned `CatalogRepository`. Migration is
  `static → compare → database`; database mode fails closed and never falls
  back to stale static prices.

## Commerce operations

- Inventory changes only through an append-only movement ledger.
- Customers use guest checkout and an Email-verified, single-use order access
  link; there is no consumer account system.
- Payment uses hosted ECPay credit card/Apple Pay. Verified callbacks are
  persisted before acknowledgement and reconciled with QueryTradeInfo.
- Sandbox operations cover ECPay B2C invoice issue/void/allowance, Black Cat
  shipment create/cancel/manual tracking, 14-day returns, Owner refunds,
  transactional Email, provider inbox, outbox, leases, retries, dead letters,
  and reconciliation.
- Every mutation carries an idempotency key and expected row version. Unknown
  remote mutation outcomes are reconciled; they are never blindly resent.

## Verification and launch gates

- Required checks include TypeScript, ESLint, Vitest, Playwright, axe, SQL
  tests, Supabase advisors, production build, asset/copy/font checks, and a
  secret scan.
- Production migrations run only on the new LIGNÉE project. Migrations are
  forward-compatible; content rollback uses a new publication.
- Live commerce remains blocked until two Owner Emails, legal/company facts,
  actual product facts/inventory, ECPay/invoice/logistics/Resend credentials,
  and a controlled canary have all been supplied and verified.
