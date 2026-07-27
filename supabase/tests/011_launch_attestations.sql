begin;

do $contract$
declare
  role_name text;
  function_definition text;
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'ops_private'
      and relation.relname = 'launch_attestations'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'launch_attestations is missing forced RLS';
  end if;

  foreach role_name in array array[
    'anon',
    'authenticated',
    'service_role'
  ]
  loop
    if has_table_privilege(
      role_name,
      'ops_private.launch_attestations',
      'select'
    ) or has_table_privilege(
      role_name,
      'ops_private.launch_attestations',
      'insert'
    ) or has_table_privilege(
      role_name,
      'ops_private.launch_attestations',
      'update'
    ) or has_table_privilege(
      role_name,
      'ops_private.launch_attestations',
      'delete'
    ) then
      raise exception '% has direct launch evidence access', role_name;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'api.admin_launch_attestation_record(bigint,text,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'api.admin_launch_attestation_record(bigint,text,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'service_role',
    'api.admin_launch_attestation_record(bigint,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Launch attestation RPC has unsafe grants';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_launch_attestation_record(bigint,text,text,text,text)'::regprocedure;
  if position(
    'require_admin_role(array[''owner''], true)'
    in function_definition
  ) = 0
    or position('request_hash_value := encode(' in function_definition) = 0
    or position('for update' in lower(function_definition)) = 0
    or position('ROW_VERSION_CONFLICT' in function_definition) = 0
    or position(
      'insert into ops_private.launch_attestations'
      in function_definition
    ) = 0
    or position(
      'insert into ops_private.audit_events'
      in function_definition
    ) = 0
    or position(
      'insert into ops_private.cache_invalidation_jobs'
      in function_definition
    ) = 0
  then
    raise exception
      'Launch attestation RPC lost Owner/AAL2/CAS/idempotency/audit gates';
  end if;
end
$contract$;

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
    '77000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'sql-launch-owner@estatelignee.test',
    now(),
    now()
  ),
  (
    '77000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'sql-launch-merchandiser@estatelignee.test',
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
    '77000000-0000-4000-8000-000000000002',
    '77000000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    '77000000-0000-4000-8000-000000000004',
    '77000000-0000-4000-8000-000000000003',
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
    '77000000-0000-4000-8000-000000000001',
    'owner',
    'active',
    'SQL Launch Owner',
    'sql-launch-owner@estatelignee.test'
  ),
  (
    '77000000-0000-4000-8000-000000000003',
    'merchandiser',
    'active',
    'SQL Launch Merchandiser',
    'sql-launch-merchandiser@estatelignee.test'
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '77000000-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '77000000-0000-4000-8000-000000000004',
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
  '77000000-0000-4000-8000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $merchandiser_denied$
declare
  controls_version bigint;
begin
  controls_version :=
    (api.public_runtime_controls_read()->>'version')::bigint;
  begin
    perform api.admin_launch_attestation_record(
      controls_version,
      'catalog',
      'catalog-denied',
      repeat('a', 64),
      'sql-launch-merchandiser-denied'
    );
    raise exception 'Merchandiser recorded launch evidence';
  exception
    when others then
      if sqlerrm <> 'ADMIN_ROLE_FORBIDDEN' then raise; end if;
  end;
end
$merchandiser_denied$;

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '77000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '77000000-0000-4000-8000-000000000002',
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
  '77000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $owner_attestation$
declare
  initial_version bigint;
  first_result jsonb;
  replay_result jsonb;
  controls jsonb;
begin
  initial_version :=
    (api.public_runtime_controls_read()->>'version')::bigint;
  first_result := api.admin_launch_attestation_record(
    initial_version,
    'catalog',
    'catalog-2026-07-28',
    repeat('b', 64),
    'sql-launch-owner-catalog-0001'
  );
  if first_result->>'kind' <> 'catalog'
    or first_result->>'value' <> 'catalog-2026-07-28'
    or (first_result->>'controlsVersion')::bigint <> initial_version + 1
  then
    raise exception 'Owner launch attestation returned malformed result';
  end if;

  replay_result := api.admin_launch_attestation_record(
    initial_version,
    'catalog',
    'catalog-2026-07-28',
    repeat('b', 64),
    'sql-launch-owner-catalog-0001'
  );
  if replay_result->>'replayed' <> 'true' then
    raise exception 'Launch attestation replay was not idempotent';
  end if;

  controls := api.public_runtime_controls_read();
  if controls->>'catalogApprovalRevision' <> 'catalog-2026-07-28'
    or (controls->>'version')::bigint <> initial_version + 1
  then
    raise exception 'Public runtime controls lost durable launch evidence';
  end if;

  begin
    perform api.admin_launch_attestation_record(
      initial_version,
      'catalog',
      'catalog-different',
      repeat('c', 64),
      'sql-launch-owner-catalog-0001'
    );
    raise exception 'Launch attestation reused key for a different payload';
  exception
    when others then
      if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then raise; end if;
  end;

  begin
    perform api.admin_launch_attestation_record(
      initial_version,
      'legal',
      'legal-stale',
      repeat('d', 64),
      'sql-launch-owner-stale-0002'
    );
    raise exception 'Stale launch attestation version was accepted';
  exception
    when others then
      if sqlerrm <> 'ROW_VERSION_CONFLICT' then raise; end if;
  end;
end
$owner_attestation$;

reset role;

do $append_only$
declare
  attestation_id uuid;
begin
  select id into attestation_id
  from ops_private.launch_attestations
  where kind = 'catalog'
  limit 1;
  begin
    update ops_private.launch_attestations
    set value = 'tampered'
    where id = attestation_id;
    raise exception 'Launch attestation was mutable';
  exception
    when others then
      if sqlerrm <> 'APPEND_ONLY_TABLE' then raise; end if;
  end;
end
$append_only$;

rollback;
