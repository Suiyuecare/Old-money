begin;

do $test$
declare
  target record;
  role_name text;
  function_definition text;
  constraint_definition text;
  function_owner text;
begin
  for target in
    select *
    from (values
      ('ops_private', 'media_upload_intents'),
      ('ops_private', 'admin_invite_operations'),
      ('ops_private', 'owner_recovery_requests'),
      ('ops_private', 'support_cases'),
      ('ops_private', 'support_case_media'),
      ('ops_private', 'support_case_notes'),
      ('ops_private', 'worker_command_receipts'),
      ('ops_private', 'operation_projections'),
      ('ops_private', 'operation_jobs'),
      ('ops_private', 'outbox_jobs'),
      ('catalog_private', 'estate_bootstrap_imports')
    ) as tables(schema_name, table_name)
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = target.schema_name
        and relation.relname = target.table_name
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) then
      raise exception '%.% is missing forced RLS',
        target.schema_name,
        target.table_name;
    end if;

    foreach role_name in array array['anon', 'authenticated']
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

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'ops_private.require_admin_role(text[],boolean)'::regprocedure;
  if position('claims->>''aal'' <> ''aal2''' in function_definition) = 0
    or position('mfa/totp' in function_definition) = 0
    or position('interval ''10 minutes''' in function_definition) = 0
    or position('sessions_revoked_at' in function_definition) = 0
  then
    raise exception 'Admin authorization function lost an AAL2/session guard';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'ops_private.require_owner_recovery_requester(uuid)'::regprocedure;
  if position('claims->>''aal'' not in (''aal1'', ''aal2'')'
      in function_definition) = 0
    or position('actor_id <> p_target_user_id' in function_definition) = 0
    or position('membership.role <> ''owner''' in function_definition) = 0
    or position('sessions_revoked_at' in function_definition) = 0
  then
    raise exception 'Owner self-recovery request lost its AAL1/session gates';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_owner_recovery_approve(uuid,bigint,text,text)'::regprocedure;
  if position('recovery.requested_by = actor_id' in function_definition) = 0
    or position('sessions_revoked_at = now()' in function_definition) = 0
    or position('require_admin_role(array[''owner''], true)'
      in function_definition) = 0
  then
    raise exception 'Owner recovery approval lost dual control or revocation';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_owner_recovery_context()'::regprocedure;
  if position('require_owner_recovery_requester(actor_id)'
      in function_definition) = 0
    or position('recovery.target_user_id = actor_id'
      in function_definition) = 0
    or position('recovery.requested_by = actor_id'
      in function_definition) = 0
    or position('recovery.state = ''pending''' in function_definition) = 0
  then
    raise exception 'AAL1 Owner recovery context is not identity-bound';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_auth_recovery_claim(text,text,text,timestamp with time zone,integer)'::regprocedure;
  if position('auth.revoke_sessions_and_recover' in function_definition) = 0
    or position('for update skip locked' in lower(function_definition)) = 0
    or position('expired_candidates' in function_definition) = 0
    or position('limit 100' in lower(function_definition)) = 0
    or position('order by available_at, created_at, id'
      in lower(function_definition)) = 0
    or position(
      'AUTH_RECOVERY_LEASE_EXPIRED_EFFECT_UNKNOWN'
      in function_definition
    ) = 0
    or position('state = ''dead_letter''' in function_definition) = 0
    or position('worker_command_begin' in function_definition) = 0
    or position('worker_command_finish' in function_definition) = 0
  then
    raise exception 'Auth recovery claim lost safe lease handling';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_auth_recovery_complete(text,text,text,text,text,text,jsonb,text,integer,timestamp with time zone)'::regprocedure;
  if position('job.lease_token is distinct from p_lease_token::uuid'
      in function_definition) = 0
    or position('job.attempt_count < job.max_attempts'
      in function_definition) = 0
    or position('AUTH_RECOVERY_MAX_ATTEMPTS_EXCEEDED'
      in function_definition) = 0
    or position('safe_result - array[' in function_definition) = 0
    or position('worker_command_begin' in function_definition) = 0
    or position('worker_command_finish' in function_definition) = 0
  then
    raise exception 'Auth recovery completion lost lease/retry safeguards';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_runtime_controls_update(bigint,text,text,jsonb)'::regprocedure;
  if position(
    'require_admin_role(array[''owner''], true)'
    in function_definition
  ) = 0
    or position('revision = p_expected_version' in function_definition) = 0
    or position('runtime_controls.update' in function_definition) = 0
    or position('cache_invalidation_jobs' in function_definition) = 0
  then
    raise exception 'Runtime controls mutation lost a security/version gate';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.public_runtime_controls_read()'::regprocedure;
  if position('commerceLive' in function_definition) = 0
    or position('checkoutEnabled' in function_definition) = 0
    or position('ops_private.runtime_controls' in function_definition) = 0
    or position('secret' in lower(function_definition)) > 0
  then
    raise exception 'Public runtime controls projection is incomplete or unsafe';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'catalog_private.admin_product_document(uuid)'::regprocedure;
  if position('assetRowVersion' in function_definition) = 0
    or position('asset.row_version' in function_definition) = 0
    or position('admin_product_document_core' in function_definition) = 0
  then
    raise exception 'Admin media document lost the asset CAS version';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'catalog_private.build_publication_snapshot(uuid)'::regprocedure;
  if position('''{media}''' in function_definition) = 0
    or position('''{product,media}''' in function_definition) > 0
    or position('live_approved' in function_definition) = 0
  then
    raise exception 'Publication media is not a compatible immutable root array';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid = 'api.catalog_snapshot_read()'::regprocedure;
  if position('''media''' in function_definition) = 0
    or position('''productId''' in function_definition) = 0
    or position('''categories''' in function_definition) = 0
    or position('''chapters''' in function_definition) = 0
    or position('active.snapshot->''media''' in function_definition) = 0
  then
    raise exception 'Public catalog snapshot lost media or taxonomy';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.public_media_resolve(text,text)'::regprocedure;
  if position('publication.snapshot->''media''' in function_definition) = 0
    or position(
      'publication.snapshot->''product''->''media'''
      in function_definition
    ) > 0
  then
    raise exception 'Public media resolver ignores publication gallery media';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_media_upload_intent_reserve(text,text,text,text,bigint,text,jsonb)'::regprocedure;
  if position('ops_private.support_cases' in function_definition) = 0
    or position('commerce_private.return_cases' in function_definition) > 0
  then
    raise exception 'Support upload intents are attached to the wrong case';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_media_finalize(text,text,text,text,bigint,jsonb)'::regprocedure;
  if position('ops_private.support_cases' in function_definition) = 0
    or position('ops_private.support_case_media' in function_definition) = 0
    or position('commerce_private.return_cases' in function_definition) > 0
  then
    raise exception 'Support media finalization is attached to the wrong case';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_operations_projection_get(text)'::regprocedure;
  if position('commerce_private.orders' in function_definition) = 0
    or position('ops_private.build_order_projection'
      in function_definition) = 0
    or position('insert into' in lower(function_definition)) > 0
    or position('update ' in lower(function_definition)) > 0
    or position('delete from' in lower(function_definition)) > 0
  then
    raise exception 'Operations projection GET is not a pure authority read';
  end if;
  if not exists (
    select 1
    from pg_proc procedure
    where procedure.oid =
      'api.admin_operations_projection_get(text)'::regprocedure
      and procedure.provolatile = 's'
  ) then
    raise exception 'Projection GET must remain STABLE';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_operations_command(text,text,bigint,text,text,jsonb)'::regprocedure;
  if position('commerce_private.order_status_events'
      in function_definition) = 0
    or position('commerce_private.inventory_movements'
      in function_definition) = 0
    or position('commerce_private.refund_operations'
      in function_definition) = 0
    or position('commerce_private.invoices'
      in function_definition) = 0
    or position('commerce_private.shipments'
      in function_definition) = 0
    or position('shipment.status.update'
      in function_definition) = 0
    or position('commerce_private.return_unit_dispositions'
      in function_definition) = 0
    or position('ops_private.support_case_notes'
      in function_definition) = 0
    or position('ops_private.refresh_order_projection'
      in function_definition) = 0
    or position('request_hash_value'
      in function_definition) = 0
    or position('extensions.digest'
      in function_definition) = 0
  then
    raise exception 'Operations command lost an authoritative reducer';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'ops_private.reduce_operation_job(uuid,timestamp with time zone)'::regprocedure;
  if position('commerce_private.payment_receipts'
      in function_definition) = 0
    or position('commerce_private.refund_operations'
      in function_definition) = 0
    or position('commerce_private.invoices'
      in function_definition) = 0
    or position('commerce_private.shipments'
      in function_definition) = 0
    or position('commerce_private.inventory_movements'
      in function_definition) = 0
    or position('ops_private.refresh_order_projection'
      in function_definition) = 0
  then
    raise exception 'Worker completion lost authoritative reduction';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_audit_list(integer,integer,text,text)'::regprocedure;
  if position(
    'require_admin_role(array[''owner''], false)'
    in function_definition
  ) = 0
    or position('''actorId''' in function_definition) > 0
    or position('contact_envelope' in function_definition) > 0
    or position('email' in lower(function_definition)) > 0
  then
    raise exception 'Audit list RPC lost Owner-only or no-PII projection';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid = 'api.admin_dashboard()'::regprocedure;
  if position(
      'actor_role := ops_private.require_admin_role'
      in function_definition
    ) = 0
    or position(
      '''orderCount'', case'
      in function_definition
    ) = 0
    or position(
      'actor_role in (''owner'', ''fulfillment'', ''support'')'
      in function_definition
    ) = 0
    or position(
      '''revenueTwd'', case'
      in function_definition
    ) = 0
    or position(
      'when actor_role = ''owner'''
      in function_definition
    ) = 0
    or position(
      '''recentOrders'', case'
      in function_definition
    ) = 0
    or position(
      'else ''[]''::jsonb'
      in function_definition
    ) = 0
  then
    raise exception 'Dashboard lost its role-scoped commerce projection';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_member_invite_complete(uuid,uuid,bigint,text,text)'::regprocedure;
  if position('assert_auth_user_email' in function_definition) = 0
    or position('from auth.users' in lower(function_definition)) > 0
  then
    raise exception 'Invite completion bypasses the narrow Auth user bridge';
  end if;
  select pg_get_userbyid(procedure.proowner)
  into function_owner
  from pg_proc procedure
  where procedure.oid =
    'ops_private.assert_auth_user_email(uuid,text)'::regprocedure;
  if function_owner <> 'postgres'
    or has_function_privilege(
      'authenticated',
      'ops_private.assert_auth_user_email(uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'backoffice_ops_owner',
      'ops_private.assert_auth_user_email(uuid,text)',
      'execute'
    )
  then
    raise exception 'Narrow Auth user bridge has unsafe ownership or grants';
  end if;

  select pg_get_constraintdef(constraint_record.oid)
  into constraint_definition
  from pg_constraint constraint_record
  where constraint_record.conrelid =
      'ops_private.operation_jobs'::regclass
    and constraint_record.contype = 'c'
    and pg_get_constraintdef(constraint_record.oid) like '%state%';
  if position('completed' in constraint_definition) = 0
    or position('succeeded' in constraint_definition) > 0
    or position('failed_terminal' in constraint_definition) > 0
  then
    raise exception 'Operation job states disagree with the TS contract';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_operations_claim(text,timestamp with time zone,integer)'::regprocedure;
  if position('''id''' in function_definition) = 0
    or position('''type''' in function_definition) = 0
    or position('''safety''' in function_definition) = 0
    or position('''lastEvidenceHash''' in function_definition) = 0
    or position('''lastErrorCode''' in function_definition) = 0
    or position('ops_private.reduce_operation_job'
      in function_definition) = 0
    or position('commerce_private.refund_operations'
      in function_definition) = 0
    or position('REMOTE_EFFECT_AUTHORITY_CONFLICT'
      in function_definition) = 0
    or position(
      'with expired_safe_candidates as'
      in lower(function_definition)
    ) = 0
    or position(
      'with expired_remote_candidates as'
      in lower(function_definition)
    ) = 0
    or position(
      'update ops_private.operation_jobs as target'
      in lower(function_definition)
    ) = 0
    or position(
      'from expired_safe_candidates candidate'
      in lower(function_definition)
    ) = 0
    or position(
      'where target.id = candidate.id'
      in lower(function_definition)
    ) = 0
    or position('for update skip locked' in lower(function_definition)) = 0
    or position('limit 100' in lower(function_definition)) = 0
    or position('order by available_at, created_at, id'
      in lower(function_definition)) = 0
    or position('p_now is null' in lower(function_definition)) = 0
  then
    raise exception 'Worker claim lost its lease or authority contract';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_operations_complete(text,text,text,text,jsonb,text,integer,timestamp with time zone)'::regprocedure;
  if position('ops_private.reduce_operation_job'
      in function_definition) = 0
    or position('target_state <> ''queued'''
      in function_definition) = 0
    or position('REMOTE_EFFECT_EVIDENCE_REQUIRED'
      in function_definition) = 0
  then
    raise exception 'Worker completion bypasses authoritative reduction';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'ops_private.admin_memberships'::regclass
      and tgname = 'admin_memberships_last_owner'
      and tgenabled <> 'D'
  ) then
    raise exception 'Last active Owner protection is missing or disabled';
  end if;
  select procedure.prosrc, pg_get_userbyid(procedure.proowner)
  into function_definition, function_owner
  from pg_proc procedure
  where procedure.oid =
    'ops_private.protect_last_active_owner()'::regprocedure;
  if position('pg_advisory_xact_lock' in function_definition) = 0
    or position(
      'ops_private.admin_memberships:last-active-owner'
      in function_definition
    ) = 0
    or function_owner <> 'backoffice_ops_owner'
    or has_function_privilege(
      'authenticated',
      'ops_private.protect_last_active_owner()',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'ops_private.protect_last_active_owner()',
      'execute'
    )
  then
    raise exception 'Last active Owner protection is not concurrency-safe';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'ops_private.audit_events'::regclass
      and tgname = 'audit_events_append_only'
      and tgenabled <> 'D'
  ) then
    raise exception 'Append-only audit protection is missing or disabled';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'ops_private.support_case_notes'::regclass
      and tgname = 'support_case_notes_append_only'
      and tgenabled <> 'D'
  ) then
    raise exception 'Support case note history is not append-only';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'storage.objects'::regclass
      and tgname = 'lignee_approved_derivative_object_immutable'
      and tgenabled <> 'D'
  ) then
    raise exception 'Approved derivative object immutability is missing';
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'lignee_product_source_admin_select',
        'lignee_product_source_admin_insert',
        'lignee_product_source_admin_update',
        'lignee_product_source_admin_delete',
        'lignee_derivatives_admin_select',
        'lignee_derivatives_admin_insert',
        'lignee_derivatives_admin_update',
        'lignee_derivatives_admin_delete',
        'lignee_support_attachments_admin_select',
        'lignee_support_attachments_admin_insert',
        'lignee_support_attachments_admin_update',
        'lignee_support_attachments_admin_delete'
      )
  ) then
    raise exception 'Authenticated users retain direct Storage object access';
  end if;
  if to_regprocedure(
    'ops_private.is_admin_authorized(text[],boolean)'
  ) is not null
    or has_schema_privilege('authenticated', 'ops_private', 'usage')
    or has_function_privilege(
      'storefront_rpc_caller',
      'api.catalog_read_all()',
      'execute'
    )
  then
    raise exception 'Obsolete direct private/live-catalog access remains';
  end if;

  for target in
    select *
    from (values
      ('ops_private', 'operation_jobs_claimable'),
      ('ops_private', 'operation_jobs_expired_lease'),
      ('ops_private', 'outbox_jobs_ready_idx'),
      ('ops_private', 'outbox_jobs_expired_lease_idx'),
      ('commerce_private', 'payment_attempts_reconcile_due_idx'),
      ('catalog_private', 'products_active_publication_id_fk_idx'),
      ('commerce_private', 'invoices_order_id_fk_idx'),
      ('ops_private', 'owner_recovery_requests_target_user_id_fk_idx')
    ) as indexes(schema_name, index_name)
  loop
    if to_regclass(format(
      '%I.%I',
      target.schema_name,
      target.index_name
    )) is null then
      raise exception 'Required queue/FK index %.% is missing',
        target.schema_name,
        target.index_name;
    end if;
  end loop;

  for target in
    select *
    from (values
      ('commerce_private', 'orders', 'orders_projection_status_check'),
      ('commerce_private', 'payment_attempts', 'payment_attempts_state_check'),
      ('commerce_private', 'invoices', 'invoices_state_check'),
      ('commerce_private', 'shipments', 'shipments_state_check'),
      ('commerce_private', 'return_cases', 'return_cases_state_check'),
      (
        'commerce_private',
        'return_unit_dispositions',
        'return_unit_dispositions_state_check'
      ),
      (
        'commerce_private',
        'order_status_events',
        'order_status_events_from_state_check'
      ),
      (
        'commerce_private',
        'order_status_events',
        'order_status_events_to_state_check'
      ),
      (
        'catalog_private',
        'media_asset_transitions',
        'media_asset_transitions_from_status_check'
      ),
      (
        'catalog_private',
        'media_asset_transitions',
        'media_asset_transitions_to_status_check'
      )
    ) as constraints(schema_name, table_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_constraint constraint_record
      join pg_class relation
        on relation.oid = constraint_record.conrelid
      join pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = target.schema_name
        and relation.relname = target.table_name
        and constraint_record.conname = target.constraint_name
        and constraint_record.convalidated
    ) then
      raise exception 'Lifecycle constraint %.%.% is missing or unvalidated',
        target.schema_name,
        target.table_name,
        target.constraint_name;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'api.operations_provider_event_store(text,text,text,text,text,boolean,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated can persist provider events directly';
  end if;
  if not has_function_privilege(
    'worker_rpc_caller',
    'api.operations_provider_event_store(text,text,text,text,text,boolean,jsonb)',
    'execute'
  ) then
    raise exception 'worker cannot persist verified provider events';
  end if;
  if has_function_privilege(
    'service_role',
    'ops_private.worker_command_begin(text,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'ops_private.worker_command_finish(text,text,jsonb,boolean)',
    'execute'
  ) then
    raise exception 'Worker idempotency internals are directly callable';
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
) values (
  '76000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'sql-dashboard-merchandiser@estatelignee.test',
  now(),
  now()
);

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at
) values (
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000001',
  now(),
  now()
);

insert into ops_private.admin_memberships (
  user_id,
  role,
  state,
  display_name,
  email
) values (
  '76000000-0000-4000-8000-000000000001',
  'merchandiser',
  'active',
  'SQL Dashboard Merchandiser',
  'sql-dashboard-merchandiser@estatelignee.test'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '76000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '76000000-0000-4000-8000-000000000002',
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
  '76000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $merchandiser_dashboard$
declare
  dashboard jsonb;
begin
  dashboard := api.admin_dashboard();
  if dashboard->>'orderCount' <> '0'
    or dashboard->>'openOrderCount' <> '0'
    or dashboard->>'revenueTwd' <> '0'
    or dashboard->'recentOrders' <> '[]'::jsonb
  then
    raise exception
      'Merchandiser dashboard exposes order, revenue, or customer data';
  end if;
end
$merchandiser_dashboard$;

reset role;

rollback;
