begin;

set local role postgres;

insert into commerce_private.checkout_sessions (
  id,
  public_id,
  state,
  safety_revision,
  legal_bundle_revision,
  expires_at
) values (
  '44444444-4444-4444-8444-444444444444',
  'SQL-ORDER-ACCESS-CHECKOUT',
  'consumed',
  1,
  1,
  now() + interval '1 day'
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
  '33333333-3333-4333-8333-333333333333',
  'LIG-20260728-9001',
  'SQLACCESS9001',
  '44444444-4444-4444-8444-444444444444',
  'processing',
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
  '33333333-3333-4333-8333-333333333333',
  '{
    "algorithm":"aes-256-gcm",
    "keyVersion":1,
    "nonce":"bm9uY2U",
    "ciphertext":"ZW5jcnlwdGVkLWNvbnRhY3Q",
    "authTag":"YXV0aC10YWc"
  }'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  1,
  1
);

insert into commerce_private.order_access_contacts (
  order_id,
  email_hmac,
  recipient_ref
) values (
  '33333333-3333-4333-8333-333333333333',
  repeat('E', 42) || 'A',
  '22222222-2222-4222-8222-222222222222'
);

do $test$
declare
  first_result jsonb;
  replay_result jsonb;
  unknown_result jsonb;
  exchange_result jsonb;
  recipient_result jsonb;
  session_result jsonb;
  expired_result jsonb;
  job_payload jsonb;
  challenge_count integer;
  job_count integer;
  limit_count integer;
  conflict_seen boolean := false;
  rate_limit_seen boolean := false;
  invalid_payload_seen boolean := false;
  index integer;
begin
  first_result := api.order_access_request(
    'LIG-20260728-9001',
    repeat('E', 42) || 'A',
    repeat('P', 42) || 'A',
    '11111111-1111-4111-8111-111111111111',
    repeat('T', 42) || 'A',
    now() + interval '15 minutes',
    'sql-order-access-request-0001',
    repeat('a', 64)
  );
  if first_result->>'challengeId'
      <> '11111111-1111-4111-8111-111111111111'
    or not (first_result->>'deliveryQueued')::boolean
    or (first_result->>'replayed')::boolean
  then
    raise exception 'Known order access request returned an invalid receipt';
  end if;

  recipient_result := api.worker_order_access_recipient_resolve(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  );
  if recipient_result is null
    or recipient_result->>'orderId'
      <> '33333333-3333-4333-8333-333333333333'
    or recipient_result ? 'email'
    or recipient_result::text ~* 'buyer@|token=|https?://'
  then
    raise exception 'Worker recipient resolver leaked or omitted data';
  end if;

  select payload into job_payload
  from ops_private.operation_jobs
  where operation_key =
    'order-access-email:11111111-1111-4111-8111-111111111111';
  if job_payload is null
    or job_payload <> jsonb_build_object(
      'kind', 'order_access_link',
      'templateVersion', 'order-access-v1',
      'challengeId', '11111111-1111-4111-8111-111111111111'::uuid,
      'recipientRef', '22222222-2222-4222-8222-222222222222'::uuid
    )
    or job_payload::text ~* '"token"|"email"|"text"|https?://'
  then
    raise exception 'Order access outbox payload contains unsafe data';
  end if;

  replay_result := api.order_access_request(
    'LIG-20260728-9001',
    repeat('E', 42) || 'A',
    repeat('P', 42) || 'A',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('X', 42) || 'A',
    now() + interval '15 minutes',
    'sql-order-access-request-0001',
    repeat('a', 64)
  );
  if replay_result->>'challengeId'
      <> '11111111-1111-4111-8111-111111111111'
    or not (replay_result->>'replayed')::boolean
  then
    raise exception 'Idempotent order access replay diverged';
  end if;

  select count(*) into challenge_count
  from commerce_private.order_access_challenges
  where order_id = '33333333-3333-4333-8333-333333333333';
  select count(*) into job_count
  from ops_private.operation_jobs
  where operation_key like 'order-access-email:%';
  select request_count into limit_count
  from ops_private.order_access_request_limits
  where principal_hash = repeat('P', 42) || 'A';
  if challenge_count <> 1 or job_count <> 1 or limit_count <> 1 then
    raise exception 'Replay duplicated challenge/job/rate consumption';
  end if;

  begin
    perform api.order_access_request(
      'LIG-20260728-9001',
      repeat('D', 42) || 'A',
      repeat('P', 42) || 'A',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      repeat('Y', 42) || 'A',
      now() + interval '15 minutes',
      'sql-order-access-request-0001',
      repeat('b', 64)
    );
  exception when others then
    conflict_seen := sqlerrm like '%IDEMPOTENCY_CONFLICT%';
  end;
  if not conflict_seen then
    raise exception 'Changed idempotency payload was not rejected';
  end if;

  unknown_result := api.order_access_request(
    'LIG-UNKNOWN-9001',
    repeat('N', 42) || 'A',
    repeat('P', 42) || 'A',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    repeat('Z', 42) || 'A',
    now() + interval '15 minutes',
    'sql-order-access-unknown-0001',
    repeat('c', 64)
  );
  if (unknown_result->>'deliveryQueued')::boolean
    or unknown_result->>'challengeId'
      <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  then
    raise exception 'Unknown request did not return the generic receipt';
  end if;
  if exists (
    select 1
    from commerce_private.order_access_challenges
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) then
    raise exception 'Unknown order request created a challenge';
  end if;

  exchange_result := api.order_access_exchange(
    repeat('T', 42) || 'A',
    repeat('S', 42) || 'A',
    now() + interval '15 minutes',
    now()
  );
  if not (exchange_result->>'granted')::boolean
    or exchange_result->'order'->>'publicId' <> 'LIG-20260728-9001'
    or exchange_result->'order'->>'status' <> 'processing'
    or exchange_result->'order'->>'paymentStatus' <> 'pending'
    or exchange_result->'order'->>'shipmentStatus' <> 'not_created'
    or (exchange_result->'order'->>'grossTwd')::integer <> 9800
  then
    raise exception 'Valid token did not create a scoped order session';
  end if;

  if api.worker_order_access_recipient_resolve(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ) is not null then
    raise exception 'Consumed challenge still resolved its recipient';
  end if;

  exchange_result := api.order_access_exchange(
    repeat('T', 42) || 'A',
    repeat('Q', 42) || 'A',
    now() + interval '15 minutes',
    now()
  );
  if (exchange_result->>'granted')::boolean then
    raise exception 'Single-use token was accepted twice';
  end if;

  session_result := api.order_access_session_read(
    repeat('S', 42) || 'A',
    now()
  );
  if session_result->>'publicId' <> 'LIG-20260728-9001' then
    raise exception 'Scoped session could not read its order';
  end if;
  perform api.order_access_session_revoke(
    repeat('S', 42) || 'A',
    now()
  );
  if api.order_access_session_read(
    repeat('S', 42) || 'A',
    now()
  ) is not null then
    raise exception 'Revoked session remained readable';
  end if;

  perform api.order_access_request(
    'LIG-20260728-9001',
    repeat('E', 42) || 'A',
    repeat('J', 42) || 'A',
    '55555555-5555-4555-8555-555555555555',
    repeat('U', 42) || 'A',
    now() + interval '1 minute',
    'sql-order-access-expired-0001',
    repeat('d', 64)
  );
  expired_result := api.order_access_exchange(
    repeat('U', 42) || 'A',
    repeat('V', 42) || 'A',
    now() + interval '17 minutes',
    now() + interval '2 minutes'
  );
  if (expired_result->>'granted')::boolean then
    raise exception 'Expired challenge was accepted';
  end if;

  perform api.order_access_request(
    'LIG-20260728-9001',
    repeat('E', 42) || 'A',
    repeat('K', 42) || 'A',
    '66666666-6666-4666-8666-666666666666',
    repeat('W', 42) || 'A',
    now() + interval '15 minutes',
    'sql-order-access-session-expiry-0001',
    repeat('e', 64)
  );
  exchange_result := api.order_access_exchange(
    repeat('W', 42) || 'A',
    repeat('G', 42) || 'A',
    now() + interval '1 minute',
    now()
  );
  if not (exchange_result->>'granted')::boolean then
    raise exception 'Short-lived session fixture was not granted';
  end if;
  if api.order_access_session_read(
    repeat('G', 42) || 'A',
    now() + interval '2 minutes'
  ) is not null then
    raise exception 'Expired session remained readable';
  end if;

  for index in 1..5 loop
    perform api.order_access_request(
      'LIG-RATE-UNKNOWN',
      repeat('R', 42) || 'A',
      repeat('L', 42) || 'A',
      gen_random_uuid(),
      lpad(index::text, 43, 'M'),
      now() + interval '15 minutes',
      'sql-order-access-rate-' || lpad(index::text, 4, '0'),
      repeat(index::text, 64)
    );
  end loop;
  begin
    perform api.order_access_request(
      'LIG-RATE-UNKNOWN',
      repeat('R', 42) || 'A',
      repeat('L', 42) || 'A',
      gen_random_uuid(),
      repeat('O', 42) || 'A',
      now() + interval '15 minutes',
      'sql-order-access-rate-0006',
      repeat('f', 64)
    );
  exception when others then
    rate_limit_seen := sqlerrm like '%ORDER_ACCESS_RATE_LIMIT%';
  end;
  if not rate_limit_seen then
    raise exception 'Sixth order access request was not rate limited';
  end if;
  select request_count into limit_count
  from ops_private.order_access_request_limits
  where principal_hash = repeat('L', 42) || 'A';
  if limit_count <> 5 then
    raise exception 'Failed rate-limit request was partially committed';
  end if;

  begin
    insert into ops_private.operation_jobs (
      operation_key,
      kind,
      command_type,
      aggregate_id,
      payload
    ) values (
      'unsafe-order-access-email-test',
      'outbox',
      'email.send',
      '33333333-3333-4333-8333-333333333333',
      jsonb_build_object(
        'kind', 'order_access_link',
        'templateVersion', 'order-access-v1',
        'challengeId', '77777777-7777-4777-8777-777777777777',
        'recipientRef', '22222222-2222-4222-8222-222222222222',
        'token', 'raw-token-must-not-persist'
      )
    );
  exception when others then
    invalid_payload_seen :=
      sqlerrm like '%INVALID_ORDER_ACCESS_EMAIL_PAYLOAD%';
  end;
  if not invalid_payload_seen then
    raise exception 'Unsafe order access email payload was accepted';
  end if;

  if exists (
    select 1
    from commerce_private.order_access_challenges challenge
    where to_jsonb(challenge)::text ~* 'buyer@|https?://|raw-token'
  ) or exists (
    select 1
    from commerce_private.order_access_sessions session
    where to_jsonb(session)::text ~* 'buyer@|https?://|raw-token'
  ) or exists (
    select 1
    from ops_private.order_access_request_commands command
    where to_jsonb(command)::text ~* 'buyer@|https?://|raw-token'
  ) then
    raise exception 'Raw order access secret or PII was persisted';
  end if;
end
$test$;

do $privileges$
declare
  tables_without_forced_rls integer;
begin
  if has_function_privilege(
    'anon',
    'api.order_access_request(text,text,text,uuid,text,timestamptz,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'api.order_access_exchange(text,text,timestamptz,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'worker_rpc_caller',
    'api.worker_order_access_recipient_resolve(uuid,uuid)',
    'execute'
  ) then
    raise exception 'Public or delegated role can execute order access RPCs';
  end if;

  if not has_function_privilege(
    'service_role',
    'api.order_access_request(text,text,text,uuid,text,timestamptz,text,text)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'api.worker_order_access_recipient_resolve(uuid,uuid)',
    'execute'
  ) then
    raise exception 'Server-only order access RPC grant is missing';
  end if;

  if has_table_privilege(
    'service_role',
    'commerce_private.order_access_challenges',
    'select,insert,update,delete'
  ) or has_table_privilege(
    'authenticated',
    'commerce_private.order_access_sessions',
    'select'
  ) then
    raise exception 'Order access table is directly exposed';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname = 'order_access_owner'
      and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Order access owner bypasses forced RLS';
  end if;

  select count(*) into tables_without_forced_rls
  from pg_tables
  where schemaname in ('commerce_private', 'ops_private')
    and tablename in (
      'order_access_contacts',
      'order_access_challenges',
      'order_access_sessions',
      'order_access_request_limits',
      'order_access_request_commands'
    )
    and (not rowsecurity or not forcerowsecurity);
  if tables_without_forced_rls <> 0 then
    raise exception 'Order access table is missing forced RLS';
  end if;
end
$privileges$;

rollback;
