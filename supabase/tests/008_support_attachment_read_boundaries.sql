begin;

do $test$
declare
  function_definition text;
  function_owner text;
  function_security_definer boolean;
  function_volatility "char";
begin
  foreach function_definition in array array[
    'api.admin_support_attachments_list(text)',
    'api.admin_support_attachment_download_resolve(text,uuid)'
  ]
  loop
    if to_regprocedure(function_definition) is null then
      raise exception 'Missing support attachment function %',
        function_definition;
    end if;

    select
      pg_get_userbyid(procedure.proowner),
      procedure.prosecdef,
      procedure.provolatile
    into
      function_owner,
      function_security_definer,
      function_volatility
    from pg_proc procedure
    where procedure.oid = function_definition::regprocedure;

    if function_owner <> 'backoffice_ops_owner'
      or not function_security_definer
      or function_volatility <> 's'
    then
      raise exception
        'Support attachment function % lost owner/security/volatility boundary',
        function_definition;
    end if;

    if not has_function_privilege(
      'authenticated',
      function_definition,
      'execute'
    ) or has_function_privilege(
      'anon',
      function_definition,
      'execute'
    ) or has_function_privilege(
      'service_role',
      function_definition,
      'execute'
    ) or has_function_privilege(
      'storefront_rpc_caller',
      function_definition,
      'execute'
    ) or has_function_privilege(
      'worker_rpc_caller',
      function_definition,
      'execute'
    ) then
      raise exception 'Support attachment function % has unsafe grants',
        function_definition;
    end if;
  end loop;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_support_attachments_list(text)'::regprocedure;

  if position(
    'require_admin_role(' in function_definition
  ) = 0
    or position(
      'array[''owner'', ''support'']' in function_definition
    ) = 0
    or position(
      'asset.object_class <> ''private_case''' in function_definition
    ) = 0
    or position(
      '''support/'' || asset.sha256 || ''/1600.webp''' in function_definition
    ) = 0
    or position(
      '''objectPath'', attachment' in function_definition
    ) > 0
    or position('source_object_path' in function_definition) > 0
    or position('signed' in lower(function_definition)) > 0
  then
    raise exception
      'Support attachment list lost AAL2 projection or leaked a Storage coordinate';
  end if;

  select procedure.prosrc
  into function_definition
  from pg_proc procedure
  where procedure.oid =
    'api.admin_support_attachment_download_resolve(text,uuid)'::regprocedure;

  if position(
    'require_admin_role(' in function_definition
  ) = 0
    or position(
      'array[''owner'', ''support'']' in function_definition
    ) = 0
    or position(
      'asset.object_class = ''private_case''' in function_definition
    ) = 0
    or position(
      '''support/'' || asset.sha256 || ''/1600.webp''' in function_definition
    ) = 0
    or position(
      '''objectPath'', attachment.object_path' in function_definition
    ) = 0
    or position('source_object_path' in function_definition) > 0
    or position('signed' in lower(function_definition)) > 0
  then
    raise exception
      'Support attachment download resolver lost its private derivative boundary';
  end if;

  foreach function_definition in array array[
    'ops_private.support_cases',
    'ops_private.support_case_media',
    'catalog_private.media_assets'
  ]
  loop
    if has_table_privilege(
      'anon',
      function_definition,
      'select'
    ) or has_table_privilege(
      'authenticated',
      function_definition,
      'select'
    ) then
      raise exception 'Direct private table read leaked for %',
        function_definition;
    end if;
  end loop;
end
$test$;

rollback;
