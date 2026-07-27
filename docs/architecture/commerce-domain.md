# Commerce domain

## Authority

The browser supplies SKU IDs, quantities, last-seen price hints, form input, and opaque tokens. It never supplies an authoritative price, tax, shipping, total, inventory, order state, refund amount, receipt, or operational identity.

The local demo implements quote validation and immutable line/unit/shipping
snapshot logic in memory. The durable order transaction described below is a
required design, not an implemented repository command: it must lock
catalog/runtime/inventory rows in deterministic SKU order, validate current
price/legal/safety revisions, consume the confirmation token, create snapshots,
and reserve stock atomically.

## External effect pattern

```text
future durable domain command transaction
  -> aggregate + immutable ledger + outbox
  -> worker claims provider_operation
  -> remote call
  -> succeeded | failed_terminal | unknown
  -> reconciliation completes the matching local transition
```

Transport failure, 5xx, response loss, lease expiry, and eventually-consistent not-found are `unknown`. A new operation key is prohibited while the prior effect may have happened.

## Totals

All amounts are non-negative integer TWD and tax-inclusive. A total 5% reverse calculation allocates net residuals in stable line order, then stable unit ordinal. Refunds sum frozen unit/shipping values; subsets never recalculate tax or reclaim free shipping. Paid shipping is credited once only when all sold units have been financially credited.

## Inventory

The migration source models append-only `inventory_movements` and transactional
`inventory_balances`. Its generic `apply_inventory_operation` RPC is
worker-only. It is not a storefront reservation command and has not been
executed against a local database in environments without Docker.

`available = on_hand - reserved - safety_stock`

The enforced invariant is `reserved + safety_stock <= on_hand`. A reservation reaching its customer deadline becomes `release_pending`; it remains reserved until every provider attempt has safe terminal evidence.
