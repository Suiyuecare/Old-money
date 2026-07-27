# LIGNÉE — Made to Be Inherited.

LIGNÉE is a Taiwan-first DTC own-brand storefront shaped around Alderwick House, contemporary British-estate life, and a private grass court. Estate No. 01 contains exactly 50 Sandbox products in Traditional Chinese and TWD.

The repository is a production-shaped, production-disabled foundation. Local development uses bounded process-local repositories and deterministic providers. It does not contain a live enable path. Production checkout, callbacks, invoices, logistics, admin mutation, indexing, canary admission, and provider calls fail closed.

## Local development

Requires Node.js 22.13+ and pnpm.

```bash
pnpm install
pnpm dev
```

No live credential is required. Do not add real customer, provider, or platform secrets to local files.

## Verification

```bash
pnpm check:launch
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:visual
pnpm audit --prod
pnpm build
```

The static launch gate verifies:

- 50 products with category split `16/10/9/5/10`
- chapter split `13/9/11/7/10`
- 150 byte-unique governed WebP payloads with 150 byte-unique AVIF variants; private local sources are checked separately
- prohibited front-end copy
- API-only Supabase schema exposure and RLS/security SQL markers
- secret-like values and the prohibited legacy project identifier

## Architecture

- Next.js 16 App Router, Server Components by default, small client islands
- local Ming font and no build-time font network request
- strict TypeScript, Zod request schemas, CSS Modules and design tokens
- server-authoritative catalog quote and digest, explicit stale-price acknowledgement, immutable tax/total snapshots, inventory ledger, bounded idempotency and state machines
- narrow repository/provider interfaces with bounded process-local demo adapters
- ECPay signature/canonicalization primitives without live provider calls
- unexecuted Supabase migration source defining private schemas, `api`-only exposure, forced RLS, negative SQL tests, and append-only financial/audit shapes
- per-request nonce CSP, same-origin BFF boundaries, noindex, no analytics on sensitive routes

The durable Supabase repositories/order transaction/OTP, DB+Edge control
reader, live media gateway, ECPay inbox/query/refund flow, invoice/logistics
adapters, workers/reconciliation, canary, live SEO/index controls, and real
private-asset custody are not implemented. See [implementation status](./docs/implementation-status.md), [launch gates](./docs/launch-gates.md), [environment matrix](./docs/environment-matrix.md), [security](./SECURITY.md), and [runbooks](./docs/runbooks/).

## Supabase safety

The repository is not linked to any remote Supabase project. `supabase/config.toml` is local-only configuration for the future `lignee-commerce` project shape. Never run link, migration, reset, or SQL commands against a remote project from this repository without a separate reviewed release process. Local database proof requires Docker.

## Visual assets

`content/asset-inventory.generated.json` is the governed public manifest. The
36 lifestyle images are Sandbox derivatives of eight distinct, locally
generated identity sources; the remaining assets are deterministic derivatives
of local sources. None is final product photography, physical-product evidence
or rights approval. The eight source anchors live under ignored
`.private/visual-anchors/`, are never served, and are absent from a clean clone.
Run `pnpm check:assets:private` only where those private local sources are
present; the normal committed public-asset gate does not require them.
