begin;

create table ops_private.launch_attestations (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('catalog', 'legal', 'canary')),
  value text not null
    check (char_length(value) between 1 and 160),
  evidence_sha256 text not null
    check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid not null,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);

alter table ops_private.launch_attestations
  owner to backoffice_ops_owner;
alter table ops_private.launch_attestations
  enable row level security;
alter table ops_private.launch_attestations
  force row level security;

create index launch_attestations_latest_kind_idx
  on ops_private.launch_attestations(kind, created_at desc, id desc);

create trigger launch_attestations_append_only
before update or delete on ops_private.launch_attestations
for each row execute function ops_private.reject_mutation();

grant select, insert on ops_private.launch_attestations
  to backoffice_ops_owner;
grant select on ops_private.launch_attestations
  to catalog_snapshot_owner;

create policy backoffice_ops_launch_attestations_select
on ops_private.launch_attestations
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_launch_attestations_insert
on ops_private.launch_attestations
for insert to backoffice_ops_owner
with check (true);

create policy catalog_snapshot_launch_attestations
on ops_private.launch_attestations
for select to catalog_snapshot_owner
using (true);

create or replace function api.admin_runtime_controls_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser', 'fulfillment', 'support'], false
  );
  return (
    select jsonb_build_object(
      'version', controls.revision,
      'mediaSafetyRevision', controls.media_safety_revision,
      'commerceLive', controls.commerce_live,
      'checkoutEnabled', controls.checkout_enabled,
      'productionCanaryEnabled', controls.production_canary_enabled,
      'ecpayApplePayEnabled', controls.ecpay_apple_pay_enabled,
      'searchIndexEnabled', controls.search_index_enabled,
      'catalogEmergencyNoCache', controls.catalog_emergency_no_cache,
      'mediaEmergencyNoCache', controls.media_emergency_no_cache,
      'catalogApprovalRevision', (
        select attestation.value
        from ops_private.launch_attestations attestation
        where attestation.kind = 'catalog'
        order by attestation.created_at desc, attestation.id desc
        limit 1
      ),
      'legalApprovalRevision', (
        select attestation.value
        from ops_private.launch_attestations attestation
        where attestation.kind = 'legal'
        order by attestation.created_at desc, attestation.id desc
        limit 1
      ),
      'canaryEvidenceSha256', (
        select attestation.value
        from ops_private.launch_attestations attestation
        where attestation.kind = 'canary'
        order by attestation.created_at desc, attestation.id desc
        limit 1
      ),
      'updatedAt', controls.updated_at
    )
    from ops_private.runtime_controls controls
    where controls.singleton
  );
end
$function$;

alter function api.admin_runtime_controls_read()
  owner to backoffice_ops_owner;
revoke all on function api.admin_runtime_controls_read()
  from public, anon;
grant execute on function api.admin_runtime_controls_read()
  to authenticated;

create or replace function api.public_runtime_controls_read()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'version', controls.revision,
    'mediaSafetyRevision', controls.media_safety_revision,
    'commerceLive', controls.commerce_live,
    'checkoutEnabled', controls.checkout_enabled,
    'productionCanaryEnabled', controls.production_canary_enabled,
    'ecpayApplePayEnabled', controls.ecpay_apple_pay_enabled,
    'searchIndexEnabled', controls.search_index_enabled,
    'catalogEmergencyNoCache', controls.catalog_emergency_no_cache,
    'mediaEmergencyNoCache', controls.media_emergency_no_cache,
    'catalogApprovalRevision', (
      select attestation.value
      from ops_private.launch_attestations attestation
      where attestation.kind = 'catalog'
      order by attestation.created_at desc, attestation.id desc
      limit 1
    ),
    'legalApprovalRevision', (
      select attestation.value
      from ops_private.launch_attestations attestation
      where attestation.kind = 'legal'
      order by attestation.created_at desc, attestation.id desc
      limit 1
    ),
    'canaryEvidenceSha256', (
      select attestation.value
      from ops_private.launch_attestations attestation
      where attestation.kind = 'canary'
      order by attestation.created_at desc, attestation.id desc
      limit 1
    ),
    'updatedAt', controls.updated_at
  )
  from ops_private.runtime_controls controls
  where controls.singleton
$function$;

alter function api.public_runtime_controls_read()
  owner to catalog_snapshot_owner;
revoke all on function api.public_runtime_controls_read()
  from public;
grant execute on function api.public_runtime_controls_read()
  to anon, authenticated, storefront_rpc_caller;

create or replace function api.admin_launch_attestation_record(
  p_expected_controls_version bigint,
  p_kind text,
  p_value text,
  p_evidence_sha256 text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  request_hash_value text;
  attestation ops_private.launch_attestations%rowtype;
  controls_version bigint;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);

  if p_expected_controls_version < 0
    or p_kind not in ('catalog', 'legal', 'canary')
    or char_length(trim(p_value)) not between 1 and 160
    or trim(p_value) <> p_value
    or p_evidence_sha256 !~ '^[a-f0-9]{64}$'
    or (
      p_kind = 'canary'
      and (
        p_value !~ '^[a-f0-9]{64}$'
        or p_value <> p_evidence_sha256
      )
    )
  then
    raise exception 'INVALID_LAUNCH_ATTESTATION';
  end if;

  request_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'operation', 'launch_attestation.record',
          'expectedControlsVersion', p_expected_controls_version,
          'kind', p_kind,
          'value', p_value,
          'evidenceSha256', p_evidence_sha256
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'launch_attestation.record',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') ||
      jsonb_build_object('replayed', true);
  end if;

  select controls.revision
  into controls_version
  from ops_private.runtime_controls controls
  where controls.singleton
  for update;
  if controls_version <> p_expected_controls_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.launch_attestations (
    kind,
    value,
    evidence_sha256,
    recorded_by,
    idempotency_key
  ) values (
    p_kind,
    p_value,
    p_evidence_sha256,
    actor_id,
    p_idempotency_key
  )
  returning * into attestation;

  update ops_private.runtime_controls
  set
    revision = revision + 1,
    updated_at = now()
  where singleton and revision = p_expected_controls_version
  returning revision into controls_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'launch_attestation.record',
    'launch_attestation',
    attestation.id::text,
    array['kind', 'value', 'evidence_sha256', 'runtime_controls.revision'],
    p_idempotency_key
  );
  insert into ops_private.cache_invalidation_jobs (
    operation_key,
    tags,
    safety_revision
  ) values (
    'launch-attestation:' || attestation.id::text,
    array['runtime-controls', 'checkout', 'indexing'],
    controls_version
  );

  result := jsonb_build_object(
    'id', attestation.id,
    'kind', attestation.kind,
    'value', attestation.value,
    'evidenceSha256', attestation.evidence_sha256,
    'controlsVersion', controls_version,
    'recordedAt', attestation.created_at
  );
  return ops_private.admin_command_finish(
    actor_id,
    'launch_attestation.record',
    p_idempotency_key,
    attestation.id,
    result
  );
end
$function$;

alter function api.admin_launch_attestation_record(
  bigint, text, text, text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_launch_attestation_record(
  bigint, text, text, text, text
) from public, anon, service_role;
grant execute on function api.admin_launch_attestation_record(
  bigint, text, text, text, text
) to authenticated;

comment on table ops_private.launch_attestations is
  'Append-only Owner attestations. Deployment evidence must exactly match the latest durable value before live gates can open.';

commit;
