# Incident response

1. Classify P0/P1 and open an immutable incident record without copied PII.
2. Fence Edge first: checkout/index/canary off; catalog/media emergency no-cache on; append tombstone for affected media.
3. CAS the matching restrictive DB revision and audit it. Unknown Edge outcome remains restrictive.
4. Preserve callbacks and existing-order predicates. Never disable refunds, invoices, reconciliation, or customer support merely because new checkout is off.
5. For suspected admin compromise, quarantine the membership and advance `sessions_revoked_at`; reconcile Auth suspension separately.
6. For payment/inventory mismatch, stop checkout, quarantine affected SKU/receipt, preserve provider facts, and reconcile.
7. Notify both staffed channels. Do not rely on Resend for the independent channel.
8. Re-enable only with DB/Edge revision match, purge acknowledgement, resolved root cause, and Owner AAL2 approval.

No route in this repository can re-enable production commerce.

