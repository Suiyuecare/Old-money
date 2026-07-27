# ECPay operations

## Payment

- Hosted redirect only; `ChoosePayment=Credit`; no card data at LIGNÉE.
- Apple Pay off sends contract-tested `IgnorePayment=ApplePay`.
- Return URL displays confirmation-in-progress only.
- The callback verifies CheckMacValue and merchant/trade identity, stores a
  redacted deduplicated provider event, and atomically enqueues a
  `payment.query` reconciliation job before returning the exact `1|OK`
  acknowledgement. Any durable write/enqueue failure is not acknowledged.
- QueryTradeInfo is the authority for applying payment. Callback data alone
  never marks an order paid, sells stock, issues an invoice, or starts
  fulfillment.
- The reconciliation scheduler leases only `safe_query` jobs in bounded
  batches. Five inconclusive queries retain their evidence and move to manual
  review; it cannot claim or redispatch a refund, invoice, or shipment effect.
- A second charge becomes duplicate receipt; a charge after release becomes paid-after-release. Both use the guarded exact-full-receipt anomaly refund.

## Unknown outcomes

Never resend a remote effect from a timeout, 5xx, response loss, or current not-found. Query/reconcile the same operation. Only written terminal-not-applied semantics permit `retry_safe`.

## Live evidence required

Merchant approval, endpoint/version, hard payable deadline/cancel ability, callback grace, QueryTradeInfo/report rate limits, refund semantics, Apple Pay device/domain proof, dispute/reversal event IDs, debit/recredit reports, evidence format, and deadlines.
