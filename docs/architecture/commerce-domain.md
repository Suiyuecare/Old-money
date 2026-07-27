# Commerce domain

## Authority

The browser supplies SKU IDs, quantities, last-seen price hints, form input, and opaque tokens. It never supplies an authoritative price, tax, shipping, total, inventory, order state, refund amount, receipt, or operational identity.

The local Demo implements quote validation and immutable line/unit/shipping
snapshot logic in memory. Production order creation intentionally remains
disabled until the dedicated transaction locks catalog/runtime/inventory rows
in deterministic SKU order, validates current price/legal/safety revisions,
consumes the confirmation token, persists encrypted contact and order-access
references, creates snapshots, and reserves stock atomically. Durable
post-order operational commands are implemented independently so callbacks and
existing-order work do not depend on opening new checkout.

## External effect pattern

```text
durable domain command transaction
  -> aggregate + immutable ledger + outbox
  -> worker claims provider_operation
  -> remote effects persist dispatch_started_at
  -> remote call
  -> succeeded | failed_terminal | unknown
  -> reconciliation completes the matching local transition
```

Transport failure, 5xx, response loss, lease expiry, and eventually-consistent not-found are `unknown`. A new operation key is prohibited while the prior effect may have happened.
Failures before the immutable dispatch marker may retry safely; once the marker
exists, neither worker completion nor lease recovery can return the job to
`queued`.

## Totals

All amounts are non-negative integer TWD and tax-inclusive. A total 5% reverse calculation allocates net residuals in stable line order, then stable unit ordinal. Refunds sum frozen unit/shipping values; subsets never recalculate tax or reclaim free shipping. Paid shipping is credited once only when all sold units have been financially credited.

## Inventory

The migration source models append-only `inventory_movements` and transactional
`inventory_balances`. Its generic `apply_inventory_operation` RPC is
worker-only. It is not a storefront reservation command. SQL behavior tests
must still run against the dedicated Supabase project because the current
workstation has no local Docker/Postgres runtime.

`available = on_hand - reserved - safety_stock`

The enforced invariant is `reserved + safety_stock <= on_hand`. A reservation reaching its customer deadline becomes `release_pending`; it remains reserved until every provider attempt has safe terminal evidence.
