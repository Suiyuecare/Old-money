# Launch gates

All boxes default open. A checkbox is evidence, not intention.

## Commercial and legal

- [ ] Registered business, representative, tax ID, address, service telephone, hours, complaint channel
- [ ] Domain purchased, controlled, renewed, canonical redirects and protected deployments proved
- [ ] Taiwan counsel approves commerce, privacy, 14-day return, complaint, product labeling and data transfers
- [ ] Taiwan accountant approves 5% allocation, invoice, allowance/void and record retention
- [ ] Trademark/right searches complete

## Catalog and media

- [ ] 50/50 physical products pass every readiness check
- [ ] Costs, ~65% target margin, tax-inclusive final prices and canary SKU/price approved
- [ ] SKU dimensions/weights, packing, inventory and accurate per-variant photography approved
- [ ] Sunglasses, fragrance/candle, food-contact mug, racquet, shoe and ball evidence approved
- [ ] 150 public assets, eight distinct private anchors, rights, human QA, immutable backup ack
- [ ] Media Edge-before-cache, purge, range/conditional tombstone and DR tests pass

## Providers and operations

- [ ] ECPay merchant, Apple Pay, QueryTradeInfo deadline/grace, rate limits, refunds and dispute reports confirmed in writing
- [ ] B2C e-invoice account, track numbers, option matrix, void/allowance rehearsed
- [ ] Black Cat profiles, dimensions, declared value, insurance, three-parcel and reverse logistics confirmed
- [ ] Resend sending/inbound, apex mailbox/MX, SPF/DKIM/DMARC, quarantine and bounce flows proved
- [ ] Second staffed incident channel and independent dead-man monitors active

## Platform and security

- [ ] New `lignee-commerce` Tokyo Supabase project created through approved release process
- [ ] PITR, disposable clone rehearsal, forced RLS/grants and backup export/restore proved
- [ ] Fixed egress, deployment capability/DPoP, Auth/Crypto/Migration brokers and role revocation proved
- [ ] Recovery enrollment, 2-of-3 custodians, HMAC bootstrap and source-unavailable DR proved
- [ ] Two different active Owners with AAL2 and recovery material
- [ ] CSP, CSRF, rate limits, secret scan, abuse fixture, load/cost profile and fault injection pass

## Future enable order (not implemented in this repository)

The repository cannot perform these actions. A separately implemented and
reviewed release system would need to:

1. Promote a production-capable candidate while every public flag stays false.
2. Run a canonical-host restricted canary only with the approved SKU/price.
3. Close and reconcile the canary.
4. Atomically publish 50/50.
5. Enable commerce, checkout and indexing in separate revisioned actions.
