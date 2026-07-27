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

## Implemented enable order

The repository now contains revisioned runtime controls and an append-only
Owner attestation ledger. These controls remain intentionally incapable of
opening commerce until all deployment hard limits and durable evidence agree:

1. Deploy `production-disabled` with commerce, checkout, canary, Apple Pay and
   indexing false.
2. Record catalog and legal approval evidence as an Owner after a recent TOTP
   challenge, then deploy their exact revision values.
3. Provision reviewed live adapters and credentials without changing the
   public flags.
4. Enable only the canonical-host canary, run one approved small-value order,
   close it, and reconcile payment, invoice, shipment and refund evidence.
5. Record the resulting SHA-256 in the append-only ledger and deploy that exact
   digest.
6. Enable commerce, checkout, Apple Pay and indexing as separate revisioned
   Owner actions. Any database outage, evidence mismatch, missing adapter or
   deployment-capability mismatch closes the affected gate.

No live provider adapter or real-money canary is present yet, so steps 3–6
remain operational launch blockers rather than automatic deployment actions.
