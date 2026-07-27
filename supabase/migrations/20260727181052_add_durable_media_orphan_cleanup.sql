begin;

-- A signed source can be uploaded without finalize ever running, while
-- derivative bytes are written before the catalog registration transaction.
-- This private queue makes both gaps observable and recoverable: every planned
-- object is staged before upload, receives a grace period, and can only be
-- deleted while registration for its exact source path or SHA is fenced.
create table ops_private.media_orphan_cleanup_candidates (
  id uuid primary key default gen_random_uuid(),
  upload_intent_id uuid not null
    references ops_private.media_upload_intents(id) on delete restrict,
  object_kind text not null check (
    object_kind in ('derivative', 'source')
  ),
  scope text not null check (scope in ('product', 'support')),
  sha256 text check (
    sha256 is null or sha256 ~ '^[a-f0-9]{64}$'
  ),
  bucket_id text not null check (
    bucket_id in (
      'lignee-product-source',
      'lignee-public-derivatives',
      'lignee-support-attachments'
    )
  ),
  object_path text not null,
  state text not null default 'queued' check (
    state in (
      'queued',
      'leased',
      'retry_pending',
      'quarantined',
      'deleted',
      'protected',
      'dead_letter'
    )
  ),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 20),
  max_attempts integer not null default 5
    check (max_attempts between 1 and 20),
  not_before timestamptz not null default now() + interval '6 hours',
  lease_token uuid,
  leased_by text,
  lease_expires_at timestamptz,
  evidence_hash text check (
    evidence_hash is null or evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  error_code text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  constraint media_orphan_cleanup_coordinates_check check (
    (
      object_kind = 'derivative'
      and
      scope = 'product'
      and bucket_id = 'lignee-public-derivatives'
      and sha256 is not null
      and object_path ~
        '^catalog/[a-f0-9]{64}/(800|1200|1600)[.](webp|avif)$'
    )
    or (
      object_kind = 'derivative'
      and
      scope = 'support'
      and bucket_id = 'lignee-support-attachments'
      and sha256 is not null
      and object_path ~
        '^support/[a-f0-9]{64}/(800|1200|1600)[.](webp|avif)$'
    )
    or (
      object_kind = 'source'
      and scope = 'product'
      and bucket_id = 'lignee-product-source'
      and sha256 is null
      and object_path ~
        '^incoming/product/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[a-f0-9]{64}[.](jpg|png|webp|avif)$'
    )
    or (
      object_kind = 'source'
      and scope = 'support'
      and bucket_id = 'lignee-support-attachments'
      and sha256 is null
      and object_path ~
        '^incoming/support/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[a-f0-9]{64}[.](jpg|png|webp|avif)$'
    )
  ),
  check (
    object_kind = 'source'
    or split_part(object_path, '/', 2) = sha256
  ),
  check (
    (
      state = 'leased'
      and lease_token is not null
      and leased_by is not null
      and lease_expires_at is not null
    )
    or (
      state <> 'leased'
      and lease_token is null
      and leased_by is null
      and lease_expires_at is null
    )
  ),
  check (
    (state = 'deleted' and deleted_at is not null)
    or (state <> 'deleted' and deleted_at is null)
  )
);

create index media_orphan_cleanup_intent_idx
  on ops_private.media_orphan_cleanup_candidates(upload_intent_id);
create index media_orphan_cleanup_claim_idx
  on ops_private.media_orphan_cleanup_candidates(
    state,
    not_before,
    created_at,
    object_path,
    id
  )
  where state in ('queued', 'retry_pending', 'quarantined');
create index media_orphan_cleanup_expired_lease_idx
  on ops_private.media_orphan_cleanup_candidates(
    lease_expires_at,
    id
  )
  where state = 'leased';
create index media_orphan_cleanup_sha_idx
  on ops_private.media_orphan_cleanup_candidates(scope, sha256)
  where object_kind = 'derivative';
create index if not exists media_assets_source_object_path_idx
  on catalog_private.media_assets(source_object_path)
  where source_object_path is not null;

alter table ops_private.media_orphan_cleanup_candidates
  enable row level security;
alter table ops_private.media_orphan_cleanup_candidates
  force row level security;
revoke all on table ops_private.media_orphan_cleanup_candidates
  from public, anon, authenticated, service_role;
grant select, insert, update
  on ops_private.media_orphan_cleanup_candidates
  to backoffice_ops_owner;

create policy backoffice_ops_media_cleanup_select
on ops_private.media_orphan_cleanup_candidates
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_media_cleanup_insert
on ops_private.media_orphan_cleanup_candidates
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_media_cleanup_update
on ops_private.media_orphan_cleanup_candidates
for update to backoffice_ops_owner
using (true) with check (true);

grant select on ops_private.media_orphan_cleanup_candidates
  to backup_exporter;
create policy backup_exporter_select_media_orphan_cleanup
on ops_private.media_orphan_cleanup_candidates
for select to backup_exporter
using (true);

create or replace function
  ops_private.media_orphan_cleanup_document(
    p_candidate ops_private.media_orphan_cleanup_candidates
  )
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', p_candidate.id,
    'intentId', p_candidate.upload_intent_id,
    'objectKind', p_candidate.object_kind,
    'scope', p_candidate.scope,
    'sha256', p_candidate.sha256,
    'bucketId', p_candidate.bucket_id,
    'objectPath', p_candidate.object_path,
    'state', p_candidate.state,
    'attemptCount', p_candidate.attempt_count,
    'maxAttempts', p_candidate.max_attempts,
    'notBefore', p_candidate.not_before,
    'leaseToken', p_candidate.lease_token,
    'leaseExpiresAt', p_candidate.lease_expires_at,
    'lastErrorCode', p_candidate.error_code,
    'deletedAt', p_candidate.deleted_at,
    'createdAt', p_candidate.created_at,
    'updatedAt', p_candidate.updated_at
  )
$function$;

alter function ops_private.media_orphan_cleanup_document(
  ops_private.media_orphan_cleanup_candidates
) owner to backoffice_ops_owner;
revoke all on function ops_private.media_orphan_cleanup_document(
  ops_private.media_orphan_cleanup_candidates
) from public, anon, authenticated, service_role;
grant execute on function ops_private.media_orphan_cleanup_document(
  ops_private.media_orphan_cleanup_candidates
) to backoffice_ops_owner;

create or replace function
  catalog_private.media_asset_references_cleanup_object(
    p_object_kind text,
    p_scope text,
    p_sha256 text,
    p_object_path text
  )
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select (
    (
      p_object_kind = 'source'
      and (
        exists (
          select 1
          from catalog_private.media_assets asset
          where asset.source_object_path = p_object_path
        )
        or exists (
          select 1
          from ops_private.media_upload_intents intent
          where intent.scope = p_scope
            and intent.source_path = p_object_path
            and intent.state = 'finalized'
        )
      )
    )
    or (
      p_object_kind = 'derivative'
      and exists (
        select 1
        from catalog_private.media_assets asset
        where (
            asset.sha256 = p_sha256
            and asset.object_class = case
              when p_scope = 'product' then 'public_catalog'
              else 'private_case'
            end
          )
          or exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(asset.manifest->'derivatives') = 'array'
                  then asset.manifest->'derivatives'
                else '[]'::jsonb
              end
            ) derivative
            where derivative->>'objectPath' = p_object_path
          )
        )
      )
    )
  )
$function$;

alter function catalog_private.media_asset_references_cleanup_object(
  text, text, text, text
) owner to backoffice_ops_owner;
revoke all on function
  catalog_private.media_asset_references_cleanup_object(
    text, text, text, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  catalog_private.media_asset_references_cleanup_object(
    text, text, text, text
  )
  to backoffice_ops_owner;

-- Serialize asset registration against a cleanup lease. Once deletion has
-- started (or its outcome is uncertain), callers must stage and re-upload the
-- complete derivative set before an asset can be registered.
create or replace function
  catalog_private.guard_media_asset_cleanup_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  scope_value text := case
    when new.object_class = 'public_catalog' then 'product'
    else 'support'
  end;
  source_bucket_value text := case
    when new.object_class = 'public_catalog'
      then 'lignee-product-source'
    else 'lignee-support-attachments'
  end;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-orphan:' || scope_value || ':' || new.sha256,
      0
    )
  );
  if new.source_object_path is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'media-source-orphan:' || scope_value || ':'
          || new.source_object_path,
        0
      )
    );
  end if;
  perform 1
  from ops_private.media_orphan_cleanup_candidates candidate
  where (
    candidate.object_kind = 'derivative'
    and candidate.scope = scope_value
    and candidate.sha256 = new.sha256
  )
  or (
    new.source_object_path is not null
    and candidate.object_kind = 'source'
    and candidate.scope = scope_value
    and candidate.bucket_id = source_bucket_value
    and candidate.object_path = new.source_object_path
  )
  order by candidate.bucket_id, candidate.object_path
  for update;

  if exists (
    select 1
    from ops_private.media_orphan_cleanup_candidates candidate
    where (
      (
        candidate.object_kind = 'derivative'
        and candidate.scope = scope_value
        and candidate.sha256 = new.sha256
      )
      or (
        new.source_object_path is not null
        and candidate.object_kind = 'source'
        and candidate.scope = scope_value
        and candidate.bucket_id = source_bucket_value
        and candidate.object_path = new.source_object_path
      )
    )
      and candidate.state in (
        'leased',
        'retry_pending',
        'quarantined',
        'deleted',
        'dead_letter'
      )
  ) then
    raise exception 'MEDIA_DERIVATIVES_REQUIRE_REUPLOAD';
  end if;

  update ops_private.media_orphan_cleanup_candidates
  set
    state = 'protected',
    not_before = now(),
    evidence_hash = null,
    error_code = null,
    updated_at = now()
  where scope = scope_value
    and (
      (
        object_kind = 'derivative'
        and sha256 = new.sha256
      )
      or (
        new.source_object_path is not null
        and object_kind = 'source'
        and bucket_id = source_bucket_value
        and object_path = new.source_object_path
      )
    )
    and state = 'queued';
  return new;
end
$function$;

alter function catalog_private.guard_media_asset_cleanup_registration()
  owner to backoffice_ops_owner;
revoke all on function
  catalog_private.guard_media_asset_cleanup_registration()
  from public, anon, authenticated, service_role;

create trigger media_assets_cleanup_registration_guard
before insert on catalog_private.media_assets
for each row execute function
  catalog_private.guard_media_asset_cleanup_registration();

-- Finalization must also fence the exact source when content deduplication
-- reuses an existing media asset and therefore performs no media_assets INSERT.
create or replace function
  ops_private.guard_media_upload_intent_cleanup_finalization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  source_bucket_value text := case
    when new.scope = 'product' then 'lignee-product-source'
    else 'lignee-support-attachments'
  end;
begin
  if new.state <> 'finalized' or old.state = 'finalized' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-source-orphan:' || new.scope || ':' || new.source_path,
      0
    )
  );
  perform 1
  from ops_private.media_orphan_cleanup_candidates candidate
  where candidate.object_kind = 'source'
    and candidate.scope = new.scope
    and candidate.bucket_id = source_bucket_value
    and candidate.object_path = new.source_path
  for update;
  if exists (
    select 1
    from ops_private.media_orphan_cleanup_candidates candidate
    where candidate.object_kind = 'source'
      and candidate.scope = new.scope
      and candidate.bucket_id = source_bucket_value
      and candidate.object_path = new.source_path
      and candidate.state in (
        'leased',
        'retry_pending',
        'quarantined',
        'deleted',
        'dead_letter'
      )
  ) then
    raise exception 'MEDIA_SOURCE_REQUIRES_REUPLOAD';
  end if;
  update ops_private.media_orphan_cleanup_candidates
  set
    state = 'protected',
    not_before = now(),
    evidence_hash = null,
    error_code = null,
    updated_at = now()
  where object_kind = 'source'
    and scope = new.scope
    and bucket_id = source_bucket_value
    and object_path = new.source_path
    and state = 'queued';
  return new;
end
$function$;

alter function
  ops_private.guard_media_upload_intent_cleanup_finalization()
  owner to backoffice_ops_owner;
revoke all on function
  ops_private.guard_media_upload_intent_cleanup_finalization()
  from public, anon, authenticated, service_role;

create trigger media_upload_intents_cleanup_finalization_guard
before update of state on ops_private.media_upload_intents
for each row execute function
  ops_private.guard_media_upload_intent_cleanup_finalization();

-- Upload intents are committed before a signed URL is returned. Staging the
-- private source in the same transaction covers the case where the browser
-- uploads successfully but never calls finalize (and therefore never stages
-- derivatives).
create or replace function
  ops_private.stage_media_source_cleanup_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into ops_private.media_orphan_cleanup_candidates (
    upload_intent_id,
    object_kind,
    scope,
    sha256,
    bucket_id,
    object_path,
    state,
    attempt_count,
    not_before
  ) values (
    new.id,
    'source',
    new.scope,
    null,
    case
      when new.scope = 'product' then 'lignee-product-source'
      else 'lignee-support-attachments'
    end,
    new.source_path,
    'queued',
    0,
    greatest(
      new.expires_at,
      new.created_at + interval '2 hours'
    ) + interval '4 hours'
  )
  on conflict (bucket_id, object_path) do nothing;
  return new;
end
$function$;

alter function ops_private.stage_media_source_cleanup_candidate()
  owner to backoffice_ops_owner;
revoke all on function
  ops_private.stage_media_source_cleanup_candidate()
  from public, anon, authenticated, service_role;

create trigger media_upload_intents_stage_source_cleanup
after insert on ops_private.media_upload_intents
for each row execute function
  ops_private.stage_media_source_cleanup_candidate();

-- Forward-safe repair for an environment that applied the earlier migrations
-- and accepted intents before this migration reached it.
insert into ops_private.media_orphan_cleanup_candidates (
  upload_intent_id,
  object_kind,
  scope,
  sha256,
  bucket_id,
  object_path,
  state,
  attempt_count,
  not_before
)
select
  intent.id,
  'source',
  intent.scope,
  null,
  case
    when intent.scope = 'product' then 'lignee-product-source'
    else 'lignee-support-attachments'
  end,
  intent.source_path,
  case
    when catalog_private.media_asset_references_cleanup_object(
      'source',
      intent.scope,
      null,
      intent.source_path
    ) then 'protected'
    else 'queued'
  end,
  0,
  case
    when catalog_private.media_asset_references_cleanup_object(
      'source',
      intent.scope,
      null,
      intent.source_path
    ) then now()
    else greatest(
      intent.expires_at,
      intent.created_at + interval '2 hours'
    ) + interval '4 hours'
  end
from ops_private.media_upload_intents intent
on conflict (bucket_id, object_path) do nothing;

create or replace function api.admin_media_orphan_cleanup_stage(
  p_idempotency_key text,
  p_request_hash text,
  p_scope text,
  p_entity_id text,
  p_expected_version bigint,
  p_intent_id text,
  p_sha256 text,
  p_derivatives jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  intent ops_private.media_upload_intents%rowtype;
  existing_asset catalog_private.media_assets%rowtype;
  aggregate_uuid uuid;
  current_version bigint;
  bucket_value text;
  derivative jsonb;
  request_hash_value text;
  result jsonb;
begin
  if p_scope = 'product' then
    perform ops_private.require_admin_role(
      array['owner', 'merchandiser'],
      false
    );
    select id, row_version into aggregate_uuid, current_version
    from catalog_private.products
    where id::text = p_entity_id or slug = p_entity_id
    for update;
    bucket_value := 'lignee-public-derivatives';
  elsif p_scope = 'support' then
    perform ops_private.require_admin_role(
      array['owner', 'support'],
      false
    );
    select id, row_version into aggregate_uuid, current_version
    from ops_private.support_cases
    where id::text = p_entity_id or public_id = p_entity_id
    for update;
    bucket_value := 'lignee-support-attachments';
  else
    raise exception 'INVALID_MEDIA_SCOPE';
  end if;
  if aggregate_uuid is null then
    raise exception 'MEDIA_PARENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'declaredRequestHash', p_request_hash,
          'scope', p_scope,
          'entityId', p_entity_id,
          'expectedVersion', p_expected_version,
          'intentId', p_intent_id,
          'sha256', p_sha256,
          'derivatives', p_derivatives
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  command_state := ops_private.admin_command_begin(
    actor_id,
    'media.orphan_cleanup.stage',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  select * into intent
  from ops_private.media_upload_intents
  where public_id = p_intent_id
  for update;
  if not found then
    raise exception 'MEDIA_UPLOAD_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if intent.state <> 'reserved'
    or intent.scope <> p_scope
    or intent.entity_id <> p_entity_id
    or intent.expected_version <> p_expected_version
    or intent.expires_at <= now()
  then
    raise exception 'MEDIA_UPLOAD_INTENT_CONFLICT';
  end if;
  if coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_derivatives) <> 'array'
    or jsonb_array_length(p_derivatives) <> 6
  then
    raise exception 'INVALID_MEDIA_CLEANUP_STAGE';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_derivatives) item
    where (item->>'width')::integer not in (800, 1200, 1600)
      or item->>'format' not in ('webp', 'avif')
      or (item->>'byteLength')::bigint not between 1 and 20971520
      or item->>'objectPath' <> (
        case when p_scope = 'product' then 'catalog/' else 'support/' end
        || p_sha256 || '/'
        || item->>'width' || '.' || item->>'format'
      )
      or (
        p_scope = 'product'
        and (item->>'deliveryPath') is distinct from (
          '/media/' || p_sha256 || '/'
          || item->>'width' || '.' || item->>'format'
        )
      )
      or (
        p_scope = 'support'
        and (item->'deliveryPath') is distinct from 'null'::jsonb
      )
  ) then
    raise exception 'INVALID_MEDIA_CLEANUP_DERIVATIVE';
  end if;
  if (
    select count(distinct (item->>'width', item->>'format'))
    from jsonb_array_elements(p_derivatives) item
  ) <> 6 then
    raise exception 'DUPLICATE_MEDIA_CLEANUP_DERIVATIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-orphan:' || p_scope || ':' || p_sha256,
      0
    )
  );
  perform 1
  from ops_private.media_orphan_cleanup_candidates candidate
  where candidate.scope = p_scope
    and candidate.sha256 = p_sha256
  order by candidate.object_path
  for update;
  if exists (
    select 1
    from ops_private.media_orphan_cleanup_candidates candidate
    where candidate.scope = p_scope
      and candidate.sha256 = p_sha256
      and candidate.state in ('leased', 'quarantined')
  ) then
    raise exception 'MEDIA_ORPHAN_CLEANUP_IN_PROGRESS';
  end if;

  select * into existing_asset
  from catalog_private.media_assets asset
  where asset.sha256 = p_sha256;
  if found and (
    existing_asset.byte_length <> intent.size_bytes
    or existing_asset.object_class <> case
      when p_scope = 'product' then 'public_catalog'
      else 'private_case'
    end
  ) then
    raise exception 'MEDIA_SHA_CONFLICT';
  end if;

  for derivative in
    select item
    from jsonb_array_elements(p_derivatives) item
  loop
    insert into ops_private.media_orphan_cleanup_candidates (
      upload_intent_id,
      object_kind,
      scope,
      sha256,
      bucket_id,
      object_path,
      state,
      attempt_count,
      not_before
    ) values (
      intent.id,
      'derivative',
      p_scope,
      p_sha256,
      bucket_value,
      derivative->>'objectPath',
      case when existing_asset.id is null then 'queued' else 'protected' end,
      0,
      case
        when existing_asset.id is null then now() + interval '6 hours'
        else now()
      end
    )
    on conflict (bucket_id, object_path) do update
    set
      upload_intent_id = excluded.upload_intent_id,
      scope = excluded.scope,
      sha256 = excluded.sha256,
      state = excluded.state,
      attempt_count = 0,
      not_before = excluded.not_before,
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      evidence_hash = null,
      error_code = null,
      deleted_at = null,
      updated_at = now();
  end loop;

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
    'media.orphan_cleanup.stage',
    'media_upload_intent',
    intent.id::text,
    array['cleanup_candidates', 'not_before'],
    p_idempotency_key
  );
  result := jsonb_build_object(
    'mediaAssetId', existing_asset.id,
    'intentId', intent.public_id,
    'sha256', p_sha256,
    'candidateCount', 6,
    'cleanupAfter', now() + interval '6 hours'
  );
  return ops_private.admin_command_finish(
    actor_id,
    'media.orphan_cleanup.stage',
    p_idempotency_key,
    intent.id,
    result
  );
end
$function$;

alter function api.admin_media_orphan_cleanup_stage(
  text, text, text, text, bigint, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_media_orphan_cleanup_stage(
  text, text, text, text, bigint, text, text, jsonb
) from public, anon;
grant execute on function api.admin_media_orphan_cleanup_stage(
  text, text, text, text, bigint, text, text, jsonb
) to authenticated;

-- The receipt table predates media cleanup and originally admitted only the
-- owner-recovery worker commands. Keep the table-level allowlist aligned with
-- worker_command_begin; changing the helper alone would still fail the INSERT.
alter table ops_private.worker_command_receipts
  drop constraint worker_command_receipts_command_name_check;
alter table ops_private.worker_command_receipts
  add constraint worker_command_receipts_command_name_check
  check (
    command_name in (
      'auth_recovery.claim',
      'auth_recovery.complete',
      'media_orphan_cleanup.claim',
      'media_orphan_cleanup.complete'
    )
  );

-- Extend the existing private receipt helper with the two cleanup command
-- names. The helper remains uncallable by service_role directly.
create or replace function ops_private.worker_command_begin(
  p_command_name text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  receipt ops_private.worker_command_receipts%rowtype;
begin
  if p_command_name not in (
      'auth_recovery.claim',
      'auth_recovery.complete',
      'media_orphan_cleanup.claim',
      'media_orphan_cleanup.complete'
    )
    or coalesce(p_idempotency_key, '')
      !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{15,199}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_WORKER_IDEMPOTENCY_CONTRACT';
  end if;

  insert into ops_private.worker_command_receipts (
    command_name,
    idempotency_key,
    request_hash
  ) values (
    p_command_name,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (command_name, idempotency_key) do nothing
  returning * into receipt;
  if found then
    return jsonb_build_object('replayed', false);
  end if;

  select * into receipt
  from ops_private.worker_command_receipts
  where command_name = p_command_name
    and idempotency_key = p_idempotency_key
  for update;
  if receipt.request_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT';
  end if;
  if receipt.completed_at is null then
    raise exception 'WORKER_COMMAND_IN_PROGRESS';
  end if;
  return jsonb_build_object(
    'replayed', true,
    'responseIsNull', receipt.response_is_null,
    'response', receipt.response
  );
end
$function$;

alter function ops_private.worker_command_begin(text, text, text)
  owner to backoffice_ops_owner;
revoke all on function ops_private.worker_command_begin(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.worker_command_begin(text, text, text)
  to backoffice_ops_owner;

create or replace function api.worker_media_orphan_cleanup_claim(
  p_worker_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_now timestamptz,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  candidate ops_private.media_orphan_cleanup_candidates%rowtype;
  candidate_id uuid;
  candidate_object_kind text;
  candidate_scope text;
  candidate_sha256 text;
  candidate_object_path text;
  command_state jsonb;
  new_lease_token uuid := gen_random_uuid();
  result jsonb;
begin
  if auth.jwt()->>'role' <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  command_state := ops_private.worker_command_begin(
    'media_orphan_cleanup.claim',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    if (command_state->>'responseIsNull')::boolean then
      return null;
    end if;
    return command_state->'response';
  end if;
  if coalesce(p_worker_id, '')
      !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'
    or p_now is null
    or p_lease_seconds not between 60 and 300
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_MEDIA_CLEANUP_WORKER_CLAIM';
  end if;

  -- An expired external-effect lease is quarantined before any retry. Asset
  -- registration remains fenced while the old invocation drains.
  with eligible as (
    select cleanup.id
    from ops_private.media_orphan_cleanup_candidates cleanup
    where cleanup.state = 'leased'
      and cleanup.lease_expires_at <= p_now
    order by cleanup.lease_expires_at, cleanup.id
    for update skip locked
    limit 100
  ),
  expired as (
    update ops_private.media_orphan_cleanup_candidates cleanup
    set
      state = 'quarantined',
      not_before = p_now + interval '15 minutes',
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      error_code = 'MEDIA_CLEANUP_LEASE_EXPIRED_QUARANTINED',
      updated_at = p_now
    from eligible
    where cleanup.id = eligible.id
    returning cleanup.id
  )
  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields
  )
  select
    'system',
    'media.orphan_cleanup.quarantined',
    'media_orphan_cleanup_candidate',
    expired.id::text,
    array['state', 'not_before', 'lease_token', 'error_code']
  from expired;

  with eligible as (
    select cleanup.id
    from ops_private.media_orphan_cleanup_candidates cleanup
    where cleanup.state = 'quarantined'
      and cleanup.not_before <= p_now
    order by cleanup.not_before, cleanup.id
    for update skip locked
    limit 100
  ),
  released as (
    update ops_private.media_orphan_cleanup_candidates cleanup
    set
      state = 'retry_pending',
      error_code = 'MEDIA_CLEANUP_QUARANTINE_ELAPSED',
      updated_at = p_now
    from eligible
    where cleanup.id = eligible.id
    returning cleanup.id
  )
  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields
  )
  select
    'system',
    'media.orphan_cleanup.quarantine_elapsed',
    'media_orphan_cleanup_candidate',
    released.id::text,
    array['state', 'error_code']
  from released;

  -- Existing exact-source or derivative ownership always wins. This protects
  -- assets imported before the staging trigger as well as normal finalization.
  with eligible as (
    select cleanup.id
    from ops_private.media_orphan_cleanup_candidates cleanup
    where cleanup.state in ('queued', 'retry_pending')
      and catalog_private.media_asset_references_cleanup_object(
        cleanup.object_kind,
        cleanup.scope,
        cleanup.sha256,
        cleanup.object_path
      )
    order by cleanup.updated_at, cleanup.id
    for update skip locked
    limit 100
  ),
  protected as (
    update ops_private.media_orphan_cleanup_candidates cleanup
    set
      state = 'protected',
      not_before = p_now,
      evidence_hash = null,
      error_code = null,
      updated_at = p_now
    from eligible
    where cleanup.id = eligible.id
    returning cleanup.id
  )
  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields
  )
  select
    'system',
    'media.orphan_cleanup.protected',
    'media_orphan_cleanup_candidate',
    protected.id::text,
    array['state', 'not_before']
  from protected;

  select
    cleanup.id,
    cleanup.object_kind,
    cleanup.scope,
    cleanup.sha256,
    cleanup.object_path
  into
    candidate_id,
    candidate_object_kind,
    candidate_scope,
    candidate_sha256,
    candidate_object_path
  from ops_private.media_orphan_cleanup_candidates cleanup
  where cleanup.state in ('queued', 'retry_pending')
    and cleanup.not_before <= p_now
    and cleanup.attempt_count < cleanup.max_attempts
    and not catalog_private.media_asset_references_cleanup_object(
      cleanup.object_kind,
      cleanup.scope,
      cleanup.sha256,
      cleanup.object_path
    )
  order by cleanup.not_before, cleanup.created_at, cleanup.object_path
  limit 1;
  if not found then
    perform ops_private.worker_command_finish(
      'media_orphan_cleanup.claim',
      p_idempotency_key,
      null,
      true
    );
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      case
        when candidate_object_kind = 'derivative'
          then 'media-orphan:' || candidate_scope || ':'
            || candidate_sha256
        else 'media-source-orphan:' || candidate_scope || ':'
          || candidate_object_path
      end,
      0
    )
  );
  select * into candidate
  from ops_private.media_orphan_cleanup_candidates cleanup
  where cleanup.id = candidate_id
    and cleanup.state in ('queued', 'retry_pending')
    and cleanup.not_before <= p_now
    and cleanup.attempt_count < cleanup.max_attempts
  for update;
  if not found then
    perform ops_private.worker_command_finish(
      'media_orphan_cleanup.claim',
      p_idempotency_key,
      null,
      true
    );
    return null;
  end if;
  if catalog_private.media_asset_references_cleanup_object(
    candidate.object_kind,
    candidate.scope,
    candidate.sha256,
    candidate.object_path
  ) then
    update ops_private.media_orphan_cleanup_candidates
    set
      state = 'protected',
      not_before = p_now,
      evidence_hash = null,
      error_code = null,
      updated_at = p_now
    where id = candidate.id;
    insert into ops_private.audit_events (
      actor_scope,
      action,
      entity_type,
      entity_id,
      changed_fields
    ) values (
      'system',
      'media.orphan_cleanup.protected',
      'media_orphan_cleanup_candidate',
      candidate.id::text,
      array['state', 'not_before']
    );
    perform ops_private.worker_command_finish(
      'media_orphan_cleanup.claim',
      p_idempotency_key,
      null,
      true
    );
    return null;
  end if;

  update ops_private.media_orphan_cleanup_candidates
  set
    state = 'leased',
    lease_token = new_lease_token,
    leased_by = p_worker_id,
    lease_expires_at =
      p_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    updated_at = p_now
  where id = candidate.id
    and state = candidate.state
    and attempt_count = candidate.attempt_count
  returning * into candidate;
  if not found then
    raise exception 'MEDIA_CLEANUP_CLAIM_CONFLICT';
  end if;

  result := ops_private.media_orphan_cleanup_document(candidate);
  perform ops_private.worker_command_finish(
    'media_orphan_cleanup.claim',
    p_idempotency_key,
    result,
    false
  );
  return result;
end
$function$;

alter function api.worker_media_orphan_cleanup_claim(
  text, text, text, timestamptz, integer
) owner to backoffice_ops_owner;
revoke all on function api.worker_media_orphan_cleanup_claim(
  text, text, text, timestamptz, integer
) from public, anon, authenticated;
grant execute on function api.worker_media_orphan_cleanup_claim(
  text, text, text, timestamptz, integer
) to service_role;

create or replace function api.worker_media_orphan_cleanup_complete(
  p_candidate_id text,
  p_lease_token text,
  p_idempotency_key text,
  p_request_hash text,
  p_outcome text,
  p_evidence_hash text,
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
  candidate ops_private.media_orphan_cleanup_candidates%rowtype;
  command_state jsonb;
  target_state text;
  error_value text := nullif(btrim(p_error_code), '');
  result jsonb;
begin
  if auth.jwt()->>'role' <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  command_state := ops_private.worker_command_begin(
    'media_orphan_cleanup.complete',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return command_state->'response';
  end if;
  if coalesce(p_candidate_id, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or coalesce(p_lease_token, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or p_outcome not in ('succeeded', 'retry_safe')
    or p_now is null
    or abs(extract(epoch from (p_now - now()))) > 300
    or (
      p_evidence_hash is not null
      and p_evidence_hash !~ '^[a-f0-9]{64}$'
    )
    or (
      error_value is not null
      and error_value !~ '^[A-Z0-9][A-Z0-9_.:-]{1,127}$'
    )
  then
    raise exception 'INVALID_MEDIA_CLEANUP_WORKER_COMPLETION';
  end if;
  if p_outcome = 'succeeded' and p_evidence_hash is null then
    raise exception 'MEDIA_CLEANUP_EVIDENCE_REQUIRED';
  end if;
  if p_outcome = 'retry_safe'
    and (
      error_value is null
      or coalesce(p_retry_after_seconds, 0) not between 60 and 86400
    )
  then
    raise exception 'INVALID_MEDIA_CLEANUP_RETRY';
  end if;

  select * into candidate
  from ops_private.media_orphan_cleanup_candidates
  where id = p_candidate_id::uuid
  for update;
  if not found then
    raise exception 'MEDIA_CLEANUP_CANDIDATE_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if candidate.state <> 'leased'
    or candidate.lease_token is distinct from p_lease_token::uuid
  then
    raise exception 'MEDIA_CLEANUP_LEASE_CONFLICT';
  end if;

  if candidate.lease_expires_at <= p_now then
    target_state := 'quarantined';
    error_value := 'MEDIA_CLEANUP_LEASE_EXPIRED_QUARANTINED';
  elsif p_outcome = 'succeeded' then
    target_state := 'deleted';
    error_value := null;
  elsif candidate.attempt_count < candidate.max_attempts then
    target_state := 'retry_pending';
  else
    target_state := 'dead_letter';
    error_value := 'MEDIA_CLEANUP_MAX_ATTEMPTS_EXCEEDED';
  end if;

  update ops_private.media_orphan_cleanup_candidates
  set
    state = target_state,
    not_before = case
      when target_state = 'quarantined'
        then p_now + interval '15 minutes'
      when target_state = 'retry_pending'
        then p_now + make_interval(secs => p_retry_after_seconds)
      else not_before
    end,
    lease_token = null,
    leased_by = null,
    lease_expires_at = null,
    evidence_hash = p_evidence_hash,
    error_code = error_value,
    deleted_at = case when target_state = 'deleted' then p_now else null end,
    updated_at = p_now
  where id = candidate.id
    and state = 'leased'
    and lease_token = p_lease_token::uuid
  returning * into candidate;
  if not found then
    raise exception 'MEDIA_CLEANUP_LEASE_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields
  ) values (
    'system',
    'media.orphan_cleanup.' || candidate.state,
    'media_orphan_cleanup_candidate',
    candidate.id::text,
    array[
      'state',
      'attempt_count',
      'lease_token',
      'evidence_hash',
      'error_code',
      'deleted_at'
    ]
  );
  result := ops_private.media_orphan_cleanup_document(candidate);
  perform ops_private.worker_command_finish(
    'media_orphan_cleanup.complete',
    p_idempotency_key,
    result,
    false
  );
  return result;
end
$function$;

alter function api.worker_media_orphan_cleanup_complete(
  text, text, text, text, text, text, text, integer, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_media_orphan_cleanup_complete(
  text, text, text, text, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function api.worker_media_orphan_cleanup_complete(
  text, text, text, text, text, text, text, integer, timestamptz
) to service_role;

comment on table ops_private.media_orphan_cleanup_candidates is
  'Durable delayed deletion candidates for abandoned private sources and unregistered derivatives; exact media references fence deletion.';
comment on function api.admin_media_orphan_cleanup_stage(
  text, text, text, text, bigint, text, text, jsonb
) is
  'Stages all six derivative cleanup candidates before the first Storage upload.';
comment on function api.worker_media_orphan_cleanup_claim(
  text, text, text, timestamptz, integer
) is
  'Claims one unreferenced private source or derivative after grace and fences concurrent media registration.';

commit;
