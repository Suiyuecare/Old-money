begin;

create or replace function
  catalog_private.media_rendered_dimensions_valid(p_manifest jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  derivative jsonb;
  variant_width text;
  rendered_width text;
  rendered_height text;
begin
  if jsonb_typeof(p_manifest->'derivatives') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p_manifest->'derivatives') <> 6 then
    return false;
  end if;

  for derivative in
    select value
    from jsonb_array_elements(p_manifest->'derivatives') item(value)
  loop
    if jsonb_typeof(derivative) is distinct from 'object' then
      return false;
    end if;
    variant_width := derivative->>'width';
    rendered_width := derivative->>'renderedWidth';
    rendered_height := derivative->>'height';
    if coalesce(variant_width, '') !~ '^(800|1200|1600)$'
      or coalesce(rendered_width, '') !~ '^[1-9][0-9]{0,3}$'
      or coalesce(rendered_height, '') !~ '^[1-9][0-9]{0,7}$'
    then
      return false;
    end if;
    if rendered_width::integer > variant_width::integer then
      return false;
    end if;
  end loop;

  if (
    select count(distinct (
      item.value->>'width',
      item.value->>'format'
    ))
    from jsonb_array_elements(p_manifest->'derivatives') item(value)
    where item.value->>'format' in ('webp', 'avif')
  ) <> 6 then
    return false;
  end if;

  return true;
end
$function$;

alter function catalog_private.media_rendered_dimensions_valid(jsonb)
  owner to admin_catalog_owner;
revoke all on function
  catalog_private.media_rendered_dimensions_valid(jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  catalog_private.media_rendered_dimensions_valid(jsonb)
to admin_catalog_owner, backoffice_ops_owner;

create or replace function catalog_private.validate_media_rendered_dimensions()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.object_class in ('public_catalog', 'private_case')
    and not catalog_private.media_rendered_dimensions_valid(new.manifest)
  then
    raise exception 'INVALID_MEDIA_RENDERED_DIMENSIONS';
  end if;
  return new;
end
$function$;

alter function catalog_private.validate_media_rendered_dimensions()
  owner to admin_catalog_owner;
revoke all on function
  catalog_private.validate_media_rendered_dimensions()
from public, anon, authenticated, service_role;

create trigger media_assets_rendered_dimensions
before insert or update of manifest, object_class
on catalog_private.media_assets
for each row execute function
  catalog_private.validate_media_rendered_dimensions();

alter table catalog_private.media_assets
  add constraint media_assets_rendered_dimensions_check
  check (
    object_class = 'private_anchor'
    or catalog_private.media_rendered_dimensions_valid(manifest)
  )
  not valid;

alter table catalog_private.media_assets
  validate constraint media_assets_rendered_dimensions_check;

comment on function
  catalog_private.media_rendered_dimensions_valid(jsonb) is
  'Validates six unique derivative coordinates and their actual rendered pixel dimensions without unsafe casts.';

comment on function
  catalog_private.validate_media_rendered_dimensions() is
  'Rejects missing or invalid rendered dimensions before a derivative-bearing media manifest is stored.';

commit;
