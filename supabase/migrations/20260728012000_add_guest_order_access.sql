begin;

do $roles$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'order_access_owner'
  ) then
    create role order_access_owner
      nologin noinherit nobypassrls nocreatedb nocreaterole noreplication;
  end if;
end
$roles$;

create table commerce_private.order_access_contacts (
  order_id uuid primary key
    references commerce_private.orders(id),
  email_hmac text not null
    check (email_hmac ~ '^[A-Za-z0-9_-]{43}$'),
  recipient_ref uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table commerce_private.order_access_challenges (
  id uuid primary key,
  order_id uuid not null
    references commerce_private.orders(id),
  recipient_ref uuid not null
    references commerce_private.order_access_contacts(recipient_ref),
  token_digest text not null unique
    check (token_digest ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    consumed_at is null
    or invalidated_at is null
  )
);

create index order_access_challenges_active_order
  on commerce_private.order_access_challenges(order_id, expires_at)
  where consumed_at is null and invalidated_at is null;

create index order_access_challenges_order_id
  on commerce_private.order_access_challenges(order_id);

create index order_access_challenges_recipient_ref
  on commerce_private.order_access_challenges(recipient_ref);

create table commerce_private.order_access_sessions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique
    references commerce_private.order_access_challenges(id),
  order_id uuid not null
    references commerce_private.orders(id),
  session_digest text not null unique
    check (session_digest ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index order_access_sessions_active_order
  on commerce_private.order_access_sessions(order_id, expires_at)
  where revoked_at is null;

create index order_access_sessions_order_id
  on commerce_private.order_access_sessions(order_id);

create table ops_private.order_access_request_limits (
  principal_hash text primary key
    check (principal_hash ~ '^[A-Za-z0-9_-]{43}$'),
  window_started_at timestamptz not null,
  request_count integer not null
    check (request_count > 0),
  updated_at timestamptz not null default now()
);

create table ops_private.order_access_request_commands (
  id uuid primary key default gen_random_uuid(),
  principal_hash text not null
    check (principal_hash ~ '^[A-Za-z0-9_-]{43}$'),
  idempotency_key text not null
    check (
      length(idempotency_key) between 16 and 128
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  request_hash text not null
    check (request_hash ~ '^[a-f0-9]{64}$'),
  public_id text not null,
  email_hmac text not null
    check (email_hmac ~ '^[A-Za-z0-9_-]{43}$'),
  challenge_id uuid not null,
  delivery_queued boolean not null,
  expires_at timestamptz not null,
  retention_deadline timestamptz not null,
  created_at timestamptz not null default now(),
  unique (principal_hash, idempotency_key),
  check (retention_deadline > created_at)
);

create index order_access_request_commands_retention
  on ops_private.order_access_request_commands(retention_deadline);

alter table commerce_private.order_access_contacts
  enable row level security;
alter table commerce_private.order_access_contacts
  force row level security;
alter table commerce_private.order_access_challenges
  enable row level security;
alter table commerce_private.order_access_challenges
  force row level security;
alter table commerce_private.order_access_sessions
  enable row level security;
alter table commerce_private.order_access_sessions
  force row level security;
alter table ops_private.order_access_request_limits
  enable row level security;
alter table ops_private.order_access_request_limits
  force row level security;
alter table ops_private.order_access_request_commands
  enable row level security;
alter table ops_private.order_access_request_commands
  force row level security;

revoke all on
  commerce_private.order_access_contacts,
  commerce_private.order_access_challenges,
  commerce_private.order_access_sessions,
  ops_private.order_access_request_limits,
  ops_private.order_access_request_commands
from public, anon, authenticated, service_role;

grant usage on schema commerce_private, ops_private
  to order_access_owner;

grant select on
  commerce_private.orders,
  commerce_private.order_pii,
  commerce_private.payment_attempts,
  commerce_private.refund_operations,
  commerce_private.shipments,
  commerce_private.order_status_events,
  commerce_private.order_access_contacts,
  commerce_private.order_access_challenges,
  commerce_private.order_access_sessions,
  ops_private.order_access_request_limits,
  ops_private.order_access_request_commands
to order_access_owner;

grant insert on
  commerce_private.order_access_challenges,
  commerce_private.order_access_sessions,
  ops_private.order_access_request_limits,
  ops_private.order_access_request_commands,
  ops_private.operation_jobs
to order_access_owner;

grant update on
  commerce_private.order_access_challenges,
  commerce_private.order_access_sessions,
  ops_private.order_access_request_limits
to order_access_owner;

create policy order_access_owner_orders_select
on commerce_private.orders
for select to order_access_owner
using (true);

create policy order_access_owner_order_pii_select
on commerce_private.order_pii
for select to order_access_owner
using (true);

create policy order_access_owner_payment_attempts_select
on commerce_private.payment_attempts
for select to order_access_owner
using (true);

create policy order_access_owner_refund_operations_select
on commerce_private.refund_operations
for select to order_access_owner
using (true);

create policy order_access_owner_shipments_select
on commerce_private.shipments
for select to order_access_owner
using (true);

create policy order_access_owner_order_status_events_select
on commerce_private.order_status_events
for select to order_access_owner
using (true);

create policy order_access_owner_contacts_select
on commerce_private.order_access_contacts
for select to order_access_owner
using (true);

create policy order_access_owner_challenges_select
on commerce_private.order_access_challenges
for select to order_access_owner
using (true);

create policy order_access_owner_challenges_insert
on commerce_private.order_access_challenges
for insert to order_access_owner
with check (true);

create policy order_access_owner_challenges_update
on commerce_private.order_access_challenges
for update to order_access_owner
using (true) with check (true);

create policy order_access_owner_sessions_select
on commerce_private.order_access_sessions
for select to order_access_owner
using (true);

create policy order_access_owner_sessions_insert
on commerce_private.order_access_sessions
for insert to order_access_owner
with check (true);

create policy order_access_owner_sessions_update
on commerce_private.order_access_sessions
for update to order_access_owner
using (true) with check (true);

create policy order_access_owner_limits_select
on ops_private.order_access_request_limits
for select to order_access_owner
using (true);

create policy order_access_owner_limits_insert
on ops_private.order_access_request_limits
for insert to order_access_owner
with check (true);

create policy order_access_owner_limits_update
on ops_private.order_access_request_limits
for update to order_access_owner
using (true) with check (true);

create policy order_access_owner_commands_select
on ops_private.order_access_request_commands
for select to order_access_owner
using (true);

create policy order_access_owner_commands_insert
on ops_private.order_access_request_commands
for insert to order_access_owner
with check (true);

create policy order_access_owner_operation_jobs_insert
on ops_private.operation_jobs
for insert to order_access_owner
with check (true);

grant select on
  commerce_private.order_access_contacts,
  commerce_private.order_access_challenges,
  commerce_private.order_access_sessions,
  ops_private.order_access_request_limits,
  ops_private.order_access_request_commands
to backup_exporter;

create policy backup_exporter_select_order_access_contacts
on commerce_private.order_access_contacts
for select to backup_exporter
using (true);

create policy backup_exporter_select_order_access_challenges
on commerce_private.order_access_challenges
for select to backup_exporter
using (true);

create policy backup_exporter_select_order_access_sessions
on commerce_private.order_access_sessions
for select to backup_exporter
using (true);

create policy backup_exporter_select_order_access_limits
on ops_private.order_access_request_limits
for select to backup_exporter
using (true);

create policy backup_exporter_select_order_access_commands
on ops_private.order_access_request_commands
for select to backup_exporter
using (true);

create or replace function ops_private.validate_order_access_email_job()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  payload_keys text[];
begin
  if new.command_type = 'email.send'
    and new.payload->>'kind' = 'order_access_link'
  then
    select array_agg(key order by key)
    into payload_keys
    from jsonb_object_keys(new.payload) as keys(key);
    if payload_keys is distinct from array[
      'challengeId',
      'kind',
      'recipientRef',
      'templateVersion'
    ]
      or new.payload->>'templateVersion' <> 'order-access-v1'
      or coalesce(new.payload->>'challengeId', '') !~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      or coalesce(new.payload->>'recipientRef', '') !~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    then
      raise exception 'INVALID_ORDER_ACCESS_EMAIL_PAYLOAD';
    end if;
  end if;
  return new;
end
$function$;

revoke all on function
  ops_private.validate_order_access_email_job()
from public, anon, authenticated, service_role;

create trigger operation_jobs_validate_order_access_email
before insert or update of command_type, payload
on ops_private.operation_jobs
for each row execute function
  ops_private.validate_order_access_email_job();

create or replace function commerce_private.build_order_access_view(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_order commerce_private.orders%rowtype;
  refund_total integer;
  latest_shipment_state text;
  tracking_ids text[];
  payment_status text;
  shipment_status text;
  order_status text;
  updated_at timestamptz;
begin
  select * into target_order
  from commerce_private.orders
  where id = p_order_id;
  if not found then return null; end if;

  order_status := case
    when target_order.projection_status in (
      'awaiting_payment', 'paid', 'processing', 'cancel_requested',
      'cancelled', 'shipped', 'delivered', 'closed'
    ) then target_order.projection_status
    when target_order.projection_status = 'refunded' then 'closed'
    else null
  end;
  if order_status is null then
    raise exception 'ORDER_ACCESS_PROJECTION_INVALID';
  end if;

  select coalesce(sum(amount_twd), 0)::integer
  into refund_total
  from commerce_private.refund_operations
  where order_id = target_order.id
    and state = 'succeeded';

  payment_status := case
    when target_order.payment_at_risk then 'exception'
    when refund_total >= target_order.total_gross_twd
      and target_order.total_gross_twd > 0 then 'refunded'
    when refund_total > 0 then 'partially_refunded'
    when target_order.applied_payment_receipt_id is not null then 'paid'
    when exists (
      select 1
      from commerce_private.payment_attempts
      where order_id = target_order.id
        and state = 'verification_pending'
    ) then 'verification_pending'
    else 'pending'
  end;

  select state
  into latest_shipment_state
  from commerce_private.shipments
  where order_id = target_order.id and direction = 'outbound'
  order by created_at desc, id desc
  limit 1;

  shipment_status := case
    when latest_shipment_state is null then 'not_created'
    when latest_shipment_state = 'draft' then 'label_pending'
    when latest_shipment_state = 'label_pending' then 'label_pending'
    when latest_shipment_state = 'created' then 'label_created'
    when latest_shipment_state = 'label_created' then 'label_created'
    when latest_shipment_state = 'manual_tracking' then 'manual_tracking'
    when latest_shipment_state = 'cancel_pending' then 'cancellation_pending'
    when latest_shipment_state = 'cancellation_pending' then 'cancellation_pending'
    when latest_shipment_state = 'cancelled' then 'cancelled'
    when latest_shipment_state = 'picked_up' then 'picked_up'
    when latest_shipment_state = 'delivered' then 'delivered'
    else 'exception'
  end;

  select coalesce(
    array_agg(tracking_id order by created_at, id)
      filter (where tracking_id is not null),
    '{}'::text[]
  )
  into tracking_ids
  from commerce_private.shipments
  where order_id = target_order.id and direction = 'outbound';

  select greatest(
    target_order.created_at,
    coalesce((
      select max(occurred_at)
      from commerce_private.order_status_events
      where order_id = target_order.id
    ), target_order.created_at),
    coalesce((
      select max(created_at)
      from commerce_private.shipments
      where order_id = target_order.id
    ), target_order.created_at),
    coalesce((
      select max(created_at)
      from commerce_private.refund_operations
      where order_id = target_order.id
    ), target_order.created_at)
  ) into updated_at;

  return jsonb_build_object(
    'publicId', target_order.public_id,
    'status', order_status,
    'paymentStatus', payment_status,
    'shipmentStatus', shipment_status,
    'grossTwd', target_order.total_gross_twd,
    'trackingIds', to_jsonb(tracking_ids),
    'updatedAt', updated_at
  );
end
$function$;

alter function commerce_private.build_order_access_view(uuid)
  owner to order_access_owner;
revoke all on function
  commerce_private.build_order_access_view(uuid)
from public, anon, authenticated, service_role;

create or replace function api.order_access_request(
  p_public_id text,
  p_email_digest text,
  p_request_principal_hash text,
  p_proposed_challenge_id uuid,
  p_token_digest text,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing ops_private.order_access_request_commands%rowtype;
  target_order_id uuid;
  target_recipient_ref uuid;
  current_request_count integer;
  delivery_queued boolean := false;
begin
  if coalesce(p_public_id, '') !~ '^[A-Za-z0-9-]{4,40}$'
    or coalesce(p_email_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or coalesce(p_request_principal_hash, '') !~ '^[A-Za-z0-9_-]{43}$'
    or p_proposed_challenge_id is null
    or coalesce(p_token_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or p_expires_at <= now()
    or p_expires_at > now() + interval '20 minutes'
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{16,128}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_ORDER_ACCESS_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_request_principal_hash || ':' || p_idempotency_key,
      0
    )
  );

  select * into existing
  from ops_private.order_access_request_commands
  where principal_hash = p_request_principal_hash
    and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash
      or existing.public_id <> p_public_id
      or existing.email_hmac <> p_email_digest
    then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'challengeId', existing.challenge_id,
      'deliveryQueued', existing.delivery_queued,
      'expiresAt', existing.expires_at,
      'replayed', true
    );
  end if;

  insert into ops_private.order_access_request_limits (
    principal_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_request_principal_hash,
    now(),
    1,
    now()
  )
  on conflict (principal_hash) do update
  set
    window_started_at = case
      when ops_private.order_access_request_limits.window_started_at
        <= now() - interval '1 hour'
        then now()
      else ops_private.order_access_request_limits.window_started_at
    end,
    request_count = case
      when ops_private.order_access_request_limits.window_started_at
        <= now() - interval '1 hour'
        then 1
      else ops_private.order_access_request_limits.request_count + 1
    end,
    updated_at = now()
  returning request_count into current_request_count;

  if current_request_count > 5 then
    raise exception 'ORDER_ACCESS_RATE_LIMIT';
  end if;

  select target_order.id, contact.recipient_ref
  into target_order_id, target_recipient_ref
  from commerce_private.orders target_order
  join commerce_private.order_access_contacts contact
    on contact.order_id = target_order.id
  where target_order.public_id = p_public_id
    and contact.email_hmac = p_email_digest;

  if found then
    update commerce_private.order_access_challenges
    set invalidated_at = now()
    where order_id = target_order_id
      and consumed_at is null
      and invalidated_at is null
      and expires_at > now();

    insert into commerce_private.order_access_challenges (
      id,
      order_id,
      recipient_ref,
      token_digest,
      expires_at
    ) values (
      p_proposed_challenge_id,
      target_order_id,
      target_recipient_ref,
      p_token_digest,
      p_expires_at
    );

    insert into ops_private.operation_jobs (
      operation_key,
      kind,
      command_type,
      aggregate_id,
      payload
    ) values (
      'order-access-email:' || p_proposed_challenge_id::text,
      'outbox',
      'email.send',
      target_order_id::text,
      jsonb_build_object(
        'kind', 'order_access_link',
        'templateVersion', 'order-access-v1',
        'challengeId', p_proposed_challenge_id,
        'recipientRef', target_recipient_ref
      )
    );
    delivery_queued := true;
  end if;

  insert into ops_private.order_access_request_commands (
    principal_hash,
    idempotency_key,
    request_hash,
    public_id,
    email_hmac,
    challenge_id,
    delivery_queued,
    expires_at,
    retention_deadline
  ) values (
    p_request_principal_hash,
    p_idempotency_key,
    p_request_hash,
    p_public_id,
    p_email_digest,
    p_proposed_challenge_id,
    delivery_queued,
    p_expires_at,
    now() + interval '24 hours'
  );

  return jsonb_build_object(
    'challengeId', p_proposed_challenge_id,
    'deliveryQueued', delivery_queued,
    'expiresAt', p_expires_at,
    'replayed', false
  );
end
$function$;

alter function api.order_access_request(
  text, text, text, uuid, text, timestamptz, text, text
) owner to order_access_owner;
revoke all on function api.order_access_request(
  text, text, text, uuid, text, timestamptz, text, text
) from public, anon, authenticated, storefront_rpc_caller,
  worker_rpc_caller, admin_rpc_caller;
grant execute on function api.order_access_request(
  text, text, text, uuid, text, timestamptz, text, text
) to service_role;

create or replace function api.order_access_exchange(
  p_token_digest text,
  p_session_digest text,
  p_session_expires_at timestamptz,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  challenge commerce_private.order_access_challenges%rowtype;
  order_view jsonb;
begin
  if coalesce(p_token_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or coalesce(p_session_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or p_session_expires_at <= p_now
    or p_session_expires_at > p_now + interval '20 minutes'
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_ORDER_ACCESS_EXCHANGE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_token_digest, 0)
  );

  select * into challenge
  from commerce_private.order_access_challenges
  where token_digest = p_token_digest
    and consumed_at is null
    and invalidated_at is null
    and expires_at > p_now
  for update;
  if not found then
    return jsonb_build_object(
      'granted', false,
      'sessionExpiresAt', null,
      'order', null
    );
  end if;

  update commerce_private.order_access_challenges
  set consumed_at = p_now
  where id = challenge.id;

  insert into commerce_private.order_access_sessions (
    challenge_id,
    order_id,
    session_digest,
    expires_at
  ) values (
    challenge.id,
    challenge.order_id,
    p_session_digest,
    p_session_expires_at
  );

  order_view :=
    commerce_private.build_order_access_view(challenge.order_id);
  if order_view is null then
    raise exception 'ORDER_ACCESS_ORDER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'granted', true,
    'sessionExpiresAt', p_session_expires_at,
    'order', order_view
  );
end
$function$;

alter function api.order_access_exchange(
  text, text, timestamptz, timestamptz
) owner to order_access_owner;
revoke all on function api.order_access_exchange(
  text, text, timestamptz, timestamptz
) from public, anon, authenticated, storefront_rpc_caller,
  worker_rpc_caller, admin_rpc_caller;
grant execute on function api.order_access_exchange(
  text, text, timestamptz, timestamptz
) to service_role;

create or replace function api.order_access_session_read(
  p_session_digest text,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_order_id uuid;
begin
  if coalesce(p_session_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_ORDER_ACCESS_SESSION';
  end if;

  select order_id into target_order_id
  from commerce_private.order_access_sessions
  where session_digest = p_session_digest
    and revoked_at is null
    and expires_at > p_now;
  if not found then return null; end if;
  return commerce_private.build_order_access_view(target_order_id);
end
$function$;

alter function api.order_access_session_read(text, timestamptz)
  owner to order_access_owner;
revoke all on function api.order_access_session_read(text, timestamptz)
from public, anon, authenticated, storefront_rpc_caller,
  worker_rpc_caller, admin_rpc_caller;
grant execute on function api.order_access_session_read(text, timestamptz)
to service_role;

create or replace function api.order_access_session_revoke(
  p_session_digest text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(p_session_digest, '') !~ '^[A-Za-z0-9_-]{43}$'
    or abs(extract(epoch from (p_now - now()))) > 300
  then
    raise exception 'INVALID_ORDER_ACCESS_SESSION';
  end if;
  update commerce_private.order_access_sessions
  set revoked_at = coalesce(revoked_at, p_now)
  where session_digest = p_session_digest;
end
$function$;

alter function api.order_access_session_revoke(text, timestamptz)
  owner to order_access_owner;
revoke all on function api.order_access_session_revoke(text, timestamptz)
from public, anon, authenticated, storefront_rpc_caller,
  worker_rpc_caller, admin_rpc_caller;
grant execute on function api.order_access_session_revoke(text, timestamptz)
to service_role;

create or replace function api.worker_order_access_recipient_resolve(
  p_challenge_id uuid,
  p_recipient_ref uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'orderId', contact.order_id,
    'contactEnvelope', pii.contact_envelope,
    'schemaVersion', pii.schema_version,
    'keyVersion', pii.key_version
  )
  into result
  from commerce_private.order_access_challenges challenge
  join commerce_private.order_access_contacts contact
    on contact.order_id = challenge.order_id
    and contact.recipient_ref = challenge.recipient_ref
  join commerce_private.order_pii pii
    on pii.order_id = contact.order_id
  where challenge.id = p_challenge_id
    and challenge.recipient_ref = p_recipient_ref
    and challenge.consumed_at is null
    and challenge.invalidated_at is null
    and challenge.expires_at > now();
  return result;
end
$function$;

alter function api.worker_order_access_recipient_resolve(uuid, uuid)
  owner to order_access_owner;
revoke all on function
  api.worker_order_access_recipient_resolve(uuid, uuid)
from public, anon, authenticated, storefront_rpc_caller,
  worker_rpc_caller, admin_rpc_caller;
grant execute on function
  api.worker_order_access_recipient_resolve(uuid, uuid)
to service_role;

comment on function api.order_access_request(
  text, text, text, uuid, text, timestamptz, text, text
) is
  'Server-only guest access request. Persists HMAC digests and an opaque recipient reference; atomically queues a token-free email job.';

comment on table commerce_private.order_access_contacts is
  'Production-disabled gate: checkout must atomically write this Email HMAC and opaque recipient reference beside the encrypted order contact before live order creation can be enabled.';

comment on function api.worker_order_access_recipient_resolve(uuid, uuid)
is
  'Worker-only active-challenge lookup. Returns an encrypted contact envelope for in-memory decryption; never returns plaintext email.';

commit;
