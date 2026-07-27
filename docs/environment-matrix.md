# Environment matrix

| Capability | Local | Preview | Production disabled | Required future live state (not implemented) |
|---|---|---|---|---|
| Catalog | deterministic 50-item seed | deterministic demo | local seed only; no durable repository | approved 50/50 batch |
| Checkout | deterministic no-payment contract | demo only | explicit 503 | canonical host + upper bound + DB/Edge controls |
| Providers | mocks | mocks | no calls | verified bindings only |
| Supabase | local Docker when available | none | unavailable; no project provisioned or linked | new Tokyo project |
| Auth/admin | disabled surface | disabled | unavailable; no AAL2 or live admin binding | AAL2 + DB membership |
| Indexing | off | off | off | explicit final control |
| Analytics | off | off | off | only after nonce/CSP proof |
| Secrets | none | none | none; no live bindings exist | scoped production bindings |

The final column is a requirement inventory, not an available mode. Production
values are not accepted from `NEXT_PUBLIC_*`. `COMMERCE_CAPABLE` is only a
deployment upper-bound input; it cannot enable commerce. The matching DB/Edge
control reader is unimplemented, so shared controls always resolve restrictive.
