begin;

set local role postgres;

do $test$
declare
  category_id_value uuid;
  chapter_id_value uuid;
  product_id_value uuid;
  publication_id_value uuid;
  public_snapshot jsonb;
  mutation_rejected boolean := false;
  invalid_snapshot_rejected boolean := false;
  hard_delete_rejected boolean := false;
begin
  if exists (
    select 1
    from (values
      (
        'apparel',
        '為城市、田野與宅邸日常保留從容的克制剪裁。'
      ),
      (
        'accessories',
        '在每日使用中留下時間質地的隨身物件。'
      ),
      (
        'home',
        '從藏書室到長桌晚宴，為生活留下安靜秩序。'
      ),
      (
        'stationery',
        '讓記錄、書信與整理成為可以延續的儀式。'
      ),
      (
        'tennis',
        '為私人草地球場與會所往返而設計的十件系列。'
      )
    ) expected(code, description)
    left join catalog_private.categories category
      on category.code = expected.code
    where category.id is null
      or category.description <> expected.description
      or category.route_segment <> expected.code
  ) then
    raise exception 'Estate category taxonomy diverges from static parity';
  end if;

  if exists (
    select 1
    from (values
      (
        'first-light-in-the-field',
        '清晨的草露、馬房與通往林地的第一段路。'
      ),
      (
        'the-conservatory-hour',
        '午後光線穿過玻璃，在葉影與衣褶間停留。'
      ),
      (
        'after-rain-the-library',
        '濕潤木質氣息與紙頁聲，構成回到室內的節奏。'
      ),
      (
        'dinner-at-the-long-table',
        '燭光、織物與器物，讓款待保有從容。'
      ),
      (
        'the-private-court',
        '白線、短草與會所露台，構成午後比賽的分寸。'
      )
    ) expected(code, description)
    left join catalog_private.chapters chapter
      on chapter.code = expected.code
    where chapter.id is null
      or chapter.description <> expected.description
      or chapter.route_segment <> expected.code
  ) then
    raise exception 'Estate chapter taxonomy diverges from static parity';
  end if;

  select id into category_id_value
  from catalog_private.categories
  order by sort_order
  limit 1;
  select id into chapter_id_value
  from catalog_private.chapters
  order by sort_order
  limit 1;

  insert into catalog_private.products (
    product_code,
    slug,
    name_en,
    name_zh,
    category_id,
    chapter_id,
    launch_position,
    status
  ) values (
    'LIG-000051',
    'sql-contract-product-51',
    'Contract Product 51',
    '合約測試商品五十一',
    category_id_value,
    chapter_id_value,
    51,
    'draft'
  )
  returning id into product_id_value;

  if (
    select count(*)
    from catalog_private.products
    where status <> 'archived'
  ) <> 51 then
    raise exception 'The catalog still enforces a global 50-product ceiling';
  end if;

  begin
    delete from catalog_private.products where id = product_id_value;
  exception
    when others then
      hard_delete_rejected := sqlerrm = 'PRODUCT_HARD_DELETE_FORBIDDEN';
  end;
  if not hard_delete_rejected then
    raise exception 'Product hard delete was not rejected';
  end if;

  insert into catalog_private.product_publications (
    product_id,
    version,
    snapshot,
    content_sha256,
    published_by,
    publisher_scope
  ) values (
    product_id_value,
    1,
    jsonb_build_object(
      'product', jsonb_build_object(
        'materialConcepts', jsonb_build_array('contract-material'),
        'optionAxes', jsonb_build_array(
          jsonb_build_object('code', 'contract-option')
        )
      ),
      'skus', jsonb_build_array(
        jsonb_build_object('id', 'contract-sku')
      ),
      'media', '[]'::jsonb
    ),
    repeat('a', 64),
    null,
    'system'
  )
  returning id into publication_id_value;

  begin
    update catalog_private.product_publications
    set snapshot = snapshot
    where id = publication_id_value;
  exception
    when others then
      mutation_rejected := sqlerrm = 'APPEND_ONLY_TABLE';
  end;
  if not mutation_rejected then
    raise exception 'Publication snapshot mutation was not rejected';
  end if;

  begin
    insert into catalog_private.product_publications (
      product_id,
      version,
      snapshot,
      content_sha256,
      published_by,
      publisher_scope
    ) values (
      product_id_value,
      2,
      jsonb_build_object(
        'product', jsonb_build_object(
          'materialConcepts', '[]'::jsonb,
          'optionAxes', '[]'::jsonb
        ),
        'skus', '[]'::jsonb
      ),
      repeat('b', 64),
      null,
      'system'
    );
  exception
    when others then
      invalid_snapshot_rejected := sqlerrm = 'INVALID_PUBLICATION_SNAPSHOT';
  end;
  if not invalid_snapshot_rejected then
    raise exception 'Empty publication snapshot was not rejected';
  end if;

  update catalog_private.products
  set
    active_publication_id = publication_id_value,
    status = 'published',
    published_at = now(),
    slug_locked_at = now()
  where id = product_id_value;

  public_snapshot := api.catalog_snapshot_read();
  if jsonb_typeof(public_snapshot->'media') <> 'array'
    or jsonb_typeof(public_snapshot->'categories') <> 'array'
    or jsonb_typeof(public_snapshot->'chapters') <> 'array'
    or jsonb_array_length(public_snapshot->'categories') < 1
    or jsonb_array_length(public_snapshot->'chapters') < 1
    or exists (
      select 1
      from jsonb_array_elements(public_snapshot->'categories') category
      where coalesce(btrim(category->>'description'), '') = ''
    )
    or exists (
      select 1
      from jsonb_array_elements(public_snapshot->'chapters') chapter
      where coalesce(btrim(chapter->>'description'), '') = ''
    )
    or exists (
      select 1
      from jsonb_array_elements(public_snapshot->'products') product
      where product ? 'launchGateCodes'
    )
  then
    raise exception 'Public snapshot media/taxonomy/redaction contract is invalid';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'catalog_private.price_versions'::regclass
      and tgname = 'price_versions_guard_mutation'
      and tgenabled <> 'D'
  ) then
    raise exception 'Append-only price guard is missing or disabled';
  end if;
end
$test$;

rollback;
