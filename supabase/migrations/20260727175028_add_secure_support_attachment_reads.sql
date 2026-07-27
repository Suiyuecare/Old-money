begin;

-- Support attachments remain private Storage objects. These two read
-- boundaries return either an allowlisted browser projection or the single
-- server-only object coordinate needed to stream a metadata-stripped
-- derivative. Both functions deliberately re-run the database AAL2,
-- membership, role and session-revocation checks on every call.

create or replace function api.admin_support_attachments_list(
  p_case_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_case_uuid uuid;
  support_case ops_private.support_cases%rowtype;
  attachments jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );

  if p_case_id is null
    or char_length(p_case_id) > 64
    or (
      p_case_id !~ '^case-[a-f0-9]{20}$'
      and p_case_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    )
  then
    raise exception 'INVALID_SUPPORT_CASE_ID' using errcode = '22023';
  end if;

  requested_case_uuid := case
    when p_case_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      then p_case_id::uuid
    else null
  end;

  select candidate.*
  into support_case
  from ops_private.support_cases candidate
  where candidate.id = requested_case_uuid
    or candidate.public_id = p_case_id;

  if not found then
    raise exception 'SUPPORT_CASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Never silently hide a linked object whose manifest no longer satisfies
  -- the immutable private-derivative contract.
  if exists (
    select 1
    from ops_private.support_case_media link
    join catalog_private.media_assets asset
      on asset.id = link.media_asset_id
    where link.support_case_id = support_case.id
      and (
        asset.object_class <> 'private_case'
        or not exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(asset.manifest->'derivatives') = 'array'
                then asset.manifest->'derivatives'
              else '[]'::jsonb
            end
          ) derivative(value)
          where derivative.value->>'width' = '1600'
            and derivative.value->>'format' = 'webp'
            and derivative.value->>'objectPath'
              = 'support/' || asset.sha256 || '/1600.webp'
            and derivative.value->>'deliveryPath' is null
            and derivative.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
            and case
              when derivative.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
                then (derivative.value->>'byteLength')::bigint
              else null
            end between 1 and 20971520
            and derivative.value->>'height' ~ '^[1-9][0-9]{0,7}$'
        )
      )
  ) then
    raise exception 'SUPPORT_ATTACHMENT_INTEGRITY_FAILURE'
      using errcode = '22000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', linked.id,
        'assetId', linked.media_asset_id,
        'sha256', linked.sha256,
        'contentType', 'image/webp',
        'byteLength', linked.derivative_byte_length,
        'width', 1600,
        'height', linked.derivative_height,
        'fileName',
          'support-' || support_case.public_id || '-'
          || left(linked.sha256, 12) || '.webp',
        'createdAt', linked.created_at
      )
      order by linked.created_at desc, linked.id
    ),
    '[]'::jsonb
  )
  into attachments
  from (
    select
      link.id,
      link.media_asset_id,
      asset.sha256,
      link.created_at,
      case
        when derivative.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
          then (derivative.value->>'byteLength')::bigint
        else null
      end as derivative_byte_length,
      case
        when derivative.value->>'height' ~ '^[1-9][0-9]{0,7}$'
          then (derivative.value->>'height')::integer
        else null
      end as derivative_height
    from ops_private.support_case_media link
    join catalog_private.media_assets asset
      on asset.id = link.media_asset_id
    join lateral (
      select candidate.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(asset.manifest->'derivatives') = 'array'
            then asset.manifest->'derivatives'
          else '[]'::jsonb
        end
      ) candidate(value)
      where candidate.value->>'width' = '1600'
        and candidate.value->>'format' = 'webp'
        and candidate.value->>'objectPath'
          = 'support/' || asset.sha256 || '/1600.webp'
        and candidate.value->>'deliveryPath' is null
        and candidate.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
        and case
          when candidate.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
            then (candidate.value->>'byteLength')::bigint
          else null
        end between 1 and 20971520
        and candidate.value->>'height' ~ '^[1-9][0-9]{0,7}$'
      limit 1
    ) derivative on true
    where link.support_case_id = support_case.id
      and asset.object_class = 'private_case'
  ) linked;

  return jsonb_build_object(
    'case', jsonb_build_object(
      'id', support_case.id,
      'publicId', support_case.public_id,
      'state', support_case.state,
      'rowVersion', support_case.row_version
    ),
    'attachments', attachments
  );
end
$function$;

alter function api.admin_support_attachments_list(text)
  owner to backoffice_ops_owner;
revoke all on function api.admin_support_attachments_list(text)
  from public, anon, service_role, storefront_rpc_caller, worker_rpc_caller;
grant execute on function api.admin_support_attachments_list(text)
  to authenticated;

comment on function api.admin_support_attachments_list(text) is
  'AAL2 owner/support projection of private support attachment metadata; never returns Storage coordinates.';

create or replace function api.admin_support_attachment_download_resolve(
  p_case_id text,
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_case_uuid uuid;
  support_case ops_private.support_cases%rowtype;
  attachment record;
begin
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );

  if p_attachment_id is null
    or p_case_id is null
    or char_length(p_case_id) > 64
    or (
      p_case_id !~ '^case-[a-f0-9]{20}$'
      and p_case_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    )
  then
    raise exception 'INVALID_SUPPORT_ATTACHMENT_COORDINATES'
      using errcode = '22023';
  end if;

  requested_case_uuid := case
    when p_case_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      then p_case_id::uuid
    else null
  end;

  select candidate.*
  into support_case
  from ops_private.support_cases candidate
  where candidate.id = requested_case_uuid
    or candidate.public_id = p_case_id;

  if not found then
    raise exception 'SUPPORT_CASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from ops_private.support_case_media link
    where link.support_case_id = support_case.id
      and link.id = p_attachment_id
  ) then
    raise exception 'SUPPORT_ATTACHMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    link.id,
    link.media_asset_id,
    asset.sha256,
    derivative.value->>'objectPath' as object_path,
    case
      when derivative.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
        then (derivative.value->>'byteLength')::bigint
      else null
    end as derivative_byte_length,
    case
      when derivative.value->>'height' ~ '^[1-9][0-9]{0,7}$'
        then (derivative.value->>'height')::integer
      else null
    end as derivative_height
  into attachment
  from ops_private.support_case_media link
  join catalog_private.media_assets asset
    on asset.id = link.media_asset_id
  join lateral (
    select candidate.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(asset.manifest->'derivatives') = 'array'
          then asset.manifest->'derivatives'
        else '[]'::jsonb
      end
    ) candidate(value)
    where candidate.value->>'width' = '1600'
      and candidate.value->>'format' = 'webp'
      and candidate.value->>'objectPath'
        = 'support/' || asset.sha256 || '/1600.webp'
      and candidate.value->>'deliveryPath' is null
      and candidate.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
      and case
        when candidate.value->>'byteLength' ~ '^[1-9][0-9]{0,7}$'
          then (candidate.value->>'byteLength')::bigint
        else null
      end between 1 and 20971520
      and candidate.value->>'height' ~ '^[1-9][0-9]{0,7}$'
    limit 1
  ) derivative on true
  where link.support_case_id = support_case.id
    and link.id = p_attachment_id
    and asset.object_class = 'private_case';

  if not found then
    raise exception 'SUPPORT_ATTACHMENT_INTEGRITY_FAILURE'
      using errcode = '22000';
  end if;

  return jsonb_build_object(
    'attachmentId', attachment.id,
    'assetId', attachment.media_asset_id,
    'caseId', support_case.id,
    'casePublicId', support_case.public_id,
    'sha256', attachment.sha256,
    'objectPath', attachment.object_path,
    'contentType', 'image/webp',
    'byteLength', attachment.derivative_byte_length,
    'width', 1600,
    'height', attachment.derivative_height,
    'fileName',
      'support-' || support_case.public_id || '-'
      || left(attachment.sha256, 12) || '.webp'
  );
end
$function$;

alter function api.admin_support_attachment_download_resolve(text, uuid)
  owner to backoffice_ops_owner;
revoke all on function api.admin_support_attachment_download_resolve(text, uuid)
  from public, anon, service_role, storefront_rpc_caller, worker_rpc_caller;
grant execute on function api.admin_support_attachment_download_resolve(text, uuid)
  to authenticated;

comment on function api.admin_support_attachment_download_resolve(text, uuid) is
  'AAL2 owner/support server resolver for one metadata-stripped private support derivative.';

commit;
