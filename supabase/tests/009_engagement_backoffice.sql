begin;

do $test$
declare
  target record;
  role_name text;
  function_signature text;
  function_definition text;
  function_owner text;
  function_security_definer boolean;
  function_search_path text[];
begin
  for target in
    select *
    from (values
      ('engagement_private', 'appointments'),
      ('engagement_private', 'newsletter_consents'),
      ('engagement_private', 'newsletter_campaign_drafts')
    ) as tables(schema_name, table_name)
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = target.schema_name
        and relation.relname = target.table_name
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) then
      raise exception '%.% is missing forced RLS',
        target.schema_name,
        target.table_name;
    end if;

    foreach role_name in array array[
      'anon',
      'authenticated',
      'service_role'
    ]
    loop
      if has_table_privilege(
        role_name,
        format('%I.%I', target.schema_name, target.table_name),
        'select'
      ) or has_table_privilege(
        role_name,
        format('%I.%I', target.schema_name, target.table_name),
        'insert'
      ) or has_table_privilege(
        role_name,
        format('%I.%I', target.schema_name, target.table_name),
        'update'
      ) or has_table_privilege(
        role_name,
        format('%I.%I', target.schema_name, target.table_name),
        'delete'
      ) then
        raise exception '% has direct access to %.%',
          role_name,
          target.schema_name,
          target.table_name;
      end if;
    end loop;
  end loop;

  if (
    select count(*)
    from pg_constraint constraint_record
    where constraint_record.conrelid in (
      'engagement_private.appointments'::regclass,
      'engagement_private.newsletter_consents'::regclass
    )
      and constraint_record.conname in (
        'appointments_schedule_check',
        'newsletter_consents_state_timestamps_check'
      )
      and constraint_record.convalidated
  ) <> 2 then
    raise exception 'Engagement state invariants are missing or unvalidated';
  end if;

  foreach function_signature in array array[
    'api.admin_appointments_list(text,integer,integer)',
    'api.admin_appointment_state_command(uuid,bigint,text,timestamp with time zone,text,text)',
    'api.admin_newsletter_consents_list(text,integer,integer)',
    'api.admin_newsletter_consent_command(uuid,bigint,text,text,text)',
    'api.admin_newsletter_campaigns_list(text,integer,integer)',
    'api.admin_newsletter_campaign_create(bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_update(uuid,bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_state_command(uuid,bigint,text,text,text)'
  ]
  loop
    if to_regprocedure(function_signature) is null then
      raise exception 'Missing engagement function %',
        function_signature;
    end if;

    select
      pg_get_userbyid(procedure.proowner),
      procedure.prosecdef,
      procedure.proconfig
    into
      function_owner,
      function_security_definer,
      function_search_path
    from pg_proc procedure
    where procedure.oid = function_signature::regprocedure;

    if function_owner <> 'backoffice_ops_owner'
      or not function_security_definer
      or not exists (
        select 1
        from unnest(
          coalesce(function_search_path, array[]::text[])
        ) configuration
        where configuration in ('search_path=', 'search_path=""')
      )
    then
      raise exception
        'Engagement function % lost owner/security/search_path boundary',
        function_signature;
    end if;

    if not has_function_privilege(
      'authenticated',
      function_signature,
      'execute'
    ) or has_function_privilege(
      'anon',
      function_signature,
      'execute'
    ) or has_function_privilege(
      'service_role',
      function_signature,
      'execute'
    ) or has_function_privilege(
      'storefront_rpc_caller',
      function_signature,
      'execute'
    ) or has_function_privilege(
      'worker_rpc_caller',
      function_signature,
      'execute'
    ) then
      raise exception 'Engagement function % has unsafe grants',
        function_signature;
    end if;
  end loop;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_appointments_list(text,integer,integer)'::regprocedure;
  if position('require_admin_role(' in function_definition) = 0
    or position(
      'array[''owner'', ''support'']'
      in function_definition
    ) = 0
    or position(
      '''hasContact'''
      in function_definition
    ) = 0
    or position(
      '''hasMessage'''
      in function_definition
    ) = 0
    or position(
      '''contactEnvelope'''
      in function_definition
    ) > 0
    or position(
      '''messageEnvelope'''
      in function_definition
    ) > 0
    or position(
      'select appointment.*'
      in function_definition
    ) > 0
  then
    raise exception
      'Appointment list lost its AAL2 role or sealed-data projection';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_appointment_state_command(uuid,bigint,text,timestamp with time zone,text,text)'::regprocedure;
  if position('require_admin_role(' in function_definition) = 0
    or position('admin_command_begin(' in function_definition) = 0
    or position('admin_command_finish(' in function_definition) = 0
    or position(
      'appointment.row_version <> p_expected_version'
      in function_definition
    ) = 0
    or position(
      'row_version = p_expected_version'
      in function_definition
    ) = 0
    or position('p_scheduled_for is null' in function_definition) = 0
    or position('insert into ops_private.audit_events'
      in function_definition) = 0
  then
    raise exception
      'Appointment command lost authorization, CAS, idempotency, or audit';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_newsletter_consents_list(text,integer,integer)'::regprocedure;
  if position('require_admin_role(' in function_definition) = 0
    or position(
      'array[''owner'', ''support'']'
      in function_definition
    ) = 0
    or position('email_hmac' in function_definition) > 0
    or position('token_hash' in function_definition) > 0
    or position('select consent.*' in function_definition) > 0
  then
    raise exception
      'Consent list lost its AAL2 role or safe projection';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_newsletter_consent_command(uuid,bigint,text,text,text)'::regprocedure;
  if position(
    'p_target_state is distinct from ''unsubscribed'''
    in function_definition
  ) = 0
    or position(
      'array[''owner'', ''support'']'
      in function_definition
    ) = 0
    or position('admin_command_begin(' in function_definition) = 0
    or position('admin_command_finish(' in function_definition) = 0
    or position(
      'consent.row_version <> p_expected_version'
      in function_definition
    ) = 0
    or position(
      'row_version = p_expected_version'
      in function_definition
    ) = 0
    or position('insert into ops_private.audit_events'
      in function_definition) = 0
  then
    raise exception
      'Consent command can re-subscribe or lost CAS/idempotency/audit';
  end if;

  foreach function_signature in array array[
    'api.admin_newsletter_campaign_create(bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_update(uuid,bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_state_command(uuid,bigint,text,text,text)'
  ]
  loop
    select procedure.prosrc
    into function_definition
    from pg_proc procedure
    where procedure.oid = function_signature::regprocedure;

    if position('require_admin_role(' in function_definition) = 0
      or position(
        'array[''owner'', ''merchandiser'']'
        in function_definition
      ) = 0
      or position('admin_command_begin(' in function_definition) = 0
      or position('admin_command_finish(' in function_definition) = 0
      or position('insert into ops_private.audit_events'
        in function_definition) = 0
    then
      raise exception
        'Campaign mutation % lost authorization, idempotency, or audit',
        function_signature;
    end if;
  end loop;

  foreach function_signature in array array[
    'api.admin_appointment_state_command(uuid,bigint,text,timestamp with time zone,text,text)',
    'api.admin_newsletter_consent_command(uuid,bigint,text,text,text)',
    'api.admin_newsletter_campaign_create(bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_update(uuid,bigint,text,text,text,text,text,text)',
    'api.admin_newsletter_campaign_state_command(uuid,bigint,text,text,text)'
  ]
  loop
    select procedure.prosrc
    into function_definition
    from pg_proc procedure
    where procedure.oid = function_signature::regprocedure;

    if position('request_hash_value := encode(' in function_definition) = 0
      or position('extensions.digest(' in function_definition) = 0
      or (
        char_length(function_definition)
        - char_length(replace(
          function_definition,
          'p_request_hash',
          ''
        ))
      ) / char_length('p_request_hash') <> 1
    then
      raise exception
        'Engagement mutation % trusts its caller supplied request hash',
        function_signature;
    end if;
  end loop;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_newsletter_campaign_update(uuid,bigint,text,text,text,text,text,text)'::regprocedure;
  if position(
    'campaign.row_version <> p_expected_version'
    in function_definition
  ) = 0
    or position(
      'row_version = p_expected_version'
      in function_definition
    ) = 0
    or position(
      'campaign.state <> ''draft'''
      in function_definition
    ) = 0
  then
    raise exception 'Campaign update lost CAS or draft-only guard';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_newsletter_campaign_state_command(uuid,bigint,text,text,text)'::regprocedure;
  if position(
    'require_admin_role(array[''owner''], true)'
    in function_definition
  ) = 0
    or position(
      'NEWSLETTER_DELIVERY_NOT_CONFIGURED'
      in function_definition
    ) = 0
    or position('outbox' in lower(function_definition)) > 0
    or position('resend' in lower(function_definition)) > 0
    or position(
      'campaign.row_version <> p_expected_version'
      in function_definition
    ) = 0
    or position(
      'row_version = p_expected_version'
      in function_definition
    ) = 0
  then
    raise exception
      'Campaign state command lost recent Owner/CAS or delivery fail-close';
  end if;
end
$test$;

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
    '72000000-0000-4000-8000-000000000090',
    'authenticated',
    'authenticated',
    'sql-engagement-owner@estatelignee.test',
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000092',
    'authenticated',
    'authenticated',
    'sql-engagement-support@estatelignee.test',
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000094',
    'authenticated',
    'authenticated',
    'sql-engagement-merchandiser@estatelignee.test',
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
    '72000000-0000-4000-8000-000000000091',
    '72000000-0000-4000-8000-000000000090',
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000093',
    '72000000-0000-4000-8000-000000000092',
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000095',
    '72000000-0000-4000-8000-000000000094',
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
    '72000000-0000-4000-8000-000000000090',
    'owner',
    'active',
    'SQL Engagement Owner',
    'sql-engagement-owner@estatelignee.test'
  ),
  (
    '72000000-0000-4000-8000-000000000092',
    'support',
    'active',
    'SQL Engagement Support',
    'sql-engagement-support@estatelignee.test'
  ),
  (
    '72000000-0000-4000-8000-000000000094',
    'merchandiser',
    'active',
    'SQL Engagement Merchandiser',
    'sql-engagement-merchandiser@estatelignee.test'
  );

insert into engagement_private.appointments (
  id,
  contact_envelope,
  message_envelope,
  key_version
) values (
  '72000000-0000-4000-8000-000000000001',
  jsonb_build_object('ciphertext', 'sealed-contact-test'),
  jsonb_build_object('ciphertext', 'sealed-message-test'),
  1
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '72000000-0000-4000-8000-000000000090',
    'role', 'authenticated',
    'aal', 'aal1',
    'session_id', '72000000-0000-4000-8000-000000000091',
    'iat', extract(epoch from now())
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000090',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $aal1_denied$
begin
  perform api.admin_appointments_list(null, 50, 0);
  raise exception 'AAL1 session reached engagement data';
exception
  when others then
    if sqlerrm <> 'ADMIN_AAL2_REQUIRED' then
      raise;
    end if;
end
$aal1_denied$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '72000000-0000-4000-8000-000000000090',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '72000000-0000-4000-8000-000000000091',
    'iat', extract(epoch from now()),
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now())
    ))
  )::text,
  true
);

do $server_authoritative_hash$
declare
  first_result jsonb;
  replay_result jsonb;
  stored_hash text;
begin
  first_result := api.admin_appointment_state_command(
    '72000000-0000-4000-8000-000000000001',
    1,
    'confirmed',
    '2026-07-30T06:30:00Z'::timestamptz,
    'sql-engagement-appointment-0001',
    repeat('f', 64)
  );
  if first_result->>'state' <> 'confirmed'
    or (first_result->>'version')::bigint <> 2
    or (first_result->>'replayed')::boolean
  then
    raise exception 'Appointment command did not complete exactly once';
  end if;

  replay_result := api.admin_appointment_state_command(
    '72000000-0000-4000-8000-000000000001',
    1,
    'confirmed',
    '2026-07-30T06:30:00Z'::timestamptz,
    'sql-engagement-appointment-0001',
    repeat('0', 64)
  );
  if not (replay_result->>'replayed')::boolean
    or (replay_result->>'version')::bigint <> 2
  then
    raise exception
      'Equivalent payload did not replay after caller hash changed';
  end if;

  select command.request_hash
  into stored_hash
  from ops_private.idempotency_commands command
  where command.actor_scope =
      'admin:72000000-0000-4000-8000-000000000090'
    and command.command_name = 'appointment.state'
    and command.idempotency_key =
      'sql-engagement-appointment-0001';
  if stored_hash is null
    or stored_hash in (repeat('f', 64), repeat('0', 64))
  then
    raise exception 'Caller supplied request hash was persisted';
  end if;

  begin
    perform api.admin_appointment_state_command(
      '72000000-0000-4000-8000-000000000001',
      1,
      'cancelled',
      null,
      'sql-engagement-appointment-0001',
      repeat('f', 64)
    );
    raise exception 'Changed payload reused an engagement idempotency key';
  exception
    when others then
      if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then
        raise;
      end if;
  end;
end
$server_authoritative_hash$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '72000000-0000-4000-8000-000000000092',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '72000000-0000-4000-8000-000000000093',
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
  '72000000-0000-4000-8000-000000000092',
  true
);

do $support_scope$
begin
  perform api.admin_newsletter_consents_list(null, 50, 0);
  begin
    perform api.admin_newsletter_campaigns_list(null, 50, 0);
    raise exception 'Support reached campaign drafts';
  exception
    when others then
      if sqlerrm <> 'ADMIN_ROLE_FORBIDDEN' then
        raise;
      end if;
  end;
end
$support_scope$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '72000000-0000-4000-8000-000000000094',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '72000000-0000-4000-8000-000000000095',
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
  '72000000-0000-4000-8000-000000000094',
  true
);

do $merchandiser_scope$
begin
  perform api.admin_newsletter_campaigns_list(null, 50, 0);
  begin
    perform api.admin_newsletter_consents_list(null, 50, 0);
    raise exception 'Merchandiser reached consent ledger';
  exception
    when others then
      if sqlerrm <> 'ADMIN_ROLE_FORBIDDEN' then
        raise;
      end if;
  end;
end
$merchandiser_scope$;

rollback;
