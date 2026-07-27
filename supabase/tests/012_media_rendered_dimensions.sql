begin;

set local role postgres;

do $test$
declare
  valid_derivatives jsonb;
  valid_manifest jsonb;
  missing_rejected boolean := false;
  oversized_rejected boolean := false;
  huge_rejected boolean := false;
begin
  select jsonb_agg(
    jsonb_build_object(
      'width', coordinate.width,
      'renderedWidth', case
        when coordinate.width = 1600 then 1200
        else coordinate.width
      end,
      'height', case
        when coordinate.width = 800 then 533
        else 800
      end,
      'format', coordinate.format,
      'byteLength', 1024,
      'objectPath',
        'catalog/' || repeat('a', 64) || '/'
          || coordinate.width || '.' || coordinate.format,
      'deliveryPath',
        '/media/' || repeat('a', 64) || '/'
          || coordinate.width || '.' || coordinate.format
    )
    order by coordinate.width, coordinate.format
  )
  into valid_derivatives
  from (values
    (800, 'avif'),
    (800, 'webp'),
    (1200, 'avif'),
    (1200, 'webp'),
    (1600, 'avif'),
    (1600, 'webp')
  ) coordinate(width, format);

  valid_manifest := jsonb_build_object(
    'width', 1200,
    'height', 800,
    'derivatives', valid_derivatives
  );

  if not catalog_private.media_rendered_dimensions_valid(valid_manifest) then
    raise exception 'A valid withoutEnlargement manifest was rejected';
  end if;
  if catalog_private.media_rendered_dimensions_valid(
    valid_manifest #- array['derivatives', '0', 'renderedWidth']
  ) then
    raise exception 'Missing renderedWidth was accepted';
  end if;
  if catalog_private.media_rendered_dimensions_valid(
    jsonb_set(
      valid_manifest,
      array['derivatives', '0', 'renderedWidth'],
      '801'::jsonb
    )
  ) then
    raise exception 'Rendered width above its URL variant was accepted';
  end if;
  if catalog_private.media_rendered_dimensions_valid(
    jsonb_set(
      valid_manifest,
      array['derivatives', '0', 'renderedWidth'],
      to_jsonb(999999999999::bigint)
    )
  ) then
    raise exception 'Oversized renderedWidth was accepted or overflowed';
  end if;
  if catalog_private.media_rendered_dimensions_valid('{}'::jsonb) then
    raise exception 'A manifest without derivatives was accepted';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid =
      'catalog_private.media_assets'::regclass
      and constraint_record.conname =
        'media_assets_rendered_dimensions_check'
      and constraint_record.convalidated
  ) then
    raise exception 'Rendered-dimension constraint is absent or unvalidated';
  end if;
  if not exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid =
      'catalog_private.media_assets'::regclass
      and trigger_record.tgname = 'media_assets_rendered_dimensions'
      and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'Rendered-dimension trigger is absent or disabled';
  end if;

  insert into catalog_private.media_assets (
    sha256,
    status,
    object_class,
    byte_length,
    manifest
  ) values (
    repeat('b', 64),
    'draft',
    'public_catalog',
    1024,
    valid_manifest
  );

  begin
    insert into catalog_private.media_assets (
      sha256,
      status,
      object_class,
      byte_length,
      manifest
    ) values (
      repeat('c', 64),
      'draft',
      'public_catalog',
      1024,
      valid_manifest #- array['derivatives', '0', 'renderedWidth']
    );
  exception
    when others then
      missing_rejected := sqlerrm = 'INVALID_MEDIA_RENDERED_DIMENSIONS';
  end;
  if not missing_rejected then
    raise exception 'The table boundary accepted missing renderedWidth';
  end if;

  begin
    insert into catalog_private.media_assets (
      sha256,
      status,
      object_class,
      byte_length,
      manifest
    ) values (
      repeat('d', 64),
      'draft',
      'private_case',
      1024,
      jsonb_set(
        valid_manifest,
        array['derivatives', '0', 'renderedWidth'],
        '801'::jsonb
      )
    );
  exception
    when others then
      oversized_rejected := sqlerrm =
        'INVALID_MEDIA_RENDERED_DIMENSIONS';
  end;
  if not oversized_rejected then
    raise exception 'The table boundary accepted oversized renderedWidth';
  end if;

  begin
    insert into catalog_private.media_assets (
      sha256,
      status,
      object_class,
      byte_length,
      manifest
    ) values (
      repeat('e', 64),
      'draft',
      'public_catalog',
      1024,
      jsonb_set(
        valid_manifest,
        array['derivatives', '0', 'renderedWidth'],
        to_jsonb(999999999999::bigint)
      )
    );
  exception
    when others then
      huge_rejected := sqlerrm = 'INVALID_MEDIA_RENDERED_DIMENSIONS';
  end;
  if not huge_rejected then
    raise exception 'Huge renderedWidth bypassed the table boundary';
  end if;
end
$test$;

rollback;
