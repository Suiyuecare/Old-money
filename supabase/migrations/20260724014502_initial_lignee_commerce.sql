begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists catalog_private;
create schema if not exists commerce_private;
create schema if not exists ops_private;
create schema if not exists engagement_private;
create schema if not exists api;

revoke all on schema public from public;
revoke all on schema public from anon;
revoke all on schema public from authenticated;
revoke all on schema catalog_private from public, anon, authenticated;
revoke all on schema commerce_private from public, anon, authenticated;
revoke all on schema ops_private from public, anon, authenticated;
revoke all on schema engagement_private from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;

do $roles$
declare
  role_name text;
begin
  foreach role_name in array array[
    'storefront_rpc_caller',
    'worker_rpc_caller',
    'admin_rpc_caller',
    'backup_exporter',
    'catalog_reader_owner',
    'inventory_command_owner',
    'ops_command_owner'
  ]
  loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'create role %I nologin noinherit nobypassrls nocreatedb nocreaterole noreplication',
        role_name
      );
    end if;
  end loop;
end
$roles$;

create table catalog_private.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label_zh text not null,
  label_en text not null,
  sort_order integer not null unique check (sort_order between 1 and 5),
  created_at timestamptz not null default now()
);

create table catalog_private.chapters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title_en text not null,
  title_zh text not null,
  sort_order integer not null unique check (sort_order between 1 and 5),
  created_at timestamptz not null default now()
);

create table catalog_private.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique check (product_code ~ '^LIG-ENO1-[0-9]{3}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_en text not null,
  name_zh text not null,
  category_id uuid not null references catalog_private.categories(id),
  chapter_id uuid not null references catalog_private.chapters(id),
  launch_position integer not null unique check (launch_position between 1 and 50),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'ready', 'published', 'archived')),
  sandbox_price_notice boolean not null default true,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create table catalog_private.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog_private.products(id),
  sku_code text not null unique check (sku_code ~ '^LIG-ENO1-[0-9]{3}-[0-9]{2}$'),
  option_values jsonb not null check (jsonb_typeof(option_values) = 'object'),
  weight_grams integer check (weight_grams > 0),
  package_length_mm integer check (package_length_mm > 0),
  package_width_mm integer check (package_width_mm > 0),
  package_height_mm integer check (package_height_mm > 0),
  facts_status text not null default 'requires_approval'
    check (facts_status in ('requires_approval', 'approved')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index product_variants_options_unique
  on catalog_private.product_variants(product_id, md5(option_values::text));

create table catalog_private.price_versions (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references catalog_private.product_variants(id),
  version integer not null check (version > 0),
  gross_twd integer not null check (gross_twd >= 0),
  tax_included boolean not null check (tax_included),
  status text not null default 'sandbox_draft'
    check (status in ('sandbox_draft', 'approved', 'retired')),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique (product_variant_id, version),
  check (valid_until is null or valid_from is not null),
  check (valid_until is null or valid_until > valid_from)
);

create table catalog_private.release_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'ready', 'published', 'blocked')),
  required_product_count integer not null default 50 check (required_product_count = 50),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table catalog_private.release_batch_products (
  release_batch_id uuid not null references catalog_private.release_batches(id),
  product_id uuid not null references catalog_private.products(id),
  primary key (release_batch_id, product_id)
);

create table catalog_private.product_readiness_checks (
  product_id uuid not null references catalog_private.products(id),
  check_code text not null,
  state text not null default 'pending' check (state in ('pending', 'passed', 'failed')),
  evidence_reference text,
  approved_by uuid,
  approved_at timestamptz,
  primary key (product_id, check_code),
  check ((state = 'passed') = (approved_at is not null))
);

create table catalog_private.media_assets (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'live_approved', 'revocation_pending', 'revoked')),
  object_class text not null check (object_class in ('public_catalog', 'private_case', 'private_anchor')),
  byte_length bigint not null check (byte_length > 0),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  backup_acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table catalog_private.media_asset_transitions (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references catalog_private.media_assets(id),
  from_status text,
  to_status text not null,
  operation_id uuid not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  unique (media_asset_id, operation_id)
);

create table catalog_private.media_revocation_tombstones (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  reason text not null,
  safety_revision bigint not null check (safety_revision > 0),
  created_at timestamptz not null default now()
);

create table commerce_private.inventory_balances (
  sku_id uuid primary key references catalog_private.product_variants(id),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  sellable_at_launch integer not null default 0 check (sellable_at_launch >= 0),
  updated_at timestamptz not null default now(),
  check (reserved + safety_stock <= on_hand)
);

create table commerce_private.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  sku_id uuid not null references catalog_private.product_variants(id),
  kind text not null check (kind in (
    'receive', 'reserve', 'release', 'sale', 'cancel_restock',
    'return_sellable', 'return_damaged', 'adjustment'
  )),
  quantity integer not null check (quantity > 0),
  delta_on_hand integer not null,
  delta_reserved integer not null,
  order_id uuid,
  reservation_id uuid,
  occurred_at timestamptz not null default now()
);

create index inventory_movements_sku_time_idx
  on commerce_private.inventory_movements(sku_id, occurred_at);

create table commerce_private.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  state text not null default 'draft'
    check (state in ('draft', 'email_verified', 'rendered', 'consumed', 'expired')),
  safety_revision bigint not null,
  legal_bundle_revision bigint not null,
  email_hmac text,
  verified_challenge_id uuid,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table commerce_private.email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references commerce_private.checkout_sessions(id),
  purpose text not null,
  email_hmac text not null,
  code_hmac text not null,
  key_version integer not null check (key_version > 0),
  attempts integer not null default 0 check (attempts between 0 and 5),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  check (expires_at > issued_at)
);

create index email_otp_active_idx
  on commerce_private.email_otp_challenges(checkout_session_id, email_hmac, expires_at)
  where consumed_at is null and invalidated_at is null;

create table commerce_private.orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  merchant_trade_no text not null unique check (merchant_trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  checkout_session_id uuid not null unique references commerce_private.checkout_sessions(id),
  projection_status text not null default 'awaiting_payment',
  merchandise_gross_twd integer not null check (merchandise_gross_twd >= 0),
  shipping_gross_twd integer not null check (shipping_gross_twd >= 0),
  shipping_net_twd integer not null check (shipping_net_twd >= 0),
  shipping_tax_twd integer not null check (shipping_tax_twd >= 0),
  total_gross_twd integer not null check (total_gross_twd >= 0),
  total_net_twd integer not null check (total_net_twd >= 0),
  total_tax_twd integer not null check (total_tax_twd >= 0),
  applied_payment_receipt_id uuid,
  production_canary boolean not null default false,
  payment_at_risk boolean not null default false,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  check (total_gross_twd = merchandise_gross_twd + shipping_gross_twd),
  check (total_gross_twd = total_net_twd + total_tax_twd),
  check (shipping_gross_twd = shipping_net_twd + shipping_tax_twd)
);

create table commerce_private.order_pii (
  order_id uuid primary key references commerce_private.orders(id),
  contact_envelope jsonb not null,
  shipping_envelope jsonb not null,
  invoice_envelope jsonb not null,
  gift_envelope jsonb,
  schema_version integer not null check (schema_version > 0),
  key_version integer not null check (key_version > 0),
  created_at timestamptz not null default now()
);

create table commerce_private.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  sku_id uuid not null references catalog_private.product_variants(id),
  product_code text not null,
  sku_code text not null,
  name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 3),
  unit_gross_twd integer not null check (unit_gross_twd >= 0),
  gross_twd integer not null check (gross_twd >= 0),
  net_twd integer not null check (net_twd >= 0),
  tax_twd integer not null check (tax_twd >= 0),
  price_version_id uuid not null references catalog_private.price_versions(id),
  invoice_line_key text not null,
  unique (order_id, sku_id),
  unique (order_id, invoice_line_key),
  check (gross_twd = unit_gross_twd * quantity),
  check (gross_twd = net_twd + tax_twd)
);

create table commerce_private.order_item_units (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references commerce_private.order_items(id),
  unit_ordinal integer not null check (unit_ordinal between 1 and 3),
  sku_id uuid not null references catalog_private.product_variants(id),
  gross_twd integer not null check (gross_twd >= 0),
  net_twd integer not null check (net_twd >= 0),
  tax_twd integer not null check (tax_twd >= 0),
  invoice_line_key text not null,
  unique (order_item_id, unit_ordinal),
  check (gross_twd = net_twd + tax_twd)
);

create table commerce_private.order_consents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  legal_document_id uuid not null,
  legal_document_hash text not null check (legal_document_hash ~ '^[a-f0-9]{64}$'),
  legal_bundle_revision bigint not null,
  checkout_surface_version text not null,
  accepted_at timestamptz not null default now(),
  unique (order_id, legal_document_id)
);

create table commerce_private.reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references commerce_private.orders(id),
  state text not null default 'active'
    check (state in ('active', 'release_pending', 'consumed', 'released')),
  customer_deadline_at timestamptz not null,
  safe_release_after timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz
);

create table commerce_private.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  reservation_id uuid not null references commerce_private.reservations(id),
  merchant_trade_no text not null unique,
  attempt_number integer not null check (attempt_number between 1 and 3),
  state text not null default 'created',
  amount_twd integer not null check (amount_twd >= 0),
  customer_deadline_at timestamptz not null,
  provider_payable_until timestamptz,
  callback_grace_interval interval,
  reconcile_after timestamptz not null,
  form_nonce_hash text,
  created_at timestamptz not null default now(),
  unique (order_id, attempt_number)
);

create unique index payment_attempts_one_payable_per_order
  on commerce_private.payment_attempts(order_id)
  where state in ('created', 'redirect_ready', 'pending', 'verification_pending');

create table commerce_private.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  payment_attempt_id uuid not null references commerce_private.payment_attempts(id),
  provider text not null,
  provider_trade_no text not null unique,
  amount_twd integer not null check (amount_twd >= 0),
  evidence_hash text not null,
  provider_paid_at timestamptz,
  received_at timestamptz not null default now()
);

alter table commerce_private.orders
  add constraint orders_applied_payment_receipt_fk
  foreign key (applied_payment_receipt_id)
  references commerce_private.payment_receipts(id);

create unique index orders_one_applied_receipt
  on commerce_private.orders(applied_payment_receipt_id)
  where applied_payment_receipt_id is not null;

create table commerce_private.provider_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_receipt_id uuid not null references commerce_private.payment_receipts(id),
  provider_case_id text not null unique,
  case_state text not null,
  funding_state text not null,
  disputed_twd integer not null check (disputed_twd >= 0),
  response_due_at timestamptz,
  internal_due_at timestamptz,
  evidence_hash text,
  created_at timestamptz not null default now()
);

create table commerce_private.payment_adjustment_entries (
  id uuid primary key default gen_random_uuid(),
  payment_receipt_id uuid not null references commerce_private.payment_receipts(id),
  provider_dispute_id uuid references commerce_private.provider_disputes(id),
  provider_event_id text not null,
  kind text not null check (kind in (
    'chargeback_debit', 'chargeback_recredit',
    'provider_reversal_debit', 'provider_recredit'
  )),
  amount_twd integer not null check (amount_twd >= 0),
  effective_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider_event_id, kind)
);

create table commerce_private.refund_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  order_id uuid not null references commerce_private.orders(id),
  payment_receipt_id uuid not null references commerce_private.payment_receipts(id),
  reason text not null,
  amount_twd integer not null check (amount_twd >= 0),
  state text not null default 'queued'
    check (state in ('queued', 'in_flight', 'unknown', 'succeeded', 'failed_terminal', 'manual_review')),
  created_at timestamptz not null default now()
);

create table commerce_private.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  relate_number text not null unique,
  state text not null default 'pending_issue',
  provider_operation_key text not null unique,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index invoices_one_active_primary
  on commerce_private.invoices(order_id)
  where state in ('pending_issue', 'issuing', 'issued', 'issue_failed');

create table commerce_private.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  direction text not null check (direction in ('outbound', 'return')),
  state text not null default 'draft',
  provider_operation_key text unique,
  tracking_id text unique,
  created_at timestamptz not null default now()
);

create table commerce_private.parcels (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references commerce_private.shipments(id),
  order_id uuid not null references commerce_private.orders(id),
  parcel_ordinal integer not null check (parcel_ordinal between 1 and 3),
  declared_value_twd integer not null check (declared_value_twd >= 0),
  weight_grams integer not null check (weight_grams > 0),
  unique (order_id, parcel_ordinal)
);

create table commerce_private.parcel_units (
  parcel_id uuid not null references commerce_private.parcels(id),
  order_item_unit_id uuid not null unique references commerce_private.order_item_units(id),
  order_id uuid not null references commerce_private.orders(id),
  primary key (parcel_id, order_item_unit_id)
);

create table commerce_private.return_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  public_id text not null unique,
  state text not null default 'requested',
  requested_at timestamptz not null default now(),
  closed_at timestamptz
);

create table commerce_private.return_unit_dispositions (
  return_case_id uuid not null references commerce_private.return_cases(id),
  order_item_unit_id uuid not null references commerce_private.order_item_units(id),
  state text not null default 'requested',
  return_eligible_until timestamptz not null,
  primary key (return_case_id, order_item_unit_id)
);

create table commerce_private.order_unit_credits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  order_item_unit_id uuid not null unique references commerce_private.order_item_units(id),
  source text not null check (source in ('cancel', 'mixed_cancel', 'return', 'financial_reversal')),
  settlement_id uuid not null,
  gross_twd integer not null check (gross_twd >= 0),
  net_twd integer not null check (net_twd >= 0),
  tax_twd integer not null check (tax_twd >= 0),
  created_at timestamptz not null default now(),
  check (gross_twd = net_twd + tax_twd)
);

create table commerce_private.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce_private.orders(id),
  event_type text not null,
  from_state text,
  to_state text not null,
  operation_key text not null,
  evidence_hash text,
  occurred_at timestamptz not null default now(),
  unique (order_id, operation_key)
);

create table ops_private.runtime_controls (
  singleton boolean primary key default true check (singleton),
  revision bigint not null check (revision >= 0),
  media_safety_revision bigint not null check (media_safety_revision >= 0),
  commerce_live boolean not null default false,
  checkout_enabled boolean not null default false,
  production_canary_enabled boolean not null default false,
  ecpay_apple_pay_enabled boolean not null default false,
  search_index_enabled boolean not null default false,
  catalog_emergency_no_cache boolean not null default true,
  media_emergency_no_cache boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into ops_private.runtime_controls (
  revision,
  media_safety_revision,
  commerce_live,
  checkout_enabled,
  production_canary_enabled,
  ecpay_apple_pay_enabled,
  search_index_enabled,
  catalog_emergency_no_cache,
  media_emergency_no_cache
) values (0, 0, false, false, false, false, false, true, true);

create table ops_private.admin_memberships (
  user_id uuid primary key,
  role text not null check (role in ('owner', 'fulfillment', 'support')),
  state text not null default 'provisional'
    check (state in ('provisional', 'active', 'suspended', 'revoked')),
  sessions_revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table ops_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_scope text not null,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  changed_fields text[] not null default '{}',
  request_id text not null,
  occurred_at timestamptz not null default now()
);

create index audit_events_entity_time_idx
  on ops_private.audit_events(entity_type, entity_id, occurred_at);

create table ops_private.pii_access_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  case_id uuid,
  order_id uuid,
  field_names text[] not null,
  reason text not null,
  request_id text not null,
  occurred_at timestamptz not null default now()
);

create table ops_private.idempotency_commands (
  id uuid primary key default gen_random_uuid(),
  actor_scope text not null,
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  aggregate_id uuid,
  result_code text,
  result_pointer jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed_before_commit')),
  retention_deadline timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_scope, command_name, idempotency_key)
);

create table ops_private.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  provider_object_id text not null,
  normalized_status text not null,
  fingerprint text not null,
  verification_state text not null check (verification_state in ('verified', 'invalid', 'unavailable')),
  redacted_payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_type, provider_object_id, normalized_status, fingerprint)
);

create table ops_private.provider_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  provider text not null,
  effect_type text not null,
  aggregate_id uuid not null,
  external_correlation_id text not null,
  state text not null default 'queued'
    check (state in ('queued', 'in_flight', 'succeeded', 'retry_safe', 'failed_terminal', 'unknown', 'manual_review')),
  request_hash text not null,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_evidence_hash text,
  created_at timestamptz not null default now(),
  unique (provider, external_correlation_id, effect_type)
);

create table ops_private.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  job_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  state text not null default 'queued'
    check (state in ('queued', 'leased', 'completed', 'dead_letter')),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now()
);

create index outbox_jobs_ready_idx
  on ops_private.outbox_jobs(job_type, available_at, created_at, id)
  where state = 'queued';

create index outbox_jobs_expired_lease_idx
  on ops_private.outbox_jobs(job_type, lease_expires_at, id)
  where state = 'leased';

create table ops_private.cache_invalidation_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  tags text[] not null,
  safety_revision bigint not null,
  provider_ack jsonb,
  state text not null default 'queued'
    check (state in ('queued', 'in_flight', 'unknown', 'succeeded', 'manual_review')),
  created_at timestamptz not null default now()
);

create table ops_private.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null,
  expected_at timestamptz not null,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  state text not null default 'expected'
    check (state in ('expected', 'running', 'completed', 'missed', 'failed')),
  unique (schedule_key, expected_at)
);

create table ops_private.incidents (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  code text not null,
  state text not null default 'open' check (state in ('open', 'contained', 'resolved')),
  aggregate_type text,
  aggregate_id uuid,
  redacted_context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table ops_private.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  version integer not null check (version > 0),
  locale text not null check (locale = 'zh-Hant-TW'),
  canonical_source text not null,
  rendered_snapshot text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null,
  supersedes_id uuid references ops_private.legal_documents(id),
  published_by uuid not null,
  legal_bundle_revision bigint not null check (legal_bundle_revision > 0),
  unique (document_type, version, locale),
  unique (sha256)
);

create table engagement_private.newsletter_consents (
  id uuid primary key default gen_random_uuid(),
  email_hmac text not null,
  state text not null default 'pending'
    check (state in ('pending', 'subscribed', 'unsubscribed')),
  token_hash text not null,
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email_hmac)
);

create table engagement_private.appointments (
  id uuid primary key default gen_random_uuid(),
  contact_envelope jsonb not null,
  message_envelope jsonb not null,
  key_version integer not null check (key_version > 0),
  state text not null default 'requested'
    check (state in ('requested', 'contacted', 'confirmed', 'completed', 'declined')),
  created_at timestamptz not null default now()
);

-- PostgreSQL does not index the referencing side of a foreign key
-- automatically. Keep parent updates/deletes and integrity checks bounded as
-- commerce history grows.
create index products_category_id_fk_idx
  on catalog_private.products(category_id);
create index products_chapter_id_fk_idx
  on catalog_private.products(chapter_id);
create index release_batch_products_product_id_fk_idx
  on catalog_private.release_batch_products(product_id);
create index email_otp_challenges_checkout_session_id_fk_idx
  on commerce_private.email_otp_challenges(checkout_session_id);
create index order_items_sku_id_fk_idx
  on commerce_private.order_items(sku_id);
create index order_items_price_version_id_fk_idx
  on commerce_private.order_items(price_version_id);
create index order_item_units_sku_id_fk_idx
  on commerce_private.order_item_units(sku_id);
create index payment_attempts_reservation_id_fk_idx
  on commerce_private.payment_attempts(reservation_id);
create index payment_receipts_order_id_fk_idx
  on commerce_private.payment_receipts(order_id);
create index payment_receipts_payment_attempt_id_fk_idx
  on commerce_private.payment_receipts(payment_attempt_id);
create index provider_disputes_payment_receipt_id_fk_idx
  on commerce_private.provider_disputes(payment_receipt_id);
create index payment_adjustments_payment_receipt_id_fk_idx
  on commerce_private.payment_adjustment_entries(payment_receipt_id);
create index payment_adjustments_provider_dispute_id_fk_idx
  on commerce_private.payment_adjustment_entries(provider_dispute_id)
  where provider_dispute_id is not null;
create index refund_operations_order_id_fk_idx
  on commerce_private.refund_operations(order_id);
create index refund_operations_payment_receipt_id_fk_idx
  on commerce_private.refund_operations(payment_receipt_id);
create index invoices_order_id_fk_idx
  on commerce_private.invoices(order_id);
create index shipments_order_id_fk_idx
  on commerce_private.shipments(order_id);
create index parcels_shipment_id_fk_idx
  on commerce_private.parcels(shipment_id);
create index parcel_units_order_id_fk_idx
  on commerce_private.parcel_units(order_id);
create index return_cases_order_id_fk_idx
  on commerce_private.return_cases(order_id);
create index return_dispositions_order_item_unit_id_fk_idx
  on commerce_private.return_unit_dispositions(order_item_unit_id);
create index order_unit_credits_order_id_fk_idx
  on commerce_private.order_unit_credits(order_id);
create index legal_documents_supersedes_id_fk_idx
  on ops_private.legal_documents(supersedes_id)
  where supersedes_id is not null;

create index payment_attempts_reconcile_due_idx
  on commerce_private.payment_attempts(reconcile_after, id)
  where state = 'verification_pending';

create or replace function ops_private.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'APPEND_ONLY_TABLE';
end
$function$;

create trigger audit_events_append_only
before update or delete on ops_private.audit_events
for each row execute function ops_private.reject_mutation();

create trigger provider_events_append_only
before update or delete on ops_private.provider_events
for each row execute function ops_private.reject_mutation();

create trigger legal_documents_immutable
before update or delete on ops_private.legal_documents
for each row execute function ops_private.reject_mutation();

create trigger inventory_movements_append_only
before update or delete on commerce_private.inventory_movements
for each row execute function ops_private.reject_mutation();

create trigger payment_receipts_append_only
before update or delete on commerce_private.payment_receipts
for each row execute function ops_private.reject_mutation();

create trigger payment_adjustments_append_only
before update or delete on commerce_private.payment_adjustment_entries
for each row execute function ops_private.reject_mutation();

create trigger order_status_events_append_only
before update or delete on commerce_private.order_status_events
for each row execute function ops_private.reject_mutation();

do $rls$
declare
  target record;
begin
  for target in
    select schemaname, tablename
    from pg_tables
    where schemaname in (
      'catalog_private',
      'commerce_private',
      'ops_private',
      'engagement_private'
    )
  loop
    execute format('alter table %I.%I enable row level security', target.schemaname, target.tablename);
    execute format('alter table %I.%I force row level security', target.schemaname, target.tablename);
  end loop;
end
$rls$;

grant usage on schema api to storefront_rpc_caller, worker_rpc_caller, admin_rpc_caller;
revoke all on all tables in schema catalog_private from public, anon, authenticated;
revoke all on all tables in schema commerce_private from public, anon, authenticated;
revoke all on all tables in schema ops_private from public, anon, authenticated;
revoke all on all tables in schema engagement_private from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;
revoke all on all sequences in schema catalog_private from public, anon, authenticated;
revoke all on all sequences in schema commerce_private from public, anon, authenticated;
revoke all on all sequences in schema ops_private from public, anon, authenticated;
revoke all on all sequences in schema engagement_private from public, anon, authenticated;

grant usage on schema catalog_private to catalog_reader_owner;
grant select on
  catalog_private.products,
  catalog_private.categories,
  catalog_private.chapters,
  catalog_private.product_variants,
  catalog_private.price_versions
to catalog_reader_owner;

create policy catalog_reader_products on catalog_private.products
  for select to catalog_reader_owner
  using (status = 'published');
create policy catalog_reader_categories on catalog_private.categories
  for select to catalog_reader_owner using (true);
create policy catalog_reader_chapters on catalog_private.chapters
  for select to catalog_reader_owner using (true);
create policy catalog_reader_variants on catalog_private.product_variants
  for select to catalog_reader_owner using (enabled and facts_status = 'approved');
create policy catalog_reader_prices on catalog_private.price_versions
  for select to catalog_reader_owner using (status = 'approved' and now() >= valid_from and (valid_until is null or now() < valid_until));

create or replace function api.catalog_read_all()
returns table (
  product_code text,
  slug text,
  name_en text,
  name_zh text,
  category_code text,
  chapter_code text,
  sku_code text,
  option_values jsonb,
  gross_twd integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.product_code,
    p.slug,
    p.name_en,
    p.name_zh,
    c.code,
    ch.code,
    v.sku_code,
    v.option_values,
    pv.gross_twd
  from catalog_private.products p
  join catalog_private.categories c on c.id = p.category_id
  join catalog_private.chapters ch on ch.id = p.chapter_id
  join catalog_private.product_variants v on v.product_id = p.id
  join lateral (
    select price.gross_twd
    from catalog_private.price_versions price
    where price.product_variant_id = v.id
      and price.status = 'approved'
      and now() >= price.valid_from
      and (price.valid_until is null or now() < price.valid_until)
    order by price.version desc
    limit 1
  ) pv on true
  where p.status = 'published' and v.enabled and v.facts_status = 'approved'
  order by p.launch_position, v.sku_code
$function$;

alter function api.catalog_read_all() owner to catalog_reader_owner;
revoke all on function api.catalog_read_all() from public;
grant execute on function api.catalog_read_all() to storefront_rpc_caller;

grant usage on schema commerce_private to inventory_command_owner;
grant select, update on commerce_private.inventory_balances to inventory_command_owner;
grant select, insert on commerce_private.inventory_movements to inventory_command_owner;

create policy inventory_owner_balances_select on commerce_private.inventory_balances
  for select to inventory_command_owner using (true);
create policy inventory_owner_balances_update on commerce_private.inventory_balances
  for update to inventory_command_owner using (true) with check (true);
create policy inventory_owner_movements_select on commerce_private.inventory_movements
  for select to inventory_command_owner using (true);
create policy inventory_owner_movements_insert on commerce_private.inventory_movements
  for insert to inventory_command_owner with check (true);

create or replace function api.apply_inventory_operation(
  p_operation_key text,
  p_sku_id uuid,
  p_kind text,
  p_quantity integer,
  p_order_id uuid default null,
  p_reservation_id uuid default null
)
returns table (
  movement_id uuid,
  on_hand integer,
  reserved integer,
  safety_stock integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing commerce_private.inventory_movements%rowtype;
  current_balance commerce_private.inventory_balances%rowtype;
  delta_on_hand integer;
  delta_reserved integer;
  new_movement_id uuid;
begin
  if p_operation_key is null or length(p_operation_key) < 8 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- Serialize every use of an operation key before replay lookup. This makes
  -- concurrent identical requests converge on the committed movement instead
  -- of racing into the unique constraint.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_key, 0)
  );

  select * into existing
  from commerce_private.inventory_movements
  where operation_key = p_operation_key;

  if found then
    if existing.sku_id <> p_sku_id
      or existing.kind <> p_kind
      or existing.quantity <> p_quantity
      or existing.order_id is distinct from p_order_id
      or existing.reservation_id is distinct from p_reservation_id
    then
      raise exception 'INVENTORY_OPERATION_CONFLICT';
    end if;
    return query
      select existing.id, b.on_hand, b.reserved, b.safety_stock, true
      from commerce_private.inventory_balances b
      where b.sku_id = p_sku_id;
    return;
  end if;

  select * into current_balance
  from commerce_private.inventory_balances
  where sku_id = p_sku_id
  for update;

  if not found then
    raise exception 'UNKNOWN_SKU';
  end if;

  case p_kind
    when 'receive' then delta_on_hand := p_quantity; delta_reserved := 0;
    when 'reserve' then delta_on_hand := 0; delta_reserved := p_quantity;
    when 'release' then delta_on_hand := 0; delta_reserved := -p_quantity;
    when 'sale' then delta_on_hand := -p_quantity; delta_reserved := -p_quantity;
    when 'cancel_restock' then delta_on_hand := p_quantity; delta_reserved := 0;
    when 'return_sellable' then delta_on_hand := p_quantity; delta_reserved := 0;
    when 'return_damaged' then delta_on_hand := 0; delta_reserved := 0;
    else raise exception 'INVALID_INVENTORY_KIND';
  end case;

  update commerce_private.inventory_balances
  set
    on_hand = on_hand + delta_on_hand,
    reserved = reserved + delta_reserved,
    updated_at = now()
  where sku_id = p_sku_id
  returning * into current_balance;

  insert into commerce_private.inventory_movements (
    operation_key,
    sku_id,
    kind,
    quantity,
    delta_on_hand,
    delta_reserved,
    order_id,
    reservation_id
  ) values (
    p_operation_key,
    p_sku_id,
    p_kind,
    p_quantity,
    delta_on_hand,
    delta_reserved,
    p_order_id,
    p_reservation_id
  )
  returning id into new_movement_id;

  return query select
    new_movement_id,
    current_balance.on_hand,
    current_balance.reserved,
    current_balance.safety_stock,
    false;
end
$function$;

alter function api.apply_inventory_operation(text, uuid, text, integer, uuid, uuid)
  owner to inventory_command_owner;
revoke all on function api.apply_inventory_operation(text, uuid, text, integer, uuid, uuid)
  from public;
revoke execute on function api.apply_inventory_operation(text, uuid, text, integer, uuid, uuid)
  from storefront_rpc_caller;
grant execute on function api.apply_inventory_operation(text, uuid, text, integer, uuid, uuid)
  to worker_rpc_caller;

grant usage on schema ops_private to ops_command_owner;
grant select, update on ops_private.runtime_controls to ops_command_owner;
grant insert on ops_private.audit_events to ops_command_owner;

create policy ops_owner_runtime_select on ops_private.runtime_controls
  for select to ops_command_owner using (true);
create policy ops_owner_runtime_update on ops_private.runtime_controls
  for update to ops_command_owner using (true) with check (true);
create policy ops_owner_audit_insert on ops_private.audit_events
  for insert to ops_command_owner with check (true);

create or replace function api.fail_close_runtime(
  p_expected_revision bigint,
  p_request_id text,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  next_revision bigint;
begin
  update ops_private.runtime_controls
  set
    revision = revision + 1,
    commerce_live = false,
    checkout_enabled = false,
    production_canary_enabled = false,
    search_index_enabled = false,
    catalog_emergency_no_cache = true,
    media_emergency_no_cache = true,
    updated_at = now()
  where singleton and revision = p_expected_revision
  returning revision into next_revision;

  if next_revision is null then
    raise exception 'RUNTIME_REVISION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'incident_principal',
    'runtime.fail_close',
    'runtime_controls',
    'singleton',
    array['commerce_live', 'checkout_enabled', 'production_canary_enabled', 'search_index_enabled', 'catalog_emergency_no_cache', 'media_emergency_no_cache', p_reason],
    p_request_id
  );

  return next_revision;
end
$function$;

alter function api.fail_close_runtime(bigint, text, text) owner to ops_command_owner;
revoke all on function api.fail_close_runtime(bigint, text, text) from public;
grant execute on function api.fail_close_runtime(bigint, text, text) to worker_rpc_caller;

grant usage on schema catalog_private, commerce_private, ops_private, engagement_private
  to backup_exporter;
grant select on all tables in schema catalog_private to backup_exporter;
grant select on all tables in schema commerce_private to backup_exporter;
grant select on all tables in schema ops_private to backup_exporter;
grant select on all tables in schema engagement_private to backup_exporter;
alter role backup_exporter set default_transaction_read_only = on;
alter role backup_exporter set statement_timeout = '5min';
alter role backup_exporter set idle_in_transaction_session_timeout = '30s';

do $backup_policies$
declare
  target record;
begin
  for target in
    select schemaname, tablename
    from pg_tables
    where schemaname in (
      'catalog_private',
      'commerce_private',
      'ops_private',
      'engagement_private'
    )
  loop
    execute format(
      'create policy %I on %I.%I for select to backup_exporter using (true)',
      'backup_exporter_select_' || target.tablename,
      target.schemaname,
      target.tablename
    );
  end loop;
end
$backup_policies$;

alter default privileges in schema catalog_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema commerce_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema ops_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema engagement_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema api revoke execute on functions from public, anon, authenticated;

commit;
