begin;

-- Engagement records remain private. The Data API exposes only the narrow
-- SECURITY DEFINER functions below, and every function revalidates the
-- authenticated administrator's AAL2 session and active membership.

alter table engagement_private.appointments
  drop constraint if exists appointments_state_check;

update engagement_private.appointments
set state = case
  when state = 'contacted' then 'requested'
  when state = 'declined' then 'cancelled'
  else state
end
where state in ('contacted', 'declined');

alter table engagement_private.appointments
  add column appointment_kind text not null default 'private_showing'
    check (
      appointment_kind in (
        'private_showing',
        'fitting',
        'store_visit'
      )
    ),
  add column scheduled_for timestamptz,
  add column row_version bigint not null default 1
    check (row_version > 0),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now(),
  add constraint appointments_state_check
    check (
      state in (
        'requested',
        'confirmed',
        'completed',
        'cancelled'
      )
    ),
  add constraint appointments_schedule_check
    check (
      state <> 'confirmed'
      or scheduled_for is not null
    ) not valid;

-- Legacy `confirmed` rows predate the scheduling column. Requeue them instead
-- of inventing an appointment time, then validate the invariant for all rows.
update engagement_private.appointments
set
  state = 'requested',
  updated_at = now()
where state = 'confirmed'
  and scheduled_for is null;

alter table engagement_private.appointments
  validate constraint appointments_schedule_check;

alter table engagement_private.newsletter_consents
  add column row_version bigint not null default 1
    check (row_version > 0),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now(),
  add constraint newsletter_consents_state_timestamps_check
    check (
      (
        state = 'pending'
        and unsubscribed_at is null
      )
      or (
        state = 'subscribed'
        and consented_at is not null
        and unsubscribed_at is null
      )
      or (
        state = 'unsubscribed'
        and unsubscribed_at is not null
      )
    ) not valid;

update engagement_private.newsletter_consents
set
  consented_at = case
    when state = 'subscribed'
      then coalesce(consented_at, created_at)
    else consented_at
  end,
  unsubscribed_at = case
    when state = 'unsubscribed'
      then coalesce(unsubscribed_at, created_at)
    else null
  end,
  updated_at = now();

alter table engagement_private.newsletter_consents
  validate constraint newsletter_consents_state_timestamps_check;

create table engagement_private.newsletter_campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null
    check (char_length(btrim(title)) between 1 and 160),
  subject text not null
    check (char_length(btrim(subject)) between 1 and 200),
  preview_text text not null default ''
    check (char_length(preview_text) <= 300),
  content_markdown text not null
    check (char_length(btrim(content_markdown)) between 1 and 50000),
  state text not null default 'draft'
    check (state in ('draft', 'review', 'approved', 'archived')),
  row_version bigint not null default 1
    check (row_version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'approved' and approved_by is not null and approved_at is not null)
    or (
      state in ('draft', 'review')
      and approved_by is null
      and approved_at is null
    )
    or state = 'archived'
  ),
  check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

create index appointments_admin_queue
  on engagement_private.appointments(state, created_at desc);
create index appointments_updated_by_fk
  on engagement_private.appointments(updated_by)
  where updated_by is not null;
create index newsletter_consents_admin_queue
  on engagement_private.newsletter_consents(state, created_at desc);
create index newsletter_consents_updated_by_fk
  on engagement_private.newsletter_consents(updated_by)
  where updated_by is not null;
create index newsletter_campaign_drafts_admin_queue
  on engagement_private.newsletter_campaign_drafts(
    state,
    updated_at desc
  );
create index newsletter_campaign_drafts_created_by_fk
  on engagement_private.newsletter_campaign_drafts(created_by);
create index newsletter_campaign_drafts_updated_by_fk
  on engagement_private.newsletter_campaign_drafts(updated_by);
create index newsletter_campaign_drafts_approved_by_fk
  on engagement_private.newsletter_campaign_drafts(approved_by)
  where approved_by is not null;

alter table engagement_private.appointments
  enable row level security;
alter table engagement_private.appointments
  force row level security;
alter table engagement_private.newsletter_consents
  enable row level security;
alter table engagement_private.newsletter_consents
  force row level security;
alter table engagement_private.newsletter_campaign_drafts
  enable row level security;
alter table engagement_private.newsletter_campaign_drafts
  force row level security;

revoke all on table engagement_private.appointments
  from public, anon, authenticated, service_role;
revoke all on table engagement_private.newsletter_consents
  from public, anon, authenticated, service_role;
revoke all on table engagement_private.newsletter_campaign_drafts
  from public, anon, authenticated, service_role;

grant usage on schema engagement_private to backoffice_ops_owner;
grant select, update on
  engagement_private.appointments,
  engagement_private.newsletter_consents
to backoffice_ops_owner;
grant select, insert, update on
  engagement_private.newsletter_campaign_drafts
to backoffice_ops_owner;
grant usage on schema extensions to backoffice_ops_owner;
grant execute on function extensions.digest(bytea, text)
  to backoffice_ops_owner;

create policy backoffice_ops_select_appointments
on engagement_private.appointments
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_update_appointments
on engagement_private.appointments
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_select_newsletter_consents
on engagement_private.newsletter_consents
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_update_newsletter_consents
on engagement_private.newsletter_consents
for update to backoffice_ops_owner
using (true) with check (true);

create policy backoffice_ops_select_newsletter_campaign_drafts
on engagement_private.newsletter_campaign_drafts
for select to backoffice_ops_owner
using (true);

create policy backoffice_ops_insert_newsletter_campaign_drafts
on engagement_private.newsletter_campaign_drafts
for insert to backoffice_ops_owner
with check (true);

create policy backoffice_ops_update_newsletter_campaign_drafts
on engagement_private.newsletter_campaign_drafts
for update to backoffice_ops_owner
using (true) with check (true);

grant select on engagement_private.newsletter_campaign_drafts
  to backup_exporter;
create policy backup_exporter_select_newsletter_campaign_drafts
on engagement_private.newsletter_campaign_drafts
for select to backup_exporter
using (true);

create or replace function api.admin_appointments_list(
  p_state text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );
  if (
    p_state is not null
    and p_state not in (
      'requested',
      'confirmed',
      'completed',
      'cancelled'
    )
  ) or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'INVALID_APPOINTMENT_LIST_QUERY';
  end if;

  with filtered as (
    select
      appointment.id,
      appointment.appointment_kind,
      appointment.state,
      appointment.scheduled_for,
      appointment.contact_envelope <> '{}'::jsonb as has_contact,
      appointment.message_envelope <> '{}'::jsonb as has_message,
      appointment.row_version,
      appointment.created_at,
      appointment.updated_at
    from engagement_private.appointments appointment
    where p_state is null or appointment.state = p_state
  ),
  page as (
    select
      appointment.id,
      appointment.appointment_kind,
      appointment.state,
      appointment.scheduled_for,
      appointment.has_contact,
      appointment.has_message,
      appointment.row_version,
      appointment.created_at,
      appointment.updated_at
    from filtered appointment
    order by
      case when appointment.state = 'requested' then 0 else 1 end,
      appointment.created_at desc,
      appointment.id
    limit p_limit
    offset p_offset
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', appointment.id,
          'reference',
            'APT-' || upper(substr(
              replace(appointment.id::text, '-', ''),
              1,
              10
            )),
          'kind', appointment.appointment_kind,
          'state', appointment.state,
          'scheduledFor', appointment.scheduled_for,
          'hasContact', appointment.has_contact,
          'hasMessage', appointment.has_message,
          'version', appointment.row_version,
          'createdAt', appointment.created_at,
          'updatedAt', appointment.updated_at
        )
        order by
          case when appointment.state = 'requested' then 0 else 1 end,
          appointment.created_at desc,
          appointment.id
      )
      from page appointment
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', p_limit,
    'offset', p_offset
  )
  into result;
  return result;
end
$function$;

alter function api.admin_appointments_list(text, integer, integer)
  owner to backoffice_ops_owner;
revoke all on function api.admin_appointments_list(
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
grant execute on function api.admin_appointments_list(
  text,
  integer,
  integer
) to authenticated;

create or replace function api.admin_appointment_state_command(
  p_appointment_id uuid,
  p_expected_version bigint,
  p_target_state text,
  p_scheduled_for timestamptz,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  appointment engagement_private.appointments%rowtype;
  request_hash_value text;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );
  if coalesce(p_expected_version, 0) < 1
    or coalesce(p_target_state, '') not in (
      'confirmed',
      'completed',
      'cancelled'
    )
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_APPOINTMENT_STATE_COMMAND';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'appointmentId', p_appointment_id,
        'expectedVersion', p_expected_version,
        'targetState', p_target_state,
        'scheduledFor', p_scheduled_for
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'appointment.state',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into appointment
  from engagement_private.appointments candidate
  where candidate.id = p_appointment_id
  for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if appointment.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if not (
    (
      appointment.state = 'requested'
      and p_target_state in ('confirmed', 'cancelled')
    )
    or (
      appointment.state = 'confirmed'
      and p_target_state in (
        'confirmed',
        'completed',
        'cancelled'
      )
    )
  ) then
    raise exception 'INVALID_APPOINTMENT_STATE_TRANSITION';
  end if;
  if p_target_state = 'confirmed' and p_scheduled_for is null then
    raise exception 'APPOINTMENT_SCHEDULE_REQUIRED';
  end if;
  if p_target_state <> 'confirmed' and p_scheduled_for is not null then
    raise exception 'APPOINTMENT_SCHEDULE_NOT_ALLOWED';
  end if;

  update engagement_private.appointments
  set
    state = p_target_state,
    scheduled_for = case
      when p_target_state = 'confirmed' then p_scheduled_for
      else scheduled_for
    end,
    row_version = row_version + 1,
    updated_by = actor_id,
    updated_at = now()
  where id = appointment.id
    and row_version = p_expected_version
  returning * into appointment;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'appointment.state',
    'appointment',
    appointment.id::text,
    case
      when p_target_state = 'confirmed'
        then array['state', 'scheduled_for', 'row_version']
      else array['state', 'row_version']
    end,
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', appointment.id,
    'reference',
      'APT-' || upper(substr(
        replace(appointment.id::text, '-', ''),
        1,
        10
      )),
    'kind', appointment.appointment_kind,
    'state', appointment.state,
    'scheduledFor', appointment.scheduled_for,
    'hasContact', appointment.contact_envelope <> '{}'::jsonb,
    'hasMessage', appointment.message_envelope <> '{}'::jsonb,
    'version', appointment.row_version,
    'createdAt', appointment.created_at,
    'updatedAt', appointment.updated_at
  );
  return ops_private.admin_command_finish(
    actor_id,
    'appointment.state',
    p_idempotency_key,
    appointment.id,
    result
  );
end
$function$;

alter function api.admin_appointment_state_command(
  uuid,
  bigint,
  text,
  timestamptz,
  text,
  text
) owner to backoffice_ops_owner;
revoke all on function api.admin_appointment_state_command(
  uuid,
  bigint,
  text,
  timestamptz,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function api.admin_appointment_state_command(
  uuid,
  bigint,
  text,
  timestamptz,
  text,
  text
) to authenticated;

create or replace function api.admin_newsletter_consents_list(
  p_state text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );
  if (
    p_state is not null
    and p_state not in ('pending', 'subscribed', 'unsubscribed')
  ) or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'INVALID_NEWSLETTER_CONSENT_LIST_QUERY';
  end if;

  with filtered as (
    select
      consent.id,
      consent.state,
      consent.row_version,
      consent.consented_at,
      consent.unsubscribed_at,
      consent.created_at,
      consent.updated_at
    from engagement_private.newsletter_consents consent
    where p_state is null or consent.state = p_state
  ),
  page as (
    select
      consent.id,
      consent.state,
      consent.row_version,
      consent.consented_at,
      consent.unsubscribed_at,
      consent.created_at,
      consent.updated_at
    from filtered consent
    order by consent.created_at desc, consent.id
    limit p_limit
    offset p_offset
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', consent.id,
          'reference',
            'CONSENT-' || upper(substr(
              replace(consent.id::text, '-', ''),
              1,
              10
            )),
          'state', consent.state,
          'version', consent.row_version,
          'consentedAt', consent.consented_at,
          'unsubscribedAt', consent.unsubscribed_at,
          'createdAt', consent.created_at,
          'updatedAt', consent.updated_at
        )
        order by consent.created_at desc, consent.id
      )
      from page consent
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', p_limit,
    'offset', p_offset
  )
  into result;
  return result;
end
$function$;

alter function api.admin_newsletter_consents_list(
  text,
  integer,
  integer
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_consents_list(
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_consents_list(
  text,
  integer,
  integer
) to authenticated;

create or replace function api.admin_newsletter_consent_command(
  p_consent_id uuid,
  p_expected_version bigint,
  p_target_state text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  consent engagement_private.newsletter_consents%rowtype;
  request_hash_value text;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'support'],
    false
  );
  if coalesce(p_expected_version, 0) < 1
    or p_target_state is distinct from 'unsubscribed'
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_NEWSLETTER_CONSENT_COMMAND';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'consentId', p_consent_id,
        'expectedVersion', p_expected_version,
        'targetState', p_target_state
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'newsletter.consent',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into consent
  from engagement_private.newsletter_consents candidate
  where candidate.id = p_consent_id
  for update;
  if not found then
    raise exception 'NEWSLETTER_CONSENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if consent.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if consent.state = 'unsubscribed' then
    raise exception 'NEWSLETTER_CONSENT_ALREADY_UNSUBSCRIBED';
  end if;

  update engagement_private.newsletter_consents
  set
    state = 'unsubscribed',
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    row_version = row_version + 1,
    updated_by = actor_id,
    updated_at = now()
  where id = consent.id
    and row_version = p_expected_version
  returning * into consent;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'newsletter.consent.unsubscribe',
    'newsletter_consent',
    consent.id::text,
    array['state', 'unsubscribed_at', 'row_version'],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', consent.id,
    'reference',
      'CONSENT-' || upper(substr(
        replace(consent.id::text, '-', ''),
        1,
        10
      )),
    'state', consent.state,
    'version', consent.row_version,
    'consentedAt', consent.consented_at,
    'unsubscribedAt', consent.unsubscribed_at,
    'createdAt', consent.created_at,
    'updatedAt', consent.updated_at
  );
  return ops_private.admin_command_finish(
    actor_id,
    'newsletter.consent',
    p_idempotency_key,
    consent.id,
    result
  );
end
$function$;

alter function api.admin_newsletter_consent_command(
  uuid,
  bigint,
  text,
  text,
  text
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_consent_command(
  uuid,
  bigint,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_consent_command(
  uuid,
  bigint,
  text,
  text,
  text
) to authenticated;

create or replace function api.admin_newsletter_campaigns_list(
  p_state text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  if (
    p_state is not null
    and p_state not in ('draft', 'review', 'approved', 'archived')
  ) or p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'INVALID_NEWSLETTER_CAMPAIGN_LIST_QUERY';
  end if;

  with filtered as (
    select campaign.*
    from engagement_private.newsletter_campaign_drafts campaign
    where p_state is null or campaign.state = p_state
  ),
  page as (
    select campaign.*
    from filtered campaign
    order by campaign.updated_at desc, campaign.id
    limit p_limit
    offset p_offset
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', campaign.id,
          'title', campaign.title,
          'subject', campaign.subject,
          'previewText', campaign.preview_text,
          'contentMarkdown', campaign.content_markdown,
          'state', campaign.state,
          'version', campaign.row_version,
          'createdAt', campaign.created_at,
          'updatedAt', campaign.updated_at,
          'deliveryEnabled', false
        )
        order by campaign.updated_at desc, campaign.id
      )
      from page campaign
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', p_limit,
    'offset', p_offset
  )
  into result;
  return result;
end
$function$;

alter function api.admin_newsletter_campaigns_list(
  text,
  integer,
  integer
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_campaigns_list(
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_campaigns_list(
  text,
  integer,
  integer
) to authenticated;

create or replace function api.admin_newsletter_campaign_create(
  p_expected_version bigint,
  p_title text,
  p_subject text,
  p_preview_text text,
  p_content_markdown text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  campaign engagement_private.newsletter_campaign_drafts%rowtype;
  request_hash_value text;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  if p_expected_version is distinct from 0
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200
    or char_length(coalesce(p_preview_text, '')) > 300
    or char_length(btrim(coalesce(p_content_markdown, '')))
      not between 1 and 50000
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_NEWSLETTER_CAMPAIGN_DRAFT';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'expectedVersion', p_expected_version,
        'title', btrim(p_title),
        'subject', btrim(p_subject),
        'previewText', coalesce(p_preview_text, ''),
        'contentMarkdown', btrim(p_content_markdown)
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'newsletter.campaign.create',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  insert into engagement_private.newsletter_campaign_drafts (
    title,
    subject,
    preview_text,
    content_markdown,
    created_by,
    updated_by
  ) values (
    btrim(p_title),
    btrim(p_subject),
    coalesce(p_preview_text, ''),
    btrim(p_content_markdown),
    actor_id,
    actor_id
  )
  returning * into campaign;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'newsletter.campaign.create',
    'newsletter_campaign',
    campaign.id::text,
    array[
      'title',
      'subject',
      'preview_text',
      'content_markdown',
      'state',
      'row_version'
    ],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', campaign.id,
    'title', campaign.title,
    'subject', campaign.subject,
    'previewText', campaign.preview_text,
    'contentMarkdown', campaign.content_markdown,
    'state', campaign.state,
    'version', campaign.row_version,
    'createdAt', campaign.created_at,
    'updatedAt', campaign.updated_at,
    'deliveryEnabled', false
  );
  return ops_private.admin_command_finish(
    actor_id,
    'newsletter.campaign.create',
    p_idempotency_key,
    campaign.id,
    result
  );
end
$function$;

alter function api.admin_newsletter_campaign_create(
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_campaign_create(
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_campaign_create(
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function api.admin_newsletter_campaign_update(
  p_campaign_id uuid,
  p_expected_version bigint,
  p_title text,
  p_subject text,
  p_preview_text text,
  p_content_markdown text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  campaign engagement_private.newsletter_campaign_drafts%rowtype;
  request_hash_value text;
  result jsonb;
begin
  perform ops_private.require_admin_role(
    array['owner', 'merchandiser'],
    false
  );
  if coalesce(p_expected_version, 0) < 1
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200
    or char_length(coalesce(p_preview_text, '')) > 300
    or char_length(btrim(coalesce(p_content_markdown, '')))
      not between 1 and 50000
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_NEWSLETTER_CAMPAIGN_DRAFT';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'campaignId', p_campaign_id,
        'expectedVersion', p_expected_version,
        'title', btrim(p_title),
        'subject', btrim(p_subject),
        'previewText', coalesce(p_preview_text, ''),
        'contentMarkdown', btrim(p_content_markdown)
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'newsletter.campaign.update',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into campaign
  from engagement_private.newsletter_campaign_drafts candidate
  where candidate.id = p_campaign_id
  for update;
  if not found then
    raise exception 'NEWSLETTER_CAMPAIGN_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if campaign.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if campaign.state <> 'draft' then
    raise exception 'NEWSLETTER_CAMPAIGN_NOT_EDITABLE';
  end if;

  update engagement_private.newsletter_campaign_drafts
  set
    title = btrim(p_title),
    subject = btrim(p_subject),
    preview_text = coalesce(p_preview_text, ''),
    content_markdown = btrim(p_content_markdown),
    row_version = row_version + 1,
    updated_by = actor_id,
    updated_at = now()
  where id = campaign.id
    and row_version = p_expected_version
  returning * into campaign;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'newsletter.campaign.update',
    'newsletter_campaign',
    campaign.id::text,
    array[
      'title',
      'subject',
      'preview_text',
      'content_markdown',
      'row_version'
    ],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', campaign.id,
    'title', campaign.title,
    'subject', campaign.subject,
    'previewText', campaign.preview_text,
    'contentMarkdown', campaign.content_markdown,
    'state', campaign.state,
    'version', campaign.row_version,
    'createdAt', campaign.created_at,
    'updatedAt', campaign.updated_at,
    'deliveryEnabled', false
  );
  return ops_private.admin_command_finish(
    actor_id,
    'newsletter.campaign.update',
    p_idempotency_key,
    campaign.id,
    result
  );
end
$function$;

alter function api.admin_newsletter_campaign_update(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_campaign_update(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_campaign_update(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function api.admin_newsletter_campaign_state_command(
  p_campaign_id uuid,
  p_expected_version bigint,
  p_target_state text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  command_state jsonb;
  campaign engagement_private.newsletter_campaign_drafts%rowtype;
  request_hash_value text;
  result jsonb;
begin
  if p_target_state = 'archived' then
    perform ops_private.require_admin_role(array['owner'], true);
  elsif p_target_state = 'approved' then
    perform ops_private.require_admin_role(array['owner'], true);
    raise exception 'NEWSLETTER_DELIVERY_NOT_CONFIGURED'
      using errcode = '55000';
  else
    perform ops_private.require_admin_role(
      array['owner', 'merchandiser'],
      false
    );
  end if;
  if coalesce(p_expected_version, 0) < 1
    or coalesce(p_target_state, '')
      not in ('draft', 'review', 'archived')
    or char_length(coalesce(p_idempotency_key, '')) not between 16 and 200
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'INVALID_NEWSLETTER_CAMPAIGN_STATE_COMMAND';
  end if;
  request_hash_value := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'campaignId', p_campaign_id,
        'expectedVersion', p_expected_version,
        'targetState', p_target_state
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  command_state := ops_private.admin_command_begin(
    actor_id,
    'newsletter.campaign.state',
    p_idempotency_key,
    request_hash_value
  );
  if (command_state->>'replayed')::boolean then
    return (command_state->'result')
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into campaign
  from engagement_private.newsletter_campaign_drafts candidate
  where candidate.id = p_campaign_id
  for update;
  if not found then
    raise exception 'NEWSLETTER_CAMPAIGN_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if campaign.row_version <> p_expected_version then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;
  if not (
    (campaign.state = 'draft' and p_target_state = 'review')
    or (campaign.state = 'review' and p_target_state = 'draft')
    or (
      campaign.state in ('draft', 'review', 'approved')
      and p_target_state = 'archived'
    )
  ) then
    raise exception 'INVALID_NEWSLETTER_CAMPAIGN_STATE_TRANSITION';
  end if;

  update engagement_private.newsletter_campaign_drafts
  set
    state = p_target_state,
    row_version = row_version + 1,
    updated_by = actor_id,
    updated_at = now()
  where id = campaign.id
    and row_version = p_expected_version
  returning * into campaign;
  if not found then
    raise exception 'ROW_VERSION_CONFLICT';
  end if;

  insert into ops_private.audit_events (
    actor_scope,
    actor_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    request_id
  ) values (
    'admin',
    actor_id,
    'newsletter.campaign.state',
    'newsletter_campaign',
    campaign.id::text,
    array['state', 'row_version'],
    p_idempotency_key
  );

  result := jsonb_build_object(
    'id', campaign.id,
    'title', campaign.title,
    'subject', campaign.subject,
    'previewText', campaign.preview_text,
    'contentMarkdown', campaign.content_markdown,
    'state', campaign.state,
    'version', campaign.row_version,
    'createdAt', campaign.created_at,
    'updatedAt', campaign.updated_at,
    'deliveryEnabled', false
  );
  return ops_private.admin_command_finish(
    actor_id,
    'newsletter.campaign.state',
    p_idempotency_key,
    campaign.id,
    result
  );
end
$function$;

alter function api.admin_newsletter_campaign_state_command(
  uuid,
  bigint,
  text,
  text,
  text
) owner to backoffice_ops_owner;
revoke all on function api.admin_newsletter_campaign_state_command(
  uuid,
  bigint,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function api.admin_newsletter_campaign_state_command(
  uuid,
  bigint,
  text,
  text,
  text
) to authenticated;

comment on function api.admin_appointments_list(text, integer, integer)
  is 'AAL2 Owner/Support appointment projection without decrypted contact or message fields.';
comment on function api.admin_newsletter_consents_list(
  text,
  integer,
  integer
) is 'AAL2 Owner/Support consent projection without email HMAC or token material.';
comment on function api.admin_newsletter_campaign_state_command(
  uuid,
  bigint,
  text,
  text,
  text
) is 'Versioned campaign review/archive workflow; approval and delivery fail closed until a later credential-gated outbox migration.';

commit;
