begin;

set local role postgres;

insert into commerce_private.checkout_sessions (
  id,
  public_id,
  state,
  safety_revision,
  legal_bundle_revision,
  expires_at,
  consumed_at
) values (
  '72000000-0000-4000-8000-000000000001',
  'SQL-INVOICE-PII-CHECKOUT',
  'consumed',
  1,
  1,
  now() + interval '1 day',
  now()
);

insert into commerce_private.orders (
  id,
  public_id,
  merchant_trade_no,
  checkout_session_id,
  projection_status,
  merchandise_gross_twd,
  shipping_gross_twd,
  shipping_net_twd,
  shipping_tax_twd,
  total_gross_twd,
  total_net_twd,
  total_tax_twd
) values (
  '72000000-0000-4000-8000-000000000002',
  'LIG-20260728-PII1',
  'SQLINVOICEPII001',
  '72000000-0000-4000-8000-000000000001',
  'paid',
  9800,
  0,
  0,
  0,
  9800,
  9333,
  467
);

insert into commerce_private.order_pii (
  order_id,
  contact_envelope,
  shipping_envelope,
  invoice_envelope,
  schema_version,
  key_version
) values (
  '72000000-0000-4000-8000-000000000002',
  '{}'::jsonb,
  '{}'::jsonb,
  '{
    "algorithm":"aes-256-gcm",
    "keyVersion":1,
    "nonce":"bm9uY2U",
    "ciphertext":"ZW5jcnlwdGVkLWludm9pY2U",
    "authTag":"YXV0aC10YWc"
  }'::jsonb,
  1,
  1
);

insert into commerce_private.invoices (
  id,
  order_id,
  relate_number,
  state,
  provider_operation_key
) values (
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002',
  'PENDING-SQL-PII-1',
  'issuing',
  'sql-invoice-pii-job-0001'
);

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  lease_token,
  leased_by,
  lease_expires_at
) values (
  '72000000-0000-4000-8000-000000000004',
  'sql-invoice-pii-job-0001',
  'provider',
  'invoice.issue',
  'remote_effect',
  '72000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'invoiceId', '72000000-0000-4000-8000-000000000003',
    'option', jsonb_build_object(
      'kind', 'ecpay_email',
      'email', 'buyer@example.com'
    ),
    'totals', jsonb_build_object(
      'grossTwd', 9800,
      'netTwd', 9333,
      'taxTwd', 467
    )
  ),
  'leased',
  '72000000-0000-4000-8000-000000000005',
  'sql-invoice-worker',
  now() + interval '1 minute'
);

do $opaque_payload$
declare
  durable_payload jsonb;
begin
  select payload into durable_payload
  from ops_private.operation_jobs
  where id = '72000000-0000-4000-8000-000000000004';
  if durable_payload ? 'option'
    or durable_payload::text like '%buyer@example.com%'
    or (durable_payload - 'invoiceId' - 'totals')
      <> '{}'::jsonb
  then
    raise exception
      'INVOICE_ISSUE_DURABLE_PAYLOAD_CONTAINS_PLAINTEXT';
  end if;
end
$opaque_payload$;

set local role service_role;

do $encrypted_resolver$
declare
  result jsonb;
begin
  result := api.worker_invoice_issue_payload_resolve(
    '72000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000002',
    'sql-invoice-pii-job-0001'
  );
  if result->>'orderId'
      <> '72000000-0000-4000-8000-000000000002'
    or result->'invoiceEnvelope'->>'ciphertext'
      <> 'ZW5jcnlwdGVkLWludm9pY2U'
    or result::text like '%buyer@example.com%'
  then
    raise exception 'INVOICE_ENCRYPTED_RESOLUTION_INVALID';
  end if;
end
$encrypted_resolver$;

reset role;
set local role postgres;

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  available_at
) values
(
  '72000000-0000-4000-8000-000000000006',
  'sql-safe-reconciliation-0001',
  'reconciliation',
  'payment.query',
  'safe_query',
  '72000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'merchantTradeNo', 'SQLINVOICEPII001'
  ),
  now() - interval '2 minutes'
),
(
  '72000000-0000-4000-8000-000000000007',
  'sql-remote-effect-must-not-reconcile-0001',
  'provider',
  'payment.refund',
  'remote_effect',
  '72000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'providerTradeNo', 'SQLPROVIDER001',
    'amountTwd', 100
  ),
  now() - interval '3 minutes'
);

set local role service_role;

do $bounded_reconciliation_claim$
declare
  claimed jsonb;
begin
  claimed := api.worker_reconciliation_claim(
    'sql-reconciliation-worker',
    now(),
    30
  );
  if claimed->>'id'
      <> '72000000-0000-4000-8000-000000000006'
    or claimed->>'type' <> 'payment.query'
    or claimed->>'safety' <> 'safe_query'
    or claimed->>'state' <> 'leased'
    or (claimed->>'attemptCount')::integer <> 1
  then
    raise exception 'SAFE_RECONCILIATION_JOB_NOT_CLAIMED';
  end if;
end
$bounded_reconciliation_claim$;

reset role;
set local role postgres;

do $remote_effect_not_claimed$
begin
  if not exists (
    select 1
    from ops_private.operation_jobs job
    where job.id =
      '72000000-0000-4000-8000-000000000007'
      and job.state = 'queued'
      and job.attempt_count = 0
      and job.lease_token is null
  ) then
    raise exception
      'RECONCILIATION_WORKER_REDISPATCHED_REMOTE_EFFECT';
  end if;
  if has_function_privilege(
    'authenticated',
    'api.worker_invoice_issue_payload_resolve(uuid,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'api.worker_reconciliation_claim(text,timestamp with time zone,integer)',
    'execute'
  ) then
    raise exception
      'AUTHENTICATED_CAN_EXECUTE_PRIVATE_WORKER_RPC';
  end if;
end
$remote_effect_not_claimed$;

rollback;
