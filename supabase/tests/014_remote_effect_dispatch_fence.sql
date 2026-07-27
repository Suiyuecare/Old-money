begin;

set local role postgres;

do $privileges$
begin
  if has_function_privilege(
    'authenticated',
    'api.worker_operations_dispatch_start(text,text,timestamp with time zone)',
    'execute'
  ) then
    raise exception
      'AUTHENTICATED_CAN_OPEN_REMOTE_EFFECT_DISPATCH_FENCE';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.worker_operations_dispatch_start(text,text,timestamp with time zone)',
    'execute'
  ) then
    raise exception
      'SERVICE_ROLE_CANNOT_OPEN_REMOTE_EFFECT_DISPATCH_FENCE';
  end if;
end
$privileges$;

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
) values
(
  '73000000-0000-4000-8000-000000000001',
  'sql-predispatch-retry-safe-0001',
  'outbox',
  'email.send',
  'remote_effect',
  'sql-dispatch-test-order',
  '{"templateVersion":"v1","to":"safe@example.test","subject":"test","text":"test"}',
  'leased',
  '73000000-0000-4000-8000-000000000002',
  'sql-dispatch-worker',
  now() + interval '1 minute'
),
(
  '73000000-0000-4000-8000-000000000003',
  'sql-postdispatch-no-retry-0001',
  'outbox',
  'email.send',
  'remote_effect',
  'sql-dispatch-test-order',
  '{"templateVersion":"v1","to":"safe@example.test","subject":"test","text":"test"}',
  'leased',
  '73000000-0000-4000-8000-000000000004',
  'sql-dispatch-worker',
  now() + interval '1 minute'
),
(
  '73000000-0000-4000-8000-000000000005',
  'sql-safe-query-no-dispatch-fence-0001',
  'reconciliation',
  'payment.query',
  'safe_query',
  'sql-dispatch-test-order',
  '{"merchantTradeNo":"SQLDISPATCHQUERY001"}',
  'leased',
  '73000000-0000-4000-8000-000000000006',
  'sql-dispatch-worker',
  now() + interval '1 minute'
);

set local role service_role;

do $predispatch_retry$
declare
  completed jsonb;
begin
  completed := api.worker_operations_complete(
    '73000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002',
    'retry_safe',
    null,
    '{}'::jsonb,
    'PRE_DISPATCH_DEPENDENCY_UNAVAILABLE',
    30,
    now()
  );
  if completed->>'state' <> 'queued'
    or completed->>'dispatchStartedAt' is not null
  then
    raise exception 'PRE_DISPATCH_REMOTE_EFFECT_WAS_NOT_REQUEUED';
  end if;
end
$predispatch_retry$;

do $dispatch_start$
declare
  first_result jsonb;
  replay_result jsonb;
begin
  first_result := api.worker_operations_dispatch_start(
    '73000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000004',
    now()
  );
  replay_result := api.worker_operations_dispatch_start(
    '73000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000004',
    now()
  );
  if first_result->>'dispatchStartedAt' is null
    or replay_result->>'dispatchStartedAt'
      is distinct from first_result->>'dispatchStartedAt'
  then
    raise exception 'REMOTE_EFFECT_DISPATCH_FENCE_NOT_DURABLE';
  end if;
end
$dispatch_start$;

do $postdispatch_retry_rejected$
begin
  begin
    perform api.worker_operations_complete(
      '73000000-0000-4000-8000-000000000003',
      '73000000-0000-4000-8000-000000000004',
      'retry_safe',
      null,
      '{}'::jsonb,
      'PROVIDER_TIMEOUT',
      30,
      now()
    );
    raise exception
      'POST_DISPATCH_REMOTE_EFFECT_RETRY_WAS_ACCEPTED';
  exception
    when others then
      if sqlerrm not like
        '%DISPATCHED_REMOTE_EFFECT_CANNOT_RETRY%'
      then
        raise;
      end if;
  end;
end
$postdispatch_retry_rejected$;

do $safe_query_cannot_dispatch$
begin
  begin
    perform api.worker_operations_dispatch_start(
      '73000000-0000-4000-8000-000000000005',
      '73000000-0000-4000-8000-000000000006',
      now()
    );
    raise exception 'SAFE_QUERY_OPENED_REMOTE_EFFECT_DISPATCH_FENCE';
  exception
    when others then
      if sqlerrm not like
        '%DISPATCH_FENCE_REQUIRES_REMOTE_EFFECT%'
      then
        raise;
      end if;
  end;
end
$safe_query_cannot_dispatch$;

select api.worker_operations_complete(
  '73000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000004',
  'unknown',
  null,
  '{}'::jsonb,
  'PROVIDER_TIMEOUT_OR_EXCEPTION_AFTER_DISPATCH',
  null,
  now()
);

reset role;
set local role postgres;

do $postdispatch_state$
begin
  if not exists (
    select 1
    from ops_private.operation_jobs job
    where job.id = '73000000-0000-4000-8000-000000000003'
      and job.state = 'unknown'
      and job.dispatch_started_at is not null
  ) then
    raise exception 'POST_DISPATCH_UNCERTAINTY_DID_NOT_BECOME_UNKNOWN';
  end if;

  begin
    update ops_private.operation_jobs
    set dispatch_started_at = null
    where id = '73000000-0000-4000-8000-000000000003';
    raise exception 'REMOTE_EFFECT_DISPATCH_FENCE_WAS_CLEARED';
  exception
    when others then
      if sqlerrm not like
        '%REMOTE_EFFECT_DISPATCH_FENCE_IMMUTABLE%'
      then
        raise;
      end if;
  end;
end
$postdispatch_state$;

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  available_at,
  lease_token,
  leased_by,
  lease_expires_at,
  attempt_count,
  dispatch_started_at
) values
(
  '73000000-0000-4000-8000-000000000007',
  'sql-expired-before-dispatch-0001',
  'outbox',
  'email.send',
  'remote_effect',
  'sql-dispatch-test-order',
  '{"templateVersion":"v1","to":"safe@example.test","subject":"test","text":"test"}',
  'leased',
  now() - interval '10 minutes',
  '73000000-0000-4000-8000-000000000008',
  'sql-crashed-worker',
  now() - interval '1 minute',
  1,
  null
),
(
  '73000000-0000-4000-8000-000000000009',
  'sql-expired-after-dispatch-0001',
  'outbox',
  'email.send',
  'remote_effect',
  'sql-dispatch-test-order',
  '{"templateVersion":"v1","to":"safe@example.test","subject":"test","text":"test"}',
  'leased',
  now() - interval '9 minutes',
  '73000000-0000-4000-8000-000000000010',
  'sql-crashed-worker',
  now() - interval '1 minute',
  1,
  now() - interval '2 minutes'
);

set local role service_role;

do $expired_lease_sweep$
declare
  claimed jsonb;
begin
  claimed := api.worker_operations_claim(
    'sql-replacement-worker',
    now(),
    30
  );
  if claimed->>'id' <> '73000000-0000-4000-8000-000000000007'
    or claimed->>'state' <> 'leased'
    or claimed->>'dispatchStartedAt' is not null
    or (claimed->>'attemptCount')::integer <> 2
  then
    raise exception 'PRE_DISPATCH_EXPIRED_LEASE_WAS_NOT_RECOVERED';
  end if;
end
$expired_lease_sweep$;

reset role;
set local role postgres;

do $expired_postdispatch_state$
begin
  if not exists (
    select 1
    from ops_private.operation_jobs job
    where job.id = '73000000-0000-4000-8000-000000000009'
      and job.state = 'unknown'
      and job.dispatch_started_at is not null
      and job.error_code = 'LEASE_EXPIRED_EFFECT_UNKNOWN'
  ) then
    raise exception
      'POST_DISPATCH_EXPIRED_LEASE_WAS_REQUEUED';
  end if;
end
$expired_postdispatch_state$;

rollback;
