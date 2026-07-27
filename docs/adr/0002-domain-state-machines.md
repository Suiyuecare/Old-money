# ADR 0002: Separate commerce state machines

- Status: accepted
- Recorded: 2026-07-24

Orders expose a customer projection, while reservation, payment attempts/receipts, dispute funding, inventory, invoice, shipment, return, refund, provider operation, and Auth saga states remain separate.

This costs more schema and reconciliation logic, but preserves contradictory external facts without rewriting history. A chargeback does not turn a capture into “failed”; a callback does not authorize payment; an invoice outage does not block an approved refund; a picked-up parcel cannot be restocked through cancellation.

Every external effect has a stable operation key and `unknown` state. Absence is never treated as safe retry without authenticated, provider-specific terminal-not-applied evidence.

