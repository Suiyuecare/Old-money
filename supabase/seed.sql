begin;

insert into catalog_private.categories (id, code, label_zh, label_en, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'apparel', '服飾', 'Apparel', 1),
  ('10000000-0000-4000-8000-000000000002', 'accessories', '配件', 'Accessories', 2),
  ('10000000-0000-4000-8000-000000000003', 'home', '居家生活', 'Home', 3),
  ('10000000-0000-4000-8000-000000000004', 'stationery', '文具', 'Stationery', 4),
  ('10000000-0000-4000-8000-000000000005', 'tennis', '網球運動', 'Tennis', 5);

insert into catalog_private.chapters (id, code, title_en, title_zh, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', 'first-light-in-the-field', 'First Light in the Field', '田野初光', 1),
  ('20000000-0000-4000-8000-000000000002', 'the-conservatory-hour', 'The Conservatory Hour', '溫室時刻', 2),
  ('20000000-0000-4000-8000-000000000003', 'after-rain-the-library', 'After Rain, the Library', '雨後，藏書室', 3),
  ('20000000-0000-4000-8000-000000000004', 'dinner-at-the-long-table', 'Dinner at the Long Table', '長桌晚宴', 4),
  ('20000000-0000-4000-8000-000000000005', 'the-private-court', 'The Private Court', '私人草地球場', 5);

with seed (
  position,
  category_code,
  chapter_code,
  slug,
  name_en,
  name_zh,
  gross_twd
) as (
  values
    (1, 'apparel', 'first-light-in-the-field', 'field-house-polo', 'Field House Polo', '田野會所 Polo 衫', 7800),
    (2, 'apparel', 'first-light-in-the-field', 'alder-oxford-shirt', 'Alder Oxford', '奧德牛津襯衫', 8800),
    (3, 'apparel', 'the-conservatory-hour', 'conservatory-knit', 'Conservatory Knit', '溫室薄針織衫', 9800),
    (4, 'apparel', 'first-light-in-the-field', 'bracken-riding-blazer', 'Bracken Riding Blazer', '蕨徑騎裝西裝外套', 28800),
    (5, 'apparel', 'the-conservatory-hour', 'long-lawn-trousers', 'Long Lawn Trousers', '長草坪西裝褲', 13800),
    (6, 'apparel', 'first-light-in-the-field', 'keeper-bermuda-shorts', 'Keeper Bermuda Shorts', '莊園守望百慕達短褲', 8800),
    (7, 'apparel', 'the-conservatory-hour', 'walled-garden-dress', 'Walled Garden Dress', '圍牆花園長洋裝', 24800),
    (8, 'apparel', 'first-light-in-the-field', 'hawthorn-trench', 'Hawthorn Trench', '山楂樹風衣', 28800),
    (9, 'apparel', 'first-light-in-the-field', 'moorland-wax-jacket', 'Moorland Wax Jacket', '荒原蠟棉獵裝外套', 24800),
    (10, 'apparel', 'after-rain-the-library', 'north-hall-overcoat', 'North Hall Overcoat', '北廳羊毛長大衣', 36800),
    (11, 'apparel', 'the-conservatory-hour', 'morning-room-cardigan', 'Morning Room Cardigan', '晨間室開襟針織衫', 12800),
    (12, 'apparel', 'first-light-in-the-field', 'orchard-roll-neck', 'Orchard Roll-Neck', '果園高領針織衫', 11800),
    (13, 'apparel', 'the-conservatory-hour', 'estate-silk-blouse', 'Estate Silk Blouse', '莊園絲質襯衫', 9800),
    (14, 'apparel', 'the-conservatory-hour', 'cedar-pleated-skirt', 'Cedar Pleated Skirt', '雪松百褶中長裙', 12800),
    (15, 'apparel', 'first-light-in-the-field', 'paddock-waistcoat', 'Paddock Waistcoat', '馬場人字紋背心', 13800),
    (16, 'apparel', 'the-conservatory-hour', 'garden-shirt-dress', 'Garden Shirt Dress', '花園襯衫洋裝', 22800),
    (17, 'accessories', 'first-light-in-the-field', 'bridle-line-belt', 'Bridle Line Belt', '韁繩線條皮帶', 6800),
    (18, 'accessories', 'the-conservatory-hour', 'glasshouse-tote', 'Glasshouse Tote', '玻璃溫室托特包', 16800),
    (19, 'accessories', 'after-rain-the-library', 'estate-dispatch-briefcase', 'Estate Dispatch Briefcase', '莊園信差公事包', 32000),
    (20, 'accessories', 'first-light-in-the-field', 'south-lawn-sunglasses', 'South Lawn Sunglasses', '南草坪太陽眼鏡', 9800),
    (21, 'accessories', 'dinner-at-the-long-table', 'long-table-tie', 'Long Table Tie', '長桌領帶', 7200),
    (22, 'accessories', 'first-light-in-the-field', 'bridle-loafers', 'Bridle Loafers', '馬銜扣樂福鞋', 14800),
    (23, 'accessories', 'first-light-in-the-field', 'keeper-riding-boots', 'Keeper Riding Boots', '莊園騎士長靴', 18800),
    (24, 'accessories', 'the-conservatory-hour', 'house-colours-silk-scarf', 'House Colours Silk Scarf', '家族色絲巾', 6800),
    (25, 'accessories', 'after-rain-the-library', 'ash-walking-umbrella', 'Ash Walking Umbrella', '梣木長柄傘', 8800),
    (26, 'accessories', 'dinner-at-the-long-table', 'signet-cufflinks', 'Signet Cufflinks', '印戒造型袖扣', 6800),
    (27, 'home', 'dinner-at-the-long-table', 'hearth-number-four-candle', 'Hearth No. 4 Candle', '四號壁爐香氛蠟燭', 3200),
    (28, 'home', 'after-rain-the-library', 'wet-cedar-diffuser', 'Wet Cedar Diffuser', '雨杉擴香', 4800),
    (29, 'home', 'first-light-in-the-field', 'stable-door-throw', 'Stable Door Throw', '馬房門毛毯', 12800),
    (30, 'home', 'dinner-at-the-long-table', 'breakfast-room-mug', 'Breakfast Room Mug', '早餐室馬克杯', 2200),
    (31, 'home', 'after-rain-the-library', 'library-service-tray', 'Library Service Tray', '藏書室木製托盤', 7600),
    (32, 'home', 'dinner-at-the-long-table', 'manor-table-linen', 'Manor Table Linen', '莊園桌巾組', 8800),
    (33, 'home', 'dinner-at-the-long-table', 'long-hall-candlesticks', 'Long Hall Candlesticks', '長廳燭台', 12800),
    (34, 'home', 'dinner-at-the-long-table', 'drawing-room-cushion', 'Drawing Room Cushion', '會客室羊毛靠墊', 6800),
    (35, 'home', 'after-rain-the-library', 'library-bookends', 'Library Bookends', '藏書室書擋', 7600),
    (36, 'stationery', 'after-rain-the-library', 'estate-ledger-notebook', 'Estate Ledger Notebook', '莊園簿冊筆記本', 5800),
    (37, 'stationery', 'after-rain-the-library', 'correspondence-pen', 'Correspondence Pen', '書信原子筆', 3800),
    (38, 'stationery', 'after-rain-the-library', 'valet-desk-tray', 'Valet Desk Tray', '管家桌面收納盤', 6800),
    (39, 'stationery', 'after-rain-the-library', 'house-correspondence-cards', 'House Correspondence Cards', '私人書信卡組', 2200),
    (40, 'stationery', 'after-rain-the-library', 'brass-letter-opener', 'Brass Letter Opener', '黃銅拆信刀', 3800),
    (41, 'tennis', 'the-private-court', 'ash-tone-tennis-racquet', 'Ash-Tone Tennis Racquet', '梣木色網球拍', 18800),
    (42, 'tennis', 'the-private-court', 'baseline-tennis-dress', 'Baseline Tennis Dress', '底線網球洋裝', 9800),
    (43, 'tennis', 'the-private-court', 'pavilion-pleated-skirt', 'Pavilion Pleated Skirt', '看台百褶網球裙', 7800),
    (44, 'tennis', 'the-private-court', 'match-point-cable-vest', 'Match Point Cable Vest', '賽末點麻花針織背心', 8800),
    (45, 'tennis', 'the-private-court', 'house-championship-tennis-balls', 'House Championship Tennis Balls', '家族錦標賽網球組', 2800),
    (46, 'tennis', 'the-private-court', 'bridle-leather-racquet-cover', 'Bridle Leather Racquet Cover', '韁繩皮革球拍套', 9800),
    (47, 'tennis', 'the-private-court', 'clubhouse-tailored-shorts', 'Clubhouse Tailored Shorts', '會所剪裁網球短褲', 7800),
    (48, 'tennis', 'the-private-court', 'centre-court-performance-polo', 'Centre Court Performance Polo', '中央球場機能 Polo 衫', 7800),
    (49, 'tennis', 'the-private-court', 'centre-line-court-shoes', 'Centre Line Court Shoes', '中線網球鞋', 12800),
    (50, 'tennis', 'the-private-court', 'clubhouse-racquet-tote', 'Clubhouse Racquet Tote', '會所球拍托特包', 16800)
),
inserted_products as (
  insert into catalog_private.products (
    id,
    product_code,
    slug,
    name_en,
    name_zh,
    category_id,
    chapter_id,
    launch_position,
    status,
    sandbox_price_notice
  )
  select
    ('30000000-0000-4000-8000-' || lpad(seed.position::text, 12, '0'))::uuid,
    'LIG-ENO1-' || lpad(seed.position::text, 3, '0'),
    seed.slug,
    seed.name_en,
    seed.name_zh,
    category.id,
    chapter.id,
    seed.position,
    'ready',
    true
  from seed
  join catalog_private.categories category on category.code = seed.category_code
  join catalog_private.chapters chapter on chapter.code = seed.chapter_code
  returning id, product_code, launch_position
),
inserted_variants as (
  insert into catalog_private.product_variants (
    id,
    product_id,
    sku_code,
    option_values,
    facts_status,
    enabled
  )
  select
    (
      '40000000-0000-4000-8000-' ||
      lpad(((product.launch_position * 100) + variant_option.option_ordinal)::text, 12, '0')
    )::uuid,
    product.id,
    product.product_code || '-' || lpad(variant_option.option_ordinal::text, 2, '0'),
    variant_option.option_values,
    'requires_approval',
    false
  from inserted_products product
  cross join lateral (
    select
      ((size_value.ordinality - 1) * 2 + color_value.ordinality)::integer as option_ordinal,
      jsonb_build_object(
        'size', size_value.value,
        'color', color_value.value
      ) as option_values
    from unnest(array['s', 'm', 'l']::text[]) with ordinality as size_value(value, ordinality)
    cross join unnest(array['estate-olive', 'warm-ivory']::text[])
      with ordinality as color_value(value, ordinality)
    where product.launch_position between 1 and 16

    union all

    select
      ((size_value.ordinality - 1) * 2 + finish_value.ordinality)::integer,
      jsonb_build_object(
        'size', size_value.value,
        'finish', finish_value.value
      )
    from unnest(array['85cm', '95cm']::text[]) with ordinality as size_value(value, ordinality)
    cross join unnest(array['estate-dark', 'warm-natural']::text[])
      with ordinality as finish_value(value, ordinality)
    where product.launch_position = 17

    union all

    select
      finish_value.ordinality::integer,
      jsonb_build_object(
        'format', 'launch-sample',
        'finish', finish_value.value
      )
    from unnest(array['estate-dark', 'warm-natural']::text[])
      with ordinality as finish_value(value, ordinality)
    where product.launch_position between 18 and 21
       or product.launch_position between 24 and 40

    union all

    select
      ((size_value.ordinality - 1) * 2 + finish_value.ordinality)::integer,
      jsonb_build_object(
        'size', size_value.value,
        'finish', finish_value.value
      )
    from unnest(array['eu-40', 'eu-42']::text[]) with ordinality as size_value(value, ordinality)
    cross join unnest(array['estate-dark', 'warm-natural']::text[])
      with ordinality as finish_value(value, ordinality)
    where product.launch_position in (22, 23)

    union all

    select
      grip_value.ordinality::integer,
      jsonb_build_object('grip', grip_value.value)
    from unnest(array['g2', 'g3']::text[]) with ordinality as grip_value(value, ordinality)
    where product.launch_position = 41

    union all

    select
      ((size_value.ordinality - 1) * 2 + color_value.ordinality)::integer,
      jsonb_build_object(
        'size', size_value.value,
        'color', color_value.value
      )
    from unnest(array['s', 'm', 'l']::text[]) with ordinality as size_value(value, ordinality)
    cross join unnest(array['court-ivory', 'deep-green']::text[])
      with ordinality as color_value(value, ordinality)
    where product.launch_position in (42, 43, 44, 47, 48)

    union all

    select
      1,
      '{"format":"launch-sample"}'::jsonb
    where product.launch_position in (45, 46, 50)

    union all

    select
      ((size_value.ordinality - 1) * 2 + color_value.ordinality)::integer,
      jsonb_build_object(
        'size', size_value.value,
        'color', color_value.value
      )
    from unnest(array['eu-40', 'eu-42']::text[]) with ordinality as size_value(value, ordinality)
    cross join unnest(array['court-ivory', 'deep-green']::text[])
      with ordinality as color_value(value, ordinality)
    where product.launch_position = 49
  ) variant_option
  returning id, product_id, sku_code
)
insert into catalog_private.price_versions (
  id,
  product_variant_id,
  version,
  gross_twd,
  tax_included,
  status
)
select
  ('5' || substr(variant.id::text, 2))::uuid,
  variant.id,
  1,
  seed.gross_twd,
  true,
  'sandbox_draft'
from seed
join inserted_variants variant
  on variant.product_id = (
    '30000000-0000-4000-8000-' || lpad(seed.position::text, 12, '0')
  )::uuid;

insert into catalog_private.release_batches (
  id,
  code,
  title,
  status,
  required_product_count
) values (
  '60000000-0000-4000-8000-000000000001',
  'estate-no-01',
  'Estate No. 01',
  'draft',
  50
);

insert into catalog_private.release_batch_products (release_batch_id, product_id)
select '60000000-0000-4000-8000-000000000001', id
from catalog_private.products;

insert into catalog_private.product_readiness_checks (
  product_id,
  check_code,
  state
)
select
  product.id,
  check_code,
  'pending'
from catalog_private.products product
cross join unnest(array[
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
]) as check_code;

insert into commerce_private.inventory_balances (
  sku_id,
  on_hand,
  reserved,
  safety_stock,
  sellable_at_launch
)
select id, 0, 0, 0, 0
from catalog_private.product_variants;

commit;
