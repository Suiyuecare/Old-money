begin;

-- Forward-only recovery migration for the remaining LIGNÉE backoffice
-- contracts. The preceding expansion migration is intentionally left intact.

do $roles$
declare
  role_name text;
begin
  foreach role_name in array array[
    'backoffice_ops_owner',
    'media_resolver_owner'
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

-- Storage writes are server-pipeline only. The broad authenticated policies
-- from the expansion are removed: signed source/support uploads are issued
-- only after an upload-intent RPC, and derivative writes use service_role.
drop policy if exists lignee_product_source_admin_select on storage.objects;
drop policy if exists lignee_product_source_admin_insert on storage.objects;
drop policy if exists lignee_product_source_admin_update on storage.objects;
drop policy if exists lignee_product_source_admin_delete on storage.objects;
drop policy if exists lignee_derivatives_admin_select on storage.objects;
drop policy if exists lignee_derivatives_admin_insert on storage.objects;
drop policy if exists lignee_derivatives_admin_update on storage.objects;
drop policy if exists lignee_derivatives_admin_delete on storage.objects;
drop policy if exists lignee_support_attachments_admin_select on storage.objects;
drop policy if exists lignee_support_attachments_admin_insert on storage.objects;
drop policy if exists lignee_support_attachments_admin_update on storage.objects;
drop policy if exists lignee_support_attachments_admin_delete on storage.objects;

-- The authorization predicate existed only for the direct Storage policies
-- above. Keep authenticated users out of private schemas once those policies
-- are gone, and remove the now-orphaned postgres-owned SECURITY DEFINER.
revoke all on function ops_private.is_admin_authorized(text[], boolean)
  from public, anon, authenticated, service_role;
drop function ops_private.is_admin_authorized(text[], boolean);
revoke usage on schema ops_private from authenticated;

-- The storefront now reads immutable publication snapshots exclusively.
-- Retaining this grant would allow a server caller to observe live catalog
-- rows and bypass the publication boundary.
revoke execute on function api.catalog_read_all()
  from storefront_rpc_caller;

alter function ops_private.protect_last_active_owner()
  owner to backoffice_ops_owner;
revoke all on function ops_private.protect_last_active_owner()
  from public, anon, authenticated, service_role;

create or replace function catalog_private.protect_approved_derivative_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from catalog_private.media_assets asset
    where asset.status in (
        'live_approved',
        'revocation_pending',
        'revoked'
      )
      and (
        (
          old.bucket_id = 'lignee-public-derivatives'
          and asset.sha256 = split_part(old.name, '/', 2)
        )
        or (
          tg_op = 'UPDATE'
          and new.bucket_id = 'lignee-public-derivatives'
          and asset.sha256 = split_part(new.name, '/', 2)
        )
      )
  )
  then
    raise exception 'APPROVED_MEDIA_OBJECT_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

alter function catalog_private.protect_approved_derivative_object()
  owner to postgres;
revoke all on function catalog_private.protect_approved_derivative_object()
  from public, anon, authenticated, service_role;

create trigger lignee_approved_derivative_object_immutable
before update or delete on storage.objects
for each row execute function
  catalog_private.protect_approved_derivative_object();

alter table ops_private.admin_memberships
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists row_version bigint not null default 1
    check (row_version > 0);

alter table catalog_private.media_assets
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists source_object_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table catalog_private.categories
  add column if not exists description text not null default '',
  add column if not exists route_segment text;
update catalog_private.categories
set
  route_segment = coalesce(route_segment, code),
  description = case
    when code = 'apparel' then
      '為城市、田野與宅邸日常保留從容的克制剪裁。'
    when code = 'accessories' then
      '在每日使用中留下時間質地的隨身物件。'
    when code = 'home' then
      '從藏書室到長桌晚宴，為生活留下安靜秩序。'
    when code = 'stationery' then
      '讓記錄、書信與整理成為可以延續的儀式。'
    when code = 'tennis' then
      '為私人草地球場與會所往返而設計的十件系列。'
    when btrim(description) = '' then
      coalesce(nullif(btrim(label_en), ''), code)
    else description
  end
where route_segment is null
  or btrim(description) = ''
  or code in ('apparel', 'accessories', 'home', 'stationery', 'tennis');
alter table catalog_private.categories
  alter column route_segment set not null,
  add constraint categories_route_segment_check
    check (route_segment ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add constraint categories_description_nonempty
    check (char_length(btrim(description)) between 1 and 1000),
  add constraint categories_public_names_length
    check (
      char_length(btrim(label_en)) between 1 and 120
      and char_length(btrim(label_zh)) between 1 and 120
    );
create unique index categories_route_segment_unique
  on catalog_private.categories(route_segment);

alter table catalog_private.chapters
  add column if not exists description text not null default '',
  add column if not exists route_segment text;
update catalog_private.chapters
set
  route_segment = coalesce(route_segment, code),
  description = case
    when code = 'first-light-in-the-field' then
      '清晨的草露、馬房與通往林地的第一段路。'
    when code = 'the-conservatory-hour' then
      '午後光線穿過玻璃，在葉影與衣褶間停留。'
    when code = 'after-rain-the-library' then
      '濕潤木質氣息與紙頁聲，構成回到室內的節奏。'
    when code = 'dinner-at-the-long-table' then
      '燭光、織物與器物，讓款待保有從容。'
    when code = 'the-private-court' then
      '白線、短草與會所露台，構成午後比賽的分寸。'
    when btrim(description) = '' then
      coalesce(nullif(btrim(title_en), ''), code)
    else description
  end
where route_segment is null
  or btrim(description) = ''
  or code in (
    'first-light-in-the-field',
    'the-conservatory-hour',
    'after-rain-the-library',
    'dinner-at-the-long-table',
    'the-private-court'
  );
alter table catalog_private.chapters
  alter column route_segment set not null,
  add constraint chapters_route_segment_check
    check (route_segment ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add constraint chapters_description_nonempty
    check (char_length(btrim(description)) between 1 and 2000),
  add constraint chapters_public_titles_length
    check (
      char_length(btrim(title_en)) between 1 and 160
      and char_length(btrim(title_zh)) between 1 and 160
    );
create unique index chapters_route_segment_unique
  on catalog_private.chapters(route_segment);

alter table commerce_private.orders
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table commerce_private.return_cases
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table ops_private.provider_operations
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists lease_token uuid,
  add column if not exists leased_by text,
  add column if not exists updated_at timestamptz not null default now();

alter table ops_private.outbox_jobs
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists lease_token uuid,
  add column if not exists leased_by text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 5
    check (max_attempts between 1 and 20),
  add column if not exists evidence_hash text
    check (
      evidence_hash is null
      or evidence_hash ~ '^[a-f0-9]{64}$'
    ),
  add column if not exists result jsonb
    check (result is null or jsonb_typeof(result) = 'object'),
  add column if not exists error_code text,
  add column if not exists completed_at timestamptz;

alter table catalog_private.product_publications
  alter column published_by drop not null;
alter table catalog_private.product_publications
  add column if not exists publisher_scope text not null default 'admin'
    check (publisher_scope in ('admin', 'system'));
alter table catalog_private.product_publications
  add constraint product_publications_publisher_check
    check (
      (publisher_scope = 'admin' and published_by is not null)
      or (publisher_scope = 'system' and published_by is null)
    );

create table ops_private.media_upload_intents (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^[a-f0-9]{64}$'),
  scope text not null check (scope in ('product', 'support')),
  entity_id text not null,
  expected_version bigint not null check (expected_version > 0),
  source_path text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  state text not null default 'reserved'
    check (state in ('reserved', 'finalized', 'failed', 'expired')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  media_asset_id uuid references catalog_private.media_assets(id),
  row_version bigint not null default 1 check (row_version > 0),
  expires_at timestamptz not null default now() + interval '30 minutes',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, source_path)
);

create table ops_private.admin_invite_operations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  role text not null
    check (role in ('owner', 'merchandiser', 'fulfillment', 'support')),
  state text not null default 'prepared'
    check (state in ('prepared', 'completed', 'failed', 'expired')),
  prepared_by uuid not null references auth.users(id),
  auth_user_id uuid references auth.users(id),
  row_version bigint not null default 1 check (row_version > 0),
  expires_at timestamptz not null default now() + interval '24 hours',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index admin_invite_one_open_email
  on ops_private.admin_invite_operations(lower(email))
  where state = 'prepared';

create table ops_private.owner_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references ops_private.admin_memberships(user_id),
  requested_by uuid not null references ops_private.admin_memberships(user_id),
  approved_by uuid references ops_private.admin_memberships(user_id),
  reason text not null,
  state text not null default 'pending'
    check (state in ('pending', 'approved', 'rejected', 'expired')),
  row_version bigint not null default 1 check (row_version > 0),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  check (approved_by is null or approved_by <> requested_by),
  check (
    (
      state = 'pending'
      and approved_by is null
      and decided_at is null
    )
    or (
      state = 'approved'
      and approved_by is not null
      and approved_by <> requested_by
      and decided_at is not null
    )
    or (
      state in ('rejected', 'expired')
      and decided_at is not null
    )
  )
);

create unique index owner_recovery_one_pending_target
  on ops_private.owner_recovery_requests(target_user_id)
  where state = 'pending';

create table ops_private.support_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    check (public_id ~ '^case-[a-f0-9]{20}$'),
  order_id uuid not null references commerce_private.orders(id),
  state text not null default 'open'
    check (state in ('open', 'resolved')),
  created_by uuid not null references auth.users(id),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ops_private.support_case_media (
  id uuid primary key default gen_random_uuid(),
  support_case_id uuid not null references ops_private.support_cases(id),
  media_asset_id uuid not null references catalog_private.media_assets(id),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (support_case_id, media_asset_id)
);

create table ops_private.worker_command_receipts (
  id uuid primary key default gen_random_uuid(),
  command_name text not null
    constraint worker_command_receipts_command_name_check
    check (command_name in (
      'auth_recovery.claim',
      'auth_recovery.complete'
    )),
  idempotency_key text not null
    check (
      idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{15,199}$'
    ),
  request_hash text not null
    check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb,
  response_is_null boolean,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (command_name, idempotency_key),
  check (
    (
      completed_at is null
      and response is null
      and response_is_null is null
    )
    or (
      completed_at is not null
      and response_is_null is not null
      and (
        (response_is_null and response is null)
        or (
          not response_is_null
          and response is not null
          and jsonb_typeof(response) = 'object'
        )
      )
    )
  )
);

create table ops_private.operation_projections (
  id uuid not null default gen_random_uuid() unique,
  aggregate_id text primary key,
  order_id uuid not null unique references commerce_private.orders(id),
  aggregate_kind text not null,
  state text not null,
  projection jsonb not null default '{}'::jsonb
    check (jsonb_typeof(projection) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ops_private.operation_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  kind text not null
    check (kind in ('provider', 'outbox', 'reconciliation', 'auth')),
  command_type text not null
    check (command_type in (
      'payment.query',
      'payment.refund',
      'invoice.issue',
      'invoice.adjust',
      'shipment.create',
      'shipment.cancel',
      'email.send'
    )),
  safety text not null default 'remote_effect'
    check (safety in ('safe_query', 'remote_effect', 'retry_safe')),
  aggregate_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'queued'
    check (state in (
      'queued', 'leased', 'completed',
      'unknown', 'manual_review', 'dead_letter'
    )),
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_by text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  evidence_hash text,
  result jsonb,
  error_code text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index operation_jobs_claimable
  on ops_private.operation_jobs(available_at, created_at, id)
  where state = 'queued';

create index operation_jobs_expired_lease
  on ops_private.operation_jobs(lease_expires_at, id)
  where state = 'leased';

create index operation_jobs_kind_created
  on ops_private.operation_jobs(kind, created_at desc, id);

create index operation_jobs_state_created
  on ops_private.operation_jobs(state, created_at desc, id);

create index operation_jobs_command_created
  on ops_private.operation_jobs(command_type, created_at desc, id);

create index media_upload_intents_created_by_fk_idx
  on ops_private.media_upload_intents(created_by);
create index media_upload_intents_media_asset_id_fk_idx
  on ops_private.media_upload_intents(media_asset_id)
  where media_asset_id is not null;
create index admin_invite_operations_prepared_by_fk_idx
  on ops_private.admin_invite_operations(prepared_by);
create index admin_invite_operations_auth_user_id_fk_idx
  on ops_private.admin_invite_operations(auth_user_id)
  where auth_user_id is not null;
create index owner_recovery_requests_target_user_id_fk_idx
  on ops_private.owner_recovery_requests(target_user_id);
create index owner_recovery_requests_requested_by_fk_idx
  on ops_private.owner_recovery_requests(requested_by);
create index owner_recovery_requests_approved_by_fk_idx
  on ops_private.owner_recovery_requests(approved_by)
  where approved_by is not null;
create index support_cases_order_id_fk_idx
  on ops_private.support_cases(order_id);
create index support_cases_created_by_fk_idx
  on ops_private.support_cases(created_by);
create index support_case_media_media_asset_id_fk_idx
  on ops_private.support_case_media(media_asset_id);
create index support_case_media_uploaded_by_fk_idx
  on ops_private.support_case_media(uploaded_by);

create index provider_events_received_at_idx
  on ops_private.provider_events(received_at desc, id);
create index operation_projections_open_support_idx
  on ops_private.operation_projections(updated_at desc, id)
  where projection->>'supportStatus' = 'open';

create table catalog_private.estate_bootstrap_imports (
  digest text primary key check (digest ~ '^[a-f0-9]{64}$'),
  schema_version integer not null check (schema_version = 1),
  product_count integer not null check (product_count = 50),
  sku_count integer not null check (sku_count = 189),
  catalog_revision bigint not null check (catalog_revision > 0),
  imported_at timestamptz not null default now()
);

do $force_rls$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('ops_private', 'media_upload_intents'),
      ('ops_private', 'admin_invite_operations'),
      ('ops_private', 'owner_recovery_requests'),
      ('ops_private', 'support_cases'),
      ('ops_private', 'support_case_media'),
      ('ops_private', 'worker_command_receipts'),
      ('ops_private', 'operation_projections'),
      ('ops_private', 'operation_jobs'),
      ('catalog_private', 'estate_bootstrap_imports')
    ) as tables(schema_name, table_name)
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.table_name
    );
    execute format(
      'alter table %I.%I force row level security',
      target.schema_name,
      target.table_name
    );
  end loop;
end
$force_rls$;

-- Accept both documented Supabase TOTP AMR spellings while retaining strict
-- session and membership checks.
create or replace function ops_private.require_admin_role(
  p_allowed_roles text[],
  p_require_recent_totp boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  claims jsonb := auth.jwt();
  actor_id uuid;
  claimed_session_id uuid;
  session_created_at timestamptz;
  membership ops_private.admin_memberships%rowtype;
  totp_timestamp double precision;
begin
  actor_id := nullif(claims->>'sub', '')::uuid;
  claimed_session_id := nullif(claims->>'session_id', '')::uuid;
  if actor_id is null or auth.uid() is distinct from actor_id then
    raise exception 'ADMIN_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if claims->>'aal' <> 'aal2' then
    raise exception 'ADMIN_AAL2_REQUIRED' using errcode = '42501';
  end if;
  if claimed_session_id is null then
    raise exception 'ADMIN_SESSION_REQUIRED' using errcode = '42501';
  end if;

  select session.created_at
  into session_created_at
  from auth.sessions session
  where session.id = claimed_session_id
    and session.user_id = actor_id;
  if session_created_at is null then
    raise exception 'ADMIN_SESSION_REVOKED' using errcode = '42501';
  end if;

  select *
  into membership
  from ops_private.admin_memberships candidate
  where candidate.user_id = actor_id;
  if not found or membership.state <> 'active' then
    raise exception 'ADMIN_MEMBERSHIP_INACTIVE' using errcode = '42501';
  end if;
  if not (membership.role = any(p_allowed_roles)) then
    raise exception 'ADMIN_ROLE_FORBIDDEN' using errcode = '42501';
  end if;
  if membership.sessions_revoked_at is not null
    and (
      session_created_at <= membership.sessions_revoked_at
      or coalesce((claims->>'iat')::double precision, 0)
        <= extract(epoch from membership.sessions_revoked_at)
    )
  then
    raise exception 'ADMIN_SESSION_REVOKED' using errcode = '42501';
  end if;

  if p_require_recent_totp then
    select max((entry->>'timestamp')::double precision)
    into totp_timestamp
    from jsonb_array_elements(coalesce(claims->'amr', '[]'::jsonb)) entry
    where entry->>'method' in ('totp', 'mfa/totp');
    if totp_timestamp is null
      or pg_catalog.to_timestamp(totp_timestamp) < now() - interval '10 minutes'
    then
      raise exception 'RECENT_TOTP_REQUIRED' using errcode = '42501';
    end if;
  end if;
  return membership.role;
exception
  when invalid_text_representation then
    raise exception 'ADMIN_AUTH_INVALID' using errcode = '42501';
end
$function$;

revoke all on function ops_private.require_admin_role(text[], boolean)
  from public, anon, authenticated;
grant execute on function ops_private.require_admin_role(text[], boolean)
  to admin_catalog_owner, admin_inventory_owner, backoffice_ops_owner;

create or replace function ops_private.require_owner_recovery_requester(
  p_target_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  claims jsonb := auth.jwt();
  actor_id uuid := auth.uid();
  claimed_session_id uuid;
  session_created_at timestamptz;
  membership ops_private.admin_memberships%rowtype;
begin
  claimed_session_id := nullif(claims->>'session_id', '')::uuid;
  if actor_id is null
    or actor_id <> p_target_user_id
    or claims->>'aal' not in ('aal1', 'aal2')
    or claimed_session_id is null
  then
    raise exception 'OWNER_RECOVERY_IDENTITY_REQUIRED'
      using errcode = '42501';
  end if;
  select session.created_at
  into session_created_at
  from auth.sessions session
  where session.id = claimed_session_id
    and session.user_id = actor_id;
  if session_created_at is null then
    raise exception 'ADMIN_SESSION_REVOKED' using errcode = '42501';
  end if;
  select * into membership
  from ops_private.admin_memberships candidate
  where candidate.user_id = actor_id;
  if not found
    or membership.role <> 'owner'
    or membership.state <> 'active'
    or (
      membership.sessions_revoked_at is not null
      and session_created_at <= membership.sessions_revoked_at
    )
  then
    raise exception 'OWNER_RECOVERY_FORBIDDEN' using errcode = '42501';
  end if;
  return actor_id;
exception
  when invalid_text_representation then
    raise exception 'OWNER_RECOVERY_IDENTITY_REQUIRED'
      using errcode = '42501';
end
$function$;

alter function ops_private.require_owner_recovery_requester(uuid)
  owner to postgres;
revoke all on function ops_private.require_owner_recovery_requester(uuid)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.require_owner_recovery_requester(uuid)
  to backoffice_ops_owner;

create or replace function catalog_private.validate_publication_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if jsonb_typeof(new.snapshot->'product'->'materialConcepts') <> 'array'
    or jsonb_array_length(new.snapshot->'product'->'materialConcepts') < 1
    or new.snapshot->'product' ? 'launchGateCodes'
    or jsonb_typeof(new.snapshot->'product'->'optionAxes') <> 'array'
    or jsonb_array_length(new.snapshot->'product'->'optionAxes') < 1
    or jsonb_typeof(new.snapshot->'skus') <> 'array'
    or jsonb_array_length(new.snapshot->'skus') < 1
    or (
      new.snapshot ? 'media'
      and jsonb_typeof(new.snapshot->'media') <> 'array'
    )
  then
    raise exception 'INVALID_PUBLICATION_SNAPSHOT';
  end if;
  return new;
end
$function$;

create trigger product_publications_validate_snapshot
before insert on catalog_private.product_publications
for each row execute function catalog_private.validate_publication_snapshot();

-- Preserve the expansion's core product/SKU builder and wrap it with the full
-- immutable media set. Detail and gallery assets can use a different SHA from
-- the main image without disappearing from the public resolver allowlist.
alter function catalog_private.build_publication_snapshot(uuid)
  rename to build_core_publication_snapshot;

revoke all on function
  catalog_private.build_core_publication_snapshot(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  catalog_private.build_core_publication_snapshot(uuid)
to admin_catalog_owner, backoffice_ops_owner;

create or replace function catalog_private.build_publication_snapshot(
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  snapshot jsonb;
  media_documents jsonb;
begin
  snapshot :=
    catalog_private.build_core_publication_snapshot(p_product_id);
  snapshot := jsonb_set(
    snapshot,
    '{product}',
    (snapshot->'product') - 'launchGateCodes',
    true
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', snapshot->'product'->>'id',
    'assetId', asset.sha256,
    'path', link.public_path,
    'role', link.role,
    'sortOrder', link.sort_order,
    'alt', link.alt_text,
    'focalX', link.focal_x,
    'focalY', link.focal_y,
    'picturedSkuId', pictured.public_id,
    'approvalStatus', 'approved'
  ) order by
    case link.role when 'main' then 1 when 'detail' then 2 else 3 end,
    link.sort_order), '[]'::jsonb)
  into media_documents
  from catalog_private.product_media link
  join catalog_private.media_assets asset
    on asset.id = link.media_asset_id
  left join catalog_private.product_variants pictured
    on pictured.id = link.pictured_sku_id
  where link.product_id = p_product_id
    and asset.status = 'live_approved'
    and asset.object_class = 'public_catalog'
    and asset.backup_acknowledged_at is not null;
  return jsonb_set(
    snapshot,
    '{media}',
    media_documents,
    true
  );
end
$function$;

alter function catalog_private.build_publication_snapshot(uuid)
  owner to admin_catalog_owner;
revoke all on function catalog_private.build_publication_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function catalog_private.build_publication_snapshot(uuid)
  to backoffice_ops_owner;

-- Preserve the expansion's draft document builder and add the media asset
-- version required by the transition CAS contract. The link rowVersion and
-- assetRowVersion deliberately remain separate concurrency tokens.
alter function catalog_private.admin_product_document(uuid)
  rename to admin_product_document_core;

revoke all on function
  catalog_private.admin_product_document_core(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  catalog_private.admin_product_document_core(uuid)
to admin_catalog_owner, backoffice_ops_owner;

create or replace function catalog_private.admin_product_document(
  p_product_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_set(
    core.document,
    '{media}',
    coalesce((
      select jsonb_agg(
        media.document || jsonb_build_object(
          'assetRowVersion',
          asset.row_version
        )
        order by media.ordinality
      )
      from jsonb_array_elements(core.document->'media')
        with ordinality media(document, ordinality)
      join catalog_private.media_assets asset
        on asset.id = (media.document->>'assetId')::uuid
    ), '[]'::jsonb),
    true
  )
  from (
    select catalog_private.admin_product_document_core(
      p_product_id
    ) as document
  ) core
$function$;

alter function catalog_private.admin_product_document(uuid)
  owner to admin_catalog_owner;
revoke all on function catalog_private.admin_product_document(uuid)
  from public, anon, authenticated, service_role;
grant execute on function catalog_private.admin_product_document(uuid)
  to backoffice_ops_owner;

grant usage on schema api to authenticated, anon, service_role;
grant usage on schema catalog_private, commerce_private, ops_private
  to backoffice_ops_owner;
grant usage on schema catalog_private, ops_private
  to media_resolver_owner;
grant usage on schema ops_private to catalog_snapshot_owner;

grant select on
  catalog_private.products,
  catalog_private.product_variants,
  catalog_private.categories,
  catalog_private.chapters,
  catalog_private.media_assets,
  catalog_private.product_media,
  catalog_private.product_publications,
  catalog_private.media_revocation_tombstones,
  commerce_private.inventory_balances,
  commerce_private.orders,
  commerce_private.order_items,
  commerce_private.return_cases,
  ops_private.admin_memberships,
  ops_private.runtime_controls,
  ops_private.media_upload_intents,
  ops_private.admin_invite_operations,
  ops_private.owner_recovery_requests,
  ops_private.support_cases,
  ops_private.support_case_media,
  ops_private.worker_command_receipts,
  ops_private.operation_projections,
  ops_private.operation_jobs,
  ops_private.outbox_jobs,
  ops_private.audit_events,
  ops_private.provider_events
to backoffice_ops_owner;

grant insert, update on
  ops_private.media_upload_intents,
  ops_private.admin_invite_operations,
  ops_private.owner_recovery_requests,
  ops_private.support_cases,
  ops_private.worker_command_receipts,
  ops_private.operation_projections,
  ops_private.operation_jobs
to backoffice_ops_owner;
grant update on ops_private.outbox_jobs
  to backoffice_ops_owner;

grant insert, update on ops_private.admin_memberships
  to backoffice_ops_owner;
grant insert, update on
  catalog_private.categories,
  catalog_private.chapters
to backoffice_ops_owner;
grant insert on
  ops_private.audit_events,
  ops_private.outbox_jobs,
  ops_private.provider_events,
  catalog_private.media_assets,
  catalog_private.media_asset_transitions,
  catalog_private.media_revocation_tombstones,
  ops_private.support_case_media
to backoffice_ops_owner;
grant update on
  catalog_private.products,
  catalog_private.media_assets,
  commerce_private.return_cases,
  ops_private.runtime_controls
to backoffice_ops_owner;
grant execute on function ops_private.admin_command_begin(uuid, text, text, text)
  to backoffice_ops_owner;
grant execute on function ops_private.admin_command_finish(
  uuid,
  text,
  text,
  uuid,
  jsonb
) to backoffice_ops_owner;

grant select on
  catalog_private.media_assets,
  catalog_private.product_publications,
  catalog_private.products,
  catalog_private.media_revocation_tombstones,
  ops_private.runtime_controls
to media_resolver_owner;

grant select on
  catalog_private.categories,
  catalog_private.chapters,
  ops_private.runtime_controls
to catalog_snapshot_owner;

do $owner_policies$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('catalog_private', 'products'),
      ('catalog_private', 'product_variants'),
      ('catalog_private', 'categories'),
      ('catalog_private', 'chapters'),
      ('catalog_private', 'media_assets'),
      ('catalog_private', 'product_media'),
      ('catalog_private', 'product_publications'),
      ('catalog_private', 'media_revocation_tombstones'),
      ('commerce_private', 'inventory_balances'),
      ('commerce_private', 'orders'),
      ('commerce_private', 'order_items'),
      ('commerce_private', 'return_cases'),
      ('ops_private', 'admin_memberships'),
      ('ops_private', 'runtime_controls'),
      ('ops_private', 'media_upload_intents'),
      ('ops_private', 'admin_invite_operations'),
      ('ops_private', 'owner_recovery_requests'),
      ('ops_private', 'support_cases'),
      ('ops_private', 'support_case_media'),
      ('ops_private', 'worker_command_receipts'),
      ('ops_private', 'operation_projections'),
      ('ops_private', 'operation_jobs'),
      ('ops_private', 'outbox_jobs'),
      ('ops_private', 'audit_events'),
      ('ops_private', 'provider_events')
    ) as tables(schema_name, table_name)
  loop
    execute format(
      'create policy %I on %I.%I for select to backoffice_ops_owner using (true)',
      'backoffice_ops_select_' || target.table_name,
      target.schema_name,
      target.table_name
    );
  end loop;
end
$owner_policies$;

do $owner_write_policies$
declare
  target record;
begin
  for target in
    select *
    from (values
      ('ops_private', 'media_upload_intents'),
      ('ops_private', 'admin_invite_operations'),
      ('ops_private', 'owner_recovery_requests'),
      ('ops_private', 'support_cases'),
      ('ops_private', 'worker_command_receipts'),
      ('ops_private', 'operation_projections'),
      ('ops_private', 'operation_jobs'),
      ('ops_private', 'admin_memberships')
    ) as tables(schema_name, table_name)
  loop
    execute format(
      'create policy %I on %I.%I for insert to backoffice_ops_owner with check (true)',
      'backoffice_ops_insert_' || target.table_name,
      target.schema_name,
      target.table_name
    );
    execute format(
      'create policy %I on %I.%I for update to backoffice_ops_owner using (true) with check (true)',
      'backoffice_ops_update_' || target.table_name,
      target.schema_name,
      target.table_name
    );
  end loop;
end
$owner_write_policies$;

create policy backoffice_ops_audit_insert
on ops_private.audit_events
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_outbox_insert
on ops_private.outbox_jobs
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_outbox_update
on ops_private.outbox_jobs
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_provider_events_insert
on ops_private.provider_events
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_media_assets_insert
on catalog_private.media_assets
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_media_assets_update
on catalog_private.media_assets
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_media_transitions_insert
on catalog_private.media_asset_transitions
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_media_tombstones_insert
on catalog_private.media_revocation_tombstones
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_support_case_media_insert
on ops_private.support_case_media
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_products_update
on catalog_private.products
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_returns_update
on commerce_private.return_cases
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_runtime_update
on ops_private.runtime_controls
for update to backoffice_ops_owner
using (singleton) with check (singleton);

create policy backoffice_ops_categories_insert
on catalog_private.categories
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_categories_update
on catalog_private.categories
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_chapters_insert
on catalog_private.chapters
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_chapters_update
on catalog_private.chapters
for update to backoffice_ops_owner
using (true) with check (true);

create policy catalog_snapshot_categories
on catalog_private.categories
for select to catalog_snapshot_owner
using (status = 'active');

create policy catalog_snapshot_chapters
on catalog_private.chapters
for select to catalog_snapshot_owner
using (status = 'active');

create policy catalog_snapshot_runtime_controls
on ops_private.runtime_controls
for select to catalog_snapshot_owner
using (singleton);

create policy media_resolver_assets
on catalog_private.media_assets
for select to media_resolver_owner
using (status = 'live_approved');

create policy media_resolver_publications
on catalog_private.product_publications
for select to media_resolver_owner
using (true);

create policy media_resolver_products
on catalog_private.products
for select to media_resolver_owner
using (status = 'published' and active_publication_id is not null);

create policy media_resolver_tombstones
on catalog_private.media_revocation_tombstones
for select to media_resolver_owner
using (true);

create policy media_resolver_runtime
on ops_private.runtime_controls
for select to media_resolver_owner
using (singleton);

-- The public snapshot keeps the v1 product/SKU documents intact while adding
-- versioned gallery media and active taxonomy at the snapshot root. Legacy
-- Estate publications without a media member contribute an empty array.
create or replace function api.catalog_snapshot_read()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with active as (
    select
      product.launch_position,
      product.slug as product_id,
      product.category_id,
      product.chapter_id,
      publication.snapshot
    from catalog_private.products product
    join catalog_private.product_publications publication
      on publication.id = product.active_publication_id
    where product.status = 'published'
    order by product.launch_position
  ),
  product_documents as (
    select coalesce(
      jsonb_agg(active.snapshot->'product' order by active.launch_position),
      '[]'::jsonb
    ) as documents
    from active
  ),
  sku_documents as (
    select coalesce(
      jsonb_agg(
        sku.document
        order by active.launch_position, sku.document->>'skuCode'
      ),
      '[]'::jsonb
    ) as documents
    from active
    cross join lateral jsonb_array_elements(active.snapshot->'skus')
      sku(document)
  ),
  media_documents as (
    select coalesce(
      jsonb_agg(
        media.document || jsonb_build_object(
          'productId',
          active.product_id
        )
        order by
          active.launch_position,
          (media.document->>'sortOrder')::integer,
          media.document->>'assetId'
      ),
      '[]'::jsonb
    ) as documents
    from active
    cross join lateral jsonb_array_elements(
      coalesce(active.snapshot->'media', '[]'::jsonb)
    ) media(document)
  ),
  category_documents as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', category.code,
      'nameEn', category.label_en,
      'nameZh', category.label_zh,
      'description', category.description,
      'routeSegment', category.route_segment,
      'sortOrder', category.sort_order
    ) order by category.sort_order), '[]'::jsonb) as documents
    from catalog_private.categories category
    where category.status = 'active'
      and exists (
        select 1 from active
        where active.category_id = category.id
      )
  ),
  chapter_documents as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', chapter.code,
      'titleEn', chapter.title_en,
      'titleZh', chapter.title_zh,
      'description', chapter.description,
      'routeSegment', chapter.route_segment,
      'sortOrder', chapter.sort_order
    ) order by chapter.sort_order), '[]'::jsonb) as documents
    from catalog_private.chapters chapter
    where chapter.status = 'active'
      and exists (
        select 1 from active
        where active.chapter_id = chapter.id
      )
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'revision', state.revision::text,
    'generatedAt', now(),
    'products', product_documents.documents,
    'skus', sku_documents.documents,
    'media', media_documents.documents,
    'categories', category_documents.documents,
    'chapters', chapter_documents.documents
  )
  from catalog_private.catalog_state state
  cross join product_documents
  cross join sku_documents
  cross join media_documents
  cross join category_documents
  cross join chapter_documents
  where state.singleton
$function$;

alter function api.catalog_snapshot_read()
  owner to catalog_snapshot_owner;
revoke all on function api.catalog_snapshot_read()
  from public;
grant execute on function api.catalog_snapshot_read()
  to anon, authenticated, storefront_rpc_caller;

create or replace function api.admin_session_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  membership_role text;
  membership_state text;
  membership_display_name text;
begin
  membership_role := ops_private.require_admin_role(
    array['owner', 'merchandiser', 'fulfillment', 'support'],
    false
  );
  select state, display_name
  into membership_state, membership_display_name
  from ops_private.admin_memberships
  where user_id = auth.uid();
  return jsonb_build_object(
    'userId', auth.uid(),
    'displayName', membership_display_name,
    'role', membership_role,
    'state', membership_state,
    'aal', auth.jwt()->>'aal',
    'sessionId', auth.jwt()->>'session_id'
  );
end
$function$;

alter function api.admin_session_context() owner to backoffice_ops_owner;
revoke all on function api.admin_session_context() from public, anon;
grant execute on function api.admin_session_context() to authenticated;

create or replace function api.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_role text;
begin
  actor_role := ops_private.require_admin_role(
    array['owner', 'merchandiser', 'fulfillment', 'support'],
    false
  );
  return jsonb_build_object(
    'productCount', case
      when actor_role in ('owner', 'merchandiser') then (
        select count(*) from catalog_private.products
        where status <> 'archived'
      )
      else 0
    end,
    'publishedProductCount', case
      when actor_role in ('owner', 'merchandiser') then (
        select count(*) from catalog_private.products
        where status = 'published'
      )
      else 0
    end,
    'draftProductCount', case
      when actor_role in ('owner', 'merchandiser') then (
        select count(*) from catalog_private.products
        where status in ('draft', 'review', 'ready')
      )
      else 0
    end,
    'lowStockSkuCount', case
      when actor_role in ('owner', 'fulfillment') then (
        select count(*)
        from commerce_private.inventory_balances
        where on_hand - reserved - safety_stock <= 2
      )
      else 0
    end,
    'orderCount', case
      when actor_role in ('owner', 'fulfillment', 'support') then (
        select count(*) from commerce_private.orders
      )
      else 0
    end,
    'openOrderCount', case
      when actor_role in ('owner', 'fulfillment', 'support') then (
        select count(*) from commerce_private.orders
        where projection_status not in ('closed', 'cancelled', 'refunded')
      )
      else 0
    end,
    'revenueTwd', case
      when actor_role = 'owner' then coalesce((
        select sum(total_gross_twd)
        from commerce_private.orders
        where applied_payment_receipt_id is not null
      ), 0)
      else 0
    end,
    'pendingReadinessCount', case
      when actor_role in ('owner', 'merchandiser') then (
        select count(*)
        from catalog_private.product_readiness_checks
        where state <> 'passed'
      )
      else 0
    end,
    'recentOrders', case
      when actor_role in ('owner', 'fulfillment', 'support') then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'publicId', recent.public_id,
          'status', recent.projection_status,
          'paymentStatus', case
            when recent.applied_payment_receipt_id is null then 'pending'
            else 'paid'
          end,
          'fulfillmentStatus', 'unfulfilled',
          'totalTwd', recent.total_gross_twd,
          'itemCount', (
            select coalesce(sum(item.quantity), 0)
            from commerce_private.order_items item
            where item.order_id = recent.id
          ),
          'createdAt', recent.created_at
        ) order by recent.created_at desc)
        from (
          select *
          from commerce_private.orders
          order by created_at desc
          limit 5
        ) recent
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    'recentProducts', case
      when actor_role in ('owner', 'merchandiser') then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'productCode', recent.product_code,
          'slug', recent.slug,
          'nameEn', recent.name_en,
          'nameZh', recent.name_zh,
          'categoryCode', recent.category_code,
          'chapterCode', recent.chapter_code,
          'audience', recent.audience,
          'kind', recent.kind,
          'description', recent.description,
          'story', recent.story,
          'sizing', recent.sizing,
          'care', recent.care,
          'materialConcepts', recent.material_concepts,
          'optionAxes', recent.option_axes,
          'launchGateCodes', to_jsonb(recent.launch_gate_codes),
          'status', recent.status,
          'rowVersion', recent.row_version,
          'updatedAt', recent.updated_at,
          'publishedAt', recent.published_at,
          'variants', '[]'::jsonb,
          'media', '[]'::jsonb,
          'readiness', '[]'::jsonb
        ) order by recent.updated_at desc)
        from (
          select
            product.*,
            category.code as category_code,
            chapter.code as chapter_code
          from catalog_private.products product
          join catalog_private.categories category
            on category.id = product.category_id
          join catalog_private.chapters chapter
            on chapter.id = product.chapter_id
          order by product.updated_at desc
          limit 5
        ) recent
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end
$function$;

alter function api.admin_dashboard() owner to backoffice_ops_owner;
revoke all on function api.admin_dashboard() from public, anon;
grant execute on function api.admin_dashboard() to authenticated;

create or replace function api.admin_inventory_list(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(
    array['owner', 'fulfillment'],
    false
  );
  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'INVALID_PAGINATION';
  end if;
  with matching as (
    select
      variant.id,
      variant.public_id,
      variant.sku_code,
      product.id as product_id,
      product.product_code,
      product.name_en,
      product.name_zh,
      balance.row_version,
      balance.on_hand,
      balance.reserved,
      balance.safety_stock,
      greatest(balance.on_hand - balance.reserved - balance.safety_stock, 0)
        as sellable,
      balance.updated_at,
      count(*) over ()::integer as total_count
    from commerce_private.inventory_balances balance
    join catalog_private.product_variants variant
      on variant.id = balance.sku_id
    join catalog_private.products product
      on product.id = variant.product_id
    where p_search is null
      or btrim(p_search) = ''
      or variant.sku_code ilike '%' || btrim(p_search) || '%'
      or variant.public_id ilike '%' || btrim(p_search) || '%'
      or product.product_code ilike '%' || btrim(p_search) || '%'
      or product.name_en ilike '%' || btrim(p_search) || '%'
      or product.name_zh ilike '%' || btrim(p_search) || '%'
    order by product.launch_position, variant.sku_code
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'variantId', id,
      'publicId', public_id,
      'skuCode', sku_code,
      'productId', product_id,
      'productCode', product_code,
      'nameEn', name_en,
      'nameZh', name_zh,
      'rowVersion', row_version,
      'onHand', on_hand,
      'reserved', reserved,
      'safetyStock', safety_stock,
      'sellable', sellable,
      'updatedAt', updated_at
    )), '[]'::jsonb),
    'total', coalesce(max(total_count), 0),
    'limit', p_limit,
    'offset', p_offset
  )
  into result
  from matching;
  return result;
end
$function$;

alter function api.admin_inventory_list(text, integer, integer)
  owner to backoffice_ops_owner;
revoke all on function api.admin_inventory_list(text, integer, integer)
  from public, anon;
grant execute on function api.admin_inventory_list(text, integer, integer)
  to authenticated;

create or replace function api.admin_orders_list(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(
    array['owner', 'fulfillment', 'support'],
    false
  );
  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'INVALID_PAGINATION';
  end if;
  with matching as (
    select
      orders.id,
      orders.public_id,
      orders.merchant_trade_no,
      orders.projection_status,
      orders.total_gross_twd,
      orders.payment_at_risk,
      orders.production_canary,
      orders.row_version,
      orders.created_at,
      orders.updated_at,
      (
        select coalesce(sum(item.quantity), 0)
        from commerce_private.order_items item
        where item.order_id = orders.id
      )::integer as item_count,
      count(*) over ()::integer as total_count
    from commerce_private.orders
    where p_status is null or orders.projection_status = p_status
    order by orders.created_at desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'publicId', public_id,
      'orderNumber', public_id,
      'customerName', '訪客',
      'customerEmailMasked', '—',
      'merchantTradeNo', merchant_trade_no,
      'status', projection_status,
      'paymentStatus', case
        when exists (
          select 1
          from commerce_private.orders paid_order
          where paid_order.id = matching.id
            and paid_order.applied_payment_receipt_id is not null
        ) then 'paid'
        else 'pending'
      end,
      'fulfillmentStatus', 'unfulfilled',
      'totalGrossTwd', total_gross_twd,
      'totalTwd', total_gross_twd,
      'itemCount', item_count,
      'paymentAtRisk', payment_at_risk,
      'productionCanary', production_canary,
      'rowVersion', row_version,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by created_at desc), '[]'::jsonb),
    'total', coalesce(max(total_count), 0),
    'limit', p_limit,
    'offset', p_offset
  )
  into result
  from matching;
  return result;
end
$function$;

alter function api.admin_orders_list(text, integer, integer)
  owner to backoffice_ops_owner;
revoke all on function api.admin_orders_list(text, integer, integer)
  from public, anon;
grant execute on function api.admin_orders_list(text, integer, integer)
  to authenticated;

create or replace function api.admin_audit_list(
  p_limit integer,
  p_offset integer,
  p_entity_type text default null,
  p_action text default null
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
  perform ops_private.require_admin_role(array['owner'], false);
  if p_limit < 1
    or p_limit > 200
    or p_offset < 0
    or length(coalesce(p_entity_type, '')) > 80
    or length(coalesce(p_action, '')) > 120
  then
    raise exception 'INVALID_AUDIT_QUERY';
  end if;
  with matching as (
    select event.*, count(*) over ()::integer as total_count
    from ops_private.audit_events event
    where (
      nullif(btrim(p_entity_type), '') is null
      or event.entity_type = btrim(p_entity_type)
    )
      and (
        nullif(btrim(p_action), '') is null
        or event.action = btrim(p_action)
      )
    order by event.occurred_at desc, event.id desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'actorScope', actor_scope,
      'action', action,
      'entityType', entity_type,
      'entityId', entity_id,
      'changedFields', to_jsonb(changed_fields),
      'requestId', request_id,
      'occurredAt', occurred_at
    ) order by occurred_at desc, id desc), '[]'::jsonb),
    'total', coalesce(max(total_count), 0),
    'limit', p_limit,
    'offset', p_offset
  ) into result
  from matching;
  return result;
end
$function$;

alter function api.admin_audit_list(integer, integer, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_audit_list(integer, integer, text, text)
  from public, anon;
grant execute on function api.admin_audit_list(
  integer, integer, text, text
) to authenticated;

create or replace function api.admin_taxonomy_list(
  p_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser', 'fulfillment', 'support'],
    false
  );
  if p_kind = 'category' then
    return jsonb_build_object(
      'kind', p_kind,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'code', code,
          'labelZh', label_zh,
          'labelEn', label_en,
          'description', description,
          'routeSegment', route_segment,
          'sortOrder', sort_order,
          'status', status,
          'rowVersion', row_version,
          'updatedAt', updated_at
        ) order by sort_order)
        from catalog_private.categories
      ), '[]'::jsonb)
    );
  elsif p_kind = 'chapter' then
    return jsonb_build_object(
      'kind', p_kind,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'code', code,
          'titleEn', title_en,
          'titleZh', title_zh,
          'description', description,
          'routeSegment', route_segment,
          'sortOrder', sort_order,
          'status', status,
          'rowVersion', row_version,
          'updatedAt', updated_at
        ) order by sort_order)
        from catalog_private.chapters
      ), '[]'::jsonb)
    );
  end if;
  raise exception 'INVALID_TAXONOMY_KIND';
end
$function$;

alter function api.admin_taxonomy_list(text) owner to backoffice_ops_owner;
revoke all on function api.admin_taxonomy_list(text) from public, anon;
grant execute on function api.admin_taxonomy_list(text) to authenticated;

create or replace function api.admin_taxonomy_upsert(
  p_kind text,
  p_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb
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
  target_id uuid := coalesce(p_id, gen_random_uuid());
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
  command_state := ops_private.admin_command_begin(
    actor_id, 'taxonomy.upsert.' || p_kind, p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if p_kind not in ('category', 'chapter')
    or jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'code', '') = ''
    or coalesce(
      p_payload->>'routeSegment',
      p_payload->>'code',
      ''
    ) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or nullif(p_payload->>'sortOrder', '') is null
  then
    raise exception 'INVALID_TAXONOMY_PAYLOAD';
  end if;

  if p_kind = 'category' then
    if p_id is null then
      if p_expected_version <> 0 then
        raise exception 'ROW_VERSION_CONFLICT';
      end if;
      insert into catalog_private.categories (
        id, code, label_zh, label_en, description, route_segment,
        sort_order, status
      ) values (
        target_id,
        p_payload->>'code',
        p_payload->>'labelZh',
        p_payload->>'labelEn',
        coalesce(
          nullif(btrim(p_payload->>'description'), ''),
          p_payload->>'labelEn'
        ),
        coalesce(p_payload->>'routeSegment', p_payload->>'code'),
        (p_payload->>'sortOrder')::integer,
        coalesce(p_payload->>'status', 'active')
      );
    else
      update catalog_private.categories
      set
        code = p_payload->>'code',
        label_zh = p_payload->>'labelZh',
        label_en = p_payload->>'labelEn',
        description = coalesce(
          nullif(btrim(p_payload->>'description'), ''),
          description
        ),
        route_segment = coalesce(
          p_payload->>'routeSegment',
          route_segment
        ),
        sort_order = (p_payload->>'sortOrder')::integer,
        status = coalesce(p_payload->>'status', status),
        row_version = row_version + 1,
        updated_at = now()
      where id = p_id and row_version = p_expected_version;
      if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    end if;
    select jsonb_build_object(
      'id', id, 'code', code, 'labelZh', label_zh, 'labelEn', label_en,
      'description', description, 'routeSegment', route_segment,
      'sortOrder', sort_order, 'status', status, 'rowVersion', row_version,
      'updatedAt', updated_at
    ) into result
    from catalog_private.categories where id = target_id;
  else
    if p_id is null then
      if p_expected_version <> 0 then
        raise exception 'ROW_VERSION_CONFLICT';
      end if;
      insert into catalog_private.chapters (
        id, code, title_en, title_zh, description, route_segment,
        sort_order, status
      ) values (
        target_id,
        p_payload->>'code',
        p_payload->>'titleEn',
        p_payload->>'titleZh',
        coalesce(
          nullif(btrim(p_payload->>'description'), ''),
          p_payload->>'titleEn'
        ),
        coalesce(p_payload->>'routeSegment', p_payload->>'code'),
        (p_payload->>'sortOrder')::integer,
        coalesce(p_payload->>'status', 'active')
      );
    else
      update catalog_private.chapters
      set
        code = p_payload->>'code',
        title_en = p_payload->>'titleEn',
        title_zh = p_payload->>'titleZh',
        description = coalesce(
          nullif(btrim(p_payload->>'description'), ''),
          description
        ),
        route_segment = coalesce(
          p_payload->>'routeSegment',
          route_segment
        ),
        sort_order = (p_payload->>'sortOrder')::integer,
        status = coalesce(p_payload->>'status', status),
        row_version = row_version + 1,
        updated_at = now()
      where id = p_id and row_version = p_expected_version;
      if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    end if;
    select jsonb_build_object(
      'id', id, 'code', code, 'titleEn', title_en, 'titleZh', title_zh,
      'description', description, 'routeSegment', route_segment,
      'sortOrder', sort_order, 'status', status, 'rowVersion', row_version,
      'updatedAt', updated_at
    ) into result
    from catalog_private.chapters where id = target_id;
  end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'taxonomy.upsert', p_kind, target_id::text,
    array(select jsonb_object_keys(p_payload)), p_idempotency_key
  );
  return ops_private.admin_command_finish(
    actor_id, 'taxonomy.upsert.' || p_kind, p_idempotency_key, target_id, result
  );
end
$function$;

alter function api.admin_taxonomy_upsert(
  text, uuid, bigint, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_taxonomy_upsert(
  text, uuid, bigint, text, text, jsonb
) from public, anon;
grant execute on function api.admin_taxonomy_upsert(
  text, uuid, bigint, text, text, jsonb
) to authenticated;

create or replace function api.admin_taxonomy_archive(
  p_kind text,
  p_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id, 'taxonomy.archive.' || p_kind, p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if p_kind = 'category' then
    if exists (
      select 1 from catalog_private.products
      where category_id = p_id and status <> 'archived'
    ) then
      raise exception 'TAXONOMY_STILL_REFERENCED';
    end if;
    update catalog_private.categories
    set status = 'archived', row_version = row_version + 1, updated_at = now()
    where id = p_id and row_version = p_expected_version;
    if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    select jsonb_build_object(
      'id', id, 'kind', p_kind, 'status', status, 'rowVersion', row_version
    ) into result from catalog_private.categories where id = p_id;
  elsif p_kind = 'chapter' then
    if exists (
      select 1 from catalog_private.products
      where chapter_id = p_id and status <> 'archived'
    ) then
      raise exception 'TAXONOMY_STILL_REFERENCED';
    end if;
    update catalog_private.chapters
    set status = 'archived', row_version = row_version + 1, updated_at = now()
    where id = p_id and row_version = p_expected_version;
    if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    select jsonb_build_object(
      'id', id, 'kind', p_kind, 'status', status, 'rowVersion', row_version
    ) into result from catalog_private.chapters where id = p_id;
  else
    raise exception 'INVALID_TAXONOMY_KIND';
  end if;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'taxonomy.archive', p_kind, p_id::text,
    array['status', 'row_version'], p_idempotency_key
  );
  return ops_private.admin_command_finish(
    actor_id, 'taxonomy.archive.' || p_kind, p_idempotency_key, p_id, result
  );
end
$function$;

alter function api.admin_taxonomy_archive(text, uuid, bigint, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_taxonomy_archive(
  text, uuid, bigint, text, text
) from public, anon;
grant execute on function api.admin_taxonomy_archive(
  text, uuid, bigint, text, text
) to authenticated;

create or replace function api.admin_media_upload_intent_reserve(
  p_idempotency_key text,
  p_request_hash text,
  p_scope text,
  p_entity_id text,
  p_expected_version bigint,
  p_source_path text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  intent_id uuid;
  intent_public_id text := p_payload->>'intentId';
  aggregate_uuid uuid;
  current_version bigint;
  result jsonb;
begin
  if p_scope = 'product' then
    perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
    select id, row_version into aggregate_uuid, current_version
    from catalog_private.products
    where id::text = p_entity_id or slug = p_entity_id;
  elsif p_scope = 'support' then
    perform ops_private.require_admin_role(array['owner', 'support'], false);
    select id, row_version into aggregate_uuid, current_version
    from ops_private.support_cases
    where id::text = p_entity_id or public_id = p_entity_id;
  else
    raise exception 'INVALID_MEDIA_SCOPE';
  end if;
  if aggregate_uuid is null then
    raise exception 'MEDIA_PARENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if coalesce(intent_public_id, '') !~ '^[a-f0-9]{64}$'
    or p_source_path !~ '^incoming/(product|support)/[A-Za-z0-9][A-Za-z0-9_-]{0,127}/[a-f0-9]{64}\\.(jpg|png|webp|avif)$'
    or position('..' in p_source_path) > 0
    or p_payload->>'contentType' not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/avif'
    )
    or (p_payload->>'sizeBytes')::bigint not between 1 and 20971520
  then
    raise exception 'INVALID_MEDIA_UPLOAD_INTENT';
  end if;
  if split_part(p_source_path, '/', 2) <> p_scope
    or split_part(p_source_path, '/', 3) <> p_entity_id
    or split_part(split_part(p_source_path, '/', 4), '.', 1) <> intent_public_id
  then
    raise exception 'MEDIA_SOURCE_PATH_MISMATCH';
  end if;

  command_state := ops_private.admin_command_begin(
    actor_id, 'media.intent.reserve', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  insert into ops_private.media_upload_intents (
    public_id, scope, entity_id, expected_version, source_path,
    content_type, size_bytes, request_hash, created_by
  ) values (
    intent_public_id, p_scope, p_entity_id, p_expected_version, p_source_path,
    p_payload->>'contentType', (p_payload->>'sizeBytes')::bigint,
    p_request_hash, actor_id
  )
  returning id into intent_id;

  result := jsonb_build_object(
    'intentId', intent_public_id,
    'operationId', intent_id,
    'scope', p_scope,
    'entityId', p_entity_id,
    'expectedVersion', p_expected_version,
    'sourcePath', p_source_path,
    'status', 'reserved',
    'rowVersion', 1,
    'expiresAt', now() + interval '30 minutes'
  );
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'media.intent.reserve', 'media_upload_intent',
    intent_id::text, array['state', 'source_path'], p_idempotency_key
  );
  return ops_private.admin_command_finish(
    actor_id, 'media.intent.reserve', p_idempotency_key, intent_id, result
  );
end
$function$;

alter function api.admin_media_upload_intent_reserve(
  text, text, text, text, bigint, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_media_upload_intent_reserve(
  text, text, text, text, bigint, text, jsonb
) from public, anon;
grant execute on function api.admin_media_upload_intent_reserve(
  text, text, text, text, bigint, text, jsonb
) to authenticated;

create or replace function api.admin_media_finalize(
  p_idempotency_key text,
  p_request_hash text,
  p_scope text,
  p_entity_id text,
  p_expected_version bigint,
  p_payload jsonb
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
  aggregate_uuid uuid;
  current_version bigint;
  media_id uuid;
  existing_asset catalog_private.media_assets%rowtype;
  result jsonb;
begin
  if p_scope = 'product' then
    perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
    select id, row_version into aggregate_uuid, current_version
    from catalog_private.products
    where id::text = p_entity_id or slug = p_entity_id
    for update;
  elsif p_scope = 'support' then
    perform ops_private.require_admin_role(array['owner', 'support'], false);
    select id, row_version into aggregate_uuid, current_version
    from ops_private.support_cases
    where id::text = p_entity_id or public_id = p_entity_id
    for update;
  else
    raise exception 'INVALID_MEDIA_SCOPE';
  end if;
  if aggregate_uuid is null then
    raise exception 'MEDIA_PARENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  command_state := ops_private.admin_command_begin(
    actor_id, 'media.finalize', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  select * into intent
  from ops_private.media_upload_intents
  where public_id = p_payload->>'intentId'
  for update;
  if not found then
    raise exception 'MEDIA_UPLOAD_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if intent.state <> 'reserved'
    or intent.scope <> p_scope
    or intent.entity_id <> p_entity_id
    or intent.expected_version <> p_expected_version
    or intent.source_path <> p_payload->>'sourcePath'
    or intent.expires_at <= now()
  then
    raise exception 'MEDIA_UPLOAD_INTENT_CONFLICT';
  end if;
  if coalesce(p_payload->>'sha256', '') !~ '^[a-f0-9]{64}$'
    or (p_payload->>'sizeBytes')::bigint <> intent.size_bytes
    or (p_payload->>'width')::integer < 1
    or (p_payload->>'height')::integer < 1
    or jsonb_typeof(p_payload->'derivatives') <> 'array'
    or jsonb_array_length(p_payload->'derivatives') <> 6
  then
    raise exception 'INVALID_MEDIA_FINALIZATION';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload->'derivatives') derivative
    where (derivative->>'width')::integer not in (800, 1200, 1600)
      or derivative->>'format' not in ('webp', 'avif')
      or (derivative->>'byteLength')::bigint not between 1 and 20971520
      or derivative->>'objectPath' <> (
        case when p_scope = 'product' then 'catalog/' else 'support/' end
        || p_payload->>'sha256' || '/'
        || derivative->>'width' || '.' || derivative->>'format'
      )
      or (
        p_scope = 'product'
        and derivative->>'deliveryPath' <> (
          '/media/' || p_payload->>'sha256' || '/'
          || derivative->>'width' || '.' || derivative->>'format'
        )
      )
  ) then
    raise exception 'INVALID_MEDIA_DERIVATIVE';
  end if;
  if (
    select count(distinct (
      derivative->>'width',
      derivative->>'format'
    ))
    from jsonb_array_elements(p_payload->'derivatives') derivative
  ) <> 6 then
    raise exception 'DUPLICATE_MEDIA_DERIVATIVE';
  end if;

  select * into existing_asset
  from catalog_private.media_assets
  where sha256 = p_payload->>'sha256';
  if found then
    if existing_asset.byte_length <> intent.size_bytes
      or existing_asset.object_class <> (
        case
          when p_scope = 'product' then 'public_catalog'
          else 'private_case'
        end
      )
    then
      raise exception 'MEDIA_SHA_CONFLICT';
    end if;
    media_id := existing_asset.id;
  else
    insert into catalog_private.media_assets (
      sha256, status, object_class, byte_length, manifest,
      source_object_path
    ) values (
      p_payload->>'sha256',
      'draft',
      case when p_scope = 'product' then 'public_catalog' else 'private_case' end,
      intent.size_bytes,
      jsonb_build_object(
        'source', jsonb_build_object(
          'path', intent.source_path,
          'contentType', intent.content_type,
          'byteLength', intent.size_bytes,
          'width', (p_payload->>'width')::integer,
          'height', (p_payload->>'height')::integer
        ),
        'derivatives', p_payload->'derivatives'
      ),
      intent.source_path
    )
    returning id into media_id;
    insert into catalog_private.media_asset_transitions (
      media_asset_id, from_status, to_status, operation_id, reason
    ) values (
      media_id, null, 'draft', gen_random_uuid(), 'media pipeline finalized'
    );
  end if;

  update ops_private.media_upload_intents
  set
    state = 'finalized',
    media_asset_id = media_id,
    row_version = row_version + 1,
    finalized_at = now(),
    updated_at = now()
  where id = intent.id and row_version = intent.row_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  if p_scope = 'product' then
    update catalog_private.products
    set row_version = row_version + 1, updated_at = now()
    where id = aggregate_uuid and row_version = p_expected_version;
  else
    update ops_private.support_cases
    set row_version = row_version + 1, updated_at = now()
    where id = aggregate_uuid and row_version = p_expected_version;
  end if;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  if p_scope = 'support' then
    insert into ops_private.support_case_media (
      support_case_id,
      media_asset_id,
      uploaded_by
    ) values (
      aggregate_uuid,
      media_id,
      actor_id
    )
    on conflict (support_case_id, media_asset_id) do nothing;
  end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'media.finalize', 'media_asset', media_id::text,
    array['manifest', 'source_object_path', 'status'], p_idempotency_key
  );
  result := jsonb_build_object(
    'mediaAssetId', media_id,
    'intentId', intent.public_id,
    'scope', p_scope,
    'entityId', p_entity_id,
    'parentVersion', p_expected_version + 1,
    'status', 'draft'
  );
  return ops_private.admin_command_finish(
    actor_id, 'media.finalize', p_idempotency_key, media_id, result
  );
end
$function$;

alter function api.admin_media_finalize(
  text, text, text, text, bigint, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_media_finalize(
  text, text, text, text, bigint, jsonb
) from public, anon;
grant execute on function api.admin_media_finalize(
  text, text, text, text, bigint, jsonb
) to authenticated;

create or replace function api.admin_media_transition(
  p_asset_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_to_status text,
  p_backup_acknowledged boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  asset catalog_private.media_assets%rowtype;
  target_status text := replace(p_to_status, '-', '_');
  next_media_revision bigint;
  result jsonb;
begin
  if target_status in ('live_approved', 'revocation_pending', 'revoked') then
    perform ops_private.require_admin_role(array['owner'], true);
  else
    perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'media.transition', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  select * into asset
  from catalog_private.media_assets
  where id = p_asset_id
  for update;
  if not found then
    raise exception 'MEDIA_ASSET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if asset.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if not (
    (asset.status = 'draft' and target_status = 'review')
    or (asset.status = 'review' and target_status in ('draft', 'live_approved'))
    or (asset.status = 'live_approved' and target_status = 'revocation_pending')
    or (
      asset.status = 'revocation_pending'
      and target_status in ('live_approved', 'revoked')
    )
  ) then
    raise exception 'INVALID_MEDIA_STATE_TRANSITION';
  end if;
  if target_status = 'live_approved'
    and not (p_backup_acknowledged or asset.backup_acknowledged_at is not null)
  then
    raise exception 'MEDIA_BACKUP_ACK_REQUIRED';
  end if;

  update catalog_private.media_assets
  set
    status = target_status,
    backup_acknowledged_at = case
      when target_status = 'live_approved' and p_backup_acknowledged
        then coalesce(backup_acknowledged_at, now())
      else backup_acknowledged_at
    end,
    row_version = row_version + 1,
    updated_at = now()
  where id = p_asset_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  insert into catalog_private.media_asset_transitions (
    media_asset_id, from_status, to_status, operation_id, reason
  ) values (
    p_asset_id, asset.status, target_status, gen_random_uuid(),
    coalesce(nullif(p_reason, ''), 'backoffice transition')
  );

  select media_safety_revision into next_media_revision
  from ops_private.runtime_controls where singleton;
  if asset.status = 'live_approved' and target_status <> 'live_approved' then
    update ops_private.runtime_controls
    set
      media_safety_revision = media_safety_revision + 1,
      media_emergency_no_cache = true,
      revision = revision + 1,
      updated_at = now()
    where singleton
    returning media_safety_revision into next_media_revision;
  end if;
  if target_status = 'revoked' then
    insert into catalog_private.media_revocation_tombstones (
      sha256, reason, safety_revision
    ) values (
      asset.sha256,
      coalesce(nullif(p_reason, ''), 'owner revocation'),
      greatest(next_media_revision, 1)
    )
    on conflict (sha256) do nothing;
  end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'media.transition', 'media_asset', p_asset_id::text,
    array['status', 'backup_acknowledged_at', 'row_version'],
    p_idempotency_key
  );
  select jsonb_build_object(
    'mediaAssetId', id,
    'sha256', sha256,
    'status', replace(status, '_', '-'),
    'rowVersion', row_version,
    'backupAcknowledgedAt', backup_acknowledged_at,
    'mediaSafetyRevision', next_media_revision
  ) into result
  from catalog_private.media_assets where id = p_asset_id;
  return ops_private.admin_command_finish(
    actor_id, 'media.transition', p_idempotency_key, p_asset_id, result
  );
end
$function$;

alter function api.admin_media_transition(
  uuid, bigint, text, text, text, boolean, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_media_transition(
  uuid, bigint, text, text, text, boolean, text
) from public, anon;
grant execute on function api.admin_media_transition(
  uuid, bigint, text, text, text, boolean, text
) to authenticated;

create or replace function api.public_media_resolve(
  p_sha text,
  p_variant text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'sha256', asset.sha256,
    'variant', p_variant,
    'objectPath', derivative.value->>'objectPath',
    'contentType', 'image/' || derivative.value->>'format',
    'byteLength', (derivative.value->>'byteLength')::integer,
    'mediaSafetyRevision', controls.media_safety_revision,
    'assetStatus', 'live-approved',
    'tombstoned', false,
    'published', true
  )
  from catalog_private.media_assets asset
  join lateral jsonb_array_elements(asset.manifest->'derivatives')
    derivative(value) on (
      derivative.value->>'width' || '.' || derivative.value->>'format'
    ) = p_variant
  cross join ops_private.runtime_controls controls
  where p_sha ~ '^[a-f0-9]{64}$'
    and p_variant ~ '^(800|1200|1600)\\.(webp|avif)$'
    and asset.sha256 = p_sha
    and asset.status = 'live_approved'
    and asset.object_class = 'public_catalog'
    and controls.singleton
    and derivative.value->>'objectPath' = (
      'catalog/' || p_sha || '/' || p_variant
    )
    and derivative.value->>'deliveryPath' = (
      '/media/' || p_sha || '/' || p_variant
    )
    and not exists (
      select 1
      from catalog_private.media_revocation_tombstones tombstone
      where tombstone.sha256 = asset.sha256
    )
    and exists (
      select 1
      from catalog_private.products product
      join catalog_private.product_publications publication
        on publication.id = product.active_publication_id
      where product.status = 'published'
        and (
          publication.snapshot->'product'->'image'->>'assetId' = asset.sha256
          or exists (
            select 1
            from jsonb_array_elements(publication.snapshot->'skus') sku
            where sku->>'representativeAssetId' = asset.sha256
          )
          or exists (
            select 1
            from jsonb_array_elements(coalesce(
              publication.snapshot->'media',
              '[]'::jsonb
            )) media
            where media->>'assetId' = asset.sha256
              and media->>'approvalStatus' = 'approved'
              and media->>'path' ~ (
                '^/media/' || asset.sha256 ||
                '/(800|1200|1600)\\.(webp|avif)$'
              )
          )
        )
    )
  limit 1
$function$;

alter function api.public_media_resolve(text, text)
  owner to media_resolver_owner;
revoke all on function api.public_media_resolve(text, text) from public;
grant execute on function api.public_media_resolve(text, text)
  to anon, authenticated, storefront_rpc_caller;

-- Narrow postgres-owned Auth bridge. Backoffice owners can verify only the
-- invited UUID/email pair; they cannot enumerate or read auth.users.
create or replace function ops_private.assert_auth_user_email(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from auth.users candidate
    where candidate.id = p_user_id
      and lower(candidate.email) = lower(btrim(p_email))
  ) then
    raise exception 'AUTH_USER_EMAIL_MISMATCH' using errcode = 'P0002';
  end if;
end
$function$;

alter function ops_private.assert_auth_user_email(uuid, text)
  owner to postgres;
revoke all on function ops_private.assert_auth_user_email(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.assert_auth_user_email(uuid, text)
  to backoffice_ops_owner;

create or replace function api.bootstrap_initial_owners(
  p_owner_one_user_id uuid,
  p_owner_one_email text,
  p_owner_one_display_name text,
  p_owner_two_user_id uuid,
  p_owner_two_email text,
  p_owner_two_display_name text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  bootstrap_actor constant uuid :=
    '00000000-0000-4000-8000-000000000002'::uuid;
  command_state jsonb;
  result jsonb;
begin
  if auth.jwt()->>'role' <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  command_state := ops_private.admin_command_begin(
    bootstrap_actor,
    'initial_owners.bootstrap',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if p_owner_one_user_id is null
    or p_owner_two_user_id is null
    or p_owner_one_user_id = p_owner_two_user_id
    or p_owner_one_email !~*
      '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
    or p_owner_two_email !~*
      '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
    or lower(btrim(p_owner_one_email)) =
      lower(btrim(p_owner_two_email))
    or coalesce(btrim(p_owner_one_display_name), '') = ''
    or coalesce(btrim(p_owner_two_display_name), '') = ''
  then
    raise exception 'INVALID_INITIAL_OWNERS';
  end if;
  if exists (select 1 from ops_private.admin_memberships) then
    raise exception 'INITIAL_OWNERS_ALREADY_BOOTSTRAPPED';
  end if;

  perform ops_private.assert_auth_user_email(
    p_owner_one_user_id,
    p_owner_one_email
  );
  perform ops_private.assert_auth_user_email(
    p_owner_two_user_id,
    p_owner_two_email
  );
  insert into ops_private.admin_memberships (
    user_id,
    role,
    state,
    display_name,
    email,
    invited_by,
    activated_at,
    created_at,
    updated_at
  ) values
    (
      p_owner_one_user_id,
      'owner',
      'active',
      btrim(p_owner_one_display_name),
      lower(btrim(p_owner_one_email)),
      null,
      now(),
      now(),
      now()
    ),
    (
      p_owner_two_user_id,
      'owner',
      'active',
      btrim(p_owner_two_display_name),
      lower(btrim(p_owner_two_email)),
      null,
      now(),
      now(),
      now()
    );

  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'system',
    'initial_owners.bootstrap',
    'admin_membership',
    'initial-owner-pair',
    array['owner_one', 'owner_two', 'state'],
    p_idempotency_key
  );
  result := jsonb_build_object(
    'owners', jsonb_build_array(
      jsonb_build_object(
        'userId', p_owner_one_user_id,
        'email', lower(btrim(p_owner_one_email)),
        'displayName', btrim(p_owner_one_display_name),
        'role', 'owner',
        'state', 'active',
        'rowVersion', 1
      ),
      jsonb_build_object(
        'userId', p_owner_two_user_id,
        'email', lower(btrim(p_owner_two_email)),
        'displayName', btrim(p_owner_two_display_name),
        'role', 'owner',
        'state', 'active',
        'rowVersion', 1
      )
    )
  );
  return ops_private.admin_command_finish(
    bootstrap_actor,
    'initial_owners.bootstrap',
    p_idempotency_key,
    bootstrap_actor,
    result
  );
end
$function$;

alter function api.bootstrap_initial_owners(
  uuid, text, text, uuid, text, text, text, text
) owner to backoffice_ops_owner;
revoke all on function api.bootstrap_initial_owners(
  uuid, text, text, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function api.bootstrap_initial_owners(
  uuid, text, text, uuid, text, text, text, text
) to service_role;

create or replace function api.admin_member_invite_prepare(
  p_email text,
  p_display_name text,
  p_role text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  operation_id uuid;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  if p_email is null or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
    or coalesce(btrim(p_display_name), '') = ''
    or p_role not in ('owner', 'merchandiser', 'fulfillment', 'support')
  then
    raise exception 'INVALID_INVITATION';
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'member.invite.prepare', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  insert into ops_private.admin_invite_operations (
    email, display_name, role, prepared_by
  ) values (
    lower(btrim(p_email)), btrim(p_display_name), p_role, actor_id
  )
  returning id into operation_id;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'member.invite.prepare', 'admin_invite',
    operation_id::text, array['email', 'display_name', 'role', 'state'],
    p_idempotency_key
  );
  select jsonb_build_object(
    'operationId', id,
    'operationVersion', row_version,
    'email', email,
    'displayName', display_name,
    'role', role,
    'status', state,
    'expiresAt', expires_at
  ) into result
  from ops_private.admin_invite_operations where id = operation_id;
  return ops_private.admin_command_finish(
    actor_id, 'member.invite.prepare', p_idempotency_key, operation_id, result
  );
end
$function$;

alter function api.admin_member_invite_prepare(text, text, text, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_member_invite_prepare(
  text, text, text, text, text
) from public, anon;
grant execute on function api.admin_member_invite_prepare(
  text, text, text, text, text
) to authenticated;

create or replace function api.admin_member_invite_complete(
  p_operation_id uuid,
  p_user_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  operation ops_private.admin_invite_operations%rowtype;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id, 'member.invite.complete', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  select * into operation
  from ops_private.admin_invite_operations
  where id = p_operation_id
  for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if operation.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if operation.state <> 'prepared' or operation.expires_at <= now() then
    raise exception 'INVITATION_NOT_COMPLETABLE';
  end if;
  perform ops_private.assert_auth_user_email(p_user_id, operation.email);

  insert into ops_private.admin_memberships (
    user_id, role, state, display_name, email,
    invited_by, activated_at, created_at, updated_at
  ) values (
    p_user_id, operation.role, 'active', operation.display_name, operation.email,
    actor_id, now(), now(), now()
  );
  update ops_private.admin_invite_operations
  set
    state = 'completed',
    auth_user_id = p_user_id,
    row_version = row_version + 1,
    completed_at = now(),
    updated_at = now()
  where id = p_operation_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'member.invite.complete', 'admin_membership',
    p_user_id::text, array['role', 'state', 'activated_at'], p_idempotency_key
  );
  select jsonb_build_object(
    'operationId', operation.id,
    'operationVersion', operation.row_version + 1,
    'userId', membership.user_id,
    'displayName', membership.display_name,
    'email', membership.email,
    'role', membership.role,
    'state', membership.state,
    'rowVersion', membership.row_version,
    'activatedAt', membership.activated_at
  ) into result
  from ops_private.admin_memberships membership
  where membership.user_id = p_user_id;
  return ops_private.admin_command_finish(
    actor_id, 'member.invite.complete', p_idempotency_key, p_user_id, result
  );
end
$function$;

alter function api.admin_member_invite_complete(
  uuid, uuid, bigint, text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_member_invite_complete(
  uuid, uuid, bigint, text, text
) from public, anon;
grant execute on function api.admin_member_invite_complete(
  uuid, uuid, bigint, text, text
) to authenticated;

create or replace function api.admin_staff_list(
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(array['owner'], false);
  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'INVALID_PAGINATION';
  end if;
  with matching as (
    select *, count(*) over ()::integer as total_count
    from ops_private.admin_memberships
    order by created_at
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'displayName', display_name,
      'email', email,
      'role', role,
      'state', state,
      'rowVersion', row_version,
      'sessionsRevokedAt', sessions_revoked_at,
      'activatedAt', activated_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by created_at), '[]'::jsonb),
    'total', coalesce(max(total_count), 0),
    'limit', p_limit,
    'offset', p_offset
  ) into result from matching;
  return result;
end
$function$;

alter function api.admin_staff_list(integer, integer)
  owner to backoffice_ops_owner;
revoke all on function api.admin_staff_list(integer, integer)
  from public, anon;
grant execute on function api.admin_staff_list(integer, integer)
  to authenticated;

create or replace function api.admin_staff_state_command(
  p_user_id uuid,
  p_expected_version bigint,
  p_state text,
  p_role text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  if p_state not in ('active', 'suspended', 'revoked')
    or p_role not in ('owner', 'merchandiser', 'fulfillment', 'support')
  then
    raise exception 'INVALID_STAFF_STATE';
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'staff.state', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  update ops_private.admin_memberships
  set
    state = p_state,
    role = p_role,
    sessions_revoked_at = case
      when p_state in ('suspended', 'revoked') then now()
      else sessions_revoked_at
    end,
    row_version = row_version + 1,
    updated_at = now()
  where user_id = p_user_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'staff.state', 'admin_membership', p_user_id::text,
    array['state', 'role', 'sessions_revoked_at', 'row_version'],
    p_idempotency_key
  );
  select jsonb_build_object(
    'userId', user_id, 'displayName', display_name, 'email', email,
    'role', role, 'state', state, 'rowVersion', row_version,
    'sessionsRevokedAt', sessions_revoked_at, 'updatedAt', updated_at
  ) into result
  from ops_private.admin_memberships where user_id = p_user_id;
  return ops_private.admin_command_finish(
    actor_id, 'staff.state', p_idempotency_key, p_user_id, result
  );
end
$function$;

alter function api.admin_staff_state_command(
  uuid, bigint, text, text, text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_staff_state_command(
  uuid, bigint, text, text, text, text
) from public, anon;
grant execute on function api.admin_staff_state_command(
  uuid, bigint, text, text, text, text
) to authenticated;

create or replace function api.admin_owner_recovery_request(
  p_target_user_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid;
  command_state jsonb;
  request_id uuid;
  result jsonb;
begin
  actor_id := ops_private.require_owner_recovery_requester(
    p_target_user_id
  );
  if coalesce(btrim(p_reason), '') = '' or not exists (
    select 1 from ops_private.admin_memberships
    where user_id = p_target_user_id and role = 'owner' and state = 'active'
  ) then
    raise exception 'INVALID_OWNER_RECOVERY_REQUEST';
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'owner.recovery.request', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  insert into ops_private.owner_recovery_requests (
    target_user_id, requested_by, reason
  ) values (
    p_target_user_id, actor_id, btrim(p_reason)
  )
  returning id into request_id;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'owner.recovery.request', 'owner_recovery',
    request_id::text, array['target_user_id', 'reason', 'state'],
    p_idempotency_key
  );
  select jsonb_build_object(
    'requestId', id, 'targetUserId', target_user_id,
    'requestedBy', requested_by, 'state', state,
    'rowVersion', row_version, 'requestedAt', requested_at
  ) into result
  from ops_private.owner_recovery_requests where id = request_id;
  return ops_private.admin_command_finish(
    actor_id, 'owner.recovery.request', p_idempotency_key, request_id, result
  );
end
$function$;

alter function api.admin_owner_recovery_request(uuid, text, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_owner_recovery_request(
  uuid, text, text, text
) from public, anon;
grant execute on function api.admin_owner_recovery_request(
  uuid, text, text, text
) to authenticated;

create or replace function api.admin_owner_recovery_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  perform ops_private.require_owner_recovery_requester(actor_id);
  return (
    select jsonb_build_object(
      'userId', membership.user_id,
      'email', membership.email,
      'displayName', membership.display_name,
      'aal', auth.jwt()->>'aal',
      'pendingRequest', (
        select jsonb_build_object(
          'requestId', recovery.id,
          'state', recovery.state,
          'rowVersion', recovery.row_version,
          'requestedAt', recovery.requested_at
        )
        from ops_private.owner_recovery_requests recovery
        where recovery.target_user_id = actor_id
          and recovery.requested_by = actor_id
          and recovery.state = 'pending'
        order by recovery.requested_at desc
        limit 1
      )
    )
    from ops_private.admin_memberships membership
    where membership.user_id = actor_id
  );
end
$function$;

alter function api.admin_owner_recovery_context()
  owner to backoffice_ops_owner;
revoke all on function api.admin_owner_recovery_context()
  from public, anon;
grant execute on function api.admin_owner_recovery_context()
  to authenticated;

create or replace function api.admin_owner_recovery_approve(
  p_request_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  recovery ops_private.owner_recovery_requests%rowtype;
  result jsonb;
  outbox_key text;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id, 'owner.recovery.approve', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  select * into recovery
  from ops_private.owner_recovery_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'RECOVERY_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if recovery.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if recovery.state <> 'pending' or recovery.requested_by = actor_id then
    raise exception 'SECOND_OWNER_APPROVAL_REQUIRED';
  end if;

  update ops_private.owner_recovery_requests
  set
    state = 'approved',
    approved_by = actor_id,
    row_version = row_version + 1,
    decided_at = now()
  where id = p_request_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  update ops_private.admin_memberships
  set
    sessions_revoked_at = now(),
    row_version = row_version + 1,
    updated_at = now()
  where user_id = recovery.target_user_id
    and role = 'owner'
    and state = 'active';
  if not found then raise exception 'TARGET_OWNER_INACTIVE'; end if;

  outbox_key := 'auth-owner-recovery:' || p_request_id::text;
  insert into ops_private.outbox_jobs (
    operation_key, job_type, aggregate_id, payload
  ) values (
    outbox_key,
    'auth.revoke_sessions_and_recover',
    recovery.target_user_id,
    jsonb_build_object(
      'recoveryRequestId', p_request_id,
      'targetUserId', recovery.target_user_id,
      'approvedBy', actor_id
    )
  );
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'owner.recovery.approve', 'owner_recovery',
    p_request_id::text,
    array['state', 'approved_by', 'sessions_revoked_at', 'outbox'],
    p_idempotency_key
  );
  result := jsonb_build_object(
    'requestId', p_request_id,
    'targetUserId', recovery.target_user_id,
    'approvedBy', actor_id,
    'state', 'approved',
    'rowVersion', p_expected_version + 1,
    'sessionRevocationQueued', true,
    'operationKey', outbox_key
  );
  return ops_private.admin_command_finish(
    actor_id, 'owner.recovery.approve', p_idempotency_key, p_request_id, result
  );
end
$function$;

alter function api.admin_owner_recovery_approve(uuid, bigint, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_owner_recovery_approve(
  uuid, bigint, text, text
) from public, anon;
grant execute on function api.admin_owner_recovery_approve(
  uuid, bigint, text, text
) to authenticated;

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
      'auth_recovery.complete'
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

create or replace function ops_private.worker_command_finish(
  p_command_name text,
  p_idempotency_key text,
  p_response jsonb,
  p_response_is_null boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_response_is_null is null
    or (
      p_response_is_null
      and p_response is not null
    )
    or (
      not p_response_is_null
      and (
        p_response is null
        or jsonb_typeof(p_response) <> 'object'
      )
    )
  then
    raise exception 'INVALID_WORKER_COMMAND_RESPONSE';
  end if;
  update ops_private.worker_command_receipts
  set
    response = p_response,
    response_is_null = p_response_is_null,
    completed_at = now()
  where command_name = p_command_name
    and idempotency_key = p_idempotency_key
    and completed_at is null;
  if not found then
    raise exception 'WORKER_COMMAND_RECEIPT_CONFLICT';
  end if;
end
$function$;

alter function ops_private.worker_command_finish(
  text, text, jsonb, boolean
) owner to backoffice_ops_owner;
revoke all on function ops_private.worker_command_finish(
  text, text, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function ops_private.worker_command_finish(
  text, text, jsonb, boolean
) to backoffice_ops_owner;

-- Production-only Auth recovery worker boundary. Expired leases are never
-- replayed automatically because a remote Auth/email effect may already have
-- occurred. A worker may request retry_safe only when it has evidence that no
-- remote effect succeeded.
create or replace function api.worker_auth_recovery_claim(
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
  job ops_private.outbox_jobs%rowtype;
  new_lease_token uuid := gen_random_uuid();
  command_state jsonb;
  result jsonb;
begin
  command_state := ops_private.worker_command_begin(
    'auth_recovery.claim',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    if (command_state->>'responseIsNull')::boolean then
      return null;
    end if;
    return command_state->'response';
  end if;
  if coalesce(p_worker_id, '') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'
    or p_now is null
    or p_lease_seconds not between 15 and 300
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_AUTH_RECOVERY_WORKER_CLAIM';
  end if;

  with expired_candidates as (
    select candidate.id
    from ops_private.outbox_jobs candidate
    where candidate.job_type = 'auth.revoke_sessions_and_recover'
      and candidate.state = 'leased'
      and candidate.lease_expires_at <= p_now
    order by candidate.lease_expires_at, candidate.id
    for update skip locked
    limit 100
  ),
  expired as (
    update ops_private.outbox_jobs as target
    set
      state = 'dead_letter',
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      error_code = 'AUTH_RECOVERY_LEASE_EXPIRED_EFFECT_UNKNOWN',
      row_version = row_version + 1,
      updated_at = p_now,
      completed_at = p_now
    from expired_candidates candidate
    where target.id = candidate.id
    returning target.id, target.operation_key
  )
  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  )
  select
    'system',
    'owner.recovery.worker.lease_expired',
    'outbox_job',
    expired.id::text,
    array['state', 'lease_token', 'error_code', 'row_version'],
    expired.operation_key
  from expired;

  select * into job
  from ops_private.outbox_jobs
  where job_type = 'auth.revoke_sessions_and_recover'
    and state = 'queued'
    and available_at <= p_now
  order by available_at, created_at, id
  for update skip locked
  limit 1;
  if not found then
    perform ops_private.worker_command_finish(
      'auth_recovery.claim',
      p_idempotency_key,
      null,
      true
    );
    return null;
  end if;

  update ops_private.outbox_jobs
  set
    state = 'leased',
    lease_token = new_lease_token,
    leased_by = p_worker_id,
    lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    row_version = row_version + 1,
    updated_at = p_now
  where id = job.id and row_version = job.row_version
  returning * into job;
  if not found then
    raise exception 'AUTH_RECOVERY_WORKER_CLAIM_CONFLICT';
  end if;

  result := jsonb_build_object(
    'id', job.id,
    'operationKey', job.operation_key,
    'jobType', job.job_type,
    'aggregateId', job.aggregate_id,
    'payload', job.payload,
    'state', job.state,
    'attemptCount', job.attempt_count,
    'maxAttempts', job.max_attempts,
    'availableAt', job.available_at,
    'leaseToken', job.lease_token,
    'leaseExpiresAt', job.lease_expires_at,
    'lastEvidenceHash', job.evidence_hash,
    'lastErrorCode', job.error_code,
    'createdAt', job.created_at,
    'updatedAt', job.updated_at
  );
  perform ops_private.worker_command_finish(
    'auth_recovery.claim',
    p_idempotency_key,
    result,
    false
  );
  return result;
end
$function$;

alter function api.worker_auth_recovery_claim(
  text, text, text, timestamptz, integer
) owner to backoffice_ops_owner;
revoke all on function api.worker_auth_recovery_claim(
  text, text, text, timestamptz, integer
) from public, anon, authenticated;
grant execute on function api.worker_auth_recovery_claim(
  text, text, text, timestamptz, integer
) to worker_rpc_caller, service_role;

create or replace function api.worker_auth_recovery_complete(
  p_job_id text,
  p_lease_token text,
  p_idempotency_key text,
  p_request_hash text,
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
  job ops_private.outbox_jobs%rowtype;
  target_state text;
  error_code_value text := nullif(btrim(p_error_code), '');
  safe_result jsonb := coalesce(p_result, '{}'::jsonb);
  command_state jsonb;
  result_document jsonb;
begin
  command_state := ops_private.worker_command_begin(
    'auth_recovery.complete',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return command_state->'response';
  end if;
  if coalesce(p_job_id, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or coalesce(p_lease_token, '')
      !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    or coalesce(p_outcome, '')
      not in ('succeeded', 'retry_safe', 'failed_terminal')
    or p_now is null
    or (
      p_evidence_hash is not null
      and p_evidence_hash !~ '^[a-f0-9]{64}$'
    )
    or (
      error_code_value is not null
      and error_code_value !~ '^[A-Z0-9][A-Z0-9_.:-]{1,127}$'
    )
    or jsonb_typeof(safe_result) <> 'object'
    or safe_result - array[
      'sessionsRevoked',
      'totpFactorsRemoved',
      'recoveryEmailQueued',
      'messageId'
    ]::text[] <> '{}'::jsonb
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_AUTH_RECOVERY_WORKER_COMPLETION';
  end if;
  if p_outcome = 'retry_safe'
    and coalesce(p_retry_after_seconds, 0) not between 1 and 86400
  then
    raise exception 'INVALID_AUTH_RECOVERY_RETRY_DELAY';
  end if;
  if p_outcome <> 'succeeded' and error_code_value is null then
    raise exception 'AUTH_RECOVERY_ERROR_CODE_REQUIRED';
  end if;
  if p_outcome = 'succeeded'
    and (
      p_evidence_hash is null
      or not (safe_result ? 'sessionsRevoked')
      or not (safe_result ? 'totpFactorsRemoved')
      or not (safe_result ? 'recoveryEmailQueued')
      or jsonb_typeof(safe_result->'sessionsRevoked') <> 'boolean'
      or safe_result->>'sessionsRevoked' <> 'true'
      or jsonb_typeof(safe_result->'totpFactorsRemoved') <> 'number'
      or (safe_result->>'totpFactorsRemoved') !~ '^[0-9]+$'
      or jsonb_typeof(safe_result->'recoveryEmailQueued') <> 'boolean'
      or safe_result->>'recoveryEmailQueued' <> 'true'
      or (
        safe_result ? 'messageId'
        and (
          jsonb_typeof(safe_result->'messageId') <> 'string'
          or char_length(safe_result->>'messageId') not between 1 and 200
        )
      )
    )
  then
    raise exception 'INVALID_AUTH_RECOVERY_SUCCESS_EVIDENCE';
  end if;

  select * into job
  from ops_private.outbox_jobs
  where id = p_job_id::uuid
  for update;
  if not found or job.job_type <> 'auth.revoke_sessions_and_recover' then
    raise exception 'AUTH_RECOVERY_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if job.state <> 'leased'
    or job.lease_token is distinct from p_lease_token::uuid
  then
    raise exception 'AUTH_RECOVERY_LEASE_CONFLICT';
  end if;

  if job.lease_expires_at <= p_now then
    target_state := 'dead_letter';
    error_code_value := 'AUTH_RECOVERY_LEASE_EXPIRED_EFFECT_UNKNOWN';
  elsif p_outcome = 'succeeded' then
    target_state := 'completed';
    error_code_value := null;
  elsif p_outcome = 'retry_safe'
    and job.attempt_count < job.max_attempts
  then
    target_state := 'queued';
  else
    target_state := 'dead_letter';
    if p_outcome = 'retry_safe' then
      error_code_value := 'AUTH_RECOVERY_MAX_ATTEMPTS_EXCEEDED';
    end if;
  end if;

  update ops_private.outbox_jobs
  set
    state = target_state,
    available_at = case
      when target_state = 'queued' then
        p_now + make_interval(secs => p_retry_after_seconds)
      else available_at
    end,
    lease_token = null,
    leased_by = null,
    lease_expires_at = null,
    evidence_hash = p_evidence_hash,
    result = safe_result,
    error_code = error_code_value,
    row_version = row_version + 1,
    updated_at = p_now,
    completed_at = case when target_state = 'queued' then null else p_now end
  where id = job.id and row_version = job.row_version
  returning * into job;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'system',
    'owner.recovery.worker.' || job.state,
    'outbox_job',
    job.id::text,
    array[
      'state',
      'evidence_hash',
      'error_code',
      'row_version',
      'completed_at'
    ],
    job.operation_key
  );

  result_document := jsonb_build_object(
    'id', job.id,
    'operationKey', job.operation_key,
    'jobType', job.job_type,
    'aggregateId', job.aggregate_id,
    'payload', job.payload,
    'state', job.state,
    'attemptCount', job.attempt_count,
    'maxAttempts', job.max_attempts,
    'availableAt', job.available_at,
    'leaseToken', job.lease_token,
    'leaseExpiresAt', job.lease_expires_at,
    'lastEvidenceHash', job.evidence_hash,
    'lastErrorCode', job.error_code,
    'result', job.result,
    'completedAt', job.completed_at,
    'createdAt', job.created_at,
    'updatedAt', job.updated_at
  );
  perform ops_private.worker_command_finish(
    'auth_recovery.complete',
    p_idempotency_key,
    result_document,
    false
  );
  return result_document;
end
$function$;

alter function api.worker_auth_recovery_complete(
  text, text, text, text, text, text, jsonb, text, integer, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_auth_recovery_complete(
  text, text, text, text, text, text, jsonb, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function api.worker_auth_recovery_complete(
  text, text, text, text, text, text, jsonb, text, integer, timestamptz
) to worker_rpc_caller, service_role;

create or replace function api.admin_operations_command(
  p_idempotency_key text,
  p_request_hash text,
  p_expected_version bigint,
  p_command_type text,
  p_aggregate_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  current_projection ops_private.operation_projections%rowtype;
  order_row commerce_private.orders%rowtype;
  projection_document jsonb;
  projection_id uuid;
  next_version bigint;
  job_id uuid;
  job_key text;
  job_kind text;
  job_type text;
  job_safety text;
  job_payload jsonb;
  reference_id text;
  references_value jsonb := '{}'::jsonb;
  result jsonb;
begin
  if p_command_type in ('invoice.adjust', 'refund.execute') then
    perform ops_private.require_admin_role(array['owner'], true);
  elsif p_command_type in (
    'shipment.create',
    'shipment.cancel',
    'shipment.manual_tracking',
    'shipment.status.update',
    'return.receive',
    'return.inspect'
  ) then
    perform ops_private.require_admin_role(array['owner', 'fulfillment'], false);
  elsif p_command_type in (
    'order.cancel.request',
    'payment.reconcile',
    'invoice.issue',
    'return.open',
    'return.decision',
    'refund.request',
    'support.open',
    'support.note',
    'support.resolve'
  ) then
    perform ops_private.require_admin_role(array['owner', 'support'], false);
  else
    raise exception 'INVALID_OPERATIONS_COMMAND';
  end if;
  if p_expected_version < 1
    or coalesce(p_idempotency_key, '') !~
      '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,199}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_aggregate_id, '') = ''
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'type' is distinct from p_command_type
  then
    raise exception 'INVALID_OPERATIONS_COMMAND';
  end if;

  command_state := ops_private.admin_command_begin(
    actor_id, 'operations.command', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  select * into order_row
  from commerce_private.orders candidate
  where candidate.id::text = p_aggregate_id
    or candidate.public_id = p_aggregate_id
  for update;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into current_projection
  from ops_private.operation_projections
  where aggregate_id = p_aggregate_id
    or order_id = order_row.id
  for update;
  if not found then
    if order_row.row_version <> p_expected_version then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;
    projection_document := jsonb_build_object(
      'id', order_row.id,
      'publicId', order_row.public_id,
      'version', order_row.row_version,
      'orderStatus', case
        when order_row.projection_status in (
          'awaiting_payment', 'paid', 'processing', 'cancel_requested',
          'cancelled', 'shipped', 'delivered', 'closed'
        ) then order_row.projection_status
        else 'awaiting_payment'
      end,
      'paymentStatus', case
        when order_row.applied_payment_receipt_id is null then 'pending'
        else 'paid'
      end,
      'invoiceStatus', 'not_requested',
      'shipmentStatus', 'not_created',
      'returnStatus', 'none',
      'refundStatus', 'none',
      'supportStatus', 'none',
      'totalGrossTwd', order_row.total_gross_twd,
      'refundedTwd', 0,
      'merchantTradeNo', order_row.merchant_trade_no,
      'providerTradeNo', null,
      'invoiceRelateNumber', null,
      'trackingIds', '[]'::jsonb,
      'updatedAt', order_row.updated_at
    );
    insert into ops_private.operation_projections (
      aggregate_id,
      order_id,
      aggregate_kind,
      state,
      projection,
      row_version
    ) values (
      p_aggregate_id,
      order_row.id,
      'order',
      projection_document->>'orderStatus',
      projection_document,
      order_row.row_version
    )
    returning * into current_projection;
  elsif current_projection.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  projection_document := current_projection.projection;
  case p_command_type
    when 'order.cancel.request' then
      if projection_document->>'orderStatus' in ('cancelled', 'closed') then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'orderStatus', 'cancel_requested'
      );

    when 'payment.reconcile' then
      projection_document := projection_document || jsonb_build_object(
        'paymentStatus', 'verification_pending'
      );
      job_type := 'payment.query';
      job_safety := 'safe_query';
      job_kind := 'reconciliation';
      job_payload := jsonb_build_object(
        'merchantTradeNo', p_payload->>'merchantTradeNo'
      );

    when 'invoice.issue' then
      if projection_document->>'paymentStatus' <> 'paid'
        or projection_document->>'invoiceStatus'
          not in ('not_requested', 'exception')
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'invoiceStatus', 'pending_issue'
      );
      job_type := 'invoice.issue';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'option', p_payload->'option',
        'totals', jsonb_build_object(
          'grossTwd', order_row.total_gross_twd,
          'netTwd', order_row.total_net_twd,
          'taxTwd', order_row.total_tax_twd
        )
      );

    when 'invoice.adjust' then
      if projection_document->>'invoiceStatus' <> 'issued' then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'invoiceStatus', 'adjustment_pending'
      );
      job_type := 'invoice.adjust';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'kind', p_payload->>'kind',
        'relateNumber', p_payload->>'relateNumber',
        'amountTwd', (p_payload->>'amountTwd')::integer
      );

    when 'shipment.create' then
      if projection_document->>'paymentStatus' <> 'paid'
        or projection_document->>'shipmentStatus' <> 'not_created'
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'shipmentStatus', 'label_pending'
      );
      job_type := 'shipment.create';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'parcelCount', (p_payload->>'parcelCount')::integer
      );

    when 'shipment.cancel' then
      if projection_document->>'shipmentStatus'
        not in ('label_created', 'manual_tracking')
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'shipmentStatus', 'cancellation_pending'
      );
      job_type := 'shipment.cancel';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'trackingId', p_payload->>'trackingId'
      );

    when 'shipment.manual_tracking' then
      if projection_document->>'shipmentStatus'
        not in ('not_created', 'label_pending')
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'shipmentStatus', 'manual_tracking',
        'trackingIds', jsonb_build_array(p_payload->>'trackingId'),
        'orderStatus', 'shipped'
      );

    when 'return.open' then
      if projection_document->>'orderStatus' <> 'delivered'
        or projection_document->>'returnStatus' <> 'none'
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      reference_id := 'return-' || substr(
        md5(p_aggregate_id || ':' || p_idempotency_key),
        1,
        20
      );
      references_value := jsonb_build_object('returnId', reference_id);
      projection_document := projection_document || jsonb_build_object(
        'returnStatus', 'requested',
        '_returnId', reference_id
      );

    when 'return.decision' then
      if projection_document->>'returnStatus' <> 'requested' then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'returnStatus', case
          when p_payload->>'decision' = 'authorize' then 'authorized'
          else 'rejected'
        end
      );

    when 'return.receive' then
      if projection_document->>'returnStatus' <> 'authorized' then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'returnStatus', 'received'
      );

    when 'return.inspect' then
      if projection_document->>'returnStatus' not in ('received', 'inspecting')
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'returnStatus', case
          when (p_payload->>'accepted')::boolean
            then 'settlement_pending'
          else 'closed'
        end
      );

    when 'refund.request' then
      if projection_document->>'paymentStatus' <> 'paid'
        or projection_document->>'refundStatus' <> 'none'
        or (p_payload->>'amountTwd')::integer >
          (projection_document->>'totalGrossTwd')::integer -
          (projection_document->>'refundedTwd')::integer
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      reference_id := 'refund-' || substr(
        md5(p_aggregate_id || ':' || p_idempotency_key),
        1,
        20
      );
      references_value := jsonb_build_object('refundId', reference_id);
      projection_document := projection_document || jsonb_build_object(
        'refundStatus', 'requested',
        'providerTradeNo', p_payload->>'providerTradeNo',
        '_refundId', reference_id,
        '_refundAmountTwd', (p_payload->>'amountTwd')::integer
      );

    when 'refund.execute' then
      if projection_document->>'refundStatus' <> 'requested'
        or projection_document->>'_refundId' <> p_payload->>'refundId'
        or coalesce(projection_document->>'providerTradeNo', '') = ''
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'refundStatus', 'queued'
      );
      job_type := 'payment.refund';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'refundId', p_payload->>'refundId',
        'providerTradeNo', projection_document->>'providerTradeNo',
        'amountTwd', (projection_document->>'_refundAmountTwd')::integer
      );

    when 'support.open' then
      if projection_document->>'supportStatus' = 'open' then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      reference_id := 'case-' || substr(
        md5(p_aggregate_id || ':' || p_idempotency_key),
        1,
        20
      );
      references_value := jsonb_build_object('caseId', reference_id);
      insert into ops_private.support_cases (
        public_id,
        order_id,
        state,
        created_by
      ) values (
        reference_id,
        order_row.id,
        'open',
        actor_id
      );
      projection_document := projection_document || jsonb_build_object(
        'supportStatus', 'open',
        '_supportCaseId', reference_id
      );

    when 'support.note' then
      if projection_document->>'supportStatus' <> 'open'
        or projection_document->>'_supportCaseId' <> p_payload->>'caseId'
        or not exists (
          select 1
          from ops_private.support_cases support_case
          where support_case.public_id = p_payload->>'caseId'
            and support_case.state = 'open'
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;

    when 'support.resolve' then
      if projection_document->>'supportStatus' <> 'open'
        or projection_document->>'_supportCaseId' <> p_payload->>'caseId'
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update ops_private.support_cases
      set
        state = 'resolved',
        row_version = row_version + 1,
        updated_at = now()
      where public_id = p_payload->>'caseId'
        and state = 'open';
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      projection_document := projection_document || jsonb_build_object(
        'supportStatus', 'resolved'
      );
  end case;

  next_version := current_projection.row_version + 1;
  projection_document := projection_document || jsonb_build_object(
    'version', next_version,
    'updatedAt', now()
  );
  update ops_private.operation_projections
  set
    state = projection_document->>'orderStatus',
    projection = projection_document,
    row_version = next_version,
    updated_at = now()
  where id = current_projection.id
    and row_version = current_projection.row_version
  returning id into projection_id;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  if job_type is not null then
    job_key :=
      'operations:' || p_idempotency_key || ':' || job_type;
    insert into ops_private.operation_jobs (
      operation_key,
      kind,
      command_type,
      safety,
      aggregate_id,
      payload
    ) values (
      job_key,
      job_kind,
      job_type,
      job_safety,
      current_projection.aggregate_id,
      job_payload
    )
    returning id into job_id;
  end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'operations.command', 'operation_projection',
    p_aggregate_id, array['state', 'projection', 'row_version', 'job'],
    p_idempotency_key
  );
  result := jsonb_build_object(
    'projection', projection_document,
    'enqueuedOperationKeys', case
      when job_key is null then '[]'::jsonb
      else jsonb_build_array(job_key)
    end,
    'references', references_value
  );
  return ops_private.admin_command_finish(
    actor_id, 'operations.command', p_idempotency_key, projection_id, result
  );
end
$function$;

alter function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) from public, anon;
grant execute on function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) to authenticated;

create or replace function api.admin_operations_projection_get(
  p_aggregate_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  order_row commerce_private.orders%rowtype;
  projection_record ops_private.operation_projections%rowtype;
  projection_document jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'fulfillment', 'support'], false
  );
  select * into projection_record
  from ops_private.operation_projections
  where aggregate_id = p_aggregate_id;
  if found then
    return projection_record.projection;
  end if;

  select * into order_row
  from commerce_private.orders candidate
  where candidate.id::text = p_aggregate_id
    or candidate.public_id = p_aggregate_id
  for update;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into projection_record
  from ops_private.operation_projections
  where order_id = order_row.id;
  if found then
    return projection_record.projection;
  end if;

  projection_document := jsonb_build_object(
    'id', order_row.id,
    'publicId', order_row.public_id,
    'version', order_row.row_version,
    'orderStatus', case
      when order_row.projection_status in (
        'awaiting_payment', 'paid', 'processing', 'cancel_requested',
        'cancelled', 'shipped', 'delivered', 'closed'
      ) then order_row.projection_status
      else 'awaiting_payment'
    end,
    'paymentStatus', case
      when order_row.applied_payment_receipt_id is null then 'pending'
      else 'paid'
    end,
    'invoiceStatus', 'not_requested',
    'shipmentStatus', 'not_created',
    'returnStatus', 'none',
    'refundStatus', 'none',
    'supportStatus', 'none',
    'totalGrossTwd', order_row.total_gross_twd,
    'refundedTwd', 0,
    'merchantTradeNo', order_row.merchant_trade_no,
    'providerTradeNo', null,
    'invoiceRelateNumber', null,
    'trackingIds', '[]'::jsonb,
    'updatedAt', order_row.updated_at
  );
  insert into ops_private.operation_projections (
    aggregate_id,
    order_id,
    aggregate_kind,
    state,
    projection,
    row_version
  ) values (
    p_aggregate_id,
    order_row.id,
    'order',
    projection_document->>'orderStatus',
    projection_document,
    order_row.row_version
  );
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
    'operations.projection.ensure',
    'operation_projection',
    p_aggregate_id,
    array['projection', 'row_version'],
    'projection-ensure:' || order_row.id::text
  );
  return projection_document;
end
$function$;

alter function api.admin_operations_projection_get(text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_operations_projection_get(text)
  from public, anon;
grant execute on function api.admin_operations_projection_get(text)
  to authenticated;

create or replace function api.admin_operations_queue(
  p_kind text,
  p_limit integer,
  p_offset integer
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
  if p_kind not in (
    'outbox',
    'provider_operations',
    'dead_letters',
    'reconciliation',
    'provider_events',
    'support'
  )
    or p_limit < 1 or p_limit > 200 or p_offset < 0
  then
    raise exception 'INVALID_QUEUE_QUERY';
  end if;
  if p_kind in ('outbox', 'provider_events', 'support') then
    perform ops_private.require_admin_role(array['owner', 'support'], false);
  else
    perform ops_private.require_admin_role(array['owner'], false);
  end if;

  if p_kind = 'provider_events' then
    with matching as (
      select event.*, count(*) over ()::integer as total_count
      from ops_private.provider_events event
      order by event.received_at desc
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'kind', p_kind,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'provider', provider,
        'eventType', event_type,
        'providerObjectId', provider_object_id,
        'normalizedStatus', normalized_status,
        'fingerprint', fingerprint,
        'verified', verification_state = 'verified',
        'redactedPayload', redacted_payload,
        'receivedAt', received_at
      ) order by received_at desc), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'limit', p_limit,
      'offset', p_offset
    ) into result from matching;
  elsif p_kind = 'support' then
    with matching as (
      select item.*, count(*) over ()::integer as total_count
      from ops_private.operation_projections item
      where item.projection->>'supportStatus' = 'open'
      order by item.updated_at desc
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'kind', p_kind,
      'items', coalesce(
        jsonb_agg(projection order by updated_at desc),
        '[]'::jsonb
      ),
      'total', coalesce(max(total_count), 0),
      'limit', p_limit,
      'offset', p_offset
    ) into result from matching;
  else
    with matching as (
      select job.*, count(*) over ()::integer as total_count
      from ops_private.operation_jobs job
      where case p_kind
        when 'outbox' then job.command_type = 'email.send'
        when 'provider_operations' then job.kind = 'provider'
        when 'dead_letters' then job.state = 'dead_letter'
        when 'reconciliation' then
          job.kind = 'reconciliation'
          or job.state in ('unknown', 'manual_review')
        else false
      end
      order by job.created_at desc
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'kind', p_kind,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'operationKey', operation_key,
        'aggregateId', aggregate_id,
        'type', command_type,
        'safety', safety,
        'state', state,
        'payload', payload,
        'attemptCount', attempt_count,
        'availableAt', available_at,
        'leaseToken', lease_token,
        'leaseExpiresAt', lease_expires_at,
        'lastEvidenceHash', evidence_hash,
        'lastErrorCode', error_code,
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by created_at desc), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'limit', p_limit,
      'offset', p_offset
    ) into result from matching;
  end if;
  return result;
end
$function$;

alter function api.admin_operations_queue(text, integer, integer)
  owner to backoffice_ops_owner;
revoke all on function api.admin_operations_queue(text, integer, integer)
  from public, anon;
grant execute on function api.admin_operations_queue(text, integer, integer)
  to authenticated;

create or replace function api.operations_provider_event_store(
  p_provider text,
  p_event_type text,
  p_provider_object_id text,
  p_normalized_status text,
  p_fingerprint text,
  p_verified boolean,
  p_redacted_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event ops_private.provider_events%rowtype;
  inserted boolean := true;
begin
  if coalesce(p_provider, '') = ''
    or coalesce(p_event_type, '') = ''
    or coalesce(p_provider_object_id, '') = ''
    or coalesce(p_normalized_status, '') = ''
    or coalesce(p_fingerprint, '') = ''
    or jsonb_typeof(p_redacted_payload) <> 'object'
  then
    raise exception 'INVALID_PROVIDER_EVENT';
  end if;
  insert into ops_private.provider_events (
    provider, event_type, provider_object_id, normalized_status,
    fingerprint, verification_state, redacted_payload
  ) values (
    p_provider, p_event_type, p_provider_object_id, p_normalized_status,
    p_fingerprint,
    case when p_verified then 'verified' else 'invalid' end,
    p_redacted_payload
  )
  on conflict (
    provider, event_type, provider_object_id, normalized_status, fingerprint
  ) do nothing
  returning * into event;
  if event.id is null then
    inserted := false;
    select * into event
    from ops_private.provider_events
    where provider = p_provider
      and event_type = p_event_type
      and provider_object_id = p_provider_object_id
      and normalized_status = p_normalized_status
      and fingerprint = p_fingerprint;
  end if;
  return jsonb_build_object(
    'provider', event.provider,
    'eventType', event.event_type,
    'providerObjectId', event.provider_object_id,
    'normalizedStatus', event.normalized_status,
    'fingerprint', event.fingerprint,
    'verified', event.verification_state = 'verified',
    'redactedPayload', event.redacted_payload,
    'id', event.id,
    'duplicate', not inserted,
    'receivedAt', event.received_at,
    'reconciliationOperationKey', null
  );
end
$function$;

alter function api.operations_provider_event_store(
  text, text, text, text, text, boolean, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.operations_provider_event_store(
  text, text, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function api.operations_provider_event_store(
  text, text, text, text, text, boolean, jsonb
) to worker_rpc_caller, service_role;

create or replace function api.operations_payment_callback_record(
  p_provider text,
  p_merchant_trade_no text,
  p_provider_trade_no text,
  p_callback_status text,
  p_fingerprint text,
  p_redacted_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event ops_private.provider_events%rowtype;
  inserted boolean := true;
  aggregate_id_value text;
  operation_key_value text;
begin
  if p_provider <> 'ecpay'
    or coalesce(p_merchant_trade_no, '') !~ '^[A-Za-z0-9]{1,20}$'
    or coalesce(p_callback_status, '') = ''
    or coalesce(p_fingerprint, '') = ''
    or jsonb_typeof(p_redacted_payload) <> 'object'
  then
    raise exception 'INVALID_PAYMENT_CALLBACK';
  end if;

  insert into ops_private.provider_events (
    provider,
    event_type,
    provider_object_id,
    normalized_status,
    fingerprint,
    verification_state,
    redacted_payload
  ) values (
    'ecpay',
    'payment.callback',
    p_merchant_trade_no,
    p_callback_status,
    p_fingerprint,
    'verified',
    p_redacted_payload || jsonb_build_object(
      'providerTradeNoPresent',
      nullif(p_provider_trade_no, '') is not null
    )
  )
  on conflict (
    provider, event_type, provider_object_id, normalized_status, fingerprint
  ) do nothing
  returning * into event;

  if event.id is null then
    inserted := false;
    select * into event
    from ops_private.provider_events
    where provider = 'ecpay'
      and event_type = 'payment.callback'
      and provider_object_id = p_merchant_trade_no
      and normalized_status = p_callback_status
      and fingerprint = p_fingerprint;
  end if;

  select candidate.id::text into aggregate_id_value
  from commerce_private.orders candidate
  where candidate.merchant_trade_no = p_merchant_trade_no;
  aggregate_id_value := coalesce(
    aggregate_id_value,
    'unmatched-' || substr(md5(p_merchant_trade_no), 1, 20)
  );
  operation_key_value :=
    'payment.callback:' || p_merchant_trade_no || ':' ||
    p_fingerprint || ':query';

  insert into ops_private.operation_jobs (
    operation_key,
    kind,
    command_type,
    safety,
    aggregate_id,
    payload
  ) values (
    operation_key_value,
    'reconciliation',
    'payment.query',
    'safe_query',
    aggregate_id_value,
    jsonb_build_object('merchantTradeNo', p_merchant_trade_no)
  )
  on conflict (operation_key) do nothing;

  return jsonb_build_object(
    'provider', 'ecpay',
    'eventType', 'payment.callback',
    'providerObjectId', event.provider_object_id,
    'normalizedStatus', event.normalized_status,
    'fingerprint', event.fingerprint,
    'verified', true,
    'redactedPayload', event.redacted_payload,
    'id', event.id,
    'duplicate', not inserted,
    'receivedAt', event.received_at,
    'reconciliationOperationKey', operation_key_value
  );
end
$function$;

alter function api.operations_payment_callback_record(
  text, text, text, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.operations_payment_callback_record(
  text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function api.operations_payment_callback_record(
  text, text, text, text, text, jsonb
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
  new_lease_token uuid := gen_random_uuid();
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
      and candidate.safety in ('safe_query', 'retry_safe')
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
    error_code = 'SAFE_LEASE_EXPIRED_REQUEUED',
    row_version = row_version + 1,
    updated_at = p_now
  from expired_safe_candidates candidate
  where target.id = candidate.id;

  with expired_remote_candidates as (
    select candidate.id
    from ops_private.operation_jobs candidate
    where candidate.state = 'leased'
      and candidate.lease_expires_at <= p_now
      and candidate.safety = 'remote_effect'
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
    updated_at = p_now
  from expired_remote_candidates candidate
  where target.id = candidate.id;

  select * into job
  from ops_private.operation_jobs
  where state = 'queued' and available_at <= p_now
  order by available_at, created_at
  for update skip locked
  limit 1;
  if not found then return null; end if;

  update ops_private.operation_jobs as target
  set
    state = 'leased',
    lease_token = new_lease_token,
    leased_by = p_worker_id,
    lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    row_version = row_version + 1,
    updated_at = p_now
  where id = job.id and row_version = job.row_version
  returning * into job;
  if not found then raise exception 'WORKER_CLAIM_CONFLICT'; end if;

  if job.command_type = 'payment.refund' then
    update ops_private.operation_projections projection
    set
      projection = projection.projection || jsonb_build_object(
        'refundStatus', 'in_flight',
        'version', projection.row_version + 1,
        'updatedAt', p_now
      ),
      row_version = projection.row_version + 1,
      updated_at = p_now
    where projection.aggregate_id = job.aggregate_id;
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

alter function api.worker_operations_claim(text, timestamptz, integer)
  owner to backoffice_ops_owner;
revoke all on function api.worker_operations_claim(text, timestamptz, integer)
  from public, anon, authenticated;
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
  projection_record ops_private.operation_projections%rowtype;
  projection_document jsonb;
  target_state text;
  worker_id text;
  refunded_total integer;
  error_code_value text := p_error_code;
  projection_changed boolean := false;
begin
  if p_job_id !~ '^[a-f0-9-]{36}$'
    or p_lease_token !~ '^[a-f0-9-]{36}$'
    or p_outcome not in (
      'succeeded', 'retry_safe', 'failed_terminal', 'unknown', 'manual_review'
    )
    or (
      p_evidence_hash is not null
      and p_evidence_hash !~ '^[a-f0-9]{64}$'
    )
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
  from ops_private.operation_jobs
  where id = p_job_id::uuid
  for update;
  if not found then
    raise exception 'OPERATION_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  if job.state <> 'leased'
    or job.lease_token is distinct from p_lease_token::uuid
  then
    raise exception 'OPERATION_LEASE_CONFLICT';
  end if;
  worker_id := job.leased_by;

  if job.lease_expires_at <= p_now then
    target_state := case
      when job.safety in ('safe_query', 'retry_safe') then 'queued'
      else 'unknown'
    end;
    error_code_value := case
      when target_state = 'queued' then 'SAFE_LEASE_EXPIRED_REQUEUED'
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
    result = p_result,
    error_code = error_code_value,
    row_version = row_version + 1,
    updated_at = p_now,
    completed_at = case
      when target_state in ('queued', 'leased') then null else p_now
    end
  where id = job.id and row_version = job.row_version
  returning * into job;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  select * into projection_record
  from ops_private.operation_projections
  where aggregate_id = job.aggregate_id
  for update;
  if found then
    projection_document := projection_record.projection;
    if job.state = 'completed' then
      case job.command_type
        when 'payment.query' then
          if p_result->>'tradeStatus' = 'paid' then
            projection_document := projection_document || jsonb_build_object(
              'paymentStatus', 'paid',
              'orderStatus', 'paid',
              'providerTradeNo', coalesce(
                nullif(p_result->>'providerTradeNo', ''),
                projection_document->>'providerTradeNo'
              )
            );
          elsif p_result->>'tradeStatus' = 'unpaid' then
            projection_document := projection_document || jsonb_build_object(
              'paymentStatus', 'pending'
            );
          end if;
          projection_changed := true;
        when 'payment.refund' then
          refunded_total :=
            (projection_document->>'refundedTwd')::integer +
            (job.payload->>'amountTwd')::integer;
          projection_document := projection_document || jsonb_build_object(
            'refundedTwd', refunded_total,
            'refundStatus', 'succeeded',
            'paymentStatus', case
              when refunded_total >=
                (projection_document->>'totalGrossTwd')::integer
                then 'refunded'
              else 'partially_refunded'
            end
          );
          projection_changed := true;
        when 'invoice.issue' then
          projection_document := projection_document || jsonb_build_object(
            'invoiceStatus', 'issued',
            'invoiceRelateNumber', coalesce(
              nullif(p_result->>'relateNumber', ''),
              projection_document->>'invoiceRelateNumber'
            )
          );
          projection_changed := true;
        when 'invoice.adjust' then
          projection_document := projection_document || jsonb_build_object(
            'invoiceStatus', 'adjusted'
          );
          projection_changed := true;
        when 'shipment.create' then
          projection_document := projection_document || jsonb_build_object(
            'shipmentStatus', 'label_created',
            'trackingIds', case
              when jsonb_typeof(p_result->'trackingIds') = 'array'
                then p_result->'trackingIds'
              else '[]'::jsonb
            end
          );
          projection_changed := true;
        when 'shipment.cancel' then
          projection_document := projection_document || jsonb_build_object(
            'shipmentStatus', case
              when p_result->>'state' = 'picked_up' then 'picked_up'
              else 'cancelled'
            end
          );
          projection_changed := true;
        when 'email.send' then
          null;
      end case;
    elsif job.state in ('unknown', 'manual_review', 'dead_letter') then
      if job.command_type = 'payment.refund' then
        projection_document := projection_document || jsonb_build_object(
          'refundStatus', case job.state
            when 'unknown' then 'unknown'
            when 'manual_review' then 'manual_review'
            else 'failed_terminal'
          end
        );
        projection_changed := true;
      elsif job.command_type like 'invoice.%' then
        projection_document := projection_document || jsonb_build_object(
          'invoiceStatus', 'exception'
        );
        projection_changed := true;
      elsif job.command_type like 'shipment.%' then
        projection_document := projection_document || jsonb_build_object(
          'shipmentStatus', 'exception'
        );
        projection_changed := true;
      elsif job.command_type = 'payment.query' then
        projection_document := projection_document || jsonb_build_object(
          'paymentStatus', case
            when job.state = 'dead_letter' then 'exception'
            else 'verification_pending'
          end
        );
        projection_changed := true;
      end if;
    end if;

    if projection_changed then
      projection_document := projection_document || jsonb_build_object(
        'version', projection_record.row_version + 1,
        'updatedAt', p_now
      );
      update ops_private.operation_projections
      set
        state = projection_document->>'orderStatus',
        projection = projection_document,
        row_version = row_version + 1,
        updated_at = p_now
      where id = projection_record.id
        and row_version = projection_record.row_version;
      if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    end if;
  end if;

  insert into ops_private.audit_events (
    actor_scope, action, entity_type, entity_id, changed_fields, request_id
  ) values (
    'worker:' || coalesce(worker_id, 'operation-worker'),
    'operations.complete',
    'operation_job',
    job.id::text,
    array['state', 'evidence_hash', 'result', 'error_code', 'row_version'],
    job.operation_key
  );
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

alter function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) to worker_rpc_caller, service_role;

-- Authoritative operations reducers.
--
-- operation_projections is deliberately only a derived read model. Admin
-- commands and worker completions first mutate the commerce ledgers below,
-- then rebuild the projection in the same transaction.
alter table commerce_private.orders
  add column if not exists cancel_reason text
    check (
      cancel_reason is null
      or char_length(btrim(cancel_reason)) between 3 and 500
    );

alter table commerce_private.refund_operations
  add column if not exists public_id text,
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

update commerce_private.refund_operations
set public_id = 'refund-' || substr(md5(id::text), 1, 20)
where public_id is null;

alter table commerce_private.refund_operations
  alter column public_id set not null,
  drop constraint if exists refund_operations_state_check,
  add constraint refund_operations_state_check check (state in (
    'requested', 'queued', 'in_flight', 'unknown', 'succeeded',
    'failed_terminal', 'manual_review'
  ));

create unique index if not exists refund_operations_public_id_unique
  on commerce_private.refund_operations(public_id);

alter table commerce_private.invoices
  add column if not exists adjustment_kind text
    check (adjustment_kind is null or adjustment_kind in ('void', 'allowance')),
  add column if not exists adjustment_amount_twd integer
    check (
      adjustment_amount_twd is null
      or adjustment_amount_twd > 0
    ),
  add column if not exists adjustment_reason text
    check (
      adjustment_reason is null
      or char_length(btrim(adjustment_reason)) between 3 and 500
    ),
  add column if not exists last_evidence_hash text
    check (
      last_evidence_hash is null
      or last_evidence_hash ~ '^[a-f0-9]{64}$'
    ),
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table commerce_private.shipments
  add column if not exists last_evidence_hash text
    check (
      last_evidence_hash is null
      or last_evidence_hash ~ '^[a-f0-9]{64}$'
    ),
  add column if not exists cancellation_reason text
    check (
      cancellation_reason is null
      or char_length(btrim(cancellation_reason)) between 3 and 500
    ),
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table commerce_private.parcels
  add column if not exists tracking_id text;

create unique index if not exists parcels_tracking_id_unique
  on commerce_private.parcels(tracking_id)
  where tracking_id is not null;

-- A cancelled or definitively failed label may be recreated without erasing
-- the historical parcel assignment. Uniqueness therefore belongs to a
-- shipment, not to an order across its entire lifetime.
alter table commerce_private.parcels
  drop constraint if exists parcels_order_id_parcel_ordinal_key;
create unique index if not exists parcels_shipment_ordinal_unique
  on commerce_private.parcels(shipment_id, parcel_ordinal);
create unique index if not exists parcels_id_shipment_unique
  on commerce_private.parcels(id, shipment_id);

alter table commerce_private.parcel_units
  add column if not exists shipment_id uuid
    references commerce_private.shipments(id);
update commerce_private.parcel_units parcel_unit
set shipment_id = parcel.shipment_id
from commerce_private.parcels parcel
where parcel.id = parcel_unit.parcel_id
  and parcel_unit.shipment_id is null;
alter table commerce_private.parcel_units
  alter column shipment_id set not null,
  drop constraint if exists parcel_units_order_item_unit_id_key;
alter table commerce_private.parcel_units
  add constraint parcel_units_parcel_shipment_fk
  foreign key (parcel_id, shipment_id)
  references commerce_private.parcels(id, shipment_id);
create unique index if not exists parcel_units_shipment_unit_unique
  on commerce_private.parcel_units(shipment_id, order_item_unit_id);
create index if not exists parcel_units_parcel_shipment_fk_idx
  on commerce_private.parcel_units(parcel_id, shipment_id);

alter table commerce_private.return_cases
  add column if not exists requested_reason text
    check (
      requested_reason is null
      or char_length(btrim(requested_reason)) between 3 and 500
    ),
  add column if not exists decision_reason text
    check (
      decision_reason is null
      or char_length(btrim(decision_reason)) between 3 and 500
    ),
  add column if not exists decided_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists inspection_note text
    check (
      inspection_note is null
      or char_length(btrim(inspection_note)) between 3 and 500
    ),
  add column if not exists inspection_accepted boolean,
  add column if not exists disposition text
    check (
      disposition is null
      or disposition in ('sellable', 'damaged', 'rejected')
    ),
  add column if not exists inspected_at timestamptz;

-- Persist the same finite-state contracts enforced by the reducers. These
-- checks prevent privileged maintenance or a future adapter from introducing
-- states that the public/admin projections cannot interpret.
alter table commerce_private.orders
  add constraint orders_projection_status_check check (
    projection_status in (
      'awaiting_payment', 'paid', 'processing', 'cancel_requested',
      'cancelled', 'shipped', 'delivered', 'closed'
    )
  );

alter table commerce_private.payment_attempts
  add constraint payment_attempts_state_check check (
    state in (
      'created', 'redirect_ready', 'pending', 'verification_pending',
      'paid', 'unpaid'
    )
  );

alter table commerce_private.invoices
  add constraint invoices_state_check check (
    state in (
      'pending_issue', 'issuing', 'issued', 'issue_unknown', 'issue_failed',
      'adjustment_pending', 'adjusting', 'adjusted', 'voided',
      'adjustment_unknown', 'adjustment_failed', 'manual_review'
    )
  );

alter table commerce_private.shipments
  add constraint shipments_state_check check (
    state in (
      'draft', 'label_pending', 'creating', 'label_created',
      'manual_tracking', 'cancellation_pending', 'cancelling', 'cancelled',
      'picked_up', 'delivered', 'creation_unknown',
      'cancellation_unknown', 'manual_review', 'failed_terminal'
    )
  );

alter table commerce_private.return_cases
  add constraint return_cases_state_check check (
    state in (
      'requested', 'authorized', 'rejected', 'received', 'inspecting',
      'settlement_pending', 'closed'
    )
  );

alter table commerce_private.return_unit_dispositions
  add constraint return_unit_dispositions_state_check check (
    state in (
      'requested', 'authorized', 'rejected', 'received',
      'return_sellable', 'return_damaged', 'inspection_rejected'
    )
  );

alter table commerce_private.order_status_events
  add constraint order_status_events_from_state_check check (
    from_state is null
    or from_state in (
      'awaiting_payment', 'paid', 'processing', 'cancel_requested',
      'cancelled', 'shipped', 'delivered', 'closed'
    )
  ),
  add constraint order_status_events_to_state_check check (
    to_state in (
      'awaiting_payment', 'paid', 'processing', 'cancel_requested',
      'cancelled', 'shipped', 'delivered', 'closed'
    )
  );

alter table catalog_private.media_asset_transitions
  add constraint media_asset_transitions_from_status_check check (
    from_status is null
    or from_status in (
      'draft', 'review', 'live_approved', 'revocation_pending', 'revoked'
    )
  ),
  add constraint media_asset_transitions_to_status_check check (
    to_status in (
      'draft', 'review', 'live_approved', 'revocation_pending', 'revoked'
    )
  );

create table ops_private.support_case_notes (
  id uuid primary key default gen_random_uuid(),
  support_case_id uuid not null
    references ops_private.support_cases(id),
  operation_key text not null unique,
  note_kind text not null
    check (note_kind in ('opened', 'note', 'resolution')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index support_case_notes_support_case_id_fk_idx
  on ops_private.support_case_notes(support_case_id);
create index support_case_notes_created_by_fk_idx
  on ops_private.support_case_notes(created_by);

alter table ops_private.support_case_notes enable row level security;
alter table ops_private.support_case_notes force row level security;

create trigger support_case_notes_append_only
before update or delete on ops_private.support_case_notes
for each row execute function ops_private.reject_mutation();

grant select, insert on
  commerce_private.inventory_movements,
  commerce_private.payment_receipts,
  commerce_private.order_status_events,
  commerce_private.return_unit_dispositions,
  ops_private.support_case_notes
to backoffice_ops_owner;

grant select, update on
  commerce_private.inventory_balances,
  commerce_private.reservations,
  commerce_private.payment_attempts,
  commerce_private.orders
to backoffice_ops_owner;

grant select, insert, update on
  commerce_private.refund_operations,
  commerce_private.invoices,
  commerce_private.shipments,
  commerce_private.parcels,
  commerce_private.parcel_units
to backoffice_ops_owner;

grant select on
  commerce_private.order_item_units,
  catalog_private.product_variants
to backoffice_ops_owner;

grant insert on commerce_private.return_cases
  to backoffice_ops_owner;

create policy backoffice_ops_inventory_movements_select_authority
on commerce_private.inventory_movements
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_inventory_movements_insert_authority
on commerce_private.inventory_movements
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_inventory_balances_update_authority
on commerce_private.inventory_balances
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_reservations_select_authority
on commerce_private.reservations
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_reservations_update_authority
on commerce_private.reservations
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_payment_attempts_select_authority
on commerce_private.payment_attempts
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_payment_attempts_update_authority
on commerce_private.payment_attempts
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_orders_update_authority
on commerce_private.orders
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_payment_receipts_select_authority
on commerce_private.payment_receipts
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_payment_receipts_insert_authority
on commerce_private.payment_receipts
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_refund_operations_select_authority
on commerce_private.refund_operations
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_refund_operations_insert_authority
on commerce_private.refund_operations
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_refund_operations_update_authority
on commerce_private.refund_operations
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_invoices_select_authority
on commerce_private.invoices
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_invoices_insert_authority
on commerce_private.invoices
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_invoices_update_authority
on commerce_private.invoices
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_shipments_select_authority
on commerce_private.shipments
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_shipments_insert_authority
on commerce_private.shipments
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_shipments_update_authority
on commerce_private.shipments
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_parcels_select_authority
on commerce_private.parcels
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_parcels_insert_authority
on commerce_private.parcels
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_parcels_update_authority
on commerce_private.parcels
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_parcel_units_select_authority
on commerce_private.parcel_units
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_parcel_units_insert_authority
on commerce_private.parcel_units
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_order_item_units_select_authority
on commerce_private.order_item_units
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_variants_select_authority
on catalog_private.product_variants
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_return_cases_insert_authority
on commerce_private.return_cases
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_return_units_select_authority
on commerce_private.return_unit_dispositions
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_return_units_insert_authority
on commerce_private.return_unit_dispositions
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_return_units_update_authority
on commerce_private.return_unit_dispositions
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_order_status_select_authority
on commerce_private.order_status_events
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_order_status_insert_authority
on commerce_private.order_status_events
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_support_notes_select_authority
on ops_private.support_case_notes
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_support_notes_insert_authority
on ops_private.support_case_notes
for insert to backoffice_ops_owner with check (true);

grant select on ops_private.support_case_notes to backup_exporter;
create policy backup_exporter_select_support_case_notes
on ops_private.support_case_notes
for select to backup_exporter using (true);

revoke all on
  commerce_private.inventory_movements,
  commerce_private.payment_receipts,
  commerce_private.refund_operations,
  commerce_private.invoices,
  commerce_private.shipments,
  commerce_private.parcels,
  commerce_private.parcel_units,
  commerce_private.return_unit_dispositions,
  commerce_private.order_status_events,
  ops_private.support_case_notes
from public, anon, authenticated;

create or replace function ops_private.build_order_projection(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  order_row commerce_private.orders%rowtype;
  payment_status text;
  invoice_status text := 'not_requested';
  shipment_status text := 'not_created';
  return_status text := 'none';
  refund_status text := 'none';
  support_status text := 'none';
  refunded_total integer := 0;
  provider_trade_number text;
  invoice_relate_number text;
  tracking_identifiers jsonb := '[]'::jsonb;
  latest_state text;
begin
  select * into order_row
  from commerce_private.orders candidate
  where candidate.id = p_order_id;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(sum(refund.amount_twd), 0)::integer
  into refunded_total
  from commerce_private.refund_operations refund
  where refund.order_id = order_row.id
    and refund.state = 'succeeded';

  select receipt.provider_trade_no
  into provider_trade_number
  from commerce_private.payment_receipts receipt
  where receipt.id = order_row.applied_payment_receipt_id;

  if refunded_total >= order_row.total_gross_twd
    and order_row.total_gross_twd > 0
  then
    payment_status := 'refunded';
  elsif refunded_total > 0 then
    payment_status := 'partially_refunded';
  elsif order_row.applied_payment_receipt_id is not null then
    payment_status := 'paid';
  elsif exists (
    select 1
    from commerce_private.payment_attempts attempt
    where attempt.order_id = order_row.id
      and attempt.state = 'verification_pending'
  ) then
    payment_status := 'verification_pending';
  elsif order_row.payment_at_risk then
    payment_status := 'exception';
  else
    payment_status := 'pending';
  end if;

  select invoice.state, invoice.relate_number
  into latest_state, invoice_relate_number
  from commerce_private.invoices invoice
  where invoice.order_id = order_row.id
  order by invoice.created_at desc
  limit 1;
  if found then
    invoice_status := case
      when latest_state in ('pending_issue', 'issuing')
        then 'pending_issue'
      when latest_state = 'issued'
        then 'issued'
      when latest_state in ('adjustment_pending', 'adjusting')
        then 'adjustment_pending'
      when latest_state in ('adjusted', 'voided')
        then 'adjusted'
      else 'exception'
    end;
  end if;

  select shipment.state
  into latest_state
  from commerce_private.shipments shipment
  where shipment.order_id = order_row.id
    and shipment.direction = 'outbound'
  order by shipment.created_at desc
  limit 1;
  if found then
    shipment_status := case
      when latest_state in ('label_pending', 'creating')
        then 'label_pending'
      when latest_state = 'label_created'
        then 'label_created'
      when latest_state = 'manual_tracking'
        then 'manual_tracking'
      when latest_state in ('cancellation_pending', 'cancelling')
        then 'cancellation_pending'
      when latest_state = 'cancelled'
        then 'cancelled'
      when latest_state = 'picked_up'
        then 'picked_up'
      when latest_state = 'delivered'
        then 'delivered'
      else 'exception'
    end;
  end if;

  select coalesce(jsonb_agg(identifier order by identifier), '[]'::jsonb)
  into tracking_identifiers
  from (
    select shipment.tracking_id as identifier
    from commerce_private.shipments shipment
    where shipment.order_id = order_row.id
      and shipment.tracking_id is not null
    union
    select parcel.tracking_id
    from commerce_private.parcels parcel
    where parcel.order_id = order_row.id
      and parcel.tracking_id is not null
  ) tracking;

  select return_case.state
  into latest_state
  from commerce_private.return_cases return_case
  where return_case.order_id = order_row.id
  order by return_case.requested_at desc
  limit 1;
  if found then
    return_status := case
      when latest_state in (
        'requested', 'authorized', 'rejected', 'received',
        'inspecting', 'settlement_pending', 'closed'
      ) then latest_state
      else 'closed'
    end;
  end if;

  select refund.state
  into latest_state
  from commerce_private.refund_operations refund
  where refund.order_id = order_row.id
  order by refund.created_at desc
  limit 1;
  if found then
    refund_status := case
      when latest_state in (
        'requested', 'queued', 'in_flight', 'unknown', 'succeeded',
        'failed_terminal', 'manual_review'
      ) then latest_state
      else 'manual_review'
    end;
  end if;

  if exists (
    select 1
    from ops_private.support_cases support_case
    where support_case.order_id = order_row.id
      and support_case.state = 'open'
  ) then
    support_status := 'open';
  elsif exists (
    select 1
    from ops_private.support_cases support_case
    where support_case.order_id = order_row.id
  ) then
    support_status := 'resolved';
  end if;

  return jsonb_build_object(
    'id', order_row.id,
    'publicId', order_row.public_id,
    'version', order_row.row_version,
    'orderStatus', case
      when order_row.projection_status in (
        'awaiting_payment', 'paid', 'processing', 'cancel_requested',
        'cancelled', 'shipped', 'delivered', 'closed'
      ) then order_row.projection_status
      else 'awaiting_payment'
    end,
    'paymentStatus', payment_status,
    'invoiceStatus', invoice_status,
    'shipmentStatus', shipment_status,
    'returnStatus', return_status,
    'refundStatus', refund_status,
    'supportStatus', support_status,
    'totalGrossTwd', order_row.total_gross_twd,
    'refundedTwd', refunded_total,
    'merchantTradeNo', order_row.merchant_trade_no,
    'providerTradeNo', provider_trade_number,
    'invoiceRelateNumber', invoice_relate_number,
    'trackingIds', tracking_identifiers,
    'updatedAt', order_row.updated_at
  );
end
$function$;

revoke all on function ops_private.build_order_projection(uuid)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.build_order_projection(uuid)
  to backoffice_ops_owner;

create or replace function ops_private.refresh_order_projection(
  p_order_id uuid
)
returns ops_private.operation_projections
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  order_row commerce_private.orders%rowtype;
  projection_document jsonb;
  projection_row ops_private.operation_projections%rowtype;
begin
  select * into order_row
  from commerce_private.orders candidate
  where candidate.id = p_order_id;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  projection_document := ops_private.build_order_projection(p_order_id);
  insert into ops_private.operation_projections (
    aggregate_id,
    order_id,
    aggregate_kind,
    state,
    projection,
    row_version,
    updated_at
  ) values (
    order_row.id::text,
    order_row.id,
    'order',
    projection_document->>'orderStatus',
    projection_document,
    order_row.row_version,
    order_row.updated_at
  )
  on conflict (order_id) do update
  set
    aggregate_id = excluded.aggregate_id,
    state = excluded.state,
    projection = excluded.projection,
    row_version = excluded.row_version,
    updated_at = excluded.updated_at
  returning * into projection_row;
  return projection_row;
end
$function$;

revoke all on function ops_private.refresh_order_projection(uuid)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.refresh_order_projection(uuid)
  to backoffice_ops_owner;

create or replace function api.admin_operations_projection_get(
  p_aggregate_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  order_id_value uuid;
begin
  perform ops_private.require_admin_role(
    array['owner', 'fulfillment', 'support'], false
  );
  select candidate.id into order_id_value
  from commerce_private.orders candidate
  where candidate.id::text = p_aggregate_id
    or candidate.public_id = p_aggregate_id;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return ops_private.build_order_projection(order_id_value);
end
$function$;

alter function api.admin_operations_projection_get(text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_operations_projection_get(text)
  from public, anon;
grant execute on function api.admin_operations_projection_get(text)
  to authenticated;

create or replace function api.admin_operations_command(
  p_idempotency_key text,
  p_request_hash text,
  p_expected_version bigint,
  p_command_type text,
  p_aggregate_id text,
  p_payload jsonb
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
  order_row commerce_private.orders%rowtype;
  projection_row ops_private.operation_projections%rowtype;
  reservation_row commerce_private.reservations%rowtype;
  invoice_row commerce_private.invoices%rowtype;
  shipment_row commerce_private.shipments%rowtype;
  return_row commerce_private.return_cases%rowtype;
  refund_row commerce_private.refund_operations%rowtype;
  support_row ops_private.support_cases%rowtype;
  old_order_status text;
  next_order_status text;
  job_key text;
  job_kind text;
  job_type text;
  job_safety text;
  job_payload jsonb;
  references_value jsonb := '{}'::jsonb;
  result jsonb;
  reference_id text;
  entity_id uuid;
  parcel_count integer;
  parcel_ordinal integer;
  total_weight integer;
  delivered_at timestamptz;
  eligible_until timestamptz;
  requested_count integer;
  matched_count integer;
  remaining_refundable integer;
  movement record;
begin
  if p_command_type in ('invoice.adjust', 'refund.execute') then
    perform ops_private.require_admin_role(array['owner'], true);
  elsif p_command_type in (
    'shipment.create',
    'shipment.cancel',
    'shipment.manual_tracking',
    'return.receive',
    'return.inspect'
  ) then
    perform ops_private.require_admin_role(
      array['owner', 'fulfillment'], false
    );
  elsif p_command_type in (
    'order.cancel.request',
    'payment.reconcile',
    'invoice.issue',
    'return.open',
    'return.decision',
    'refund.request',
    'support.open',
    'support.note',
    'support.resolve'
  ) then
    perform ops_private.require_admin_role(array['owner', 'support'], false);
  else
    raise exception 'INVALID_OPERATIONS_COMMAND';
  end if;

  if p_expected_version < 1
    or coalesce(p_aggregate_id, '') = ''
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'type' is distinct from p_command_type
  then
    raise exception 'INVALID_OPERATIONS_COMMAND';
  end if;

  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'aggregateId', p_aggregate_id,
        'expectedVersion', p_expected_version,
        'commandType', p_command_type,
        'payload', p_payload
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'operations.command',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object(
      'replayed', true
    );
  end if;

  select * into order_row
  from commerce_private.orders candidate
  where candidate.id::text = p_aggregate_id
    or candidate.public_id = p_aggregate_id
  for update;
  if not found then
    raise exception 'OPERATIONS_AGGREGATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if order_row.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  old_order_status := order_row.projection_status;
  next_order_status := old_order_status;
  job_key := 'operations:' || p_idempotency_key || ':' || p_command_type;

  case p_command_type
    when 'order.cancel.request' then
      if char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
        or old_order_status in ('cancelled', 'closed')
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      next_order_status := 'cancel_requested';

      if order_row.applied_payment_receipt_id is null then
        select * into reservation_row
        from commerce_private.reservations reservation
        where reservation.order_id = order_row.id
          and reservation.state in ('active', 'release_pending')
        for update;
        if found then
          for movement in
            select item.sku_id, item.quantity
            from commerce_private.order_items item
            where item.order_id = order_row.id
            order by item.sku_id
          loop
            update commerce_private.inventory_balances balance
            set
              reserved = balance.reserved - movement.quantity,
              updated_at = now()
            where balance.sku_id = movement.sku_id
              and balance.reserved >= movement.quantity;
            if not found then
              raise exception 'INVENTORY_RESERVATION_INCONSISTENT';
            end if;
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
              p_idempotency_key || ':cancel-release:' ||
                movement.sku_id::text,
              movement.sku_id,
              'release',
              movement.quantity,
              0,
              -movement.quantity,
              order_row.id,
              reservation_row.id
            );
          end loop;
          update commerce_private.reservations
          set state = 'released', released_at = now()
          where id = reservation_row.id;
          next_order_status := 'cancelled';
        end if;
      end if;

    when 'payment.reconcile' then
      if coalesce(p_payload->>'merchantTradeNo', '')
          <> order_row.merchant_trade_no
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update commerce_private.payment_attempts attempt
      set state = 'verification_pending'
      where attempt.id = (
        select candidate.id
        from commerce_private.payment_attempts candidate
        where candidate.order_id = order_row.id
          and candidate.merchant_trade_no = order_row.merchant_trade_no
        order by candidate.attempt_number desc
        limit 1
      )
      returning attempt.id into entity_id;
      if not found then
        raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
      end if;
      job_type := 'payment.query';
      job_safety := 'safe_query';
      job_kind := 'reconciliation';
      job_payload := jsonb_build_object(
        'paymentAttemptId', entity_id,
        'merchantTradeNo', order_row.merchant_trade_no
      );

    when 'invoice.issue' then
      if order_row.applied_payment_receipt_id is null
        or jsonb_typeof(p_payload->'option') <> 'object'
        or exists (
          select 1
          from commerce_private.invoices invoice
          where invoice.order_id = order_row.id
            and invoice.state in (
              'pending_issue', 'issuing', 'issued',
              'adjustment_pending', 'adjusting'
            )
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      insert into commerce_private.invoices (
        order_id,
        relate_number,
        state,
        provider_operation_key
      ) values (
        order_row.id,
        'P' || substr(md5(job_key), 1, 31),
        'pending_issue',
        job_key
      )
      returning * into invoice_row;
      references_value := jsonb_build_object(
        'invoiceId', invoice_row.id::text
      );
      job_type := 'invoice.issue';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'invoiceId', invoice_row.id,
        'option', p_payload->'option',
        'totals', jsonb_build_object(
          'grossTwd', order_row.total_gross_twd,
          'netTwd', order_row.total_net_twd,
          'taxTwd', order_row.total_tax_twd
        )
      );

    when 'invoice.adjust' then
      if p_payload->>'kind' not in ('void', 'allowance')
        or coalesce(p_payload->>'relateNumber', '') = ''
        or coalesce((p_payload->>'amountTwd')::integer, 0) <= 0
        or char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into invoice_row
      from commerce_private.invoices invoice
      where invoice.order_id = order_row.id
        and invoice.relate_number = p_payload->>'relateNumber'
        and invoice.state = 'issued'
      order by invoice.created_at desc
      limit 1
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update commerce_private.invoices
      set
        state = 'adjustment_pending',
        provider_operation_key = job_key,
        adjustment_kind = p_payload->>'kind',
        adjustment_amount_twd = (p_payload->>'amountTwd')::integer,
        adjustment_reason = btrim(p_payload->>'reason'),
        row_version = row_version + 1,
        updated_at = now()
      where id = invoice_row.id;
      job_type := 'invoice.adjust';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'invoiceId', invoice_row.id,
        'kind', p_payload->>'kind',
        'relateNumber', invoice_row.relate_number,
        'amountTwd', (p_payload->>'amountTwd')::integer
      );

    when 'shipment.create' then
      parcel_count := coalesce((p_payload->>'parcelCount')::integer, 0);
      if order_row.applied_payment_receipt_id is null
        or parcel_count not between 1 and 3
        or exists (
          select 1
          from commerce_private.shipments shipment
          where shipment.order_id = order_row.id
            and shipment.direction = 'outbound'
            and shipment.state not in (
              'cancelled', 'failed_terminal'
            )
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      select coalesce(sum(
        variant.weight_grams * item.quantity
      ), 0)::integer
      into total_weight
      from commerce_private.order_items item
      join catalog_private.product_variants variant
        on variant.id = item.sku_id
      where item.order_id = order_row.id;
      if total_weight <= 0 then
        raise exception 'SHIPMENT_FACTS_INCOMPLETE';
      end if;
      insert into commerce_private.shipments (
        order_id,
        direction,
        state,
        provider_operation_key
      ) values (
        order_row.id,
        'outbound',
        'label_pending',
        job_key
      )
      returning * into shipment_row;
      for parcel_ordinal in 1..parcel_count
      loop
        insert into commerce_private.parcels (
          shipment_id,
          order_id,
          parcel_ordinal,
          declared_value_twd,
          weight_grams
        ) values (
          shipment_row.id,
          order_row.id,
          parcel_ordinal,
          case
            when parcel_ordinal = 1 then
              order_row.total_gross_twd -
              (order_row.total_gross_twd / parcel_count) *
              (parcel_count - 1)
            else order_row.total_gross_twd / parcel_count
          end,
          greatest(1, ceiling(total_weight::numeric / parcel_count)::integer)
        );
      end loop;
      with ranked_units as (
        select
          unit.id,
          row_number() over (
            order by item.id, unit.unit_ordinal
          ) as sequence
        from commerce_private.order_items item
        join commerce_private.order_item_units unit
          on unit.order_item_id = item.id
        where item.order_id = order_row.id
      )
      insert into commerce_private.parcel_units (
        parcel_id,
        shipment_id,
        order_item_unit_id,
        order_id
      )
      select
        parcel.id,
        shipment_row.id,
        ranked_units.id,
        order_row.id
      from ranked_units
      join commerce_private.parcels parcel
        on parcel.shipment_id = shipment_row.id
        and parcel.parcel_ordinal =
          ((ranked_units.sequence - 1) % parcel_count) + 1;
      references_value := jsonb_build_object(
        'shipmentId', shipment_row.id::text
      );
      job_type := 'shipment.create';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'shipmentId', shipment_row.id,
        'parcelCount', parcel_count
      );

    when 'shipment.cancel' then
      if char_length(coalesce(p_payload->>'trackingId', ''))
          not between 3 and 80
        or char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into shipment_row
      from commerce_private.shipments shipment
      where shipment.order_id = order_row.id
        and shipment.direction = 'outbound'
        and shipment.state in ('label_created', 'manual_tracking')
        and (
          shipment.tracking_id = p_payload->>'trackingId'
          or exists (
            select 1
            from commerce_private.parcels parcel
            where parcel.shipment_id = shipment.id
              and parcel.tracking_id = p_payload->>'trackingId'
          )
        )
      order by shipment.created_at desc
      limit 1
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update commerce_private.shipments
      set
        state = 'cancellation_pending',
        provider_operation_key = job_key,
        cancellation_reason = btrim(p_payload->>'reason'),
        row_version = row_version + 1,
        updated_at = now()
      where id = shipment_row.id;
      job_type := 'shipment.cancel';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'shipmentId', shipment_row.id,
        'trackingId', p_payload->>'trackingId'
      );

    when 'shipment.manual_tracking' then
      if char_length(coalesce(p_payload->>'trackingId', ''))
          not between 3 and 80
        or order_row.applied_payment_receipt_id is null
        or exists (
          select 1
          from commerce_private.shipments active_shipment
          where active_shipment.order_id = order_row.id
            and active_shipment.direction = 'outbound'
            and active_shipment.state in (
              'label_created', 'manual_tracking',
              'cancellation_pending', 'cancelling', 'picked_up',
              'delivered'
            )
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      select * into shipment_row
      from commerce_private.shipments shipment
      where shipment.order_id = order_row.id
        and shipment.direction = 'outbound'
        and shipment.state in (
          'label_pending', 'creating', 'creation_unknown',
          'failed_terminal'
        )
      order by shipment.created_at desc
      limit 1
      for update;
      if found then
        update commerce_private.shipments
        set
          state = 'manual_tracking',
          tracking_id = p_payload->>'trackingId',
          row_version = row_version + 1,
          updated_at = now()
        where id = shipment_row.id;
      else
        insert into commerce_private.shipments (
          order_id,
          direction,
          state,
          tracking_id
        ) values (
          order_row.id,
          'outbound',
          'manual_tracking',
          p_payload->>'trackingId'
        )
        returning * into shipment_row;
      end if;
      next_order_status := 'shipped';
      references_value := jsonb_build_object(
        'shipmentId', shipment_row.id::text
      );

    when 'shipment.status.update' then
      if char_length(coalesce(p_payload->>'trackingId', ''))
          not between 3 and 80
        or p_payload->>'state' not in ('picked_up', 'delivered')
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into shipment_row
      from commerce_private.shipments shipment
      where shipment.order_id = order_row.id
        and shipment.direction = 'outbound'
        and (
          shipment.tracking_id = p_payload->>'trackingId'
          or exists (
            select 1
            from commerce_private.parcels parcel
            where parcel.shipment_id = shipment.id
              and parcel.tracking_id = p_payload->>'trackingId'
          )
        )
        and (
          (
            p_payload->>'state' = 'picked_up'
            and shipment.state in ('label_created', 'manual_tracking')
          )
          or (
            p_payload->>'state' = 'delivered'
            and shipment.state in (
              'label_created', 'manual_tracking', 'picked_up'
            )
          )
        )
      order by shipment.created_at desc
      limit 1
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update commerce_private.shipments
      set
        state = p_payload->>'state',
        row_version = row_version + 1,
        updated_at = now()
      where id = shipment_row.id;
      next_order_status := case
        when p_payload->>'state' = 'delivered' then 'delivered'
        else 'shipped'
      end;
      references_value := jsonb_build_object(
        'shipmentId', shipment_row.id::text
      );

    when 'return.open' then
      if jsonb_typeof(p_payload->'unitIds') <> 'array'
        or jsonb_array_length(p_payload->'unitIds') not between 1 and 10
        or char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
        or old_order_status <> 'delivered'
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      select max(event.occurred_at) into delivered_at
      from commerce_private.order_status_events event
      where event.order_id = order_row.id
        and event.to_state = 'delivered';
      eligible_until := delivered_at + interval '14 days';
      if delivered_at is null or now() > eligible_until then
        raise exception 'RETURN_WINDOW_CLOSED';
      end if;
      select count(distinct requested.value), count(*)
      into matched_count, requested_count
      from jsonb_array_elements_text(
        p_payload->'unitIds'
      ) as requested(value);
      if matched_count <> requested_count then
        raise exception 'INVALID_RETURN_UNITS';
      end if;
      select count(*) into matched_count
      from commerce_private.order_item_units unit
      join commerce_private.order_items item
        on item.id = unit.order_item_id
      where item.order_id = order_row.id
        and unit.id::text in (
          select requested.value
          from jsonb_array_elements_text(
            p_payload->'unitIds'
          ) as requested(value)
        )
        and not exists (
          select 1
          from commerce_private.return_unit_dispositions disposition
          join commerce_private.return_cases existing_return
            on existing_return.id = disposition.return_case_id
          where disposition.order_item_unit_id = unit.id
            and existing_return.state not in ('rejected', 'closed')
        );
      if matched_count <> requested_count then
        raise exception 'INVALID_RETURN_UNITS';
      end if;
      reference_id := 'return-' || substr(
        md5(order_row.id::text || ':' || p_idempotency_key),
        1,
        20
      );
      insert into commerce_private.return_cases (
        order_id,
        public_id,
        state,
        requested_reason
      ) values (
        order_row.id,
        reference_id,
        'requested',
        btrim(p_payload->>'reason')
      )
      returning * into return_row;
      insert into commerce_private.return_unit_dispositions (
        return_case_id,
        order_item_unit_id,
        state,
        return_eligible_until
      )
      select
        return_row.id,
        unit.id,
        'requested',
        eligible_until
      from commerce_private.order_item_units unit
      join commerce_private.order_items item
        on item.id = unit.order_item_id
      where item.order_id = order_row.id
        and unit.id::text in (
          select requested.value
          from jsonb_array_elements_text(
            p_payload->'unitIds'
          ) as requested(value)
        );
      references_value := jsonb_build_object(
        'returnId', return_row.public_id
      );

    when 'return.decision' then
      if p_payload->>'decision' not in ('authorize', 'reject')
        or char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into return_row
      from commerce_private.return_cases return_case
      where return_case.order_id = order_row.id
        and (
          return_case.public_id = p_payload->>'returnId'
          or return_case.id::text = p_payload->>'returnId'
        )
        and return_case.state = 'requested'
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      update commerce_private.return_cases
      set
        state = case
          when p_payload->>'decision' = 'authorize'
            then 'authorized'
          else 'rejected'
        end,
        decision_reason = btrim(p_payload->>'reason'),
        decided_at = now(),
        closed_at = case
          when p_payload->>'decision' = 'reject' then now()
          else null
        end,
        row_version = row_version + 1,
        updated_at = now()
      where id = return_row.id;
      update commerce_private.return_unit_dispositions
      set state = case
        when p_payload->>'decision' = 'authorize'
          then 'authorized'
        else 'rejected'
      end
      where return_case_id = return_row.id;
      references_value := jsonb_build_object(
        'returnId', return_row.public_id
      );

    when 'return.receive' then
      if jsonb_typeof(p_payload->'receivedUnitIds') <> 'array'
        or jsonb_array_length(p_payload->'receivedUnitIds')
          not between 1 and 10
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into return_row
      from commerce_private.return_cases return_case
      where return_case.order_id = order_row.id
        and (
          return_case.public_id = p_payload->>'returnId'
          or return_case.id::text = p_payload->>'returnId'
        )
        and return_case.state in ('authorized', 'received')
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      select count(distinct received.value), count(*)
      into matched_count, requested_count
      from jsonb_array_elements_text(
        p_payload->'receivedUnitIds'
      ) as received(value);
      if matched_count <> requested_count then
        raise exception 'INVALID_RETURN_UNITS';
      end if;
      update commerce_private.return_unit_dispositions disposition
      set state = 'received'
      where disposition.return_case_id = return_row.id
        and disposition.state in ('authorized', 'received')
        and disposition.order_item_unit_id::text in (
          select received.value
          from jsonb_array_elements_text(
            p_payload->'receivedUnitIds'
          ) as received(value)
        );
      get diagnostics matched_count = row_count;
      if matched_count <> requested_count then
        raise exception 'INVALID_RETURN_UNITS';
      end if;
      update commerce_private.return_cases
      set
        state = 'received',
        received_at = coalesce(received_at, now()),
        row_version = row_version + 1,
        updated_at = now()
      where id = return_row.id;
      references_value := jsonb_build_object(
        'returnId', return_row.public_id
      );

    when 'return.inspect' then
      if p_payload->>'accepted' not in ('true', 'false')
        or p_payload->>'disposition' not in ('sellable', 'damaged')
        or char_length(btrim(coalesce(p_payload->>'note', '')))
          not between 3 and 500
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into return_row
      from commerce_private.return_cases return_case
      where return_case.order_id = order_row.id
        and (
          return_case.public_id = p_payload->>'returnId'
          or return_case.id::text = p_payload->>'returnId'
        )
        and return_case.state in ('received', 'inspecting')
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      if (p_payload->>'accepted')::boolean then
        for movement in
          select unit.id as unit_id, unit.sku_id
          from commerce_private.return_unit_dispositions disposition
          join commerce_private.order_item_units unit
            on unit.id = disposition.order_item_unit_id
          where disposition.return_case_id = return_row.id
            and disposition.state = 'received'
          order by unit.sku_id, unit.id
        loop
          if p_payload->>'disposition' = 'sellable' then
            update commerce_private.inventory_balances
            set on_hand = on_hand + 1, updated_at = now()
            where sku_id = movement.sku_id;
            if not found then
              raise exception 'INVENTORY_BALANCE_NOT_FOUND';
            end if;
          end if;
          insert into commerce_private.inventory_movements (
            operation_key,
            sku_id,
            kind,
            quantity,
            delta_on_hand,
            delta_reserved,
            order_id
          ) values (
            p_idempotency_key || ':return:' || movement.unit_id::text,
            movement.sku_id,
            case
              when p_payload->>'disposition' = 'sellable'
                then 'return_sellable'
              else 'return_damaged'
            end,
            1,
            case
              when p_payload->>'disposition' = 'sellable' then 1
              else 0
            end,
            0,
            order_row.id
          );
        end loop;
        update commerce_private.return_unit_dispositions
        set state = case
          when p_payload->>'disposition' = 'sellable'
            then 'return_sellable'
          else 'return_damaged'
        end
        where return_case_id = return_row.id
          and state = 'received';
      else
        update commerce_private.return_unit_dispositions
        set state = 'inspection_rejected'
        where return_case_id = return_row.id
          and state = 'received';
      end if;
      update commerce_private.return_cases
      set
        state = case
          when (p_payload->>'accepted')::boolean
            then 'settlement_pending'
          else 'closed'
        end,
        inspection_note = btrim(p_payload->>'note'),
        inspection_accepted = (p_payload->>'accepted')::boolean,
        disposition = case
          when (p_payload->>'accepted')::boolean
            then p_payload->>'disposition'
          else 'rejected'
        end,
        inspected_at = now(),
        closed_at = case
          when (p_payload->>'accepted')::boolean then null
          else now()
        end,
        row_version = row_version + 1,
        updated_at = now()
      where id = return_row.id;
      references_value := jsonb_build_object(
        'returnId', return_row.public_id
      );

    when 'refund.request' then
      if coalesce((p_payload->>'amountTwd')::integer, 0) <= 0
        or char_length(btrim(coalesce(p_payload->>'reason', '')))
          not between 3 and 500
        or order_row.applied_payment_receipt_id is null
        or exists (
          select 1
          from commerce_private.refund_operations pending_refund
          where pending_refund.order_id = order_row.id
            and pending_refund.state in (
              'requested', 'queued', 'in_flight', 'unknown',
              'manual_review'
            )
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      if not exists (
        select 1
        from commerce_private.payment_receipts receipt
        where receipt.id = order_row.applied_payment_receipt_id
          and receipt.provider_trade_no =
            p_payload->>'providerTradeNo'
      ) then
        raise exception 'PAYMENT_RECEIPT_MISMATCH';
      end if;
      select order_row.total_gross_twd -
        coalesce(sum(refund.amount_twd), 0)::integer
      into remaining_refundable
      from commerce_private.refund_operations refund
      where refund.order_id = order_row.id
        and refund.state = 'succeeded';
      if (p_payload->>'amountTwd')::integer > remaining_refundable then
        raise exception 'REFUND_AMOUNT_EXCEEDS_REMAINING';
      end if;
      reference_id := 'refund-' || substr(
        md5(order_row.id::text || ':' || p_idempotency_key),
        1,
        20
      );
      insert into commerce_private.refund_operations (
        operation_key,
        public_id,
        order_id,
        payment_receipt_id,
        reason,
        amount_twd,
        state
      ) values (
        'refund-request:' || p_idempotency_key,
        reference_id,
        order_row.id,
        order_row.applied_payment_receipt_id,
        p_payload->>'reason',
        (p_payload->>'amountTwd')::integer,
        'requested'
      )
      returning * into refund_row;
      references_value := jsonb_build_object(
        'refundId', refund_row.public_id
      );

    when 'refund.execute' then
      select * into refund_row
      from commerce_private.refund_operations refund
      where refund.order_id = order_row.id
        and (
          refund.public_id = p_payload->>'refundId'
          or refund.id::text = p_payload->>'refundId'
        )
        and refund.state = 'requested'
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      select receipt.provider_trade_no into reference_id
      from commerce_private.payment_receipts receipt
      where receipt.id = refund_row.payment_receipt_id;
      if reference_id is null then
        raise exception 'PAYMENT_RECEIPT_MISMATCH';
      end if;
      update commerce_private.refund_operations
      set
        state = 'queued',
        operation_key = job_key,
        row_version = row_version + 1,
        updated_at = now()
      where id = refund_row.id;
      job_type := 'payment.refund';
      job_safety := 'remote_effect';
      job_kind := 'provider';
      job_payload := jsonb_build_object(
        'refundOperationId', refund_row.id,
        'refundId', refund_row.public_id,
        'providerTradeNo', reference_id,
        'amountTwd', refund_row.amount_twd
      );

    when 'support.open' then
      if char_length(btrim(coalesce(p_payload->>'subject', '')))
          not between 3 and 160
        or char_length(btrim(coalesce(p_payload->>'note', '')))
          not between 1 and 4000
        or exists (
          select 1
          from ops_private.support_cases existing_case
          where existing_case.order_id = order_row.id
            and existing_case.state = 'open'
        )
      then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      reference_id := 'case-' || substr(
        md5(order_row.id::text || ':' || p_idempotency_key),
        1,
        20
      );
      insert into ops_private.support_cases (
        public_id,
        order_id,
        state,
        created_by
      ) values (
        reference_id,
        order_row.id,
        'open',
        actor_id
      )
      returning * into support_row;
      insert into ops_private.support_case_notes (
        support_case_id,
        operation_key,
        note_kind,
        body,
        created_by
      ) values (
        support_row.id,
        p_idempotency_key || ':support-open',
        'opened',
        p_payload->>'subject' || E'\n\n' || p_payload->>'note',
        actor_id
      );
      references_value := jsonb_build_object(
        'caseId', support_row.public_id
      );

    when 'support.note' then
      if char_length(btrim(coalesce(p_payload->>'note', '')))
          not between 1 and 4000
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into support_row
      from ops_private.support_cases support_case
      where support_case.order_id = order_row.id
        and support_case.public_id = p_payload->>'caseId'
        and support_case.state = 'open'
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      insert into ops_private.support_case_notes (
        support_case_id,
        operation_key,
        note_kind,
        body,
        created_by
      ) values (
        support_row.id,
        p_idempotency_key || ':support-note',
        'note',
        p_payload->>'note',
        actor_id
      );
      update ops_private.support_cases
      set row_version = row_version + 1, updated_at = now()
      where id = support_row.id;

    when 'support.resolve' then
      if char_length(btrim(coalesce(p_payload->>'resolution', '')))
          not between 3 and 1000
      then
        raise exception 'INVALID_OPERATIONS_COMMAND';
      end if;
      select * into support_row
      from ops_private.support_cases support_case
      where support_case.order_id = order_row.id
        and support_case.public_id = p_payload->>'caseId'
        and support_case.state = 'open'
      for update;
      if not found then
        raise exception 'INVALID_OPERATIONS_TRANSITION';
      end if;
      insert into ops_private.support_case_notes (
        support_case_id,
        operation_key,
        note_kind,
        body,
        created_by
      ) values (
        support_row.id,
        p_idempotency_key || ':support-resolution',
        'resolution',
        p_payload->>'resolution',
        actor_id
      );
      update ops_private.support_cases
      set
        state = 'resolved',
        row_version = row_version + 1,
        updated_at = now()
      where id = support_row.id;
  end case;

  update commerce_private.orders
  set
    projection_status = next_order_status,
    cancel_reason = case
      when p_command_type = 'order.cancel.request'
        then btrim(p_payload->>'reason')
      else cancel_reason
    end,
    cancel_requested_at = case
      when p_command_type = 'order.cancel.request'
        then coalesce(cancel_requested_at, now())
      else cancel_requested_at
    end,
    row_version = row_version + 1,
    updated_at = now()
  where id = order_row.id
    and row_version = p_expected_version
  returning * into order_row;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  if next_order_status is distinct from old_order_status then
    insert into commerce_private.order_status_events (
      order_id,
      event_type,
      from_state,
      to_state,
      operation_key
    ) values (
      order_row.id,
      p_command_type,
      old_order_status,
      next_order_status,
      p_idempotency_key || ':order-status'
    );
  end if;

  if job_type is not null then
    insert into ops_private.operation_jobs (
      operation_key,
      kind,
      command_type,
      safety,
      aggregate_id,
      payload
    ) values (
      job_key,
      job_kind,
      job_type,
      job_safety,
      order_row.id::text,
      job_payload
    );
  end if;

  insert into ops_private.outbox_jobs (
    operation_key,
    job_type,
    aggregate_id,
    payload
  ) values (
    'operations-notification:' || p_idempotency_key,
    'order.operation.recorded',
    order_row.id,
    jsonb_build_object(
      'schemaVersion', 1,
      'commandType', p_command_type,
      'orderId', order_row.id,
      'references', references_value
    )
  );

  projection_row :=
    ops_private.refresh_order_projection(order_row.id);

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
    'operations.command',
    'order',
    order_row.id::text,
    array[
      'authoritative_records',
      'order_status_events',
      'operation_jobs',
      'outbox_jobs',
      'operation_projection'
    ],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'projection', projection_row.projection,
    'enqueuedOperationKeys', case
      when job_type is null then '[]'::jsonb
      else jsonb_build_array(job_key)
    end,
    'references', references_value
  );
  return ops_private.admin_command_finish(
    actor_id,
    'operations.command',
    p_idempotency_key,
    projection_row.id,
    result
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_OPERATIONS_COMMAND';
end
$function$;

alter function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) from public, anon;
grant execute on function api.admin_operations_command(
  text, text, bigint, text, text, jsonb
) to authenticated;

create or replace function ops_private.reduce_operation_job(
  p_job_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  job ops_private.operation_jobs%rowtype;
  order_row commerce_private.orders%rowtype;
  attempt_row commerce_private.payment_attempts%rowtype;
  receipt_row commerce_private.payment_receipts%rowtype;
  refund_row commerce_private.refund_operations%rowtype;
  invoice_row commerce_private.invoices%rowtype;
  shipment_row commerce_private.shipments%rowtype;
  reservation_row commerce_private.reservations%rowtype;
  old_order_status text;
  next_order_status text;
  domain_changed boolean := false;
  semantic_review boolean := false;
  review_code text;
  result_amount integer;
  refunded_total integer;
  tracking_count integer;
  parcel_count integer;
  movement record;
begin
  select * into job
  from ops_private.operation_jobs candidate
  where candidate.id = p_job_id
  for update;
  if not found then
    raise exception 'OPERATION_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into order_row
  from commerce_private.orders candidate
  where candidate.id::text = job.aggregate_id
    or candidate.public_id = job.aggregate_id
  for update;
  if not found then
    return;
  end if;

  old_order_status := order_row.projection_status;
  next_order_status := old_order_status;

  case job.command_type
    when 'payment.query' then
      select * into attempt_row
      from commerce_private.payment_attempts attempt
      where attempt.order_id = order_row.id
        and (
          (
            coalesce(job.payload->>'paymentAttemptId', '') ~
              '^[a-f0-9-]{36}$'
            and attempt.id =
              (job.payload->>'paymentAttemptId')::uuid
          )
          or attempt.merchant_trade_no =
            job.payload->>'merchantTradeNo'
        )
      order by attempt.attempt_number desc
      limit 1
      for update;

      if job.state = 'completed'
        and job.result->>'tradeStatus' = 'paid'
      then
        if not found
          or coalesce(job.result->>'providerTradeNo', '') = ''
          or job.evidence_hash is null
          or coalesce(job.result->>'amountTwd', '') !~ '^[0-9]+$'
        then
          semantic_review := true;
          review_code := 'PAYMENT_EVIDENCE_INCOMPLETE';
        else
          result_amount := (job.result->>'amountTwd')::integer;
          if result_amount <> order_row.total_gross_twd
            or result_amount <> attempt_row.amount_twd
          then
            semantic_review := true;
            review_code := 'PAYMENT_AMOUNT_MISMATCH';
          else
            insert into commerce_private.payment_receipts (
              order_id,
              payment_attempt_id,
              provider,
              provider_trade_no,
              amount_twd,
              evidence_hash,
              provider_paid_at,
              received_at
            ) values (
              order_row.id,
              attempt_row.id,
              'ecpay',
              job.result->>'providerTradeNo',
              result_amount,
              job.evidence_hash,
              p_now,
              p_now
            )
            on conflict (provider_trade_no) do nothing;

            select * into receipt_row
            from commerce_private.payment_receipts receipt
            where receipt.provider_trade_no =
              job.result->>'providerTradeNo';
            if receipt_row.order_id is distinct from order_row.id
              or receipt_row.payment_attempt_id is distinct from attempt_row.id
              or receipt_row.amount_twd is distinct from result_amount
            then
              semantic_review := true;
              review_code := 'PAYMENT_RECEIPT_CONFLICT';
            end if;
          end if;
        end if;

        if semantic_review then
          update commerce_private.orders
          set payment_at_risk = true
          where id = order_row.id;
          if attempt_row.id is not null then
            update commerce_private.payment_attempts
            set state = 'verification_pending'
            where id = attempt_row.id;
          end if;
        else
          update commerce_private.payment_attempts
          set state = 'paid'
          where id = attempt_row.id;
          update commerce_private.orders
          set
            applied_payment_receipt_id = receipt_row.id,
            payment_at_risk = false
          where id = order_row.id;
          next_order_status := 'paid';

          select * into reservation_row
          from commerce_private.reservations reservation
          where reservation.order_id = order_row.id
            and reservation.state = 'active'
          for update;
          if found then
            if exists (
              select 1
              from commerce_private.order_items item
              left join commerce_private.inventory_balances balance
                on balance.sku_id = item.sku_id
              where item.order_id = order_row.id
                and (
                  balance.sku_id is null
                  or balance.reserved < item.quantity
                  or balance.on_hand < item.quantity
                )
            ) then
              update commerce_private.orders
              set payment_at_risk = true
              where id = order_row.id;
            else
              for movement in
                select item.sku_id, item.quantity
                from commerce_private.order_items item
                where item.order_id = order_row.id
                order by item.sku_id
              loop
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
                  job.operation_key || ':sale:' ||
                    movement.sku_id::text,
                  movement.sku_id,
                  'sale',
                  movement.quantity,
                  -movement.quantity,
                  -movement.quantity,
                  order_row.id,
                  reservation_row.id
                )
                on conflict (operation_key) do nothing;
                if found then
                  update commerce_private.inventory_balances
                  set
                    on_hand = on_hand - movement.quantity,
                    reserved = reserved - movement.quantity,
                    updated_at = p_now
                  where sku_id = movement.sku_id;
                end if;
              end loop;
              update commerce_private.reservations
              set state = 'consumed', consumed_at = p_now
              where id = reservation_row.id;
            end if;
          end if;
        end if;
        domain_changed := true;
      elsif job.state = 'completed'
        and job.result->>'tradeStatus' = 'unpaid'
      then
        if attempt_row.id is not null then
          update commerce_private.payment_attempts
          set state = 'unpaid'
          where id = attempt_row.id;
        end if;
        domain_changed := true;
      elsif job.state = 'completed' then
        semantic_review := true;
        review_code := 'PAYMENT_QUERY_RESULT_INVALID';
      elsif job.state in ('unknown', 'manual_review', 'dead_letter') then
        if attempt_row.id is not null then
          update commerce_private.payment_attempts
          set state = 'verification_pending'
          where id = attempt_row.id;
        end if;
        update commerce_private.orders
        set payment_at_risk = true
        where id = order_row.id;
        domain_changed := true;
      end if;

    when 'payment.refund' then
      if coalesce(job.payload->>'refundOperationId', '') !~
          '^[a-f0-9-]{36}$'
      then
        semantic_review := true;
        review_code := 'REFUND_AUTHORITY_REFERENCE_INVALID';
      else
        select * into refund_row
        from commerce_private.refund_operations refund
        where refund.id =
            (job.payload->>'refundOperationId')::uuid
          and refund.order_id = order_row.id
        for update;
        if not found then
          semantic_review := true;
          review_code := 'REFUND_AUTHORITY_NOT_FOUND';
        elsif job.state = 'completed'
          and job.result->>'state' is distinct from 'succeeded'
        then
          semantic_review := true;
          review_code := 'REFUND_RESULT_INVALID';
        else
          update commerce_private.refund_operations
          set
            state = case
              when job.state = 'completed'
                and job.result->>'state' = 'succeeded'
                then 'succeeded'
              when job.state = 'unknown' then 'unknown'
              when job.state = 'manual_review' then 'manual_review'
              when job.state = 'dead_letter' then 'failed_terminal'
              else state
            end,
            row_version = row_version + 1,
            updated_at = p_now
          where id = refund_row.id;
          domain_changed := true;

          if job.state = 'completed'
            and job.result->>'state' = 'succeeded'
          then
            select coalesce(sum(refund.amount_twd), 0)::integer
            into refunded_total
            from commerce_private.refund_operations refund
            where refund.order_id = order_row.id
              and refund.state = 'succeeded';
            if refunded_total >= order_row.total_gross_twd then
              next_order_status := 'closed';
            end if;
            update commerce_private.return_cases
            set
              state = 'closed',
              closed_at = p_now,
              row_version = row_version + 1,
              updated_at = p_now
            where order_id = order_row.id
              and state = 'settlement_pending';
          end if;
        end if;
      end if;

    when 'invoice.issue', 'invoice.adjust' then
      if coalesce(job.payload->>'invoiceId', '') !~
          '^[a-f0-9-]{36}$'
      then
        semantic_review := true;
        review_code := 'INVOICE_AUTHORITY_REFERENCE_INVALID';
      else
        select * into invoice_row
        from commerce_private.invoices invoice
        where invoice.id = (job.payload->>'invoiceId')::uuid
          and invoice.order_id = order_row.id
        for update;
        if not found then
          semantic_review := true;
          review_code := 'INVOICE_AUTHORITY_NOT_FOUND';
        elsif job.command_type = 'invoice.issue'
          and job.state = 'completed'
          and job.result->>'state' is distinct from 'issued'
        then
          semantic_review := true;
          review_code := 'INVOICE_ISSUE_RESULT_INVALID';
        elsif job.command_type = 'invoice.adjust'
          and job.state = 'completed'
          and job.result->>'state' is distinct from 'succeeded'
        then
          semantic_review := true;
          review_code := 'INVOICE_ADJUST_RESULT_INVALID';
        elsif job.command_type = 'invoice.issue' then
          update commerce_private.invoices
          set
            state = case
              when job.state = 'completed'
                and job.result->>'state' = 'issued'
                then 'issued'
              when job.state = 'unknown' then 'issue_unknown'
              when job.state = 'manual_review' then 'manual_review'
              when job.state = 'dead_letter' then 'issue_failed'
              else state
            end,
            relate_number = case
              when job.state = 'completed'
                and coalesce(job.result->>'relateNumber', '') <> ''
                then job.result->>'relateNumber'
              else relate_number
            end,
            issued_at = case
              when job.state = 'completed'
                and job.result->>'state' = 'issued'
                then p_now
              else issued_at
            end,
            last_evidence_hash = job.evidence_hash,
            row_version = row_version + 1,
            updated_at = p_now
          where id = invoice_row.id;
          domain_changed := true;
        else
          update commerce_private.invoices
          set
            state = case
              when job.state = 'completed'
                and job.result->>'state' = 'succeeded'
                and job.payload->>'kind' = 'void'
                then 'voided'
              when job.state = 'completed'
                and job.result->>'state' = 'succeeded'
                then 'adjusted'
              when job.state = 'unknown'
                then 'adjustment_unknown'
              when job.state = 'manual_review'
                then 'manual_review'
              when job.state = 'dead_letter'
                then 'adjustment_failed'
              else state
            end,
            last_evidence_hash = job.evidence_hash,
            row_version = row_version + 1,
            updated_at = p_now
          where id = invoice_row.id;
          domain_changed := true;
        end if;
      end if;

    when 'shipment.create', 'shipment.cancel' then
      if coalesce(job.payload->>'shipmentId', '') !~
          '^[a-f0-9-]{36}$'
      then
        semantic_review := true;
        review_code := 'SHIPMENT_AUTHORITY_REFERENCE_INVALID';
      else
        select * into shipment_row
        from commerce_private.shipments shipment
        where shipment.id = (job.payload->>'shipmentId')::uuid
          and shipment.order_id = order_row.id
        for update;
        if not found then
          semantic_review := true;
          review_code := 'SHIPMENT_AUTHORITY_NOT_FOUND';
        elsif job.command_type = 'shipment.create'
          and job.state = 'completed'
          and job.result->>'state' is distinct from 'created'
        then
          semantic_review := true;
          review_code := 'SHIPMENT_CREATE_RESULT_INVALID';
        elsif job.command_type = 'shipment.cancel'
          and job.state = 'completed'
          and job.result->>'state' is distinct from 'cancelled'
          and job.result->>'state' is distinct from 'picked_up'
        then
          semantic_review := true;
          review_code := 'SHIPMENT_CANCEL_RESULT_INVALID';
        elsif job.command_type = 'shipment.create'
          and job.state = 'completed'
          and job.result->>'state' = 'created'
        then
          if jsonb_typeof(job.result->'trackingIds') <> 'array' then
            semantic_review := true;
            review_code := 'SHIPMENT_TRACKING_EVIDENCE_INVALID';
          else
            select count(*) into tracking_count
            from jsonb_array_elements_text(
              job.result->'trackingIds'
            );
            select count(*) into parcel_count
            from commerce_private.parcels parcel
            where parcel.shipment_id = shipment_row.id;
            if tracking_count <> parcel_count or tracking_count < 1 then
              semantic_review := true;
              review_code := 'SHIPMENT_TRACKING_COUNT_MISMATCH';
            else
              update commerce_private.parcels parcel
              set tracking_id = tracking.tracking_id
              from (
                select
                  tracking_id,
                  ordinality::integer as parcel_ordinal
                from jsonb_array_elements_text(
                  job.result->'trackingIds'
                ) with ordinality as item(tracking_id, ordinality)
              ) tracking
              where parcel.shipment_id = shipment_row.id
                and parcel.parcel_ordinal = tracking.parcel_ordinal;
              update commerce_private.shipments
              set
                state = 'label_created',
                tracking_id = job.result->'trackingIds'->>0,
                last_evidence_hash = job.evidence_hash,
                row_version = row_version + 1,
                updated_at = p_now
              where id = shipment_row.id;
              domain_changed := true;
            end if;
          end if;
        elsif job.command_type = 'shipment.cancel'
          and job.state = 'completed'
        then
          update commerce_private.shipments
          set
            state = case
              when job.result->>'state' = 'picked_up'
                then 'picked_up'
              else 'cancelled'
            end,
            last_evidence_hash = job.evidence_hash,
            row_version = row_version + 1,
            updated_at = p_now
          where id = shipment_row.id;
          domain_changed := true;
        elsif job.state in ('unknown', 'manual_review', 'dead_letter') then
          update commerce_private.shipments
          set
            state = case
              when job.command_type = 'shipment.create'
                and job.state = 'unknown'
                then 'creation_unknown'
              when job.command_type = 'shipment.cancel'
                and job.state = 'unknown'
                then 'cancellation_unknown'
              when job.state = 'manual_review'
                then 'manual_review'
              else 'failed_terminal'
            end,
            last_evidence_hash = job.evidence_hash,
            row_version = row_version + 1,
            updated_at = p_now
          where id = shipment_row.id;
          domain_changed := true;
        end if;
      end if;

    when 'email.send' then
      null;
  end case;

  if semantic_review then
    update ops_private.operation_jobs
    set
      state = 'manual_review',
      error_code = review_code,
      row_version = row_version + 1,
      updated_at = p_now,
      completed_at = p_now
    where id = job.id
    returning * into job;
    domain_changed := true;
  end if;

  if domain_changed then
    update commerce_private.orders
    set
      projection_status = next_order_status,
      row_version = row_version + 1,
      updated_at = p_now
    where id = order_row.id
    returning * into order_row;

    if next_order_status is distinct from old_order_status then
      insert into commerce_private.order_status_events (
        order_id,
        event_type,
        from_state,
        to_state,
        operation_key,
        evidence_hash,
        occurred_at
      ) values (
        order_row.id,
        job.command_type || '.' || job.state,
        old_order_status,
        next_order_status,
        job.operation_key || ':order-status:' || job.state,
        job.evidence_hash,
        p_now
      )
      on conflict (order_id, operation_key) do nothing;
    end if;

    perform ops_private.refresh_order_projection(order_row.id);

    insert into ops_private.outbox_jobs (
      operation_key,
      job_type,
      aggregate_id,
      payload
    ) values (
      'operations-result:' || job.operation_key || ':' || job.state,
      'order.operation.result',
      order_row.id,
      jsonb_build_object(
        'schemaVersion', 1,
        'commandType', job.command_type,
        'operationState', job.state,
        'orderId', order_row.id
      )
    )
    on conflict (operation_key) do nothing;
  end if;
end
$function$;

revoke all on function ops_private.reduce_operation_job(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function ops_private.reduce_operation_job(uuid, timestamptz)
  to backoffice_ops_owner;

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
      and candidate.safety in ('safe_query', 'retry_safe')
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
    error_code = 'SAFE_LEASE_EXPIRED_REQUEUED',
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
        and state = 'queued';
      authority_changed := found;
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
        and state in ('pending_issue', 'adjustment_pending');
      authority_changed := found;
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
        and state in ('label_pending', 'cancellation_pending');
      authority_changed := found;
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
    and not authority_changed
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

alter function api.worker_operations_claim(text, timestamptz, integer)
  owner to backoffice_ops_owner;
revoke all on function api.worker_operations_claim(
  text, timestamptz, integer
) from public, anon, authenticated;
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
        then 'queued'
      else 'unknown'
    end;
    error_code_value := case
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
      'evidence_hash',
      'result',
      'error_code',
      'authoritative_records',
      'row_version'
    ],
    job.operation_key
  );

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

alter function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) owner to backoffice_ops_owner;
revoke all on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function api.worker_operations_complete(
  text, text, text, text, jsonb, text, integer, timestamptz
) to worker_rpc_caller, service_role;

alter table catalog_private.release_batches
  add column if not exists chapter_id uuid
    references catalog_private.chapters(id),
  add column if not exists updated_at timestamptz not null default now();

create index release_batches_chapter_id_fk_idx
  on catalog_private.release_batches(chapter_id)
  where chapter_id is not null;

grant select, insert, update on catalog_private.release_batches
  to backoffice_ops_owner;
grant select, insert, delete on catalog_private.release_batch_products
  to backoffice_ops_owner;
grant select on
  catalog_private.product_readiness_checks,
  catalog_private.price_versions,
  catalog_private.catalog_state
to backoffice_ops_owner;
grant insert on catalog_private.product_publications
  to backoffice_ops_owner;
grant update on catalog_private.catalog_state
  to backoffice_ops_owner;
grant insert on ops_private.cache_invalidation_jobs
  to backoffice_ops_owner;
grant usage on schema extensions to backoffice_ops_owner;
grant execute on function extensions.digest(bytea, text)
  to backoffice_ops_owner;
grant execute on function catalog_private.build_publication_snapshot(uuid)
  to backoffice_ops_owner;

create policy backoffice_ops_release_batches_select
on catalog_private.release_batches
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_release_batches_insert
on catalog_private.release_batches
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_release_batches_update
on catalog_private.release_batches
for update to backoffice_ops_owner using (true) with check (true);
create policy backoffice_ops_release_products_select
on catalog_private.release_batch_products
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_release_products_insert
on catalog_private.release_batch_products
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_release_products_delete
on catalog_private.release_batch_products
for delete to backoffice_ops_owner using (true);
create policy backoffice_ops_readiness_select
on catalog_private.product_readiness_checks
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_prices_select
on catalog_private.price_versions
for select to backoffice_ops_owner using (true);
create policy backoffice_ops_catalog_state_select
on catalog_private.catalog_state
for select to backoffice_ops_owner using (singleton);
create policy backoffice_ops_catalog_state_update
on catalog_private.catalog_state
for update to backoffice_ops_owner using (singleton) with check (singleton);
create policy backoffice_ops_publications_insert
on catalog_private.product_publications
for insert to backoffice_ops_owner with check (true);
create policy backoffice_ops_cache_insert
on ops_private.cache_invalidation_jobs
for insert to backoffice_ops_owner with check (true);

create or replace function catalog_private.release_batch_document(
  p_batch_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', batch.id,
    'code', batch.code,
    'name', batch.title,
    'chapterId', batch.chapter_id,
    'chapterCode', chapter.code,
    'state', batch.status,
    'status', batch.status,
    'requiredProductCount', batch.required_product_count,
    'productIds', coalesce((
      select jsonb_agg(link.product_id order by product.launch_position)
      from catalog_private.release_batch_products link
      join catalog_private.products product on product.id = link.product_id
      where link.release_batch_id = batch.id
    ), '[]'::jsonb),
    'version', batch.row_version,
    'rowVersion', batch.row_version,
    'publishedAt', batch.published_at,
    'createdAt', batch.created_at,
    'updatedAt', batch.updated_at
  )
  from catalog_private.release_batches batch
  left join catalog_private.chapters chapter on chapter.id = batch.chapter_id
  where batch.id = p_batch_id
$function$;

alter function catalog_private.release_batch_document(uuid)
  owner to backoffice_ops_owner;
revoke all on function catalog_private.release_batch_document(uuid)
  from public, anon, authenticated, service_role;

create or replace function api.admin_release_batch_list()
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
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        catalog_private.release_batch_document(batch.id)
        order by batch.created_at desc
      )
      from catalog_private.release_batches batch
    ), '[]'::jsonb)
  );
end
$function$;

alter function api.admin_release_batch_list() owner to backoffice_ops_owner;
revoke all on function api.admin_release_batch_list() from public, anon;
grant execute on function api.admin_release_batch_list() to authenticated;

create or replace function api.admin_release_batch_create(
  p_chapter_id uuid,
  p_name text,
  p_product_ids uuid[],
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  batch_id uuid := gen_random_uuid();
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
  if coalesce(btrim(p_name), '') = ''
    or coalesce(array_length(p_product_ids, 1), 0) < 1
    or not exists (
      select 1 from catalog_private.chapters
      where id = p_chapter_id and status = 'active'
    )
    or (
      select count(distinct requested_id)
      from unnest(p_product_ids) as requested(requested_id)
    ) <> array_length(p_product_ids, 1)
  then
    raise exception 'INVALID_RELEASE_BATCH';
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'release_batch.create', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  insert into catalog_private.release_batches (
    id, code, title, status, required_product_count, chapter_id
  ) values (
    batch_id,
    'series-' || substr(replace(batch_id::text, '-', ''), 1, 12),
    btrim(p_name),
    'draft',
    array_length(p_product_ids, 1),
    p_chapter_id
  );
  insert into catalog_private.release_batch_products (
    release_batch_id, product_id
  )
  select batch_id, requested.product_id
  from unnest(p_product_ids) as requested(product_id)
  join catalog_private.products product on product.id = requested.product_id
  where product.chapter_id = p_chapter_id and product.status <> 'archived';
  if (select count(*) from catalog_private.release_batch_products
      where release_batch_id = batch_id) <> array_length(p_product_ids, 1)
  then
    raise exception 'RELEASE_BATCH_PRODUCT_MISMATCH';
  end if;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'release_batch.create', 'release_batch', batch_id::text,
    array['title', 'chapter_id', 'products'], p_idempotency_key
  );
  result := catalog_private.release_batch_document(batch_id);
  return ops_private.admin_command_finish(
    actor_id, 'release_batch.create', p_idempotency_key, batch_id, result
  );
end
$function$;

alter function api.admin_release_batch_create(
  uuid, text, uuid[], text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_release_batch_create(
  uuid, text, uuid[], text, text
) from public, anon;
grant execute on function api.admin_release_batch_create(
  uuid, text, uuid[], text, text
) to authenticated;

create or replace function api.admin_release_batch_save(
  p_batch_id uuid,
  p_expected_version bigint,
  p_name text,
  p_product_ids uuid[],
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  batch catalog_private.release_batches%rowtype;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner', 'merchandiser'], false);
  command_state := ops_private.admin_command_begin(
    actor_id, 'release_batch.save', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  select * into batch from catalog_private.release_batches
  where id = p_batch_id for update;
  if not found then raise exception 'RELEASE_BATCH_NOT_FOUND'; end if;
  if batch.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if batch.status = 'published'
    or coalesce(btrim(p_name), '') = ''
    or coalesce(array_length(p_product_ids, 1), 0) < 1
  then
    raise exception 'INVALID_RELEASE_BATCH_UPDATE';
  end if;
  delete from catalog_private.release_batch_products
  where release_batch_id = p_batch_id;
  insert into catalog_private.release_batch_products (
    release_batch_id, product_id
  )
  select p_batch_id, requested.product_id
  from unnest(p_product_ids) as requested(product_id)
  join catalog_private.products product on product.id = requested.product_id
  where product.chapter_id = batch.chapter_id and product.status <> 'archived';
  if (select count(*) from catalog_private.release_batch_products
      where release_batch_id = p_batch_id) <> array_length(p_product_ids, 1)
  then
    raise exception 'RELEASE_BATCH_PRODUCT_MISMATCH';
  end if;
  update catalog_private.release_batches
  set
    title = btrim(p_name),
    required_product_count = array_length(p_product_ids, 1),
    row_version = row_version + 1,
    updated_at = now()
  where id = p_batch_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'release_batch.save', 'release_batch', p_batch_id::text,
    array['title', 'products', 'row_version'], p_idempotency_key
  );
  result := catalog_private.release_batch_document(p_batch_id);
  return ops_private.admin_command_finish(
    actor_id, 'release_batch.save', p_idempotency_key, p_batch_id, result
  );
end
$function$;

alter function api.admin_release_batch_save(
  uuid, bigint, text, uuid[], text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_release_batch_save(
  uuid, bigint, text, uuid[], text, text
) from public, anon;
grant execute on function api.admin_release_batch_save(
  uuid, bigint, text, uuid[], text, text
) to authenticated;

create or replace function api.admin_release_batch_readiness_set(
  p_batch_id uuid,
  p_expected_version bigint,
  p_state text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  if p_state not in ('draft', 'review', 'ready', 'blocked') then
    raise exception 'INVALID_RELEASE_BATCH_STATE';
  end if;
  command_state := ops_private.admin_command_begin(
    actor_id, 'release_batch.readiness', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  update catalog_private.release_batches
  set
    status = p_state,
    row_version = row_version + 1,
    updated_at = now()
  where id = p_batch_id
    and row_version = p_expected_version
    and status <> 'published';
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'release_batch.readiness', 'release_batch',
    p_batch_id::text, array['status', 'row_version'], p_idempotency_key
  );
  result := catalog_private.release_batch_document(p_batch_id);
  return ops_private.admin_command_finish(
    actor_id, 'release_batch.readiness', p_idempotency_key, p_batch_id, result
  );
end
$function$;

alter function api.admin_release_batch_readiness_set(
  uuid, bigint, text, text, text
) owner to backoffice_ops_owner;
revoke all on function api.admin_release_batch_readiness_set(
  uuid, bigint, text, text, text
) from public, anon;
grant execute on function api.admin_release_batch_readiness_set(
  uuid, bigint, text, text, text
) to authenticated;

create or replace function api.admin_release_batch_publish(
  p_batch_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  batch catalog_private.release_batches%rowtype;
  item record;
  publication_snapshot jsonb;
  publication_hash text;
  publication_id uuid;
  publication_version integer;
  next_catalog_revision bigint;
  published_count integer := 0;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id, 'release_batch.publish', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  select * into batch from catalog_private.release_batches
  where id = p_batch_id for update;
  if not found then raise exception 'RELEASE_BATCH_NOT_FOUND'; end if;
  if batch.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if batch.status <> 'ready' then
    raise exception 'RELEASE_BATCH_NOT_READY';
  end if;
  if (
    select count(*) from catalog_private.release_batch_products
    where release_batch_id = p_batch_id
  ) <> batch.required_product_count then
    raise exception 'RELEASE_BATCH_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
    from catalog_private.release_batch_products link
    join catalog_private.products product on product.id = link.product_id
    where link.release_batch_id = p_batch_id
      and (
        product.status = 'archived'
        or jsonb_typeof(product.material_concepts) <> 'array'
        or jsonb_array_length(product.material_concepts) < 1
        or jsonb_typeof(product.option_axes) <> 'array'
        or jsonb_array_length(product.option_axes) < 1
        or not exists (
          select 1 from catalog_private.product_readiness_checks readiness
          where readiness.product_id = product.id
        )
        or exists (
          select 1 from catalog_private.product_readiness_checks readiness
          where readiness.product_id = product.id and readiness.state <> 'passed'
        )
        or not exists (
          select 1 from catalog_private.product_variants variant
          where variant.product_id = product.id
            and variant.enabled and variant.archived_at is null
        )
        or exists (
          select 1
          from catalog_private.product_variants variant
          left join commerce_private.inventory_balances balance
            on balance.sku_id = variant.id
          where variant.product_id = product.id
            and variant.enabled and variant.archived_at is null
            and (
              variant.facts_status <> 'approved'
              or balance.sku_id is null
              or balance.on_hand - balance.reserved - balance.safety_stock <= 0
              or not exists (
                select 1 from catalog_private.price_versions price
                where price.product_variant_id = variant.id
                  and price.status = 'approved'
                  and now() >= price.valid_from
                  and (price.valid_until is null or now() < price.valid_until)
              )
            )
        )
        or not exists (
          select 1
          from catalog_private.product_media media
          join catalog_private.media_assets asset
            on asset.id = media.media_asset_id
          where media.product_id = product.id
            and media.role = 'main'
            and asset.status = 'live_approved'
            and asset.backup_acknowledged_at is not null
        )
      )
  ) then
    raise exception 'RELEASE_BATCH_PRODUCT_NOT_PUBLISHABLE';
  end if;

  for item in
    select
      product.id,
      product.slug,
      product.row_version,
      product.active_publication_id
    from catalog_private.release_batch_products link
    join catalog_private.products product on product.id = link.product_id
    where link.release_batch_id = p_batch_id
    order by product.launch_position
    for update of product
  loop
    publication_snapshot :=
      catalog_private.build_publication_snapshot(item.id);
    publication_hash := encode(
      extensions.digest(convert_to(publication_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );
    select coalesce(max(version), 0) + 1 into publication_version
    from catalog_private.product_publications where product_id = item.id;
    insert into catalog_private.product_publications (
      product_id, version, snapshot, content_sha256, release_batch_id,
      supersedes_id, published_by, publisher_scope
    ) values (
      item.id, publication_version, publication_snapshot, publication_hash,
      p_batch_id, item.active_publication_id, actor_id, 'admin'
    )
    returning id into publication_id;
    update catalog_private.products
    set
      active_publication_id = publication_id,
      status = 'published',
      published_at = coalesce(published_at, now()),
      archived_at = null,
      slug_locked_at = coalesce(slug_locked_at, now()),
      row_version = row_version + 1,
      updated_at = now()
    where id = item.id and row_version = item.row_version;
    if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    published_count := published_count + 1;
  end loop;

  update catalog_private.catalog_state
  set revision = revision + 1, updated_at = now()
  where singleton returning revision into next_catalog_revision;
  update catalog_private.release_batches
  set
    status = 'published',
    published_at = now(),
    row_version = row_version + 1,
    updated_at = now()
  where id = p_batch_id and row_version = p_expected_version;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
  insert into ops_private.cache_invalidation_jobs (
    operation_key, tags, safety_revision
  ) values (
    'catalog-batch:' || p_batch_id::text || ':' || next_catalog_revision::text,
    array['catalog', 'series:' || batch.code, 'category', 'sitemap'],
    next_catalog_revision
  );
  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'release_batch.publish', 'release_batch',
    p_batch_id::text,
    array['status', 'published_at', 'product_publications', 'catalog_revision'],
    p_idempotency_key
  );
  result := catalog_private.release_batch_document(p_batch_id) ||
    jsonb_build_object(
    'publishedProductCount', published_count,
    'catalogRevision', next_catalog_revision
  );
  return ops_private.admin_command_finish(
    actor_id, 'release_batch.publish', p_idempotency_key, p_batch_id, result
  );
end
$function$;

alter function api.admin_release_batch_publish(uuid, bigint, text, text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_release_batch_publish(
  uuid, bigint, text, text
) from public, anon;
grant execute on function api.admin_release_batch_publish(
  uuid, bigint, text, text
) to authenticated;

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

create or replace function api.admin_runtime_controls_update(
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  controls ops_private.runtime_controls%rowtype;
  next_controls ops_private.runtime_controls%rowtype;
  changed_fields text[] := '{}';
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id, 'runtime_controls.update', p_idempotency_key, p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  if jsonb_typeof(p_payload) <> 'object'
    or p_payload = '{}'::jsonb
    or p_payload - array[
      'commerceLive',
      'checkoutEnabled',
      'productionCanaryEnabled',
      'ecpayApplePayEnabled',
      'searchIndexEnabled',
      'catalogEmergencyNoCache',
      'mediaEmergencyNoCache'
    ]::text[] <> '{}'::jsonb
    or exists (
      select 1
      from jsonb_each(p_payload) field
      where jsonb_typeof(field.value) <> 'boolean'
    )
  then
    raise exception 'INVALID_RUNTIME_CONTROLS_PAYLOAD';
  end if;

  select * into controls
  from ops_private.runtime_controls
  where singleton
  for update;
  if controls.revision <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  next_controls := controls;
  if p_payload ? 'commerceLive' then
    next_controls.commerce_live := (p_payload->>'commerceLive')::boolean;
    changed_fields := array_append(changed_fields, 'commerce_live');
  end if;
  if p_payload ? 'checkoutEnabled' then
    next_controls.checkout_enabled :=
      (p_payload->>'checkoutEnabled')::boolean;
    changed_fields := array_append(changed_fields, 'checkout_enabled');
  end if;
  if p_payload ? 'productionCanaryEnabled' then
    next_controls.production_canary_enabled :=
      (p_payload->>'productionCanaryEnabled')::boolean;
    changed_fields :=
      array_append(changed_fields, 'production_canary_enabled');
  end if;
  if p_payload ? 'ecpayApplePayEnabled' then
    next_controls.ecpay_apple_pay_enabled :=
      (p_payload->>'ecpayApplePayEnabled')::boolean;
    changed_fields :=
      array_append(changed_fields, 'ecpay_apple_pay_enabled');
  end if;
  if p_payload ? 'searchIndexEnabled' then
    next_controls.search_index_enabled :=
      (p_payload->>'searchIndexEnabled')::boolean;
    changed_fields := array_append(changed_fields, 'search_index_enabled');
  end if;
  if p_payload ? 'catalogEmergencyNoCache' then
    next_controls.catalog_emergency_no_cache :=
      (p_payload->>'catalogEmergencyNoCache')::boolean;
    changed_fields :=
      array_append(changed_fields, 'catalog_emergency_no_cache');
  end if;
  if p_payload ? 'mediaEmergencyNoCache' then
    next_controls.media_emergency_no_cache :=
      (p_payload->>'mediaEmergencyNoCache')::boolean;
    changed_fields :=
      array_append(changed_fields, 'media_emergency_no_cache');
  end if;

  if next_controls.checkout_enabled and not next_controls.commerce_live then
    raise exception 'CHECKOUT_REQUIRES_COMMERCE_LIVE';
  end if;
  if next_controls.ecpay_apple_pay_enabled
    and not next_controls.checkout_enabled
  then
    raise exception 'APPLE_PAY_REQUIRES_CHECKOUT';
  end if;

  update ops_private.runtime_controls
  set
    revision = revision + 1,
    commerce_live = next_controls.commerce_live,
    checkout_enabled = next_controls.checkout_enabled,
    production_canary_enabled = next_controls.production_canary_enabled,
    ecpay_apple_pay_enabled = next_controls.ecpay_apple_pay_enabled,
    search_index_enabled = next_controls.search_index_enabled,
    catalog_emergency_no_cache =
      next_controls.catalog_emergency_no_cache,
    media_emergency_no_cache =
      next_controls.media_emergency_no_cache,
    updated_at = now()
  where singleton and revision = p_expected_version
  returning * into next_controls;
  if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;

  insert into ops_private.audit_events (
    actor_scope, actor_id, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'admin', actor_id, 'runtime_controls.update', 'runtime_controls',
    'singleton', changed_fields || array['revision'], p_idempotency_key
  );
  insert into ops_private.cache_invalidation_jobs (
    operation_key, tags, safety_revision
  ) values (
    'runtime-controls:' || next_controls.revision::text,
    array['runtime-controls', 'catalog', 'checkout', 'media'],
    greatest(
      next_controls.revision,
      next_controls.media_safety_revision
    )
  );

  result := jsonb_build_object(
    'version', next_controls.revision,
    'mediaSafetyRevision', next_controls.media_safety_revision,
    'commerceLive', next_controls.commerce_live,
    'checkoutEnabled', next_controls.checkout_enabled,
    'productionCanaryEnabled', next_controls.production_canary_enabled,
    'ecpayApplePayEnabled', next_controls.ecpay_apple_pay_enabled,
    'searchIndexEnabled', next_controls.search_index_enabled,
    'catalogEmergencyNoCache',
      next_controls.catalog_emergency_no_cache,
    'mediaEmergencyNoCache',
      next_controls.media_emergency_no_cache,
    'updatedAt', next_controls.updated_at
  );
  return ops_private.admin_command_finish(
    actor_id,
    'runtime_controls.update',
    p_idempotency_key,
    '00000000-0000-4000-8000-000000000001'::uuid,
    result
  );
end
$function$;

alter function api.admin_runtime_controls_update(
  bigint, text, text, jsonb
) owner to backoffice_ops_owner;
revoke all on function api.admin_runtime_controls_update(
  bigint, text, text, jsonb
) from public, anon;
grant execute on function api.admin_runtime_controls_update(
  bigint, text, text, jsonb
) to authenticated;

create or replace function api.bootstrap_estate_no01(
  p_snapshot jsonb,
  p_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  product_count integer;
  sku_count integer;
  next_catalog_revision bigint;
  item record;
  product_document jsonb;
  sku_documents jsonb;
  publication_snapshot jsonb;
  publication_hash text;
  publication_id uuid;
  publication_version integer;
begin
  if auth.jwt()->>'role' <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_digest !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_snapshot) <> 'object'
    or (p_snapshot->>'schemaVersion')::integer <> 1
    or jsonb_typeof(p_snapshot->'products') <> 'array'
    or jsonb_typeof(p_snapshot->'skus') <> 'array'
  then
    raise exception 'INVALID_BOOTSTRAP_SNAPSHOT';
  end if;
  product_count := jsonb_array_length(p_snapshot->'products');
  sku_count := jsonb_array_length(p_snapshot->'skus');
  if product_count <> 50 or sku_count <> 189 then
    raise exception 'ESTATE_BOOTSTRAP_COUNT_MISMATCH';
  end if;

  if exists (
    select 1 from catalog_private.estate_bootstrap_imports
    where digest = p_digest
  ) then
    return (
      select jsonb_build_object(
        'digest', digest,
        'schemaVersion', schema_version,
        'productCount', product_count,
        'skuCount', sku_count,
        'catalogRevision', catalog_revision,
        'replayed', true
      )
      from catalog_private.estate_bootstrap_imports
      where digest = p_digest
    );
  end if;
  if exists (select 1 from catalog_private.estate_bootstrap_imports)
    or exists (
      select 1 from catalog_private.products
      where active_publication_id is not null
    )
  then
    raise exception 'ESTATE_BOOTSTRAP_ALREADY_COMMITTED';
  end if;

  if (
    select count(*)
    from catalog_private.products product
    where product.product_code ~ '^LIG-ENO1-[0-9]{3}$'
      and exists (
        select 1
        from jsonb_array_elements(p_snapshot->'products') document
        where document->>'id' = product.slug
          and document->>'slug' = product.slug
          and document->>'productCode' = product.product_code
          and (document->>'launchPosition')::integer = product.launch_position
      )
  ) <> 50 then
    raise exception 'ESTATE_PRODUCT_IDENTITY_MISMATCH';
  end if;
  if (
    select count(*)
    from catalog_private.product_variants variant
    join catalog_private.products product on product.id = variant.product_id
    where product.product_code ~ '^LIG-ENO1-[0-9]{3}$'
      and exists (
        select 1
        from jsonb_array_elements(p_snapshot->'skus') document
        where document->>'id' = variant.public_id
          and document->>'skuCode' = variant.sku_code
          and document->>'productId' = product.slug
      )
  ) <> 189 then
    raise exception 'ESTATE_SKU_IDENTITY_MISMATCH';
  end if;

  for item in
    select product.*
    from catalog_private.products product
    where product.product_code ~ '^LIG-ENO1-[0-9]{3}$'
    order by product.launch_position
    for update
  loop
    select document into product_document
    from jsonb_array_elements(p_snapshot->'products') document
    where document->>'id' = item.slug;
    select coalesce(jsonb_agg(document order by document->>'skuCode'), '[]'::jsonb)
    into sku_documents
    from jsonb_array_elements(p_snapshot->'skus') document
    where document->>'productId' = item.slug;
    if jsonb_array_length(sku_documents) < 1 then
      raise exception 'ESTATE_PRODUCT_WITHOUT_SKUS';
    end if;
    publication_snapshot := jsonb_build_object(
      'product', product_document - 'launchGateCodes',
      'skus', sku_documents,
      'media', '[]'::jsonb
    );
    publication_hash := encode(
      extensions.digest(convert_to(publication_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );
    publication_version := 1;
    insert into catalog_private.product_publications (
      product_id, version, snapshot, content_sha256, release_batch_id,
      supersedes_id, published_by, publisher_scope
    ) values (
      item.id,
      publication_version,
      publication_snapshot,
      publication_hash,
      '60000000-0000-4000-8000-000000000001',
      null,
      null,
      'system'
    )
    returning id into publication_id;

    update catalog_private.products
    set
      audience = product_document->>'audience',
      kind = product_document->>'kind',
      subtitle_zh = product_document->>'subtitle',
      description = product_document->>'description',
      story = product_document->>'story',
      sizing = product_document->>'sizing',
      care = product_document->>'care',
      material_concepts = product_document->'materialConcepts',
      option_axes = product_document->'optionAxes',
      launch_gate_codes = array(
        select code
        from jsonb_array_elements_text(product_document->'launchGateCodes') code
      ),
      active_publication_id = publication_id,
      status = 'published',
      published_at = now(),
      slug_locked_at = now(),
      row_version = row_version + 1,
      updated_at = now()
    where id = item.id;
  end loop;

  update catalog_private.release_batches
  set
    status = 'published',
    published_at = now(),
    row_version = row_version + 1,
    updated_at = now()
  where id = '60000000-0000-4000-8000-000000000001';
  update catalog_private.catalog_state
  set revision = revision + 1, updated_at = now()
  where singleton
  returning revision into next_catalog_revision;
  insert into catalog_private.estate_bootstrap_imports (
    digest, schema_version, product_count, sku_count, catalog_revision
  ) values (
    p_digest, 1, product_count, sku_count, next_catalog_revision
  );
  insert into ops_private.cache_invalidation_jobs (
    operation_key, tags, safety_revision
  ) values (
    'estate-no01-bootstrap:' || p_digest,
    array['catalog', 'estate-no-01', 'category', 'sitemap'],
    next_catalog_revision
  );
  insert into ops_private.audit_events (
    actor_scope, action, entity_type, entity_id,
    changed_fields, request_id
  ) values (
    'system', 'estate.bootstrap', 'release_batch',
    '60000000-0000-4000-8000-000000000001',
    array['product_publications', 'catalog_revision'],
    'estate-bootstrap:' || p_digest
  );
  return jsonb_build_object(
    'digest', p_digest,
    'schemaVersion', 1,
    'productCount', product_count,
    'skuCount', sku_count,
    'catalogRevision', next_catalog_revision,
    'replayed', false
  );
end
$function$;

revoke all on function api.bootstrap_estate_no01(jsonb, text)
  from public, anon, authenticated;
grant execute on function api.bootstrap_estate_no01(jsonb, text)
  to service_role;

-- The deterministic bootstrap runs with the same narrowly-scoped catalog
-- owner as normal backoffice publication. It does not inherit postgres'
-- superuser or RLS-bypass powers.
grant select, insert on catalog_private.estate_bootstrap_imports
  to backoffice_ops_owner;

create policy backoffice_ops_estate_bootstrap_select
on catalog_private.estate_bootstrap_imports
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_estate_bootstrap_insert
on catalog_private.estate_bootstrap_imports
for insert to backoffice_ops_owner
with check (true);

alter function api.bootstrap_estate_no01(jsonb, text)
  owner to backoffice_ops_owner;

-- Forced RLS also applies to the deliberately read-only backup principal.
grant select on
  ops_private.media_upload_intents,
  ops_private.admin_invite_operations,
  ops_private.owner_recovery_requests,
  ops_private.support_cases,
  ops_private.support_case_media,
  ops_private.worker_command_receipts,
  ops_private.operation_projections,
  ops_private.operation_jobs,
  catalog_private.estate_bootstrap_imports
to backup_exporter;

create policy backup_exporter_select_media_upload_intents
on ops_private.media_upload_intents
for select to backup_exporter
using (true);

create policy backup_exporter_select_admin_invite_operations
on ops_private.admin_invite_operations
for select to backup_exporter
using (true);

create policy backup_exporter_select_owner_recovery_requests
on ops_private.owner_recovery_requests
for select to backup_exporter
using (true);

create policy backup_exporter_select_support_cases
on ops_private.support_cases
for select to backup_exporter
using (true);

create policy backup_exporter_select_support_case_media
on ops_private.support_case_media
for select to backup_exporter
using (true);

create policy backup_exporter_select_worker_command_receipts
on ops_private.worker_command_receipts
for select to backup_exporter
using (true);

create policy backup_exporter_select_operation_projections
on ops_private.operation_projections
for select to backup_exporter
using (true);

create policy backup_exporter_select_operation_jobs
on ops_private.operation_jobs
for select to backup_exporter
using (true);

create policy backup_exporter_select_estate_bootstrap_imports
on catalog_private.estate_bootstrap_imports
for select to backup_exporter
using (true);

-- Private tables and trigger helpers stay unreachable through PostgREST.
revoke all on
  ops_private.media_upload_intents,
  ops_private.admin_invite_operations,
  ops_private.owner_recovery_requests,
  ops_private.support_cases,
  ops_private.support_case_media,
  ops_private.worker_command_receipts,
  ops_private.operation_projections,
  ops_private.operation_jobs,
  catalog_private.estate_bootstrap_imports
from public, anon, authenticated;

revoke all on function catalog_private.validate_publication_snapshot()
  from public, anon, authenticated;

alter default privileges in schema catalog_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema catalog_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema commerce_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema commerce_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema ops_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema ops_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api
  revoke execute on functions from public, anon, authenticated;

comment on table ops_private.operation_jobs is
  'Durable command jobs. Expired leases become unknown and require reconciliation; potentially successful provider effects are never blindly replayed.';
comment on table ops_private.worker_command_receipts is
  'Idempotency receipts for server-only worker claim/completion commands; a key cannot be reused with a different request hash.';
comment on function api.public_media_resolve(text, text) is
  'Resolves only active-publication, live-approved, non-tombstoned product derivatives. Returns no storage credential.';
comment on function api.catalog_snapshot_read() is
  'Returns schema-v1 published products/SKUs plus immutable gallery media and active category/chapter taxonomy.';
comment on function api.public_runtime_controls_read() is
  'Returns only public-safe launch, checkout, indexing and emergency-cache switches.';
comment on function api.worker_auth_recovery_claim(
  text, text, text, timestamptz, integer
) is
  'Leases one approved Owner recovery job; an expired remote-effect lease is dead-lettered rather than replayed.';
comment on function api.worker_auth_recovery_complete(
  text, text, text, text, text, text, jsonb, text, integer, timestamptz
) is
  'Completes, explicitly retries, or dead-letters an Auth recovery lease while persisting only redacted evidence.';
comment on function api.bootstrap_estate_no01(jsonb, text) is
  'One-time service-role bootstrap for the canonical Estate No. 01 50-product and 189-SKU snapshot. Identity mismatches fail closed.';

commit;
