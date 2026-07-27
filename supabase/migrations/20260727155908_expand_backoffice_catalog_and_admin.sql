begin;

-- LIGNÉE backoffice expansion.
--
-- This migration is intentionally additive. Estate No. 01 keeps its original
-- product codes, slugs, launch positions, SKU codes, and UUIDs. New products
-- use the global LIG-000051+ sequence and are not subject to a catalog-size
-- ceiling.

do $roles$
declare
  role_name text;
begin
  foreach role_name in array array[
    'catalog_snapshot_owner',
    'admin_catalog_owner',
    'admin_inventory_owner'
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

-- Remove the baseline launch-only ceilings while preserving the original
-- values. The old code forms remain valid alongside the global sequence.
alter table catalog_private.categories
  drop constraint if exists categories_sort_order_check;
alter table catalog_private.categories
  add constraint categories_sort_order_positive check (sort_order > 0);

alter table catalog_private.chapters
  drop constraint if exists chapters_sort_order_check;
alter table catalog_private.chapters
  add constraint chapters_sort_order_positive check (sort_order > 0);

alter table catalog_private.products
  drop constraint if exists products_product_code_check;
alter table catalog_private.products
  drop constraint if exists products_launch_position_check;
alter table catalog_private.products
  drop constraint if exists products_check;
alter table catalog_private.products
  add constraint products_product_code_check
    check (product_code ~ '^LIG-(ENO1-[0-9]{3}|[0-9]{6})$'),
  add constraint products_launch_position_positive
    check (launch_position > 0),
  add constraint products_publication_state_check
    check (
      (status = 'published' and published_at is not null)
      or status in ('draft', 'review', 'ready', 'archived')
    );

alter table catalog_private.product_variants
  drop constraint if exists product_variants_sku_code_check;
alter table catalog_private.product_variants
  add constraint product_variants_sku_code_check
    check (sku_code ~ '^LIG-(ENO1-[0-9]{3}|[0-9]{6})-[0-9]{2,3}$');

alter table catalog_private.release_batches
  drop constraint if exists release_batches_required_product_count_check;
alter table catalog_private.release_batches
  add constraint release_batches_required_product_count_positive
    check (required_product_count > 0);

alter table ops_private.admin_memberships
  drop constraint if exists admin_memberships_role_check;
alter table ops_private.admin_memberships
  add constraint admin_memberships_role_check
    check (role in ('owner', 'merchandiser', 'fulfillment', 'support'));

alter table ops_private.admin_memberships
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists invited_by uuid,
  add column if not exists activated_at timestamptz;

do $admin_membership_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'ops_private.admin_memberships'::regclass
      and conname = 'admin_memberships_user_id_fkey'
  ) then
    alter table ops_private.admin_memberships
      add constraint admin_memberships_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete restrict;
  end if;
end
$admin_membership_fk$;

create sequence if not exists catalog_private.product_code_seq
  as bigint
  minvalue 51
  start with 51;

select pg_catalog.setval(
  'catalog_private.product_code_seq',
  greatest(
    50,
    coalesce((
      select max(substring(product_code from '^LIG-([0-9]{6})$')::bigint)
      from catalog_private.products
      where product_code ~ '^LIG-[0-9]{6}$'
    ), 50)
  ),
  true
);

alter table catalog_private.categories
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived')),
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table catalog_private.chapters
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived')),
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table catalog_private.products
  add column if not exists audience text not null default 'unisex'
    check (audience in ('men', 'women', 'unisex')),
  add column if not exists kind text not null default 'unspecified'
    check (kind ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add column if not exists subtitle_en text not null default '',
  add column if not exists subtitle_zh text not null default '',
  add column if not exists description text not null default '',
  add column if not exists story text not null default '',
  add column if not exists sizing text not null default '',
  add column if not exists care text not null default '',
  add column if not exists material_concepts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(material_concepts) = 'array'),
  add column if not exists option_axes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(option_axes) = 'array'),
  add column if not exists launch_gate_codes text[] not null default array[
    'physical-sample',
    'cost-margin-tax-price',
    'materials-origin-manufacture',
    'measurements-care-safety',
    'inventory-packaging-media',
    'legal-trademark'
  ]::text[],
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists slug_locked_at timestamptz;

update catalog_private.products
set
  subtitle_zh = name_zh,
  subtitle_en = name_en
where subtitle_zh = '' and subtitle_en = '';

alter table catalog_private.product_variants
  add column if not exists public_id text,
  add column if not exists row_version bigint not null default 1
    check (row_version > 0),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

update catalog_private.product_variants variant
set public_id =
  product.slug || '-' ||
  case
    when variant.option_values ? 'size' and variant.option_values ? 'color' then
      variant.option_values->>'size' || '-' || variant.option_values->>'color'
    when variant.option_values ? 'size' and variant.option_values ? 'finish' then
      variant.option_values->>'size' || '-' || variant.option_values->>'finish'
    when variant.option_values ? 'format' and variant.option_values ? 'finish' then
      variant.option_values->>'format' || '-' || variant.option_values->>'finish'
    when variant.option_values ? 'grip' then
      variant.option_values->>'grip'
    when variant.option_values ? 'format' then
      variant.option_values->>'format'
    else replace(trim(both '"' from variant.option_values::text), ' ', '-')
  end
from catalog_private.products product
where product.id = variant.product_id
  and variant.public_id is null;

alter table catalog_private.product_variants
  alter column public_id set not null;
alter table catalog_private.product_variants
  add constraint product_variants_public_id_check
    check (public_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
create unique index product_variants_public_id_unique
  on catalog_private.product_variants(public_id);

alter table commerce_private.inventory_balances
  add column if not exists row_version bigint not null default 1
    check (row_version > 0);

alter table commerce_private.inventory_movements
  drop constraint if exists inventory_movements_kind_check;
alter table commerce_private.inventory_movements
  add column if not exists delta_safety_stock integer not null default 0;
alter table commerce_private.inventory_movements
  add constraint inventory_movements_kind_check check (kind in (
    'receive', 'reserve', 'release', 'sale', 'cancel_restock',
    'return_sellable', 'return_damaged', 'adjustment', 'safety_stock'
  ));

create extension if not exists btree_gist with schema extensions;

alter table catalog_private.price_versions
  add constraint price_versions_approved_start_check
    check (status <> 'approved' or valid_from is not null);

alter table catalog_private.price_versions
  add constraint price_versions_no_approved_overlap
  exclude using gist (
    product_variant_id with =,
    tstzrange(valid_from, valid_until, '[)') with &&
  )
  where (status = 'approved');

create table catalog_private.product_related_products (
  product_id uuid not null references catalog_private.products(id),
  related_product_id uuid not null references catalog_private.products(id),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  primary key (product_id, related_product_id),
  unique (product_id, sort_order),
  check (product_id <> related_product_id)
);

create table catalog_private.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog_private.products(id),
  media_asset_id uuid not null references catalog_private.media_assets(id),
  role text not null check (role in ('main', 'detail', 'gallery')),
  sort_order integer not null default 1 check (sort_order > 0),
  alt_text text not null,
  focal_x numeric(6,5) not null default 0.5 check (focal_x between 0 and 1),
  focal_y numeric(6,5) not null default 0.5 check (focal_y between 0 and 1),
  pictured_sku_id uuid references catalog_private.product_variants(id),
  public_path text not null
    check (
      public_path ~ '^/media/[a-f0-9]{64}/(800|1200|1600)\\.(webp|avif)$'
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1 check (row_version > 0),
  unique (product_id, role, sort_order)
);

create unique index product_media_one_main
  on catalog_private.product_media(product_id)
  where role = 'main';

create table catalog_private.product_publications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog_private.products(id),
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  release_batch_id uuid references catalog_private.release_batches(id),
  supersedes_id uuid references catalog_private.product_publications(id),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unique (product_id, version),
  unique (product_id, content_sha256)
);

create table catalog_private.catalog_state (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into catalog_private.catalog_state(singleton, revision)
values (true, 0)
on conflict (singleton) do nothing;

alter table catalog_private.products
  add column if not exists active_publication_id uuid;

do $active_publication_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'catalog_private.products'::regclass
      and conname = 'products_active_publication_id_fkey'
  ) then
    alter table catalog_private.products
      add constraint products_active_publication_id_fkey
      foreign key (active_publication_id)
      references catalog_private.product_publications(id)
      on delete restrict;
  end if;
end
$active_publication_fk$;

alter table catalog_private.release_batches
  add column if not exists row_version bigint not null default 1
    check (row_version > 0);

create index product_related_products_related_id_fk_idx
  on catalog_private.product_related_products(related_product_id);
create index product_media_media_asset_id_fk_idx
  on catalog_private.product_media(media_asset_id);
create index product_media_pictured_sku_id_fk_idx
  on catalog_private.product_media(pictured_sku_id)
  where pictured_sku_id is not null;
create index product_publications_release_batch_id_fk_idx
  on catalog_private.product_publications(release_batch_id)
  where release_batch_id is not null;
create index product_publications_supersedes_id_fk_idx
  on catalog_private.product_publications(supersedes_id)
  where supersedes_id is not null;
create index product_publications_published_by_fk_idx
  on catalog_private.product_publications(published_by);
create index products_active_publication_id_fk_idx
  on catalog_private.products(active_publication_id)
  where active_publication_id is not null;

-- Match the predicates and ordering used by forced-RLS catalog readers.
create index products_public_snapshot_idx
  on catalog_private.products(launch_position, id)
  where status = 'published' and active_publication_id is not null;
create index product_variants_public_snapshot_idx
  on catalog_private.product_variants(product_id, sku_code, id)
  where enabled and facts_status = 'approved';
create index price_versions_current_approved_idx
  on catalog_private.price_versions(
    product_variant_id,
    valid_from desc,
    valid_until,
    id
  )
  where status = 'approved';
create index categories_active_sort_idx
  on catalog_private.categories(sort_order, id)
  where status = 'active';
create index chapters_active_sort_idx
  on catalog_private.chapters(sort_order, id)
  where status = 'active';

create or replace function catalog_private.reject_product_delete()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'PRODUCT_HARD_DELETE_FORBIDDEN';
end
$function$;

create trigger products_no_hard_delete
before delete on catalog_private.products
for each row execute function catalog_private.reject_product_delete();

create trigger product_publications_immutable
before update or delete on catalog_private.product_publications
for each row execute function ops_private.reject_mutation();

create or replace function catalog_private.guard_price_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'PRICE_VERSION_DELETE_FORBIDDEN';
  end if;

  if new.product_variant_id <> old.product_variant_id
    or new.version <> old.version
    or new.gross_twd <> old.gross_twd
    or new.tax_included <> old.tax_included
    or new.valid_from is distinct from old.valid_from
    or old.status = 'retired'
    or new.status not in ('approved', 'retired')
    or (
      old.valid_until is not null
      and new.valid_until is distinct from old.valid_until
    )
    or (
      new.valid_until is not null
      and new.valid_until <= coalesce(old.valid_from, new.valid_from)
    )
  then
    raise exception 'PRICE_VERSION_IMMUTABLE';
  end if;

  return new;
end
$function$;

create trigger price_versions_guard_mutation
before update or delete on catalog_private.price_versions
for each row execute function catalog_private.guard_price_version_mutation();

create or replace function commerce_private.bump_inventory_row_version()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.row_version = old.row_version then
    new.row_version := old.row_version + 1;
  end if;
  new.updated_at := now();
  return new;
end
$function$;

create trigger inventory_balances_bump_version
before update on commerce_private.inventory_balances
for each row execute function commerce_private.bump_inventory_row_version();

create or replace function ops_private.protect_last_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.role = 'owner'
    and old.state = 'active'
    and (
      tg_op = 'DELETE'
      or new.role <> 'owner'
      or new.state <> 'active'
    )
  then
    -- Serialize all active-Owner removals. Without a transaction-scoped lock,
    -- two concurrent demotions can each observe the other Owner and leave the
    -- installation with no active Owner.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ops_private.admin_memberships:last-active-owner',
        0
      )
    );

    if not exists (
      select 1
      from ops_private.admin_memberships membership
      where membership.user_id <> old.user_id
        and membership.role = 'owner'
        and membership.state = 'active'
    ) then
      raise exception 'LAST_ACTIVE_OWNER';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger admin_memberships_last_owner
before update or delete on ops_private.admin_memberships
for each row execute function ops_private.protect_last_active_owner();

revoke all on function ops_private.protect_last_active_owner()
  from public, anon, authenticated, service_role;

-- Every new private table receives forced RLS before any grants are made.
do $rls$
declare
  target text;
begin
  foreach target in array array[
    'product_related_products',
    'product_media',
    'product_publications',
    'catalog_state'
  ]
  loop
    execute format(
      'alter table catalog_private.%I enable row level security',
      target
    );
    execute format(
      'alter table catalog_private.%I force row level security',
      target
    );
  end loop;
end
$rls$;

-- Authorization is based only on signed Auth claims plus database state. User
-- metadata is deliberately ignored. For strict revocation, the signed
-- session_id must still exist in auth.sessions and predate no membership
-- revocation marker.
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
    where entry->>'method' = 'totp';

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

create or replace function ops_private.is_admin_authorized(
  p_allowed_roles text[],
  p_require_recent_totp boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform ops_private.require_admin_role(
    p_allowed_roles,
    p_require_recent_totp
  );
  return true;
exception
  when others then
    return false;
end
$function$;

revoke all on function ops_private.require_admin_role(text[], boolean)
  from public, anon, authenticated;
revoke all on function ops_private.is_admin_authorized(text[], boolean)
  from public, anon;
grant execute on function ops_private.require_admin_role(text[], boolean)
  to admin_catalog_owner, admin_inventory_owner;
grant execute on function ops_private.is_admin_authorized(text[], boolean)
  to authenticated;

create or replace function ops_private.admin_command_begin(
  p_actor_id uuid,
  p_command_name text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_scope_value text := 'admin:' || p_actor_id::text;
  existing ops_private.idempotency_commands%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor_scope_value || ':' || p_command_name || ':' || p_idempotency_key,
      0
    )
  );

  select *
  into existing
  from ops_private.idempotency_commands command
  where command.actor_scope = actor_scope_value
    and command.command_name = p_command_name
    and command.idempotency_key = p_idempotency_key;

  if found then
    if existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    if existing.status = 'completed' then
      return jsonb_build_object(
        'replayed', true,
        'result', existing.result_pointer
      );
    end if;
    raise exception 'IDEMPOTENCY_COMMAND_IN_PROGRESS';
  end if;

  insert into ops_private.idempotency_commands (
    actor_scope,
    command_name,
    idempotency_key,
    request_hash,
    retention_deadline
  ) values (
    actor_scope_value,
    p_command_name,
    p_idempotency_key,
    p_request_hash,
    now() + interval '30 days'
  );

  return jsonb_build_object('replayed', false);
end
$function$;

create or replace function ops_private.admin_command_finish(
  p_actor_id uuid,
  p_command_name text,
  p_idempotency_key text,
  p_aggregate_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update ops_private.idempotency_commands
  set
    aggregate_id = p_aggregate_id,
    result_code = 'ok',
    result_pointer = p_result,
    status = 'completed',
    completed_at = now()
  where actor_scope = 'admin:' || p_actor_id::text
    and command_name = p_command_name
    and idempotency_key = p_idempotency_key
    and status = 'processing';

  if not found then
    raise exception 'IDEMPOTENCY_COMMAND_MISSING';
  end if;

  return p_result || jsonb_build_object('replayed', false);
end
$function$;

revoke all on function ops_private.admin_command_begin(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function ops_private.admin_command_finish(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function ops_private.admin_command_begin(uuid, text, text, text)
  to admin_catalog_owner, admin_inventory_owner;
grant execute on function ops_private.admin_command_finish(uuid, text, text, uuid, jsonb)
  to admin_catalog_owner, admin_inventory_owner;

-- Private Storage buckets. Objects are never public at the bucket layer;
-- approved derivatives are served through the application's same-origin media
-- route. Storage's service role keeps its normal bypass behavior.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'lignee-product-source',
    'lignee-product-source',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
  ),
  (
    'lignee-public-derivatives',
    'lignee-public-derivatives',
    false,
    20971520,
    array['image/webp', 'image/avif']::text[]
  ),
  (
    'lignee-support-attachments',
    'lignee-support-attachments',
    false,
    20971520,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'application/pdf'
    ]::text[]
  )
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy lignee_product_source_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lignee-product-source'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_product_source_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lignee-product-source'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_product_source_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lignee-product-source'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
)
with check (
  bucket_id = 'lignee-product-source'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_product_source_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lignee-product-source'
  and ops_private.is_admin_authorized(
    array['owner'],
    true
  )
);

create policy lignee_derivatives_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lignee-public-derivatives'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_derivatives_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lignee-public-derivatives'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_derivatives_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lignee-public-derivatives'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
)
with check (
  bucket_id = 'lignee-public-derivatives'
  and ops_private.is_admin_authorized(
    array['owner', 'merchandiser'],
    false
  )
);

create policy lignee_derivatives_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lignee-public-derivatives'
  and ops_private.is_admin_authorized(
    array['owner'],
    true
  )
);

create policy lignee_support_attachments_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lignee-support-attachments'
  and ops_private.is_admin_authorized(
    array['owner', 'support'],
    false
  )
);

create policy lignee_support_attachments_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lignee-support-attachments'
  and ops_private.is_admin_authorized(
    array['owner', 'support'],
    false
  )
);

create policy lignee_support_attachments_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lignee-support-attachments'
  and ops_private.is_admin_authorized(
    array['owner', 'support'],
    false
  )
)
with check (
  bucket_id = 'lignee-support-attachments'
  and ops_private.is_admin_authorized(
    array['owner', 'support'],
    false
  )
);

create policy lignee_support_attachments_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lignee-support-attachments'
  and ops_private.is_admin_authorized(
    array['owner'],
    true
  )
);

-- Owner roles have exactly the direct privileges required by their functions.
grant usage on schema api to anon, authenticated;
grant usage on schema ops_private to authenticated;
grant usage on schema catalog_private, commerce_private, ops_private
  to admin_catalog_owner;
grant usage on schema catalog_private, commerce_private, ops_private
  to admin_inventory_owner;
grant usage on schema catalog_private to catalog_snapshot_owner;
grant usage on schema extensions to admin_catalog_owner;
grant execute on function extensions.digest(bytea, text) to admin_catalog_owner;

grant select on
  catalog_private.categories,
  catalog_private.chapters,
  catalog_private.products,
  catalog_private.product_variants,
  catalog_private.price_versions,
  catalog_private.release_batches,
  catalog_private.release_batch_products,
  catalog_private.product_readiness_checks,
  catalog_private.media_assets,
  catalog_private.media_asset_transitions,
  catalog_private.product_related_products,
  catalog_private.product_media,
  catalog_private.product_publications,
  catalog_private.catalog_state,
  commerce_private.inventory_balances
to admin_catalog_owner;

grant insert on
  catalog_private.products,
  catalog_private.product_variants,
  catalog_private.price_versions,
  catalog_private.product_readiness_checks,
  catalog_private.media_assets,
  catalog_private.media_asset_transitions,
  catalog_private.product_related_products,
  catalog_private.product_media,
  catalog_private.product_publications,
  commerce_private.inventory_balances
to admin_catalog_owner;

grant update on
  catalog_private.products,
  catalog_private.product_variants,
  catalog_private.product_readiness_checks,
  catalog_private.media_assets,
  catalog_private.product_media,
  catalog_private.catalog_state
to admin_catalog_owner;
grant delete on
  catalog_private.product_related_products,
  catalog_private.product_media
to admin_catalog_owner;

grant usage, select on sequence catalog_private.product_code_seq
  to admin_catalog_owner;
grant insert on ops_private.audit_events to admin_catalog_owner;
grant insert on ops_private.cache_invalidation_jobs to admin_catalog_owner;

grant select, update on commerce_private.inventory_balances
  to admin_inventory_owner;
grant select, insert on commerce_private.inventory_movements
  to admin_inventory_owner;
grant select on catalog_private.product_variants
  to admin_inventory_owner;
grant insert on ops_private.audit_events
  to admin_inventory_owner;

grant select on
  catalog_private.products,
  catalog_private.product_publications,
  catalog_private.catalog_state
to catalog_snapshot_owner;

create policy catalog_snapshot_products
on catalog_private.products
for select
to catalog_snapshot_owner
using (status = 'published' and active_publication_id is not null);

create policy catalog_snapshot_publications
on catalog_private.product_publications
for select
to catalog_snapshot_owner
using (
  exists (
    select 1
    from catalog_private.products product
    where product.id = product_publications.product_id
      and product.active_publication_id = product_publications.id
      and product.status = 'published'
  )
);

create policy catalog_snapshot_state
on catalog_private.catalog_state
for select
to catalog_snapshot_owner
using (singleton);

do $admin_catalog_policies$
declare
  target text;
begin
  foreach target in array array[
    'categories',
    'chapters',
    'products',
    'product_variants',
    'price_versions',
    'release_batches',
    'release_batch_products',
    'product_readiness_checks',
    'media_assets',
    'media_asset_transitions',
    'product_related_products',
    'product_media',
    'product_publications',
    'catalog_state'
  ]
  loop
    execute format(
      'create policy %I on catalog_private.%I for select to admin_catalog_owner using (true)',
      'admin_catalog_select_' || target,
      target
    );
  end loop;
end
$admin_catalog_policies$;

do $admin_catalog_insert_policies$
declare
  target text;
begin
  foreach target in array array[
    'products',
    'product_variants',
    'price_versions',
    'product_readiness_checks',
    'media_assets',
    'media_asset_transitions',
    'product_related_products',
    'product_media',
    'product_publications'
  ]
  loop
    execute format(
      'create policy %I on catalog_private.%I for insert to admin_catalog_owner with check (true)',
      'admin_catalog_insert_' || target,
      target
    );
  end loop;
end
$admin_catalog_insert_policies$;

do $admin_catalog_update_policies$
declare
  target text;
begin
  foreach target in array array[
    'products',
    'product_variants',
    'product_readiness_checks',
    'media_assets',
    'product_media',
    'catalog_state'
  ]
  loop
    execute format(
      'create policy %I on catalog_private.%I for update to admin_catalog_owner using (true) with check (true)',
      'admin_catalog_update_' || target,
      target
    );
  end loop;
end
$admin_catalog_update_policies$;

create policy admin_catalog_inventory_select
on commerce_private.inventory_balances
for select
to admin_catalog_owner
using (true);

create policy admin_catalog_inventory_insert
on commerce_private.inventory_balances
for insert
to admin_catalog_owner
with check (true);

create policy admin_catalog_related_delete
on catalog_private.product_related_products
for delete
to admin_catalog_owner
using (true);

create policy admin_catalog_media_delete
on catalog_private.product_media
for delete
to admin_catalog_owner
using (true);

create policy admin_catalog_audit_insert
on ops_private.audit_events
for insert
to admin_catalog_owner
with check (true);

create policy admin_catalog_cache_insert
on ops_private.cache_invalidation_jobs
for insert
to admin_catalog_owner
with check (true);

create policy admin_inventory_balances_select
on commerce_private.inventory_balances
for select
to admin_inventory_owner
using (true);

create policy admin_inventory_balances_update
on commerce_private.inventory_balances
for update
to admin_inventory_owner
using (true)
with check (true);

create policy admin_inventory_movements_select
on commerce_private.inventory_movements
for select
to admin_inventory_owner
using (true);

create policy admin_inventory_movements_insert
on commerce_private.inventory_movements
for insert
to admin_inventory_owner
with check (true);

create policy admin_inventory_variants_select
on catalog_private.product_variants
for select
to admin_inventory_owner
using (true);

create policy admin_inventory_audit_insert
on ops_private.audit_events
for insert
to admin_inventory_owner
with check (true);

create or replace function catalog_private.admin_product_document(
  p_product_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', product.id,
    'productCode', product.product_code,
    'rowVersion', product.row_version,
    'launchPosition', product.launch_position,
    'slug', product.slug,
    'slugLockedAt', product.slug_locked_at,
    'nameEn', product.name_en,
    'nameZh', product.name_zh,
    'subtitleEn', product.subtitle_en,
    'subtitleZh', product.subtitle_zh,
    'kind', product.kind,
    'categoryCode', category.code,
    'chapterCode', chapter.code,
    'audience', product.audience,
    'description', product.description,
    'story', product.story,
    'sizing', product.sizing,
    'care', product.care,
    'materialConcepts', product.material_concepts,
    'optionAxes', product.option_axes,
    'launchGateCodes', to_jsonb(product.launch_gate_codes),
    'seoTitle', product.seo_title,
    'seoDescription', product.seo_description,
    'status', product.status,
    'sandboxPriceNotice', product.sandbox_price_notice,
    'publishedAt', product.published_at,
    'archivedAt', product.archived_at,
    'activePublicationId', product.active_publication_id,
    'createdAt', product.created_at,
    'updatedAt', product.updated_at,
    'relatedProductIds', coalesce((
      select jsonb_agg(related.slug order by link.sort_order)
      from catalog_private.product_related_products link
      join catalog_private.products related
        on related.id = link.related_product_id
      where link.product_id = product.id
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', variant.id,
          'publicId', variant.public_id,
          'rowVersion', variant.row_version,
          'skuCode', variant.sku_code,
          'options', variant.option_values,
          'weightGrams', variant.weight_grams,
          'packageDimensionsMm', case
            when variant.package_length_mm is null
              and variant.package_width_mm is null
              and variant.package_height_mm is null
            then null
            else jsonb_build_object(
              'length', variant.package_length_mm,
              'width', variant.package_width_mm,
              'height', variant.package_height_mm
            )
          end,
          'factsStatus', replace(variant.facts_status, '_', '-'),
          'enabled', variant.enabled,
          'archivedAt', variant.archived_at,
          'inventory', case
            when balance.sku_id is null then null
            else jsonb_build_object(
              'rowVersion', balance.row_version,
              'onHand', balance.on_hand,
              'reserved', balance.reserved,
              'safetyStock', balance.safety_stock,
              'sellable', greatest(
                balance.on_hand - balance.reserved - balance.safety_stock,
                0
              ),
              'updatedAt', balance.updated_at
            )
          end,
          'prices', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', price.id,
                'version', price.version,
                'grossTwd', price.gross_twd,
                'taxIncluded', price.tax_included,
                'status', replace(price.status, '_', '-'),
                'validFrom', price.valid_from,
                'validUntil', price.valid_until,
                'createdAt', price.created_at
              )
              order by price.version desc
            )
            from catalog_private.price_versions price
            where price.product_variant_id = variant.id
          ), '[]'::jsonb)
        )
        order by variant.sku_code
      )
      from catalog_private.product_variants variant
      left join commerce_private.inventory_balances balance
        on balance.sku_id = variant.id
      where variant.product_id = product.id
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', link.id,
          'rowVersion', link.row_version,
          'assetId', asset.id,
          'sha256', asset.sha256,
          'assetStatus', replace(asset.status, '_', '-'),
          'role', link.role,
          'sortOrder', link.sort_order,
          'alt', link.alt_text,
          'focalX', link.focal_x,
          'focalY', link.focal_y,
          'picturedSkuId', variant.public_id,
          'publicPath', link.public_path,
          'manifest', asset.manifest
        )
        order by
          case link.role when 'main' then 1 when 'detail' then 2 else 3 end,
          link.sort_order
      )
      from catalog_private.product_media link
      join catalog_private.media_assets asset
        on asset.id = link.media_asset_id
      left join catalog_private.product_variants variant
        on variant.id = link.pictured_sku_id
      where link.product_id = product.id
    ), '[]'::jsonb),
    'readiness', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', readiness.check_code,
          'state', readiness.state,
          'evidenceReference', readiness.evidence_reference,
          'approvedBy', readiness.approved_by,
          'approvedAt', readiness.approved_at
        )
        order by readiness.check_code
      )
      from catalog_private.product_readiness_checks readiness
      where readiness.product_id = product.id
    ), '[]'::jsonb),
    'publications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', publication.id,
          'version', publication.version,
          'contentSha256', publication.content_sha256,
          'releaseBatchId', publication.release_batch_id,
          'supersedesId', publication.supersedes_id,
          'publishedBy', publication.published_by,
          'publishedAt', publication.published_at,
          'active', publication.id = product.active_publication_id
        )
        order by publication.version desc
      )
      from catalog_private.product_publications publication
      where publication.product_id = product.id
    ), '[]'::jsonb)
  )
  from catalog_private.products product
  join catalog_private.categories category
    on category.id = product.category_id
  join catalog_private.chapters chapter
    on chapter.id = product.chapter_id
  where product.id = p_product_id
$function$;

alter function catalog_private.admin_product_document(uuid)
  owner to admin_catalog_owner;
revoke all on function catalog_private.admin_product_document(uuid)
  from public, anon, authenticated;

create or replace function api.admin_session_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  membership_role text;
begin
  membership_role := ops_private.require_admin_role(
    array['owner', 'merchandiser', 'fulfillment', 'support'],
    false
  );
  return jsonb_build_object(
    'userId', auth.uid(),
    'role', membership_role,
    'aal', auth.jwt()->>'aal',
    'sessionId', auth.jwt()->>'session_id'
  );
end
$function$;

alter function api.admin_session_context() owner to admin_catalog_owner;
revoke all on function api.admin_session_context()
  from public, anon;
grant execute on function api.admin_session_context()
  to authenticated;

create or replace function api.admin_catalog_list(
  p_search text default null,
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
    array['owner', 'merchandiser'],
    false
  );
  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'INVALID_PAGINATION';
  end if;
  if p_status is not null
    and p_status not in ('draft', 'review', 'ready', 'published', 'archived')
  then
    raise exception 'INVALID_PRODUCT_STATUS';
  end if;

  with matching as (
    select
      product.id,
      product.product_code,
      product.slug,
      product.name_en,
      product.name_zh,
      product.status,
      product.row_version,
      product.launch_position,
      product.updated_at,
      product.published_at,
      category.code as category_code,
      chapter.code as chapter_code,
      count(*) over ()::integer as total_count
    from catalog_private.products product
    join catalog_private.categories category
      on category.id = product.category_id
    join catalog_private.chapters chapter
      on chapter.id = product.chapter_id
    where (p_status is null or product.status = p_status)
      and (
        p_search is null
        or btrim(p_search) = ''
        or product.product_code ilike '%' || btrim(p_search) || '%'
        or product.slug ilike '%' || btrim(p_search) || '%'
        or product.name_en ilike '%' || btrim(p_search) || '%'
        or product.name_zh ilike '%' || btrim(p_search) || '%'
      )
    order by product.launch_position, product.product_code
    limit p_limit
    offset p_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', matching.id,
        'productCode', matching.product_code,
        'slug', matching.slug,
        'nameEn', matching.name_en,
        'nameZh', matching.name_zh,
        'status', matching.status,
        'rowVersion', matching.row_version,
        'launchPosition', matching.launch_position,
        'categoryCode', matching.category_code,
        'chapterCode', matching.chapter_code,
        'updatedAt', matching.updated_at,
        'publishedAt', matching.published_at
      )
      order by matching.launch_position, matching.product_code
    ), '[]'::jsonb),
    'total', coalesce(max(matching.total_count), 0),
    'limit', p_limit,
    'offset', p_offset
  )
  into result
  from matching;

  return result;
end
$function$;

alter function api.admin_catalog_list(text, text, integer, integer)
  owner to admin_catalog_owner;
revoke all on function api.admin_catalog_list(text, text, integer, integer)
  from public, anon;
grant execute on function api.admin_catalog_list(text, text, integer, integer)
  to authenticated;

create or replace function api.admin_product_get(
  p_product_id uuid
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
    array['owner', 'merchandiser'],
    false
  );
  result := catalog_private.admin_product_document(p_product_id);
  if result is null then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return result;
end
$function$;

alter function api.admin_product_get(uuid) owner to admin_catalog_owner;
revoke all on function api.admin_product_get(uuid) from public, anon;
grant execute on function api.admin_product_get(uuid) to authenticated;

create or replace function api.admin_product_create(
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
  category_id_value uuid;
  chapter_id_value uuid;
  new_product_id uuid;
  new_product_code text;
  next_position integer;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'product.create',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'slug', '') = ''
    or coalesce(p_payload->>'nameEn', '') = ''
    or coalesce(p_payload->>'nameZh', '') = ''
    or coalesce(p_payload->>'kind', '') = ''
  then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  select id into category_id_value
  from catalog_private.categories
  where code = p_payload->>'categoryCode'
    and status = 'active';
  select id into chapter_id_value
  from catalog_private.chapters
  where code = p_payload->>'chapterCode'
    and status = 'active';
  if category_id_value is null or chapter_id_value is null then
    raise exception 'UNKNOWN_TAXONOMY';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lignee-product-create', 0)
  );
  new_product_code := 'LIG-' || lpad(
    nextval('catalog_private.product_code_seq')::text,
    6,
    '0'
  );
  select coalesce(max(launch_position), 0) + 1
  into next_position
  from catalog_private.products;

  insert into catalog_private.products (
    product_code,
    slug,
    name_en,
    name_zh,
    subtitle_en,
    subtitle_zh,
    category_id,
    chapter_id,
    launch_position,
    status,
    audience,
    kind,
    description,
    story,
    sizing,
    care,
    material_concepts,
    option_axes,
    launch_gate_codes,
    seo_title,
    seo_description,
    sandbox_price_notice
  ) values (
    new_product_code,
    p_payload->>'slug',
    p_payload->>'nameEn',
    p_payload->>'nameZh',
    coalesce(p_payload->>'subtitleEn', p_payload->>'nameEn'),
    coalesce(p_payload->>'subtitleZh', p_payload->>'nameZh'),
    category_id_value,
    chapter_id_value,
    next_position,
    'draft',
    coalesce(p_payload->>'audience', 'unisex'),
    p_payload->>'kind',
    coalesce(p_payload->>'description', ''),
    coalesce(p_payload->>'story', ''),
    coalesce(p_payload->>'sizing', ''),
    coalesce(p_payload->>'care', ''),
    coalesce(p_payload->'materialConcepts', '[]'::jsonb),
    coalesce(p_payload->'optionAxes', '[]'::jsonb),
    coalesce((
      select array_agg(value)
      from jsonb_array_elements_text(
        coalesce(p_payload->'launchGateCodes', '[]'::jsonb)
      ) value
    ), array[
      'physical-sample',
      'cost-margin-tax-price',
      'materials-origin-manufacture',
      'measurements-care-safety',
      'inventory-packaging-media',
      'legal-trademark'
    ]::text[]),
    nullif(p_payload->>'seoTitle', ''),
    nullif(p_payload->>'seoDescription', ''),
    true
  )
  returning id into new_product_id;

  insert into catalog_private.product_readiness_checks (
    product_id,
    check_code,
    state
  )
  select
    new_product_id,
    check_code,
    'pending'
  from unnest(array[
    'physical_sample',
    'supplier',
    'cost_margin_tax_price',
    'materials_origin_manufacture',
    'measurements_capacity_weight',
    'care_warning',
    'sku',
    'packaging',
    'sellable_inventory',
    'accurate_photography',
    'shipping_returns',
    'warranty_care_repair',
    'legal',
    'trademark'
  ]) check_code;

  if p_payload ? 'relatedProductIds' then
    insert into catalog_private.product_related_products (
      product_id,
      related_product_id,
      sort_order
    )
    select
      new_product_id,
      related.id,
      requested.ordinality::integer
    from jsonb_array_elements_text(p_payload->'relatedProductIds')
      with ordinality requested(slug, ordinality)
    join catalog_private.products related
      on related.slug = requested.slug;
  end if;

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
    'product.create',
    'product',
    new_product_id::text,
    array(select jsonb_object_keys(p_payload)),
    p_idempotency_key
  );

  result := catalog_private.admin_product_document(new_product_id);
  return ops_private.admin_command_finish(
    actor_id,
    'product.create',
    p_idempotency_key,
    new_product_id,
    result
  );
end
$function$;

alter function api.admin_product_create(text, text, jsonb)
  owner to admin_catalog_owner;
revoke all on function api.admin_product_create(text, text, jsonb)
  from public, anon;
grant execute on function api.admin_product_create(text, text, jsonb)
  to authenticated;

create or replace function api.admin_product_save(
  p_product_id uuid,
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
  current_product catalog_private.products%rowtype;
  category_id_value uuid;
  chapter_id_value uuid;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'product.save',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if current_product.status = 'archived' then
    raise exception 'ARCHIVED_PRODUCT_IMMUTABLE';
  end if;
  if current_product.slug_locked_at is not null
    and p_payload ? 'slug'
    and p_payload->>'slug' <> current_product.slug
  then
    raise exception 'PUBLISHED_SLUG_LOCKED';
  end if;
  if p_payload ? 'status'
    and (
      p_payload->>'status' not in ('draft', 'review', 'ready')
      or current_product.status = 'published'
    )
  then
    raise exception 'INVALID_PRODUCT_STATUS_TRANSITION';
  end if;

  if p_payload ? 'categoryCode' then
    select id into category_id_value
    from catalog_private.categories
    where code = p_payload->>'categoryCode'
      and status = 'active';
    if category_id_value is null then
      raise exception 'UNKNOWN_CATEGORY';
    end if;
  else
    category_id_value := current_product.category_id;
  end if;

  if p_payload ? 'chapterCode' then
    select id into chapter_id_value
    from catalog_private.chapters
    where code = p_payload->>'chapterCode'
      and status = 'active';
    if chapter_id_value is null then
      raise exception 'UNKNOWN_CHAPTER';
    end if;
  else
    chapter_id_value := current_product.chapter_id;
  end if;

  update catalog_private.products
  set
    slug = case when p_payload ? 'slug'
      then p_payload->>'slug' else slug end,
    name_en = case when p_payload ? 'nameEn'
      then p_payload->>'nameEn' else name_en end,
    name_zh = case when p_payload ? 'nameZh'
      then p_payload->>'nameZh' else name_zh end,
    subtitle_en = case when p_payload ? 'subtitleEn'
      then p_payload->>'subtitleEn' else subtitle_en end,
    subtitle_zh = case when p_payload ? 'subtitleZh'
      then p_payload->>'subtitleZh' else subtitle_zh end,
    category_id = category_id_value,
    chapter_id = chapter_id_value,
    audience = case when p_payload ? 'audience'
      then p_payload->>'audience' else audience end,
    kind = case when p_payload ? 'kind'
      then p_payload->>'kind' else kind end,
    description = case when p_payload ? 'description'
      then p_payload->>'description' else description end,
    story = case when p_payload ? 'story'
      then p_payload->>'story' else story end,
    sizing = case when p_payload ? 'sizing'
      then p_payload->>'sizing' else sizing end,
    care = case when p_payload ? 'care'
      then p_payload->>'care' else care end,
    material_concepts = case when p_payload ? 'materialConcepts'
      then p_payload->'materialConcepts' else material_concepts end,
    option_axes = case when p_payload ? 'optionAxes'
      then p_payload->'optionAxes' else option_axes end,
    launch_gate_codes = case when p_payload ? 'launchGateCodes'
      then array(
        select value
        from jsonb_array_elements_text(p_payload->'launchGateCodes') value
      )
      else launch_gate_codes
    end,
    seo_title = case when p_payload ? 'seoTitle'
      then nullif(p_payload->>'seoTitle', '') else seo_title end,
    seo_description = case when p_payload ? 'seoDescription'
      then nullif(p_payload->>'seoDescription', '') else seo_description end,
    status = case when p_payload ? 'status'
      then p_payload->>'status' else status end,
    row_version = row_version + 1,
    updated_at = now()
  where id = p_product_id
    and row_version = p_expected_version;

  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  if p_payload ? 'relatedProductIds' then
    delete from catalog_private.product_related_products
    where product_id = p_product_id;

    insert into catalog_private.product_related_products (
      product_id,
      related_product_id,
      sort_order
    )
    select
      p_product_id,
      related.id,
      requested.ordinality::integer
    from jsonb_array_elements_text(p_payload->'relatedProductIds')
      with ordinality requested(slug, ordinality)
    join catalog_private.products related
      on related.slug = requested.slug;
  end if;

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
    'product.save',
    'product',
    p_product_id::text,
    array(select jsonb_object_keys(p_payload)),
    p_idempotency_key
  );

  result := catalog_private.admin_product_document(p_product_id);
  return ops_private.admin_command_finish(
    actor_id,
    'product.save',
    p_idempotency_key,
    p_product_id,
    result
  );
end
$function$;

alter function api.admin_product_save(uuid, bigint, text, text, jsonb)
  owner to admin_catalog_owner;
revoke all on function api.admin_product_save(uuid, bigint, text, text, jsonb)
  from public, anon;
grant execute on function api.admin_product_save(uuid, bigint, text, text, jsonb)
  to authenticated;

create or replace function api.admin_variant_upsert(
  p_product_id uuid,
  p_expected_product_version bigint,
  p_variant_id uuid,
  p_expected_variant_version bigint,
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
  current_product catalog_private.products%rowtype;
  current_variant catalog_private.product_variants%rowtype;
  target_variant_id uuid;
  generated_sku_code text;
  requested_facts_status text :=
    replace(coalesce(p_payload->>'factsStatus', 'requires-approval'), '-', '_');
  requested_enabled boolean :=
    coalesce((p_payload->>'enabled')::boolean, false);
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  if requested_facts_status = 'approved' or requested_enabled then
    perform ops_private.require_admin_role(array['owner'], true);
  end if;

  command_state := ops_private.admin_command_begin(
    actor_id,
    'variant.upsert',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(coalesce(p_payload->'options', 'null'::jsonb)) <> 'object'
  then
    raise exception 'INVALID_VARIANT_PAYLOAD';
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_product_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if current_product.status = 'archived' then
    raise exception 'ARCHIVED_PRODUCT_IMMUTABLE';
  end if;

  if p_variant_id is null then
    if coalesce(p_payload->>'publicId', '') = '' then
      raise exception 'VARIANT_PUBLIC_ID_REQUIRED';
    end if;
    select current_product.product_code || '-' ||
      lpad((count(*) + 1)::text, 2, '0')
    into generated_sku_code
    from catalog_private.product_variants
    where product_id = p_product_id;

    insert into catalog_private.product_variants (
      product_id,
      public_id,
      sku_code,
      option_values,
      weight_grams,
      package_length_mm,
      package_width_mm,
      package_height_mm,
      facts_status,
      enabled
    ) values (
      p_product_id,
      p_payload->>'publicId',
      coalesce(nullif(p_payload->>'skuCode', ''), generated_sku_code),
      p_payload->'options',
      nullif(p_payload->>'weightGrams', '')::integer,
      nullif(p_payload#>>'{packageDimensionsMm,length}', '')::integer,
      nullif(p_payload#>>'{packageDimensionsMm,width}', '')::integer,
      nullif(p_payload#>>'{packageDimensionsMm,height}', '')::integer,
      requested_facts_status,
      requested_enabled
    )
    returning id into target_variant_id;

    insert into commerce_private.inventory_balances (
      sku_id,
      on_hand,
      reserved,
      safety_stock,
      sellable_at_launch
    ) values (target_variant_id, 0, 0, 0, 0);
  else
    select *
    into current_variant
    from catalog_private.product_variants
    where id = p_variant_id
      and product_id = p_product_id
    for update;
    if not found then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_expected_variant_version is null
      or current_variant.row_version <> p_expected_variant_version
    then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;
    if p_payload ? 'publicId'
      and p_payload->>'publicId' <> current_variant.public_id
    then
      raise exception 'VARIANT_PUBLIC_ID_IMMUTABLE';
    end if;
    if p_payload ? 'skuCode'
      and p_payload->>'skuCode' <> current_variant.sku_code
    then
      raise exception 'SKU_CODE_IMMUTABLE';
    end if;

    update catalog_private.product_variants
    set
      option_values = case when p_payload ? 'options'
        then p_payload->'options' else option_values end,
      weight_grams = case when p_payload ? 'weightGrams'
        then nullif(p_payload->>'weightGrams', '')::integer
        else weight_grams
      end,
      package_length_mm = case when p_payload ? 'packageDimensionsMm'
        then nullif(p_payload#>>'{packageDimensionsMm,length}', '')::integer
        else package_length_mm
      end,
      package_width_mm = case when p_payload ? 'packageDimensionsMm'
        then nullif(p_payload#>>'{packageDimensionsMm,width}', '')::integer
        else package_width_mm
      end,
      package_height_mm = case when p_payload ? 'packageDimensionsMm'
        then nullif(p_payload#>>'{packageDimensionsMm,height}', '')::integer
        else package_height_mm
      end,
      facts_status = case when p_payload ? 'factsStatus'
        then requested_facts_status else facts_status end,
      enabled = case when p_payload ? 'enabled'
        then requested_enabled else enabled end,
      archived_at = case
        when coalesce((p_payload->>'archived')::boolean, false)
        then now()
        else archived_at
      end,
      row_version = row_version + 1,
      updated_at = now()
    where id = p_variant_id
      and row_version = p_expected_variant_version;
    if not found then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;
    target_variant_id := p_variant_id;
  end if;

  update catalog_private.products
  set
    row_version = row_version + 1,
    updated_at = now()
  where id = p_product_id
    and row_version = p_expected_product_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

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
    'variant.upsert',
    'product_variant',
    target_variant_id::text,
    array(select jsonb_object_keys(p_payload)),
    p_idempotency_key
  );

  result := catalog_private.admin_product_document(p_product_id);
  return ops_private.admin_command_finish(
    actor_id,
    'variant.upsert',
    p_idempotency_key,
    target_variant_id,
    result
  );
end
$function$;

alter function api.admin_variant_upsert(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) owner to admin_catalog_owner;
revoke all on function api.admin_variant_upsert(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) from public, anon;
grant execute on function api.admin_variant_upsert(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) to authenticated;

create or replace function api.admin_price_add(
  p_variant_id uuid,
  p_expected_variant_version bigint,
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
  current_variant catalog_private.product_variants%rowtype;
  new_price_id uuid;
  next_version integer;
  requested_status text :=
    replace(coalesce(p_payload->>'status', 'sandbox-draft'), '-', '_');
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id,
    'price.add',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or nullif(p_payload->>'grossTwd', '') is null
    or requested_status not in ('sandbox_draft', 'approved')
  then
    raise exception 'INVALID_PRICE_PAYLOAD';
  end if;

  select *
  into current_variant
  from catalog_private.product_variants
  where id = p_variant_id
  for update;
  if not found then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_variant.row_version <> p_expected_variant_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if requested_status = 'approved'
    and nullif(p_payload->>'validFrom', '') is null
  then
    raise exception 'APPROVED_PRICE_REQUIRES_VALID_FROM';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from catalog_private.price_versions
  where product_variant_id = p_variant_id;

  insert into catalog_private.price_versions (
    product_variant_id,
    version,
    gross_twd,
    tax_included,
    status,
    valid_from,
    valid_until
  ) values (
    p_variant_id,
    next_version,
    (p_payload->>'grossTwd')::integer,
    true,
    requested_status,
    nullif(p_payload->>'validFrom', '')::timestamptz,
    nullif(p_payload->>'validUntil', '')::timestamptz
  )
  returning id into new_price_id;

  update catalog_private.product_variants
  set row_version = row_version + 1, updated_at = now()
  where id = p_variant_id
    and row_version = p_expected_variant_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  update catalog_private.products
  set row_version = row_version + 1, updated_at = now()
  where id = current_variant.product_id;

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
    'price.add',
    'price_version',
    new_price_id::text,
    array['gross_twd', 'tax_included', 'status', 'valid_from', 'valid_until'],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', new_price_id,
    'variantId', p_variant_id,
    'version', next_version,
    'product', catalog_private.admin_product_document(current_variant.product_id)
  );
  return ops_private.admin_command_finish(
    actor_id,
    'price.add',
    p_idempotency_key,
    new_price_id,
    result
  );
end
$function$;

alter function api.admin_price_add(uuid, bigint, text, text, jsonb)
  owner to admin_catalog_owner;
revoke all on function api.admin_price_add(uuid, bigint, text, text, jsonb)
  from public, anon;
grant execute on function api.admin_price_add(uuid, bigint, text, text, jsonb)
  to authenticated;

create or replace function api.admin_media_register(
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
  requested_status text :=
    replace(coalesce(p_payload->>'status', 'draft'), '-', '_');
  media_id uuid;
  existing catalog_private.media_assets%rowtype;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  if requested_status = 'live_approved' then
    perform ops_private.require_admin_role(array['owner'], true);
  end if;

  command_state := ops_private.admin_command_begin(
    actor_id,
    'media.register',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'sha256', '') !~ '^[a-f0-9]{64}$'
    or nullif(p_payload->>'byteLength', '') is null
    or jsonb_typeof(coalesce(p_payload->'manifest', 'null'::jsonb)) <> 'object'
    or requested_status not in ('draft', 'review', 'live_approved')
  then
    raise exception 'INVALID_MEDIA_PAYLOAD';
  end if;

  select * into existing
  from catalog_private.media_assets
  where sha256 = p_payload->>'sha256';

  if found then
    if existing.byte_length <> (p_payload->>'byteLength')::bigint
      or existing.manifest <> p_payload->'manifest'
    then
      raise exception 'MEDIA_SHA_CONFLICT';
    end if;
    media_id := existing.id;
  else
    insert into catalog_private.media_assets (
      sha256,
      status,
      object_class,
      byte_length,
      manifest,
      backup_acknowledged_at
    ) values (
      p_payload->>'sha256',
      requested_status,
      'public_catalog',
      (p_payload->>'byteLength')::bigint,
      p_payload->'manifest',
      case when requested_status = 'live_approved' then now() else null end
    )
    returning id into media_id;

    insert into catalog_private.media_asset_transitions (
      media_asset_id,
      from_status,
      to_status,
      operation_id,
      reason
    ) values (
      media_id,
      null,
      requested_status,
      gen_random_uuid(),
      coalesce(p_payload->>'reason', 'backoffice registration')
    );
  end if;

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
    'media.register',
    'media_asset',
    media_id::text,
    array['sha256', 'status', 'object_class', 'byte_length', 'manifest'],
    p_idempotency_key
  );

  select jsonb_build_object(
    'id', asset.id,
    'sha256', asset.sha256,
    'status', replace(asset.status, '_', '-'),
    'objectClass', replace(asset.object_class, '_', '-'),
    'byteLength', asset.byte_length,
    'manifest', asset.manifest,
    'createdAt', asset.created_at
  )
  into result
  from catalog_private.media_assets asset
  where asset.id = media_id;

  return ops_private.admin_command_finish(
    actor_id,
    'media.register',
    p_idempotency_key,
    media_id,
    result
  );
end
$function$;

alter function api.admin_media_register(text, text, jsonb)
  owner to admin_catalog_owner;
revoke all on function api.admin_media_register(text, text, jsonb)
  from public, anon;
grant execute on function api.admin_media_register(text, text, jsonb)
  to authenticated;

create or replace function api.admin_product_media_link(
  p_product_id uuid,
  p_expected_product_version bigint,
  p_link_id uuid,
  p_expected_link_version bigint,
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
  current_product catalog_private.products%rowtype;
  current_link catalog_private.product_media%rowtype;
  asset catalog_private.media_assets%rowtype;
  pictured_variant_id uuid;
  target_link_id uuid;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'product.media.link',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'role', '') not in ('main', 'detail', 'gallery')
    or coalesce(p_payload->>'alt', '') = ''
    or coalesce(p_payload->>'publicPath', '') = ''
  then
    raise exception 'INVALID_PRODUCT_MEDIA_PAYLOAD';
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_product_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if current_product.status = 'archived' then
    raise exception 'ARCHIVED_PRODUCT_IMMUTABLE';
  end if;

  select *
  into asset
  from catalog_private.media_assets
  where id = (p_payload->>'assetId')::uuid;
  if not found then
    raise exception 'MEDIA_ASSET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_payload->>'publicPath'
    !~ ('^/media/' || asset.sha256 || '/(800|1200|1600)\\.(webp|avif)$')
  then
    raise exception 'MEDIA_PATH_SHA_MISMATCH';
  end if;

  if nullif(p_payload->>'picturedSkuId', '') is not null then
    select id into pictured_variant_id
    from catalog_private.product_variants
    where public_id = p_payload->>'picturedSkuId'
      and product_id = p_product_id;
    if pictured_variant_id is null then
      raise exception 'PICTURED_SKU_NOT_FOUND';
    end if;
  end if;

  if p_link_id is null then
    insert into catalog_private.product_media (
      product_id,
      media_asset_id,
      role,
      sort_order,
      alt_text,
      focal_x,
      focal_y,
      pictured_sku_id,
      public_path
    ) values (
      p_product_id,
      asset.id,
      p_payload->>'role',
      coalesce((p_payload->>'sortOrder')::integer, 1),
      p_payload->>'alt',
      coalesce((p_payload->>'focalX')::numeric, 0.5),
      coalesce((p_payload->>'focalY')::numeric, 0.5),
      pictured_variant_id,
      p_payload->>'publicPath'
    )
    returning id into target_link_id;
  else
    select *
    into current_link
    from catalog_private.product_media
    where id = p_link_id
      and product_id = p_product_id
    for update;
    if not found then
      raise exception 'PRODUCT_MEDIA_LINK_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_expected_link_version is null
      or current_link.row_version <> p_expected_link_version
    then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;

    update catalog_private.product_media
    set
      media_asset_id = asset.id,
      role = p_payload->>'role',
      sort_order = coalesce((p_payload->>'sortOrder')::integer, sort_order),
      alt_text = p_payload->>'alt',
      focal_x = coalesce((p_payload->>'focalX')::numeric, focal_x),
      focal_y = coalesce((p_payload->>'focalY')::numeric, focal_y),
      pictured_sku_id = pictured_variant_id,
      public_path = p_payload->>'publicPath',
      row_version = row_version + 1,
      updated_at = now()
    where id = p_link_id
      and row_version = p_expected_link_version;
    if not found then
      raise exception 'ROW_VERSION_CONFLICT';
    end if;
    target_link_id := p_link_id;
  end if;

  update catalog_private.products
  set row_version = row_version + 1, updated_at = now()
  where id = p_product_id
    and row_version = p_expected_product_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

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
    'product.media.link',
    'product_media',
    target_link_id::text,
    array(select jsonb_object_keys(p_payload)),
    p_idempotency_key
  );

  result := catalog_private.admin_product_document(p_product_id);
  return ops_private.admin_command_finish(
    actor_id,
    'product.media.link',
    p_idempotency_key,
    target_link_id,
    result
  );
end
$function$;

alter function api.admin_product_media_link(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) owner to admin_catalog_owner;
revoke all on function api.admin_product_media_link(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) from public, anon;
grant execute on function api.admin_product_media_link(
  uuid,
  bigint,
  uuid,
  bigint,
  text,
  text,
  jsonb
) to authenticated;

create or replace function api.admin_readiness_set(
  p_product_id uuid,
  p_expected_product_version bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_check_code text,
  p_state text,
  p_evidence_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  current_product catalog_private.products%rowtype;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id,
    'readiness.set',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if p_state not in ('pending', 'passed', 'failed')
    or coalesce(p_check_code, '') = ''
  then
    raise exception 'INVALID_READINESS_STATE';
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_product_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into catalog_private.product_readiness_checks (
    product_id,
    check_code,
    state,
    evidence_reference,
    approved_by,
    approved_at
  ) values (
    p_product_id,
    p_check_code,
    p_state,
    p_evidence_reference,
    case when p_state = 'passed' then actor_id else null end,
    case when p_state = 'passed' then now() else null end
  )
  on conflict (product_id, check_code) do update
  set
    state = excluded.state,
    evidence_reference = excluded.evidence_reference,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

  update catalog_private.products
  set row_version = row_version + 1, updated_at = now()
  where id = p_product_id
    and row_version = p_expected_product_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

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
    'readiness.set',
    'product_readiness',
    p_product_id::text || ':' || p_check_code,
    array['state', 'evidence_reference', 'approved_by', 'approved_at'],
    p_idempotency_key
  );

  result := catalog_private.admin_product_document(p_product_id);
  return ops_private.admin_command_finish(
    actor_id,
    'readiness.set',
    p_idempotency_key,
    p_product_id,
    result
  );
end
$function$;

alter function api.admin_readiness_set(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text
) owner to admin_catalog_owner;
revoke all on function api.admin_readiness_set(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text
) from public, anon;
grant execute on function api.admin_readiness_set(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text
) to authenticated;

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
  product catalog_private.products%rowtype;
  category_code_value text;
  chapter_code_value text;
  main_asset_id text;
  main_path text;
  main_alt text;
  pictured_sku_public_id text;
  detail_path text;
  base_price integer;
  related_ids jsonb;
  sku_documents jsonb;
begin
  select candidate.*, category.code, chapter.code
  into product, category_code_value, chapter_code_value
  from catalog_private.products candidate
  join catalog_private.categories category
    on category.id = candidate.category_id
  join catalog_private.chapters chapter
    on chapter.id = candidate.chapter_id
  where candidate.id = p_product_id;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    asset.sha256,
    link.public_path,
    link.alt_text,
    pictured.public_id
  into
    main_asset_id,
    main_path,
    main_alt,
    pictured_sku_public_id
  from catalog_private.product_media link
  join catalog_private.media_assets asset
    on asset.id = link.media_asset_id
  left join catalog_private.product_variants pictured
    on pictured.id = link.pictured_sku_id
  where link.product_id = p_product_id
    and link.role = 'main'
    and asset.status = 'live_approved'
  order by link.sort_order
  limit 1;

  select link.public_path
  into detail_path
  from catalog_private.product_media link
  join catalog_private.media_assets asset
    on asset.id = link.media_asset_id
  where link.product_id = p_product_id
    and link.role = 'detail'
    and asset.status = 'live_approved'
  order by link.sort_order
  limit 1;
  detail_path := coalesce(detail_path, main_path);

  select coalesce(jsonb_agg(related.slug order by link.sort_order), '[]'::jsonb)
  into related_ids
  from catalog_private.product_related_products link
  join catalog_private.products related
    on related.id = link.related_product_id
  where link.product_id = p_product_id;

  select
    min(current_price.gross_twd),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', variant.public_id,
        'skuCode', variant.sku_code,
        'productId', product.slug,
        'options', variant.option_values,
        'priceTwd', current_price.gross_twd,
        'priceVersion', 'approved-v' || current_price.version::text,
        'taxIncluded', true,
        'displayStatus', case
          when balance.on_hand - balance.reserved - balance.safety_stock > 0
            then 'available'
          else 'unavailable'
        end,
        'representativeAssetId', main_asset_id,
        'factsStatus', 'approved',
        'weightGrams', variant.weight_grams,
        'packageDimensionsMm', case
          when variant.package_length_mm is null
            and variant.package_width_mm is null
            and variant.package_height_mm is null
          then null
          else jsonb_build_object(
            'length', variant.package_length_mm,
            'width', variant.package_width_mm,
            'height', variant.package_height_mm
          )
        end,
        'enabledInProduction', true
      )
      order by variant.sku_code
    ), '[]'::jsonb)
  into base_price, sku_documents
  from catalog_private.product_variants variant
  join commerce_private.inventory_balances balance
    on balance.sku_id = variant.id
  join lateral (
    select price.gross_twd, price.version
    from catalog_private.price_versions price
    where price.product_variant_id = variant.id
      and price.status = 'approved'
      and now() >= price.valid_from
      and (price.valid_until is null or now() < price.valid_until)
    order by price.version desc
    limit 1
  ) current_price on true
  where variant.product_id = p_product_id
    and variant.enabled
    and variant.facts_status = 'approved'
    and variant.archived_at is null;

  return jsonb_build_object(
    'product',
    jsonb_build_object(
      'id', product.slug,
      'productCode', product.product_code,
      'launchPosition', product.launch_position,
      'slug', product.slug,
      'name', product.name_en,
      'subtitle', coalesce(nullif(product.subtitle_zh, ''), product.name_zh),
      'kind', product.kind,
      'category', category_code_value,
      'audience', product.audience,
      'collectionId', chapter_code_value,
      'basePriceTwd', base_price,
      'priceStatus', 'approved',
      'taxIncluded', true,
      'launchStatus', 'published',
      'purchasableInDemo', false,
      'purchasableInProduction', true,
      'optionAxes', product.option_axes,
      'materialConcepts', product.material_concepts,
      'description', product.description,
      'story', product.story,
      'sizing', product.sizing,
      'care', product.care,
      'image', jsonb_build_object(
        'assetId', main_asset_id,
        'path', main_path,
        'detailPath', detail_path,
        'alt', main_alt,
        'picturedSkuId', coalesce(
          pictured_sku_public_id,
          sku_documents->0->>'id'
        ),
        'approvalStatus', 'approved'
      ),
      'relatedProductIds', related_ids,
      'launchGateCodes', to_jsonb(product.launch_gate_codes)
    ),
    'skus',
    sku_documents
  );
end
$function$;

alter function catalog_private.build_publication_snapshot(uuid)
  owner to admin_catalog_owner;
revoke all on function catalog_private.build_publication_snapshot(uuid)
  from public, anon, authenticated;

create or replace function api.admin_product_publish(
  p_product_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_release_batch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  current_product catalog_private.products%rowtype;
  publication_snapshot jsonb;
  publication_hash text;
  publication_id uuid;
  superseded_publication_id uuid;
  next_publication_version integer;
  next_catalog_revision bigint;
  enabled_variant_count integer;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id,
    'product.publish',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if current_product.status = 'archived' then
    raise exception 'ARCHIVED_PRODUCT_IMMUTABLE';
  end if;

  if p_release_batch_id is not null
    and not exists (
      select 1
      from catalog_private.release_batch_products batch_product
      where batch_product.release_batch_id = p_release_batch_id
        and batch_product.product_id = p_product_id
    )
  then
    raise exception 'PRODUCT_NOT_IN_RELEASE_BATCH';
  end if;

  if not exists (
    select 1
    from catalog_private.product_readiness_checks readiness
    where readiness.product_id = p_product_id
  ) or exists (
    select 1
    from catalog_private.product_readiness_checks readiness
    where readiness.product_id = p_product_id
      and readiness.state <> 'passed'
  )
  then
    raise exception 'PRODUCT_READINESS_INCOMPLETE';
  end if;

  select count(*)
  into enabled_variant_count
  from catalog_private.product_variants variant
  where variant.product_id = p_product_id
    and variant.enabled
    and variant.archived_at is null;
  if enabled_variant_count = 0 then
    raise exception 'NO_ENABLED_VARIANTS';
  end if;
  if exists (
    select 1
    from catalog_private.product_variants variant
    where variant.product_id = p_product_id
      and variant.enabled
      and variant.archived_at is null
      and variant.facts_status <> 'approved'
  ) then
    raise exception 'VARIANT_FACTS_UNAPPROVED';
  end if;
  if exists (
    select 1
    from catalog_private.product_variants variant
    where variant.product_id = p_product_id
      and variant.enabled
      and variant.archived_at is null
      and not exists (
        select 1
        from catalog_private.price_versions price
        where price.product_variant_id = variant.id
          and price.status = 'approved'
          and now() >= price.valid_from
          and (price.valid_until is null or now() < price.valid_until)
      )
  ) then
    raise exception 'ACTIVE_APPROVED_PRICE_REQUIRED';
  end if;
  if exists (
    select 1
    from catalog_private.product_variants variant
    left join commerce_private.inventory_balances balance
      on balance.sku_id = variant.id
    where variant.product_id = p_product_id
      and variant.enabled
      and variant.archived_at is null
      and (
        balance.sku_id is null
        or balance.on_hand - balance.reserved - balance.safety_stock <= 0
      )
  ) then
    raise exception 'SELLABLE_INVENTORY_REQUIRED';
  end if;
  if not exists (
    select 1
    from catalog_private.product_media link
    join catalog_private.media_assets asset
      on asset.id = link.media_asset_id
    where link.product_id = p_product_id
      and link.role = 'main'
      and asset.status = 'live_approved'
      and asset.backup_acknowledged_at is not null
  ) then
    raise exception 'APPROVED_MAIN_MEDIA_REQUIRED';
  end if;

  publication_snapshot :=
    catalog_private.build_publication_snapshot(p_product_id);
  publication_hash := encode(
    extensions.digest(
      convert_to(publication_snapshot::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  superseded_publication_id := current_product.active_publication_id;
  if superseded_publication_id is not null
    and exists (
      select 1
      from catalog_private.product_publications publication
      where publication.id = superseded_publication_id
        and publication.content_sha256 = publication_hash
    )
  then
    raise exception 'PUBLICATION_CONTENT_UNCHANGED';
  end if;

  select coalesce(max(version), 0) + 1
  into next_publication_version
  from catalog_private.product_publications
  where product_id = p_product_id;

  insert into catalog_private.product_publications (
    product_id,
    version,
    snapshot,
    content_sha256,
    release_batch_id,
    supersedes_id,
    published_by
  ) values (
    p_product_id,
    next_publication_version,
    publication_snapshot,
    publication_hash,
    p_release_batch_id,
    superseded_publication_id,
    actor_id
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
  where id = p_product_id
    and row_version = p_expected_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  update catalog_private.catalog_state
  set revision = revision + 1, updated_at = now()
  where singleton
  returning revision into next_catalog_revision;

  insert into ops_private.cache_invalidation_jobs (
    operation_key,
    tags,
    safety_revision
  ) values (
    'catalog-publication:' || publication_id::text,
    array[
      'catalog',
      'product:' || current_product.slug,
      'category',
      'sitemap'
    ],
    next_catalog_revision
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
    'product.publish',
    'product_publication',
    publication_id::text,
    array[
      'active_publication_id',
      'status',
      'published_at',
      'slug_locked_at',
      'catalog_revision'
    ],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'publicationId', publication_id,
    'publicationVersion', next_publication_version,
    'contentSha256', publication_hash,
    'catalogRevision', next_catalog_revision,
    'product', catalog_private.admin_product_document(p_product_id)
  );
  return ops_private.admin_command_finish(
    actor_id,
    'product.publish',
    p_idempotency_key,
    publication_id,
    result
  );
end
$function$;

alter function api.admin_product_publish(uuid, bigint, text, text, uuid)
  owner to admin_catalog_owner;
revoke all on function api.admin_product_publish(uuid, bigint, text, text, uuid)
  from public, anon;
grant execute on function api.admin_product_publish(
  uuid,
  bigint,
  text,
  text,
  uuid
) to authenticated;

create or replace function api.admin_product_archive(
  p_product_id uuid,
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
  current_product catalog_private.products%rowtype;
  next_catalog_revision bigint;
  result jsonb;
begin
  perform ops_private.require_admin_role(array['owner'], true);
  command_state := ops_private.admin_command_begin(
    actor_id,
    'product.archive',
    p_idempotency_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;

  select *
  into current_product
  from catalog_private.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_product.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if current_product.status = 'archived' then
    raise exception 'PRODUCT_ALREADY_ARCHIVED';
  end if;

  update catalog_private.products
  set
    status = 'archived',
    archived_at = now(),
    active_publication_id = null,
    row_version = row_version + 1,
    updated_at = now()
  where id = p_product_id
    and row_version = p_expected_version;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  update catalog_private.catalog_state
  set revision = revision + 1, updated_at = now()
  where singleton
  returning revision into next_catalog_revision;

  insert into ops_private.cache_invalidation_jobs (
    operation_key,
    tags,
    safety_revision
  ) values (
    'catalog-archive:' || p_idempotency_key,
    array[
      'catalog',
      'product:' || current_product.slug,
      'category',
      'sitemap'
    ],
    next_catalog_revision
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
    'product.archive',
    'product',
    p_product_id::text,
    array[
      'status',
      'archived_at',
      'active_publication_id',
      'catalog_revision'
    ],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'catalogRevision', next_catalog_revision,
    'product', catalog_private.admin_product_document(p_product_id)
  );
  return ops_private.admin_command_finish(
    actor_id,
    'product.archive',
    p_idempotency_key,
    p_product_id,
    result
  );
end
$function$;

alter function api.admin_product_archive(uuid, bigint, text, text)
  owner to admin_catalog_owner;
revoke all on function api.admin_product_archive(uuid, bigint, text, text)
  from public, anon;
grant execute on function api.admin_product_archive(uuid, bigint, text, text)
  to authenticated;

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
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'revision', state.revision::text,
    'generatedAt', now(),
    'products', product_documents.documents,
    'skus', sku_documents.documents
  )
  from catalog_private.catalog_state state
  cross join product_documents
  cross join sku_documents
  where state.singleton
$function$;

alter function api.catalog_snapshot_read() owner to catalog_snapshot_owner;
revoke all on function api.catalog_snapshot_read() from public;
grant execute on function api.catalog_snapshot_read()
  to anon, authenticated, storefront_rpc_caller;

create or replace function api.admin_inventory_command(
  p_variant_id uuid,
  p_expected_version bigint,
  p_operation_key text,
  p_request_hash text,
  p_kind text,
  p_delta integer,
  p_order_id uuid default null,
  p_reservation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  current_balance commerce_private.inventory_balances%rowtype;
  next_on_hand integer;
  next_reserved integer;
  next_safety_stock integer;
  delta_on_hand_value integer := 0;
  delta_reserved_value integer := 0;
  delta_safety_value integer := 0;
  movement_quantity integer;
  movement_id uuid;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'fulfillment'],
    false
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'inventory.command',
    p_operation_key,
    p_request_hash
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result') || jsonb_build_object('replayed', true);
  end if;
  if p_operation_key is null or length(p_operation_key) < 8 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if p_kind not in (
    'receive',
    'reserve',
    'release',
    'sale',
    'cancel_restock',
    'return_sellable',
    'return_damaged',
    'adjustment',
    'safety_stock'
  ) then
    raise exception 'INVALID_INVENTORY_KIND';
  end if;
  if p_delta is null
    or p_delta = 0
    or (
      p_kind not in ('adjustment', 'safety_stock')
      and p_delta < 0
    )
  then
    raise exception 'INVALID_INVENTORY_DELTA';
  end if;
  if exists (
    select 1
    from commerce_private.inventory_movements movement
    where movement.operation_key = p_operation_key
  ) then
    raise exception 'INVENTORY_OPERATION_CONFLICT';
  end if;

  select *
  into current_balance
  from commerce_private.inventory_balances
  where sku_id = p_variant_id
  for update;
  if not found then
    raise exception 'UNKNOWN_SKU' using errcode = 'P0002';
  end if;
  if current_balance.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  case p_kind
    when 'receive' then
      delta_on_hand_value := p_delta;
    when 'reserve' then
      delta_reserved_value := p_delta;
    when 'release' then
      delta_reserved_value := -p_delta;
    when 'sale' then
      delta_on_hand_value := -p_delta;
      delta_reserved_value := -p_delta;
    when 'cancel_restock' then
      delta_on_hand_value := p_delta;
    when 'return_sellable' then
      delta_on_hand_value := p_delta;
    when 'return_damaged' then
      delta_on_hand_value := 0;
    when 'adjustment' then
      delta_on_hand_value := p_delta;
    when 'safety_stock' then
      delta_safety_value := p_delta;
  end case;

  next_on_hand := current_balance.on_hand + delta_on_hand_value;
  next_reserved := current_balance.reserved + delta_reserved_value;
  next_safety_stock :=
    current_balance.safety_stock + delta_safety_value;
  if next_on_hand < 0
    or next_reserved < 0
    or next_safety_stock < 0
    or next_reserved + next_safety_stock > next_on_hand
  then
    raise exception 'INSUFFICIENT_INVENTORY';
  end if;

  update commerce_private.inventory_balances
  set
    on_hand = next_on_hand,
    reserved = next_reserved,
    safety_stock = next_safety_stock,
    row_version = row_version + 1
  where sku_id = p_variant_id
    and row_version = p_expected_version
  returning * into current_balance;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  movement_quantity := abs(p_delta);
  insert into commerce_private.inventory_movements (
    operation_key,
    sku_id,
    kind,
    quantity,
    delta_on_hand,
    delta_reserved,
    delta_safety_stock,
    order_id,
    reservation_id
  ) values (
    p_operation_key,
    p_variant_id,
    p_kind,
    movement_quantity,
    delta_on_hand_value,
    delta_reserved_value,
    delta_safety_value,
    p_order_id,
    p_reservation_id
  )
  returning id into movement_id;

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
    'inventory.' || p_kind,
    'inventory_balance',
    p_variant_id::text,
    array['on_hand', 'reserved', 'safety_stock', 'row_version'],
    p_operation_key
  );

  result := jsonb_build_object(
    'movementId', movement_id,
    'variantId', p_variant_id,
    'rowVersion', current_balance.row_version,
    'onHand', current_balance.on_hand,
    'reserved', current_balance.reserved,
    'safetyStock', current_balance.safety_stock,
    'sellable', greatest(
      current_balance.on_hand
        - current_balance.reserved
        - current_balance.safety_stock,
      0
    ),
    'updatedAt', current_balance.updated_at
  );
  return ops_private.admin_command_finish(
    actor_id,
    'inventory.command',
    p_operation_key,
    p_variant_id,
    result
  );
end
$function$;

alter function api.admin_inventory_command(
  uuid,
  bigint,
  text,
  text,
  text,
  integer,
  uuid,
  uuid
) owner to admin_inventory_owner;
revoke all on function api.admin_inventory_command(
  uuid,
  bigint,
  text,
  text,
  text,
  integer,
  uuid,
  uuid
) from public, anon;
grant execute on function api.admin_inventory_command(
  uuid,
  bigint,
  text,
  text,
  text,
  integer,
  uuid,
  uuid
) to authenticated;

-- Include expansion tables in the read-only backup role. RLS remains forced,
-- so each table also receives an explicit backup policy.
grant select on
  catalog_private.product_related_products,
  catalog_private.product_media,
  catalog_private.product_publications,
  catalog_private.catalog_state
to backup_exporter;

create policy backup_exporter_select_product_related_products
on catalog_private.product_related_products
for select
to backup_exporter
using (true);

create policy backup_exporter_select_product_media
on catalog_private.product_media
for select
to backup_exporter
using (true);

create policy backup_exporter_select_product_publications
on catalog_private.product_publications
for select
to backup_exporter
using (true);

create policy backup_exporter_select_catalog_state
on catalog_private.catalog_state
for select
to backup_exporter
using (true);

-- Direct access to private commerce data remains denied. API reachability is
-- opt-in per function, independently from RLS.
revoke all on
  catalog_private.product_related_products,
  catalog_private.product_media,
  catalog_private.product_publications,
  catalog_private.catalog_state
from public, anon, authenticated;
revoke all on sequence catalog_private.product_code_seq
  from public, anon, authenticated;

revoke all on function catalog_private.reject_product_delete()
  from public, anon, authenticated;
revoke all on function catalog_private.guard_price_version_mutation()
  from public, anon, authenticated;
revoke all on function commerce_private.bump_inventory_row_version()
  from public, anon, authenticated;
revoke all on function ops_private.protect_last_active_owner()
  from public, anon, authenticated;

alter default privileges in schema catalog_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema catalog_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema catalog_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema commerce_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema ops_private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api
  revoke execute on functions from public, anon, authenticated;

comment on function api.catalog_snapshot_read() is
  'Returns one versioned immutable public catalog envelope. revision is decimal text; UUIDs and exact inventory are excluded.';
comment on function api.admin_product_publish(uuid, bigint, text, text, uuid) is
  'Owner-only recent-TOTP publication command. Snapshot, active pointer, revision, audit, cache job, and idempotency result commit atomically.';
comment on table catalog_private.product_publications is
  'Immutable per-product publication snapshots. Never update or delete; rollback creates a new publication.';

commit;
