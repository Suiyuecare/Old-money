begin;

do $test$
declare
  public_products integer;
  seeded_variants integer;
  seeded_prices integer;
  category_counts integer[];
  chapter_counts integer[];
  tables_without_rls integer;
begin
  select count(*) into public_products
  from catalog_private.products
  where status <> 'archived';
  if public_products <> 50 then
    raise exception 'Expected 50 seeded products, found %', public_products;
  end if;

  select count(*) into seeded_variants
  from catalog_private.product_variants;
  if seeded_variants <> 189 then
    raise exception 'Expected 189 seeded variants, found %', seeded_variants;
  end if;

  select count(*) into seeded_prices
  from catalog_private.price_versions;
  if seeded_prices <> 189 then
    raise exception 'Expected 189 seeded price snapshots, found %', seeded_prices;
  end if;

  select array_agg(product_count order by sort_order) into category_counts
  from (
    select category.sort_order, count(product.id)::integer as product_count
    from catalog_private.categories category
    left join catalog_private.products product on product.category_id = category.id
    group by category.sort_order
  ) counted;
  if category_counts <> array[16, 10, 9, 5, 10] then
    raise exception 'Unexpected category split: %', category_counts;
  end if;

  select array_agg(product_count order by sort_order) into chapter_counts
  from (
    select chapter.sort_order, count(product.id)::integer as product_count
    from catalog_private.chapters chapter
    left join catalog_private.products product on product.chapter_id = chapter.id
    group by chapter.sort_order
  ) counted;
  if chapter_counts <> array[13, 9, 11, 7, 10] then
    raise exception 'Unexpected chapter split: %', chapter_counts;
  end if;

  select count(*) into tables_without_rls
  from pg_tables
  where schemaname in (
    'catalog_private',
    'commerce_private',
    'ops_private',
    'engagement_private'
  )
  and (not rowsecurity or not forcerowsecurity);
  if tables_without_rls <> 0 then
    raise exception '% application tables are missing forced RLS', tables_without_rls;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname in (
      'storefront_rpc_caller',
      'worker_rpc_caller',
      'admin_rpc_caller',
      'backup_exporter',
      'catalog_reader_owner',
      'inventory_command_owner',
      'ops_command_owner'
    )
    and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Application role has superuser or BYPASSRLS';
  end if;
end
$test$;

rollback;
