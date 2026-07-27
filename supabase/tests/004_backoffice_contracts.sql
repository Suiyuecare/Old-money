begin;

do $test$
declare
  signature text;
  required_signatures constant text[] := array[
    'api.admin_session_context()',
    'api.admin_dashboard()',
    'api.admin_inventory_list(text,integer,integer)',
    'api.admin_orders_list(text,integer,integer)',
    'api.admin_audit_list(integer,integer,text,text)',
    'api.admin_taxonomy_list(text)',
    'api.admin_taxonomy_upsert(text,uuid,bigint,text,text,jsonb)',
    'api.admin_taxonomy_archive(text,uuid,bigint,text,text)',
    'api.admin_media_upload_intent_reserve(text,text,text,text,bigint,text,jsonb)',
    'api.admin_media_finalize(text,text,text,text,bigint,jsonb)',
    'api.admin_media_transition(uuid,bigint,text,text,text,boolean,text)',
    'api.public_media_resolve(text,text)',
    'api.bootstrap_initial_owners(uuid,text,text,uuid,text,text,text,text)',
    'api.admin_member_invite_prepare(text,text,text,text,text)',
    'api.admin_member_invite_complete(uuid,uuid,bigint,text,text)',
    'api.admin_staff_list(integer,integer)',
    'api.admin_staff_state_command(uuid,bigint,text,text,text,text)',
    'api.admin_owner_recovery_request(uuid,text,text,text)',
    'api.admin_owner_recovery_context()',
    'api.admin_owner_recovery_approve(uuid,bigint,text,text)',
    'api.worker_auth_recovery_claim(text,text,text,timestamp with time zone,integer)',
    'api.worker_auth_recovery_complete(text,text,text,text,text,text,jsonb,text,integer,timestamp with time zone)',
    'api.admin_operations_command(text,text,bigint,text,text,jsonb)',
    'api.admin_operations_projection_get(text)',
    'api.admin_operations_queue(text,integer,integer)',
    'api.operations_provider_event_store(text,text,text,text,text,boolean,jsonb)',
    'api.operations_payment_callback_record(text,text,text,text,text,jsonb)',
    'api.worker_operations_claim(text,timestamp with time zone,integer)',
    'api.worker_operations_dispatch_start(text,text,timestamp with time zone)',
    'api.worker_operations_complete(text,text,text,text,jsonb,text,integer,timestamp with time zone)',
    'api.admin_release_batch_list()',
    'api.admin_release_batch_create(uuid,text,uuid[],text,text)',
    'api.admin_release_batch_save(uuid,bigint,text,uuid[],text,text)',
    'api.admin_release_batch_readiness_set(uuid,bigint,text,text,text)',
    'api.admin_release_batch_publish(uuid,bigint,text,text)',
    'api.admin_runtime_controls_read()',
    'api.public_runtime_controls_read()',
    'api.admin_runtime_controls_update(bigint,text,text,jsonb)',
    'api.bootstrap_estate_no01(jsonb,text)'
  ];
begin
  foreach signature in array required_signatures
  loop
    if to_regprocedure(signature) is null then
      raise exception 'Missing required backoffice RPC: %', signature;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'api.admin_session_context()',
    'execute'
  ) then
    raise exception 'authenticated cannot execute admin session RPC';
  end if;
  if has_function_privilege(
    'anon',
    'api.admin_session_context()',
    'execute'
  ) then
    raise exception 'anon can execute admin session RPC';
  end if;
  if not has_function_privilege(
    'authenticated',
    'api.admin_audit_list(integer,integer,text,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'api.admin_audit_list(integer,integer,text,text)',
    'execute'
  ) then
    raise exception 'Audit list RPC grants are incorrect';
  end if;

  if not has_function_privilege(
    'anon',
    'api.public_media_resolve(text,text)',
    'execute'
  ) then
    raise exception 'anon cannot resolve approved public media';
  end if;
  if has_function_privilege(
    'anon',
    'api.bootstrap_estate_no01(jsonb,text)',
    'execute'
  ) then
    raise exception 'anon can execute the Estate bootstrap';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.bootstrap_estate_no01(jsonb,text)',
    'execute'
  ) then
    raise exception 'service_role cannot execute the Estate bootstrap';
  end if;
  if has_function_privilege(
    'anon',
    'api.admin_runtime_controls_update(bigint,text,text,jsonb)',
    'execute'
  ) then
    raise exception 'anon can mutate runtime controls';
  end if;
  if not has_function_privilege(
    'authenticated',
    'api.admin_runtime_controls_update(bigint,text,text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot reach guarded runtime controls RPC';
  end if;
  if not has_function_privilege(
    'anon',
    'api.public_runtime_controls_read()',
    'execute'
  ) or not has_function_privilege(
    'storefront_rpc_caller',
    'api.public_runtime_controls_read()',
    'execute'
  ) then
    raise exception 'Public runtime controls RPC grants are incomplete';
  end if;

  if not has_function_privilege(
    'worker_rpc_caller',
    'api.worker_operations_claim(text,timestamp with time zone,integer)',
    'execute'
  ) then
    raise exception 'worker role cannot claim durable operation jobs';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.worker_operations_claim(text,timestamp with time zone,integer)',
    'execute'
  ) then
    raise exception 'server-only service role cannot claim operation jobs';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.worker_operations_complete(text,text,text,text,jsonb,text,integer,timestamp with time zone)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'api.operations_provider_event_store(text,text,text,text,text,boolean,jsonb)',
    'execute'
  ) then
    raise exception 'service role is missing an operations worker RPC grant';
  end if;
  if has_function_privilege(
    'authenticated',
    'api.worker_operations_claim(text,timestamp with time zone,integer)',
    'execute'
  ) then
    raise exception 'authenticated can claim durable operation jobs';
  end if;
  if not has_function_privilege(
    'worker_rpc_caller',
    'api.operations_payment_callback_record(text,text,text,text,text,jsonb)',
    'execute'
  ) then
    raise exception 'worker cannot durably record payment callbacks';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.operations_payment_callback_record(text,text,text,text,text,jsonb)',
    'execute'
  ) then
    raise exception 'service role cannot durably record payment callbacks';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.bootstrap_initial_owners(uuid,text,text,uuid,text,text,text,text)',
    'execute'
  ) then
    raise exception 'service role cannot perform initial Owner bootstrap';
  end if;
  if has_function_privilege(
    'authenticated',
    'api.bootstrap_initial_owners(uuid,text,text,uuid,text,text,text,text)',
    'execute'
  ) then
    raise exception 'authenticated can perform initial Owner bootstrap';
  end if;
  if not has_function_privilege(
    'authenticated',
    'api.admin_owner_recovery_context()',
    'execute'
  ) or has_function_privilege(
    'anon',
    'api.admin_owner_recovery_context()',
    'execute'
  ) then
    raise exception 'Owner recovery context grants are incorrect';
  end if;
  if not has_function_privilege(
    'service_role',
    'api.worker_auth_recovery_claim(text,text,text,timestamp with time zone,integer)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'api.worker_auth_recovery_complete(text,text,text,text,text,text,jsonb,text,integer,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'Service role cannot consume Auth recovery jobs';
  end if;
  if has_function_privilege(
    'authenticated',
    'api.worker_auth_recovery_claim(text,text,text,timestamp with time zone,integer)',
    'execute'
  ) then
    raise exception 'authenticated can claim Auth recovery jobs';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname in ('backoffice_ops_owner', 'media_resolver_owner')
      and (rolsuper or rolbypassrls or rolinherit)
  ) then
    raise exception 'Backoffice owner role has unsafe role attributes';
  end if;
end
$test$;

rollback;
