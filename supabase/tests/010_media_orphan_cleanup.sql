begin;

do $test$
declare
  function_definition text;
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'ops_private'
      and relation.relname = 'media_orphan_cleanup_candidates'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) then
    raise exception 'Media orphan cleanup queue is missing forced RLS';
  end if;

  if has_table_privilege(
    'anon',
    'ops_private.media_orphan_cleanup_candidates',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'ops_private.media_orphan_cleanup_candidates',
    'select'
  ) or has_table_privilege(
    'service_role',
    'ops_private.media_orphan_cleanup_candidates',
    'select'
  ) then
    raise exception 'Cleanup queue has a direct runtime table grant';
  end if;

  select pg_get_constraintdef(constraint_record.oid)
  into function_definition
  from pg_constraint constraint_record
  where constraint_record.conrelid =
      'ops_private.worker_command_receipts'::regclass
    and constraint_record.conname =
      'worker_command_receipts_command_name_check';
  if function_definition is null
    or position('media_orphan_cleanup.claim' in function_definition) = 0
    or position('media_orphan_cleanup.complete' in function_definition) = 0
    or position('auth_recovery.claim' in function_definition) = 0
    or position('auth_recovery.complete' in function_definition) = 0
  then
    raise exception 'Worker receipt command allowlist omits cleanup commands';
  end if;

  select pg_get_constraintdef(constraint_record.oid)
  into function_definition
  from pg_constraint constraint_record
  where constraint_record.conrelid =
      'ops_private.media_orphan_cleanup_candidates'::regclass
    and constraint_record.conname =
      'media_orphan_cleanup_coordinates_check';
  if function_definition is null
    or position('lignee-product-source' in function_definition) = 0
    or position('lignee-public-derivatives' in function_definition) = 0
    or position('lignee-support-attachments' in function_definition) = 0
    or position('incoming/product/' in function_definition) = 0
    or position('incoming/support/' in function_definition) = 0
    or position(
      'object_kind = ''source''' in lower(function_definition)
    ) = 0
    or position('sha256 is null' in lower(function_definition)) = 0
  then
    raise exception 'Cleanup coordinates do not bind exact source buckets';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'catalog_private.media_assets'::regclass
      and tgname = 'media_assets_cleanup_registration_guard'
      and tgenabled <> 'D'
  ) then
    raise exception 'Media registration is not fenced against cleanup';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'ops_private.media_upload_intents'::regclass
      and tgname = 'media_upload_intents_stage_source_cleanup'
      and tgenabled <> 'D'
  ) then
    raise exception 'Private source cleanup is not staged with the intent';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'ops_private.media_upload_intents'::regclass
      and tgname = 'media_upload_intents_cleanup_finalization_guard'
      and tgenabled <> 'D'
  ) then
    raise exception 'Finalized source paths are not fenced from cleanup';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'ops_private.stage_media_source_cleanup_candidate()'::regprocedure;
  if position('''lignee-product-source''' in function_definition) = 0
    or position('''lignee-support-attachments''' in function_definition) = 0
    or position('new.scope = ''product''' in function_definition) = 0
    or position('new.source_path' in function_definition) = 0
    or position('interval ''2 hours''' in function_definition) = 0
    or position('interval ''4 hours''' in function_definition) = 0
  then
    raise exception 'Source cleanup bucket/grace mapping is incomplete';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'catalog_private.guard_media_asset_cleanup_registration()'
      ::regprocedure;
  if position('for update' in lower(function_definition)) = 0
    or position('pg_advisory_xact_lock' in function_definition) = 0
    or position('media-orphan:' in function_definition) = 0
    or position('media-source-orphan:' in function_definition) = 0
    or position('MEDIA_DERIVATIVES_REQUIRE_REUPLOAD'
      in function_definition) = 0
    or position('''leased''' in function_definition) = 0
    or position('''quarantined''' in function_definition) = 0
    or position('state = ''protected''' in function_definition) = 0
  then
    raise exception 'Media registration cleanup fence is incomplete';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'ops_private.guard_media_upload_intent_cleanup_finalization()'
      ::regprocedure;
  if position('media-source-orphan:' in function_definition) = 0
    or position('candidate.object_path = new.source_path'
      in function_definition) = 0
    or position('state = ''protected''' in function_definition) = 0
    or position('MEDIA_SOURCE_REQUIRES_REUPLOAD'
      in function_definition) = 0
    or position('''leased''' in function_definition) = 0
    or position('''retry_pending''' in function_definition) = 0
    or position('''quarantined''' in function_definition) = 0
    or position('''deleted''' in function_definition) = 0
    or position('''dead_letter''' in function_definition) = 0
  then
    raise exception 'Finalized source cleanup fence is incomplete';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_media_orphan_cleanup_stage(text,text,text,text,bigint,text,text,jsonb)'
      ::regprocedure;
  if position(
      'require_admin_role' in function_definition
    ) = 0
    or position('ROW_VERSION_CONFLICT' in function_definition) = 0
    or position('jsonb_array_length(p_derivatives) <> 6'
      in function_definition) = 0
    or position('MEDIA_ORPHAN_CLEANUP_IN_PROGRESS'
      in function_definition) = 0
    or position('interval ''6 hours''' in function_definition) = 0
    or position('extensions.digest' in function_definition) = 0
    or position('declaredRequestHash' in function_definition) = 0
    or position('pg_advisory_xact_lock' in function_definition) = 0
    or position('media-orphan:' in function_definition) = 0
  then
    raise exception 'Cleanup staging lost authorization, CAS, or grace';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_media_orphan_cleanup_claim(text,text,text,timestamp with time zone,integer)'
      ::regprocedure;
  if position('auth.jwt()->>''role'' <> ''service_role'''
      in function_definition) = 0
    or position('for update skip locked'
      in lower(function_definition)) = 0
    or position('state = ''protected''' in function_definition) = 0
    or position('state = ''quarantined''' in function_definition) = 0
    or position('worker_command_begin' in function_definition) = 0
    or position('pg_advisory_xact_lock' in function_definition) = 0
    or position('for update skip locked' in lower(function_definition)) = 0
    or position('limit 100' in lower(function_definition)) = 0
    or position('media_asset_references_cleanup_object'
      in function_definition) = 0
  then
    raise exception 'Cleanup claim lost service, reference, or lease guards';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'catalog_private.media_asset_references_cleanup_object(text,text,text,text)'
      ::regprocedure;
  if position('asset.source_object_path = p_object_path'
      in function_definition) = 0
    or position('intent.state = ''finalized''' in function_definition) = 0
    or position('asset.sha256 = p_sha256' in function_definition) = 0
    or position('derivative->>''objectPath''' in function_definition) = 0
  then
    raise exception 'Cleanup reference check omits source or derivative assets';
  end if;

  if not exists (
    select 1
    from pg_indexes index_record
    where index_record.schemaname = 'ops_private'
      and index_record.tablename = 'media_orphan_cleanup_candidates'
      and index_record.indexname =
        'media_orphan_cleanup_expired_lease_idx'
      and index_record.indexdef like '%lease_expires_at%'
      and index_record.indexdef like '%WHERE (state = ''leased''%'
  ) then
    raise exception 'Expired media cleanup leases lack a partial index';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.worker_media_orphan_cleanup_complete(text,text,text,text,text,text,text,integer,timestamp with time zone)'
      ::regprocedure;
  if position(
      'candidate.lease_token is distinct from p_lease_token::uuid'
      in function_definition
    ) = 0
    or position('MEDIA_CLEANUP_EVIDENCE_REQUIRED'
      in function_definition) = 0
    or position('state = target_state' in function_definition) = 0
    or position('''retry_pending''' in function_definition) = 0
    or position('''dead_letter''' in function_definition) = 0
  then
    raise exception 'Cleanup completion lost fencing or retry evidence';
  end if;

  if has_function_privilege(
    'authenticated',
    'api.worker_media_orphan_cleanup_claim(text,text,text,timestamp with time zone,integer)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'api.worker_media_orphan_cleanup_claim(text,text,text,timestamp with time zone,integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'api.worker_media_orphan_cleanup_complete(text,text,text,text,text,text,text,integer,timestamp with time zone)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'api.worker_media_orphan_cleanup_complete(text,text,text,text,text,text,text,integer,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'Cleanup worker RPC grants are unsafe';
  end if;

  if position(
    'delete from storage.objects' in lower(function_definition)
  ) > 0 then
    raise exception 'Cleanup must delete bytes through the Storage API';
  end if;
end
$test$;

rollback;
