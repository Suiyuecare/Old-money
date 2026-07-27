# Data dictionary — foundation

| Area | Primary records | Sensitivity | Retention baseline |
|---|---|---|---|
| Catalog | products, variants, price versions, readiness, media | internal/public after approval | product lifecycle |
| Checkout | session, OTP HMAC, confirmation token hash | confidential | incomplete checkout 30 days |
| Order | immutable line/unit/shipping/consent snapshots | financial/confidential | accounting 10 years; PII 5 years subject to review |
| PII envelopes | contact, shipping, invoice, gift/free text | restricted | 5 years then delete/de-identify unless hold |
| Inventory | balances and append-only movements | internal/financial | aggregate lifecycle |
| Payment | attempts, receipts, disputes, adjustments | restricted financial | accounting/legal policy |
| Invoice | issue/void/allowance operations | restricted financial | at least 5 years; accountant approval |
| Logistics | shipment, parcel, unit mapping, tracking | confidential | order/support lifecycle |
| Returns/refunds | unit dispositions, credits, allocations, operations | restricted financial | order/dispute lifecycle |
| Provider inbox/outbox | redacted events and operations | confidential ops | raw masked ops 90 days; normalized financial facts longer |
| Audit/PII access | actor/action/changed fields/reason | restricted | policy + legal hold |
| Engagement | newsletter HMAC consent, appointment envelope | confidential | subscription; appointment +12 months |
| Private Blob | re-encoded encrypted case media | restricted | case close +12 months unless hold |

No field in the app requires birthday, national ID, gender, customer password, full card data, or a second billing address.

