begin;

do $role_contract$
declare
  function_definition text;
begin
  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_catalog_list(text,text,integer,integer)'::regprocedure;
  if position(
    'array[''owner'', ''merchandiser'']'
    in function_definition
  ) = 0 then
    raise exception
      'Catalog list RPC lost its Owner/Merchandiser read boundary';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_product_get(uuid)'::regprocedure;
  if position(
    'array[''owner'', ''merchandiser'']'
    in function_definition
  ) = 0 then
    raise exception
      'Product document RPC lost its Owner/Merchandiser read boundary';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_inventory_list(text,integer,integer)'::regprocedure;
  if position(
    'array[''owner'', ''fulfillment'']'
    in function_definition
  ) = 0 then
    raise exception
      'Inventory list RPC lost its Owner/Fulfillment read boundary';
  end if;
end
$role_contract$;

set local role postgres;

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
) values
  (
    '79000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'sql-role-boundary-support@estatelignee.test',
    now(),
    now()
  ),
  (
    '79000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'sql-role-boundary-fulfillment@estatelignee.test',
    now(),
    now()
  ),
  (
    '79000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'sql-role-boundary-merchandiser@estatelignee.test',
    now(),
    now()
  );

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at
) values
  (
    '79000000-0000-4000-8000-000000000002',
    '79000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    '79000000-0000-4000-8000-000000000004',
    '79000000-0000-4000-8000-000000000003',
    now(),
    now()
  ),
  (
    '79000000-0000-4000-8000-000000000006',
    '79000000-0000-4000-8000-000000000005',
    now(),
    now()
  );

insert into ops_private.admin_memberships (
  user_id,
  role,
  state,
  display_name,
  email
) values
  (
    '79000000-0000-4000-8000-000000000001',
    'support',
    'active',
    'SQL Role Boundary Support',
    'sql-role-boundary-support@estatelignee.test'
  ),
  (
    '79000000-0000-4000-8000-000000000003',
    'fulfillment',
    'active',
    'SQL Role Boundary Fulfillment',
    'sql-role-boundary-fulfillment@estatelignee.test'
  ),
  (
    '79000000-0000-4000-8000-000000000005',
    'merchandiser',
    'active',
    'SQL Role Boundary Merchandiser',
    'sql-role-boundary-merchandiser@estatelignee.test'
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '79000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '79000000-0000-4000-8000-000000000002',
    'iat', extract(epoch from now()),
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now())
    ))
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  '79000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $support_denied$
begin
  begin
    perform api.admin_catalog_list(null, null, 1, 0);
    raise exception 'Support read the catalog list';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;

  begin
    perform api.admin_product_get(
      '79000000-0000-4000-8000-000000000099'
    );
    raise exception 'Support read a product document';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;

  begin
    perform api.admin_inventory_list(null, 1, 0);
    raise exception 'Support read exact inventory';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;
end
$support_denied$;

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '79000000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '79000000-0000-4000-8000-000000000004',
    'iat', extract(epoch from now()),
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now())
    ))
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  '79000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $fulfillment_denied$
begin
  begin
    perform api.admin_catalog_list(null, null, 1, 0);
    raise exception 'Fulfillment read the catalog list';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;

  begin
    perform api.admin_product_get(
      '79000000-0000-4000-8000-000000000099'
    );
    raise exception 'Fulfillment read a product document';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;
end
$fulfillment_denied$;

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '79000000-0000-4000-8000-000000000005',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '79000000-0000-4000-8000-000000000006',
    'iat', extract(epoch from now()),
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now())
    ))
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  '79000000-0000-4000-8000-000000000005',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $merchandiser_denied$
begin
  begin
    perform api.admin_inventory_list(null, 1, 0);
    raise exception 'Merchandiser read exact inventory';
  exception
    when others then
      if sqlstate <> '42501'
        or sqlerrm <> 'ADMIN_ROLE_FORBIDDEN'
      then
        raise;
      end if;
  end;
end
$merchandiser_denied$;

reset role;

rollback;
