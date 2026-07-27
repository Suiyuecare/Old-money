begin;

do $test$
begin
  if has_schema_privilege('anon', 'catalog_private', 'usage') then
    raise exception 'anon can use catalog_private';
  end if;
  if has_schema_privilege('authenticated', 'commerce_private', 'usage') then
    raise exception 'authenticated can use commerce_private';
  end if;
  if has_function_privilege('anon', 'api.catalog_read_all()', 'execute') then
    raise exception 'anon can execute catalog RPC';
  end if;
  if has_function_privilege(
    'storefront_rpc_caller',
    'api.apply_inventory_operation(text,uuid,text,integer,uuid,uuid)',
    'execute'
  ) then
    raise exception 'storefront can execute generic inventory operation';
  end if;
  if has_function_privilege(
    'storefront_rpc_caller',
    'api.fail_close_runtime(bigint,text,text)',
    'execute'
  ) then
    raise exception 'storefront can fail-close runtime';
  end if;
  if has_table_privilege(
    'storefront_rpc_caller',
    'commerce_private.orders',
    'select'
  ) then
    raise exception 'storefront has direct order table access';
  end if;
  if has_table_privilege(
    'worker_rpc_caller',
    'ops_private.admin_memberships',
    'select'
  ) then
    raise exception 'worker has direct admin membership access';
  end if;
  if has_table_privilege(
    'admin_rpc_caller',
    'ops_private.audit_events',
    'delete'
  ) then
    raise exception 'admin can delete audit events';
  end if;
  if has_table_privilege(
    'backup_exporter',
    'commerce_private.orders',
    'insert,update,delete'
  ) then
    raise exception 'backup exporter has write access';
  end if;
end
$test$;

rollback;
