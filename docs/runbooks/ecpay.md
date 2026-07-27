# ECPay operations

## Payment

- Hosted redirect only; `ChoosePayment=Credit`; no card data at LIGNÉE.
- Apple Pay off sends contract-tested `IgnorePayment=ApplePay`.
- Return URL displays confirmation-in-progress only.
- The implemented callback route remains unavailable; it cannot persist or mark
  payment success. A future callback must pass signature, merchant, trade number
  and amount and create a durable inbox/verification marker.
- Future QueryTradeInfo reconciliation must append an authenticated receipt
  before applying exactly one receipt to sale/invoice/fulfillment.
- A second charge becomes duplicate receipt; a charge after release becomes paid-after-release. Both use the guarded exact-full-receipt anomaly refund.

## Unknown outcomes

Never resend a remote effect from a timeout, 5xx, response loss, or current not-found. Query/reconcile the same operation. Only written terminal-not-applied semantics permit `retry_safe`.

## Live evidence required

Merchant approval, endpoint/version, hard payable deadline/cancel ability, callback grace, QueryTradeInfo/report rate limits, refund semantics, Apple Pay device/domain proof, dispute/reversal event IDs, debit/recredit reports, evidence format, and deadlines.
