begin;

set local role postgres;

alter table ops_private.operation_jobs
  add column dispatch_started_at timestamptz;

alter table ops_private.operation_jobs
  add constraint operation_jobs_dispatch_fence_state_check
  check (
    dispatch_started_at is null
    or (
      safety = 'remote_effect'
      and state <> 'queued'
    )
  );

create or replace function ops_private.guard_operation_job_dispatch_fence()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.dispatch_started_at is not null
    and new.dispatch_started_at is distinct from old.dispatch_started_at
  then
    raise exception 'REMOTE_EFFECT_DISPATCH_FENCE_IMMUTABLE';
  end if;

  if old.dispatch_started_at is null
    and new.dispatch_started_at is not null
    and (
      old.safety <> 'remote_effect'
      or old.state <> 'leased'
      or new.state <> 'leased'
      or new.lease_token is distinct from old.lease_token
    )
  then
    raise exception 'INVALID_REMOTE_EFFECT_DISPATCH_FENCE';
  end if;

  if new.dispatch_started_at is not null
    and new.state = 'queued'
  then
    raise exception 'DISPATCHED_REMOTE_EFFECT_CANNOT_REQUEUE';
  end if;

  return new;
end
$function$;

alter function ops_private.guard_operation_job_dispatch_fence()
  owner to backoffice_ops_owner;
revoke all on function
  ops_private.guard_operation_job_dispatch_fence()
from public, anon, authenticated, service_role;
grant execute on function
  ops_private.guard_operation_job_dispatch_fence()
to backoffice_ops_owner;

create trigger operation_jobs_dispatch_fence_guard
before update of dispatch_started_at, state, lease_token
on ops_private.operation_jobs
for each row
execute function ops_private.guard_operation_job_dispatch_fence();

create or replace function ops_private.operation_job_document(
  p_job ops_private.operation_jobs
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', p_job.id,
    'operationKey', p_job.operation_key,
    'aggregateId', p_job.aggregate_id,
    'type', p_job.command_type,
    'safety', p_job.safety,
    'state', p_job.state,
    'payload', p_job.payload,
    'attemptCount', p_job.attempt_count,
    'availableAt', p_job.available_at,
    'leaseToken', p_job.lease_token,
    'leaseExpiresAt', p_job.lease_expires_at,
    'dispatchStartedAt', p_job.dispatch_started_at,
    'lastEvidenceHash', p_job.evidence_hash,
    'lastErrorCode', p_job.error_code,
    'createdAt', p_job.created_at,
    'updatedAt', p_job.updated_at
  )
$function$;

alter function ops_private.operation_job_document(
  ops_private.operation_jobs
) owner to backoffice_ops_owner;
revoke all on function ops_private.operation_job_document(
  ops_private.operation_jobs
) from public, anon, authenticated, service_role;
grant execute on function ops_private.operation_job_document(
  ops_private.operation_jobs
) to backoffice_ops_owner;

create or replace function api.worker_operations_dispatch_start(
  p_job_id text,
  p_lease_token text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job ops_private.operation_jobs%rowtype;
  first_dispatch boolean := false;
begin
  if coalesce(p_job_id, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or coalesce(p_lease_token, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or p_now is null
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_WORKER_DISPATCH_START';
  end if;

  select * into job
  from ops_private.operation_jobs candidate
  where candidate.id = p_job_id::uuid
  for update;
  if not found then
    raise exception 'OPERATION_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if job.state <> 'leased'
    or job.lease_token is distinct from p_lease_token::uuid
    or job.lease_expires_at <= p_now
  then
    raise exception 'OPERATION_LEASE_CONFLICT';
  end if;
  if job.safety <> 'remote_effect' then
    raise exception 'DISPATCH_FENCE_REQUIRES_REMOTE_EFFECT';
  end if;

  if job.dispatch_started_at is null then
    update ops_private.operation_jobs
    set
      dispatch_started_at = p_now,
      row_version = row_version + 1,
      updated_at = p_now
    where id = job.id
      and row_version = job.row_version
    returning * into job;
    if not found then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;
    first_dispatch := true;
  end if;

  if first_dispatch then
    insert into ops_private.audit_events (
      actor_scope,
      action,
      entity_type,
      entity_id,
      changed_fields,
      request_id
    ) values (
      'worker:' || coalesce(job.leased_by, 'operation-worker'),
      'operations.dispatch.started',
      'operation_job',
      job.id::text,
      array['dispatch_started_at', 'row_version'],
      job.operation_key
    );
  end if;

  return ops_private.operation_job_document(job);
end
$function$;

alter function api.worker_operations_dispatch_start(
  text, text, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_operations_dispatch_start(
  text, text, timestamptz
) from public, anon, authenticated, admin_rpc_caller;
grant execute on function api.worker_operations_dispatch_start(
  text, text, timestamptz
) to worker_rpc_caller, service_role;

create or replace function api.worker_operations_claim(
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job ops_private.operation_jobs%rowtype;
  expired_job record;
  new_lease_token uuid := gen_random_uuid();
  order_id_value uuid;
  authority_changed boolean := false;
  authority_ready boolean := false;
begin
  if coalesce(p_worker_id, '') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'
    or p_now is null
    or p_lease_seconds not between 15 and 300
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_WORKER_CLAIM';
  end if;

  with expired_safe_candidates as (
    select candidate.id
    from ops_private.operation_jobs candidate
    where candidate.state = 'leased'
      and candidate.lease_expires_at <= p_now
      and (
        candidate.safety in ('safe_query', 'retry_safe')
        or (
          candidate.safety = 'remote_effect'
          and candidate.dispatch_started_at is null
        )
      )
    order by candidate.lease_expires_at, candidate.id
    for update skip locked
    limit 100
  )
  update ops_private.operation_jobs as target
  set
    state = 'queued',
    available_at = p_now,
    lease_token = null,
    leased_by = null,
    lease_expires_at = null,
    error_code = case
      when target.safety = 'remote_effect'
        then 'PRE_DISPATCH_LEASE_EXPIRED_REQUEUED'
      else 'SAFE_LEASE_EXPIRED_REQUEUED'
    end,
    row_version = row_version + 1,
    updated_at = p_now
  from expired_safe_candidates candidate
  where target.id = candidate.id;

  for expired_job in
    with expired_remote_candidates as (
      select candidate.id
      from ops_private.operation_jobs candidate
      where candidate.state = 'leased'
        and candidate.lease_expires_at <= p_now
        and candidate.safety = 'remote_effect'
        and candidate.dispatch_started_at is not null
      order by candidate.lease_expires_at, candidate.id
      for update skip locked
      limit 100
    )
    update ops_private.operation_jobs as target
    set
      state = 'unknown',
      error_code = 'LEASE_EXPIRED_EFFECT_UNKNOWN',
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      row_version = row_version + 1,
      updated_at = p_now,
      completed_at = p_now
    from expired_remote_candidates candidate
    where target.id = candidate.id
    returning target.id
  loop
    perform ops_private.reduce_operation_job(expired_job.id, p_now);
  end loop;

  select * into job
  from ops_private.operation_jobs
  where state = 'queued'
    and available_at <= p_now
  order by available_at, created_at, id
  for update skip locked
  limit 1;
  if not found then
    return null;
  end if;

  update ops_private.operation_jobs
  set
    state = 'leased',
    lease_token = new_lease_token,
    leased_by = p_worker_id,
    lease_expires_at =
      p_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    row_version = row_version + 1,
    updated_at = p_now
  where id = job.id
    and row_version = job.row_version
  returning * into job;
  if not found then
    raise exception 'WORKER_CLAIM_CONFLICT';
  end if;

  select candidate.id into order_id_value
  from commerce_private.orders candidate
  where candidate.id::text = job.aggregate_id
    or candidate.public_id = job.aggregate_id
  for update;

  if order_id_value is not null then
    if job.command_type = 'payment.refund'
      and coalesce(job.payload->>'refundOperationId', '') ~
        '^[a-f0-9-]{36}$'
    then
      update commerce_private.refund_operations
      set
        state = 'in_flight',
        row_version = row_version + 1,
        updated_at = p_now
      where id = (job.payload->>'refundOperationId')::uuid
        and order_id = order_id_value
        and operation_key = job.operation_key
        and state = 'queued';
      authority_changed := found;
      authority_ready := authority_changed;
      if not authority_ready then
        select exists (
          select 1
          from commerce_private.refund_operations candidate
          where candidate.id =
              (job.payload->>'refundOperationId')::uuid
            and candidate.order_id = order_id_value
            and candidate.operation_key = job.operation_key
            and candidate.state = 'in_flight'
        ) into authority_ready;
      end if;
    elsif job.command_type like 'invoice.%'
      and coalesce(job.payload->>'invoiceId', '') ~
        '^[a-f0-9-]{36}$'
    then
      update commerce_private.invoices
      set
        state = case
          when job.command_type = 'invoice.issue' then 'issuing'
          else 'adjusting'
        end,
        row_version = row_version + 1,
        updated_at = p_now
      where id = (job.payload->>'invoiceId')::uuid
        and order_id = order_id_value
        and provider_operation_key = job.operation_key
        and state in ('pending_issue', 'adjustment_pending');
      authority_changed := found;
      authority_ready := authority_changed;
      if not authority_ready then
        select exists (
          select 1
          from commerce_private.invoices candidate
          where candidate.id = (job.payload->>'invoiceId')::uuid
            and candidate.order_id = order_id_value
            and candidate.provider_operation_key = job.operation_key
            and candidate.state = case
              when job.command_type = 'invoice.issue' then 'issuing'
              else 'adjusting'
            end
        ) into authority_ready;
      end if;
    elsif job.command_type like 'shipment.%'
      and coalesce(job.payload->>'shipmentId', '') ~
        '^[a-f0-9-]{36}$'
    then
      update commerce_private.shipments
      set
        state = case
          when job.command_type = 'shipment.create' then 'creating'
          else 'cancelling'
        end,
        row_version = row_version + 1,
        updated_at = p_now
      where id = (job.payload->>'shipmentId')::uuid
        and order_id = order_id_value
        and provider_operation_key = job.operation_key
        and state in ('label_pending', 'cancellation_pending');
      authority_changed := found;
      authority_ready := authority_changed;
      if not authority_ready then
        select exists (
          select 1
          from commerce_private.shipments candidate
          where candidate.id =
              (job.payload->>'shipmentId')::uuid
            and candidate.order_id = order_id_value
            and candidate.provider_operation_key = job.operation_key
            and candidate.state = case
              when job.command_type = 'shipment.create' then 'creating'
              else 'cancelling'
            end
        ) into authority_ready;
      end if;
    end if;

    if authority_changed then
      update commerce_private.orders
      set row_version = row_version + 1, updated_at = p_now
      where id = order_id_value;
      perform ops_private.refresh_order_projection(order_id_value);
    end if;
  end if;

  if job.safety = 'remote_effect'
    and job.command_type in (
      'payment.refund',
      'invoice.issue',
      'invoice.adjust',
      'shipment.create',
      'shipment.cancel'
    )
    and not authority_ready
  then
    update ops_private.operation_jobs
    set
      state = 'manual_review',
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      error_code = 'REMOTE_EFFECT_AUTHORITY_CONFLICT',
      row_version = row_version + 1,
      updated_at = p_now,
      completed_at = p_now
    where id = job.id
    returning * into job;
    perform ops_private.reduce_operation_job(job.id, p_now);
    insert into ops_private.audit_events (
      actor_scope,
      action,
      entity_type,
      entity_id,
      changed_fields,
      request_id
    ) values (
      'worker:' || p_worker_id,
      'operations.claim.rejected',
      'operation_job',
      job.id::text,
      array['state', 'error_code', 'authoritative_records'],
      job.operation_key
    );
    return null;
  end if;

  return ops_private.operation_job_document(job);
end
$function$;

alter function api.worker_operations_claim(
  text, timestamptz, integer
) owner to backoffice_ops_owner;
revoke all on function api.worker_operations_claim(
  text, timestamptz, integer
) from public, anon, authenticated, admin_rpc_caller;
grant execute on function api.worker_operations_claim(
  text, timestamptz, integer
) to worker_rpc_caller, service_role;

create or replace function api.worker_operations_complete(
  p_job_id text,
  p_lease_token text,
  p_outcome text,
  p_evidence_hash text,
  p_result jsonb,
  p_error_code text,
  p_retry_after_seconds integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job ops_private.operation_jobs%rowtype;
  target_state text;
  worker_id text;
  error_code_value text := p_error_code;
begin
  if p_job_id !~ '^[a-f0-9-]{36}$'
    or p_lease_token !~ '^[a-f0-9-]{36}$'
    or p_outcome not in (
      'succeeded', 'retry_safe', 'failed_terminal',
      'unknown', 'manual_review'
    )
    or (
      p_evidence_hash is not null
      and p_evidence_hash !~ '^[a-f0-9]{64}$'
    )
    or jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object'
    or p_now is null
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_WORKER_COMPLETION';
  end if;
  if p_outcome = 'retry_safe'
    and coalesce(p_retry_after_seconds, 0) not between 1 and 86400
  then
    raise exception 'INVALID_RETRY_DELAY';
  end if;

  select * into job
  from ops_private.operation_jobs candidate
  where candidate.id = p_job_id::uuid
  for update;
  if not found then
    raise exception 'OPERATION_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if job.state <> 'leased'
    or job.lease_token is distinct from p_lease_token::uuid
  then
    raise exception 'OPERATION_LEASE_CONFLICT';
  end if;
  if p_outcome = 'retry_safe'
    and job.safety = 'remote_effect'
    and job.dispatch_started_at is not null
  then
    raise exception 'DISPATCHED_REMOTE_EFFECT_CANNOT_RETRY';
  end if;
  if p_outcome = 'succeeded'
    and job.safety = 'remote_effect'
    and job.dispatch_started_at is null
  then
    raise exception 'REMOTE_EFFECT_DISPATCH_FENCE_REQUIRED';
  end if;
  if p_outcome = 'succeeded'
    and job.safety = 'remote_effect'
    and p_evidence_hash is null
  then
    raise exception 'REMOTE_EFFECT_EVIDENCE_REQUIRED';
  end if;
  worker_id := job.leased_by;

  if job.lease_expires_at <= p_now then
    target_state := case
      when job.safety in ('safe_query', 'retry_safe')
        or (
          job.safety = 'remote_effect'
          and job.dispatch_started_at is null
        )
        then 'queued'
      else 'unknown'
    end;
    error_code_value := case
      when target_state = 'queued'
        and job.safety = 'remote_effect'
        then 'PRE_DISPATCH_LEASE_EXPIRED_REQUEUED'
      when target_state = 'queued'
        then 'SAFE_LEASE_EXPIRED_REQUEUED'
      else 'LEASE_EXPIRED_EFFECT_UNKNOWN'
    end;
  else
    target_state := case p_outcome
      when 'succeeded' then 'completed'
      when 'retry_safe' then 'queued'
      when 'failed_terminal' then 'dead_letter'
      when 'unknown' then 'unknown'
      when 'manual_review' then 'manual_review'
    end;
  end if;

  update ops_private.operation_jobs
  set
    state = target_state,
    available_at = case
      when target_state = 'queued'
        then p_now + make_interval(
          secs => coalesce(p_retry_after_seconds, 30)
        )
      else available_at
    end,
    lease_token = null,
    leased_by = null,
    lease_expires_at = null,
    evidence_hash = p_evidence_hash,
    result = coalesce(p_result, '{}'::jsonb),
    error_code = error_code_value,
    row_version = row_version + 1,
    updated_at = p_now,
    completed_at = case
      when target_state = 'queued' then null
      else p_now
    end
  where id = job.id
    and row_version = job.row_version
  returning * into job;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  if target_state <> 'queued' then
    perform ops_private.reduce_operation_job(job.id, p_now);
  end if;

  select * into job
  from ops_private.operation_jobs candidate
  where candidate.id = job.id;

  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'worker:' || coalesce(worker_id, 'operation-worker'),
    'operations.complete',
    'operation_job',
    job.id::text,
    array[
      'state',
      'dispatch_started_at',
      'evidence_hash',
      'result',
      'error_code',
      'authoritative_records',
      'row_version'
    ],
    job.operation_key
  );

  return ops_private.operation_job_document(job);
end
$function$;

alter function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) from public, anon, authenticated, admin_rpc_caller;
grant execute on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) to worker_rpc_caller, service_role;

create or replace function api.worker_reconciliation_claim(
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job ops_private.operation_jobs%rowtype;
  new_lease_token uuid := gen_random_uuid();
begin
  if coalesce(p_worker_id, '') !~
      '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'
    or p_now is null
    or p_lease_seconds not between 15 and 300
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_RECONCILIATION_WORKER_CLAIM';
  end if;

  with expired_candidates as (
    select candidate.id
    from ops_private.operation_jobs candidate
    where candidate.kind = 'reconciliation'
      and candidate.safety = 'safe_query'
      and candidate.state = 'leased'
      and candidate.lease_expires_at <= p_now
    order by candidate.lease_expires_at, candidate.id
    for update skip locked
    limit 100
  )
  update ops_private.operation_jobs as target
  set
    state = 'queued',
    available_at = p_now,
    lease_token = null,
    leased_by = null,
    lease_expires_at = null,
    error_code = 'SAFE_RECONCILIATION_LEASE_EXPIRED_REQUEUED',
    row_version = row_version + 1,
    updated_at = p_now
  from expired_candidates candidate
  where target.id = candidate.id;

  select * into job
  from ops_private.operation_jobs candidate
  where candidate.kind = 'reconciliation'
    and candidate.safety = 'safe_query'
    and candidate.command_type = 'payment.query'
    and candidate.state = 'queued'
    and candidate.available_at <= p_now
  order by candidate.available_at, candidate.created_at, candidate.id
  for update skip locked
  limit 1;
  if not found then
    return null;
  end if;

  update ops_private.operation_jobs
  set
    state = 'leased',
    lease_token = new_lease_token,
    leased_by = p_worker_id,
    lease_expires_at =
      p_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    row_version = row_version + 1,
    updated_at = p_now
  where id = job.id
    and row_version = job.row_version
  returning * into job;
  if not found then
    raise exception 'RECONCILIATION_WORKER_CLAIM_CONFLICT';
  end if;

  return ops_private.operation_job_document(job);
end
$function$;

alter function api.worker_reconciliation_claim(
  text, timestamptz, integer
) owner to backoffice_ops_owner;
revoke all on function api.worker_reconciliation_claim(
  text, timestamptz, integer
) from public, anon, authenticated, admin_rpc_caller;
grant execute on function api.worker_reconciliation_claim(
  text, timestamptz, integer
) to worker_rpc_caller, service_role;

comment on column ops_private.operation_jobs.dispatch_started_at is
  'Immutable at-most-once fence set immediately before a remote provider call. A fenced job can never return to queued.';
comment on function api.worker_operations_dispatch_start(
  text, text, timestamptz
) is
  'Durably and idempotently records provider dispatch start for the active remote-effect lease.';

commit;
