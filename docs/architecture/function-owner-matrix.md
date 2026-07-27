# Function-owner privilege matrix

Only allowlisted `api` functions cross a trust boundary. Private schemas are
not exposed directly through PostgREST and every private application table
uses forced RLS.

| Function or function family | Security-definer owner | Direct objects | Caller |
|---|---|---|---|
| `api.catalog_read_all` | `catalog_reader_owner` | legacy live-table reader retained only for migration compatibility; execution revoked | none |
| `api.catalog_snapshot_read` | `catalog_snapshot_owner` | active immutable publications, gallery media, active taxonomy and catalog revision | `anon`, `authenticated`, `storefront_rpc_caller` |
| `api.public_runtime_controls_read` | `catalog_snapshot_owner` | public-safe commerce, checkout, indexing and cache switches | `anon`, `authenticated`, `storefront_rpc_caller` |
| `api.public_media_resolve` | `media_resolver_owner` | live-approved media, active publications, tombstones, media safety revision | `anon`, `authenticated`, `storefront_rpc_caller` |
| `api.bootstrap_initial_owners` | `backoffice_ops_owner` | exactly two pre-created Auth identities, active Owner memberships, idempotency and audit | `service_role` only; available only while membership table is empty |
| `api.apply_inventory_operation` | `inventory_command_owner` | inventory balances and append-only movements | `worker_rpc_caller` |
| `api.fail_close_runtime` | `ops_command_owner` | runtime controls and append-only audit | `worker_rpc_caller` |
| `api.admin_catalog_list`, `api.admin_product_get`, `api.admin_product_create`, `api.admin_product_save`, `api.admin_variant_upsert`, `api.admin_price_add`, `api.admin_media_register`, `api.admin_product_media_link`, `api.admin_readiness_set`, `api.admin_product_publish`, `api.admin_product_archive` | `admin_catalog_owner` | draft catalog, variants, prices, media, readiness, publication, revision, audit and cache jobs | `authenticated`; catalog reads are Owner/Merchandiser only and every mutation revalidates its narrower role/AAL2 boundary |
| `api.admin_inventory_command` | `admin_inventory_owner` | inventory balances, movements and audit | `authenticated`; each call revalidates AAL2, membership and role |
| `api.admin_session_context`, `api.admin_dashboard` | `backoffice_ops_owner` | active membership plus role-redacted catalog, inventory, order and revenue aggregates | `authenticated`; all active admin roles at AAL2, with fields reduced inside SQL |
| `api.admin_inventory_list` | `backoffice_ops_owner` | exact on-hand, reserved, safety-stock and available balances | `authenticated`; Owner/Fulfillment only at AAL2 |
| `api.admin_orders_list` | `backoffice_ops_owner` | non-PII order projections | `authenticated`; Owner/Fulfillment/Support only at AAL2 |
| `api.admin_audit_list` | `backoffice_ops_owner` | allowlisted non-PII projection of append-only audit events | `authenticated`; Owner only |
| `api.admin_taxonomy_list`, `api.admin_taxonomy_upsert`, `api.admin_taxonomy_archive` | `backoffice_ops_owner` | category/chapter drafts, row versions and audit | `authenticated`; mutation role checks are inside each function |
| `api.admin_media_upload_intent_reserve`, `api.admin_media_finalize`, `api.admin_media_transition` | `backoffice_ops_owner` | upload intents, product/support-case media manifests and links, transitions/tombstones, parent and asset row versions, audit | `authenticated`; Storage writes remain server-pipeline only and live/revoke requires Owner plus recent TOTP |
| `api.admin_media_orphan_cleanup_stage` | `backoffice_ops_owner` | exact six-derivative cleanup candidates, upload intent, parent version and audit | `authenticated` Owner/Merchandiser or Owner/Support with AAL2; candidate staging commits before the first Storage write |
| `api.worker_media_orphan_cleanup_claim`, `api.worker_media_orphan_cleanup_complete` | `backoffice_ops_owner` | delayed source/derivative cleanup candidates, exact source and SHA/manifest reference fences, leases/quarantine/retry/dead-letter, deletion evidence and audit | Production server-only `service_role`; object removal itself uses the exact private Supabase Storage bucket/path |
| `api.admin_support_attachments_list`, `api.admin_support_attachment_download_resolve` | `backoffice_ops_owner` | support case/media links and one metadata-stripped 1600px private derivative coordinate | `authenticated` Owner/Support with AAL2; list omits Storage coordinates and download resolution is consumed only by the authenticated server-stream route |
| `api.admin_appointments_list`, `api.admin_appointment_state_command` | `backoffice_ops_owner` | sealed appointment presence flags, scheduling state, optimistic row version and audit; never contact/message envelopes | `authenticated` Owner/Support with AAL2; mutations derive the idempotency request hash from RPC arguments inside Postgres |
| `api.admin_newsletter_consents_list`, `api.admin_newsletter_consent_command` | `backoffice_ops_owner` | consent state/timestamps, optimistic row version and audit; never Email HMAC or confirmation token | `authenticated` Owner/Support with AAL2; mutation is unsubscribe-only and derives its request hash inside Postgres |
| `api.admin_newsletter_campaigns_list`, `api.admin_newsletter_campaign_create`, `api.admin_newsletter_campaign_update`, `api.admin_newsletter_campaign_state_command` | `backoffice_ops_owner` | non-recipient content drafts, review/archive state, optimistic row version and audit | `authenticated` Owner/Merchandiser with AAL2; archive requires Owner plus recent TOTP, approval/delivery fail closed, and mutations derive request hashes inside Postgres |
| `api.admin_member_invite_prepare`, `api.admin_member_invite_complete`, `api.admin_staff_list`, `api.admin_staff_state_command`, `api.admin_owner_recovery_context`, `api.admin_owner_recovery_request`, `api.admin_owner_recovery_approve` | `backoffice_ops_owner` | invite operations, memberships, identity-bound recovery context/requests, revocation outbox and audit | `authenticated`; recovery context/request permits the target active Owner at AAL1, approval requires a different Owner plus recent TOTP |
| `api.worker_auth_recovery_claim`, `api.worker_auth_recovery_complete` | `backoffice_ops_owner` | idempotent worker receipts, leased Auth recovery outbox, bounded retry/dead-letter state, redacted evidence and audit | server-only `service_role`; `worker_rpc_caller` is also allowlisted for a future isolated credential |
| `api.admin_operations_command`, `api.admin_operations_projection_get`, `api.admin_operations_queue` | `backoffice_ops_owner` | durable operation projections/jobs and audit | `authenticated`; command-specific role checks |
| `api.operations_provider_event_store`, `api.operations_payment_callback_record`, `api.worker_operations_claim`, `api.worker_operations_dispatch_start`, `api.worker_reconciliation_claim`, `api.worker_operations_complete` | `backoffice_ops_owner` | verified provider events, bounded safe-query reconciliation, leased jobs and immutable provider-dispatch fences; reconciliation never claims remote effects | server-only `service_role` client; `worker_rpc_caller` is also allowlisted for a future isolated credential |
| `api.worker_invoice_issue_payload_resolve` | `invoice_pii_resolver_owner` | the leased invoice authority and its encrypted `order_pii.invoice_envelope`; no plaintext carrier or Email leaves SQL | server-only `service_role`; the worker decrypts in memory immediately before provider dispatch |
| `api.admin_release_batch_list`, `api.admin_release_batch_create`, `api.admin_release_batch_save`, `api.admin_release_batch_readiness_set`, `api.admin_release_batch_publish` | `backoffice_ops_owner` | release batches, readiness, immutable publications, catalog revision, audit and cache jobs | `authenticated`; publish requires Owner plus recent TOTP |
| `api.admin_runtime_controls_read`, `api.admin_runtime_controls_update` | `backoffice_ops_owner` | runtime switches, optimistic revision, audit and cache jobs | `authenticated`; update requires Owner plus recent TOTP |
| `api.admin_launch_attestation_record` | `backoffice_ops_owner` | append-only catalog/legal/canary evidence, runtime revision, audit and cache jobs | `authenticated`; Owner plus recent TOTP, expected controls version and idempotency key |
| `api.bootstrap_estate_no01` | `backoffice_ops_owner` | canonical Estate No. 01 products/SKUs, immutable publications, release batch and catalog revision | `service_role` only; one-time deterministic import |
| `api.order_access_request`, `api.order_access_exchange`, `api.order_access_session_read`, `api.order_access_session_revoke`, `api.worker_order_access_recipient_resolve` | `order_access_owner` | hashed challenges/sessions, encrypted contact envelope and outbox | `service_role` only; public routes enforce their own rate, origin and token controls |

The dedicated owner roles are `NOLOGIN NOINHERIT NOBYPASSRLS`, own no table,
and receive only the table operations and forced-RLS policies needed by their
functions. Runtime caller roles receive `api` usage plus exact function
`EXECUTE`; default/public execute is revoked. `service_role` is permitted only
at explicitly listed server-only application boundaries and must never enter a
browser bundle, preview deployment, log or source map.

New checkout, payment, refund, invoice, logistics, Auth or PII functions must
add a row here before migration approval. Broad table grants, dynamic caller
SQL and shared worker credentials are prohibited.
