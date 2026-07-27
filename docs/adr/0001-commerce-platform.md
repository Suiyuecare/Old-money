# ADR 0001: Commerce platform decision

- Status: accepted for local custom implementation; live decision remains gated
- Decision owner: user
- Recorded: 2026-07-24

## Decision

The user explicitly accepted a custom implementation and authorized this local build. That decision permits the repository work; it does not assert that custom commerce has passed the plan’s live hard gates.

## Candidate comparison

| Candidate | Brand/editorial retention | Exact Taiwan provider stack | Guest secure lookup | MFA/RBAC/audit | Export/continuity | Evidence status |
|---|---:|---:|---:|---:|---:|---|
| Custom Next.js/Supabase/AWS | High | Designed for exact scope | Designed | Designed | Designed | Local contracts only |
| SHOPLINE | Unknown | Written evidence not obtained | Unknown | Unknown | Unknown | Needs vendor evidence |
| 91APP | Unknown | Written evidence not obtained | Unknown | Unknown | Unknown | Needs vendor evidence |
| CYBERBIZ | Unknown | Written evidence not obtained | Unknown | Unknown | Unknown | Needs vendor evidence |
| Shopify + Taiwan integrations | High | Written evidence not obtained | Unknown | Partial/unknown | High/unknown | Needs vendor evidence |

No score or TCO is fabricated. The plan’s one-day vendor exercise, dated pricing, provider confirmations, and three-year risk-adjusted cost model remain open. If a managed candidate later meets the thresholds, the decision returns to the user.

## Consequences

The custom baseline must include deployment-specific capabilities, Auth/Crypto/Migration brokers, recovery certificate enrollment, immutable backup, object-lock media ingest, fixed egress, dual custody, PITR/rehearsal, and 24/7 operations. None is considered provisioned by this repository. Commerce remains off until evidence exists.

