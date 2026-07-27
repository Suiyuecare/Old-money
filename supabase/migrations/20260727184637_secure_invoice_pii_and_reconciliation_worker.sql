begin;

-- Invoice recipient/carrier facts remain encrypted on order_pii. The generic
-- operations queue may only retain the authoritative invoice UUID and totals.
create or replace function ops_private.sanitize_invoice_issue_job_payload()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.command_type <> 'invoice.issue' then
    return new;
  end if;

  -- The compatibility marker accepted by admin_operations_command is
  -- transient. Strip it even if a legacy caller placed PII inside it.
  new.payload := new.payload - 'option';
  if jsonb_typeof(new.payload) <> 'object'
    or coalesce(new.payload->>'invoiceId', '') !~
      '^[a-f0-9-]{36}$'
    or jsonb_typeof(new.payload->'totals') <> 'object'
    or (new.payload - 'invoiceId' - 'totals') <> '{}'::jsonb
    or (
      (new.payload->'totals') -
        'grossTwd' - 'netTwd' - 'taxTwd'
    ) <> '{}'::jsonb
    or coalesce((new.payload->'totals'->>'grossTwd')::integer, -1)
      < 0
    or coalesce((new.payload->'totals'->>'netTwd')::integer, -1)
      < 0
    or coalesce((new.payload->'totals'->>'taxTwd')::integer, -1)
      < 0
  then
    raise exception 'INVALID_INVOICE_ISSUE_DURABLE_PAYLOAD';
  end if;
  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_INVOICE_ISSUE_DURABLE_PAYLOAD';
end
$function$;

alter function ops_private.sanitize_invoice_issue_job_payload()
  owner to backoffice_ops_owner;
revoke all on function
  ops_private.sanitize_invoice_issue_job_payload()
from public, anon, authenticated, service_role;

drop trigger if exists operation_jobs_sanitize_invoice_issue
  on ops_private.operation_jobs;
create trigger operation_jobs_sanitize_invoice_issue
before insert or update of payload on ops_private.operation_jobs
for each row
execute function ops_private.sanitize_invoice_issue_job_payload();

-- Scrub any rows produced before this forward migration. The authoritative
-- encrypted order envelope remains the sole source for the provider payload.
update ops_private.operation_jobs
set payload = jsonb_build_object(
  'invoiceId', payload->'invoiceId',
  'totals', payload->'totals'
)
where command_type = 'invoice.issue';

alter table ops_private.operation_jobs
  drop constraint if exists
    operation_jobs_invoice_issue_opaque_payload_check;
alter table ops_private.operation_jobs
  add constraint operation_jobs_invoice_issue_opaque_payload_check
  check (
    command_type <> 'invoice.issue'
    or (
      jsonb_typeof(payload) = 'object'
      and coalesce(payload->>'invoiceId', '') ~
        '^[a-f0-9-]{36}$'
      and jsonb_typeof(payload->'totals') = 'object'
      and (payload - 'invoiceId' - 'totals') = '{}'::jsonb
      and (
        (payload->'totals') -
          'grossTwd' - 'netTwd' - 'taxTwd'
      ) = '{}'::jsonb
    )
  );

comment on function
  ops_private.sanitize_invoice_issue_job_payload()
is
  'Removes the transient invoice source marker and rejects any invoice.issue durable payload beyond an opaque invoice UUID and non-PII totals.';

do $roles$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'invoice_pii_resolver_owner'
  ) then
    create role invoice_pii_resolver_owner
      nologin noinherit nobypassrls
      nocreatedb nocreaterole noreplication;
  end if;
end
$roles$;

grant usage on schema api, commerce_private, ops_private
  to invoice_pii_resolver_owner;
grant select on
  commerce_private.orders,
  commerce_private.order_pii,
  commerce_private.invoices,
  ops_private.operation_jobs
to invoice_pii_resolver_owner;

create policy invoice_pii_resolver_orders_select
on commerce_private.orders
for select to invoice_pii_resolver_owner
using (true);

create policy invoice_pii_resolver_order_pii_select
on commerce_private.order_pii
for select to invoice_pii_resolver_owner
using (true);

create policy invoice_pii_resolver_invoices_select
on commerce_private.invoices
for select to invoice_pii_resolver_owner
using (true);

create policy invoice_pii_resolver_operation_jobs_select
on ops_private.operation_jobs
for select to invoice_pii_resolver_owner
using (true);

create or replace function api.worker_invoice_issue_payload_resolve(
  p_invoice_id uuid,
  p_aggregate_id text,
  p_operation_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_invoice_id is null
    or coalesce(p_aggregate_id, '') !~
      '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    or char_length(coalesce(p_operation_key, '')) not between 1 and 500
  then
    raise exception 'INVALID_INVOICE_ISSUE_REFERENCE';
  end if;

  select jsonb_build_object(
    'orderId', order_record.id,
    'invoiceEnvelope', pii.invoice_envelope,
    'schemaVersion', pii.schema_version,
    'keyVersion', pii.key_version
  )
  into result
  from commerce_private.invoices invoice
  join commerce_private.orders order_record
    on order_record.id = invoice.order_id
  join commerce_private.order_pii pii
    on pii.order_id = order_record.id
  join ops_private.operation_jobs job
    on job.operation_key = p_operation_key
    and job.aggregate_id = p_aggregate_id
    and job.command_type = 'invoice.issue'
    and job.safety = 'remote_effect'
    and job.state = 'leased'
    and job.payload->>'invoiceId' = invoice.id::text
  where invoice.id = p_invoice_id
    and invoice.state = 'issuing'
    and (
      order_record.id::text = p_aggregate_id
      or order_record.public_id = p_aggregate_id
    );
  return result;
end
$function$;

alter function api.worker_invoice_issue_payload_resolve(
  uuid, text, text
) owner to invoice_pii_resolver_owner;
revoke all on function
  api.worker_invoice_issue_payload_resolve(uuid, text, text)
from public, anon, authenticated, worker_rpc_caller,
  admin_rpc_caller;
grant execute on function
  api.worker_invoice_issue_payload_resolve(uuid, text, text)
to service_role;

comment on function
  api.worker_invoice_issue_payload_resolve(uuid, text, text)
is
  'Worker-only leased-job lookup returning an encrypted invoice envelope. Plaintext carrier Email is never returned by SQL or persisted in operation payloads.';

-- Dedicated reconciliation claims only safe, read-only provider queries.
-- Unknown remote effects are deliberately not made claimable and therefore
-- cannot be replayed through this scheduler.
create index operation_jobs_reconciliation_claimable
  on ops_private.operation_jobs(available_at, created_at, id)
  where state = 'queued'
    and kind = 'reconciliation'
    and safety = 'safe_query';

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

  return jsonb_build_object(
    'id', job.id,
    'operationKey', job.operation_key,
    'aggregateId', job.aggregate_id,
    'type', job.command_type,
    'safety', job.safety,
    'state', job.state,
    'payload', job.payload,
    'attemptCount', job.attempt_count,
    'availableAt', job.available_at,
    'leaseToken', job.lease_token,
    'leaseExpiresAt', job.lease_expires_at,
    'lastEvidenceHash', job.evidence_hash,
    'lastErrorCode', job.error_code,
    'createdAt', job.created_at,
    'updatedAt', job.updated_at
  );
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

comment on function api.worker_reconciliation_claim(
  text, timestamptz, integer
) is
  'Bounded SKIP LOCKED lease for safe reconciliation queries only. Remote-effect jobs and unknown outcomes are never redispatched.';

commit;
