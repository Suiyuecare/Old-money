# Environment matrix

| Capability | Local | Verified Vercel Preview | Production disabled | Live |
|---|---|---|---|---|
| Catalog | locked Estate fixture | bounded fixture | dedicated Supabase snapshots | dedicated Supabase snapshots |
| Admin | Demo Owner | bounded demo | Supabase password + two TOTP + membership | same |
| Mutations | bounded memory | bounded memory | durable RPC | durable RPC |
| Media | no persisted upload | no persisted upload | private Supabase Storage | private Supabase Storage |
| Providers | mocks only | mocks only | disabled | verified credentials/adapters |
| Checkout | no-charge demo | no-charge demo | 503/off | canonical-host controls only |
| Indexing | off | off | off | explicit Owner control |
| Launch evidence | local fixtures | local fixtures | append-only durable attestations; mismatch closes gates | exact deployment-to-database match |
| Workers | in-memory bounded adapters | in-memory bounded adapters | authenticated durable leases; live effects unavailable | provisioned providers plus reconciliation |

Production never falls back to Demo. The secret key is scoped to Production and
used only by lazy server code. Preview must not receive Production Supabase or
provider secrets.

Live money movement has two deployment stages:

1. `canary`: provider/database/incident bindings plus the catalog and legal
   approval revisions are present. Only the allowlisted production canary may
   be enabled; public commerce and checkout remain off.
2. `open`: the verified canary evidence SHA-256 is also deployed. Runtime
   controls may then enable commerce and checkout, but can still only tighten
   the deployment boundary.

The immutable attestation variables are
`LIGNEE_CATALOG_APPROVAL_REVISION`, `LIGNEE_LEGAL_APPROVAL_REVISION`, and
`LIGNEE_CANARY_EVIDENCE_SHA256`. Environment variables state what the
deployment expects; they are never evidence by themselves. A missing,
malformed, stale, or non-matching durable value fails closed.
