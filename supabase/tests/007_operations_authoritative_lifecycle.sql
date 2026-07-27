begin;

set local role postgres;

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
) values (
  '71000000-0000-4000-8000-000000000090',
  'authenticated',
  'authenticated',
  'sql-operations-owner@estatelignee.test',
  now(),
  now()
);

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at
) values (
  '71000000-0000-4000-8000-000000000091',
  '71000000-0000-4000-8000-000000000090',
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
  '71000000-0000-4000-8000-000000000090',
  'owner',
  'active',
  'SQL Operations Owner',
  'sql-operations-owner@estatelignee.test'
);

update catalog_private.product_variants
set weight_grams = 500
where id = '40000000-0000-4000-8000-000000000101';

update commerce_private.inventory_balances
set
  on_hand = 5,
  reserved = 1,
  safety_stock = 0,
  updated_at = now()
where sku_id = '40000000-0000-4000-8000-000000000101';

insert into commerce_private.checkout_sessions (
  id,
  public_id,
  state,
  safety_revision,
  legal_bundle_revision,
  expires_at,
  consumed_at
) values (
  '71000000-0000-4000-8000-000000000001',
  'SQL-OPERATIONS-CHECKOUT',
  'consumed',
  1,
  1,
  now() + interval '1 day',
  now()
);

insert into commerce_private.orders (
  id,
  public_id,
  merchant_trade_no,
  checkout_session_id,
  projection_status,
  merchandise_gross_twd,
  shipping_gross_twd,
  shipping_net_twd,
  shipping_tax_twd,
  total_gross_twd,
  total_net_twd,
  total_tax_twd
) values (
  '71000000-0000-4000-8000-000000000002',
  'LIG-20260728-OPS1',
  'SQLOPSPAY001',
  '71000000-0000-4000-8000-000000000001',
  'awaiting_payment',
  7800,
  0,
  0,
  0,
  7800,
  7429,
  371
);

insert into commerce_private.order_items (
  id,
  order_id,
  sku_id,
  product_code,
  sku_code,
  name_snapshot,
  quantity,
  unit_gross_twd,
  gross_twd,
  net_twd,
  tax_twd,
  price_version_id,
  invoice_line_key
) values (
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000101',
  'LIG-ENO1-001',
  'LIG-ENO1-001-01',
  'Field House Polo',
  1,
  7800,
  7800,
  7429,
  371,
  '50000000-0000-4000-8000-000000000101',
  'sql-ops-line-1'
);

insert into commerce_private.order_item_units (
  id,
  order_item_id,
  unit_ordinal,
  sku_id,
  gross_twd,
  net_twd,
  tax_twd,
  invoice_line_key
) values (
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000003',
  1,
  '40000000-0000-4000-8000-000000000101',
  7800,
  7429,
  371,
  'sql-ops-line-1'
);

insert into commerce_private.reservations (
  id,
  order_id,
  state,
  customer_deadline_at
) values (
  '71000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000002',
  'active',
  now() + interval '30 minutes'
);

insert into commerce_private.payment_attempts (
  id,
  order_id,
  reservation_id,
  merchant_trade_no,
  attempt_number,
  state,
  amount_twd,
  customer_deadline_at,
  reconcile_after
) values (
  '71000000-0000-4000-8000-000000000006',
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000005',
  'SQLOPSPAY001',
  1,
  'verification_pending',
  7800,
  now() + interval '30 minutes',
  now()
);

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  lease_token,
  leased_by,
  lease_expires_at
) values (
  '71000000-0000-4000-8000-000000000007',
  'sql-operations-payment-query-0001',
  'reconciliation',
  'payment.query',
  'safe_query',
  '71000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'paymentAttemptId',
    '71000000-0000-4000-8000-000000000006',
    'merchantTradeNo',
    'SQLOPSPAY001'
  ),
  'leased',
  '71000000-0000-4000-8000-000000000008',
  'sql-operations-worker',
  now() + interval '1 minute'
);

select api.worker_operations_complete(
  '71000000-0000-4000-8000-000000000007',
  '71000000-0000-4000-8000-000000000008',
  'succeeded',
  repeat('a', 64),
  jsonb_build_object(
    'tradeStatus', 'paid',
    'providerTradeNo', 'SQLPROVIDERPAY001',
    'amountTwd', 7800
  ),
  null,
  null,
  now()
);

do $payment$
declare
  projection jsonb;
begin
  if not exists (
    select 1
    from commerce_private.payment_receipts receipt
    where receipt.order_id =
      '71000000-0000-4000-8000-000000000002'
      and receipt.provider_trade_no = 'SQLPROVIDERPAY001'
      and receipt.amount_twd = 7800
  ) then
    raise exception 'Payment evidence was not reduced into a receipt';
  end if;
  if not exists (
    select 1
    from commerce_private.reservations reservation
    where reservation.id =
      '71000000-0000-4000-8000-000000000005'
      and reservation.state = 'consumed'
  ) then
    raise exception 'Paid order did not consume its reservation';
  end if;
  if not exists (
    select 1
    from commerce_private.inventory_movements movement
    where movement.operation_key =
      'sql-operations-payment-query-0001:sale:' ||
      '40000000-0000-4000-8000-000000000101'
      and movement.kind = 'sale'
      and movement.delta_on_hand = -1
      and movement.delta_reserved = -1
  ) then
    raise exception 'Paid order did not append its inventory sale';
  end if;
  if not exists (
    select 1
    from commerce_private.inventory_balances balance
    where balance.sku_id =
      '40000000-0000-4000-8000-000000000101'
      and balance.on_hand = 4
      and balance.reserved = 0
  ) then
    raise exception 'Paid order inventory balance is incorrect';
  end if;
  select projection_record.projection into projection
  from ops_private.operation_projections projection_record
  where projection_record.order_id =
    '71000000-0000-4000-8000-000000000002';
  if projection->>'paymentStatus' <> 'paid'
    or projection->>'orderStatus' <> 'paid'
  then
    raise exception 'Payment projection was not derived from authority';
  end if;
end
$payment$;

insert into commerce_private.invoices (
  id,
  order_id,
  relate_number,
  state,
  provider_operation_key
) values (
  '71000000-0000-4000-8000-000000000009',
  '71000000-0000-4000-8000-000000000002',
  'PENDING-SQL-OPS-1',
  'issuing',
  'sql-operations-invoice-issue-0001'
);

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  lease_token,
  leased_by,
  lease_expires_at
) values (
  '71000000-0000-4000-8000-000000000010',
  'sql-operations-invoice-issue-0001',
  'provider',
  'invoice.issue',
  'remote_effect',
  '71000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'invoiceId', '71000000-0000-4000-8000-000000000009',
    'option', jsonb_build_object('kind', 'ecpay_email'),
    'totals', jsonb_build_object(
      'grossTwd', 7800,
      'netTwd', 7429,
      'taxTwd', 371
    )
  ),
  'leased',
  '71000000-0000-4000-8000-000000000011',
  'sql-operations-worker',
  now() + interval '1 minute'
);

select api.worker_operations_dispatch_start(
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000011',
  now()
);

select api.worker_operations_complete(
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000011',
  'succeeded',
  repeat('b', 64),
  '{"state":"issued","relateNumber":"SQLINV0001"}'::jsonb,
  null,
  null,
  now()
);

insert into commerce_private.shipments (
  id,
  order_id,
  direction,
  state,
  provider_operation_key
) values (
  '71000000-0000-4000-8000-000000000012',
  '71000000-0000-4000-8000-000000000002',
  'outbound',
  'creating',
  'sql-operations-shipment-create-0001'
);

insert into commerce_private.parcels (
  id,
  shipment_id,
  order_id,
  parcel_ordinal,
  declared_value_twd,
  weight_grams
) values (
  '71000000-0000-4000-8000-000000000013',
  '71000000-0000-4000-8000-000000000012',
  '71000000-0000-4000-8000-000000000002',
  1,
  7800,
  500
);

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  lease_token,
  leased_by,
  lease_expires_at
) values (
  '71000000-0000-4000-8000-000000000014',
  'sql-operations-shipment-create-0001',
  'provider',
  'shipment.create',
  'remote_effect',
  '71000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'shipmentId', '71000000-0000-4000-8000-000000000012',
    'parcelCount', 1
  ),
  'leased',
  '71000000-0000-4000-8000-000000000015',
  'sql-operations-worker',
  now() + interval '1 minute'
);

select api.worker_operations_dispatch_start(
  '71000000-0000-4000-8000-000000000014',
  '71000000-0000-4000-8000-000000000015',
  now()
);

select api.worker_operations_complete(
  '71000000-0000-4000-8000-000000000014',
  '71000000-0000-4000-8000-000000000015',
  'succeeded',
  repeat('c', 64),
  '{"state":"created","trackingIds":["SQLTRACK0001"]}'::jsonb,
  null,
  null,
  now()
);

do $invoice_shipment$
begin
  if not exists (
    select 1
    from commerce_private.invoices invoice
    where invoice.id =
      '71000000-0000-4000-8000-000000000009'
      and invoice.state = 'issued'
      and invoice.relate_number = 'SQLINV0001'
      and invoice.issued_at is not null
  ) then
    raise exception 'Invoice result did not update invoice authority';
  end if;
  if not exists (
    select 1
    from commerce_private.shipments shipment
    where shipment.id =
      '71000000-0000-4000-8000-000000000012'
      and shipment.state = 'label_created'
      and shipment.tracking_id = 'SQLTRACK0001'
  ) or not exists (
    select 1
    from commerce_private.parcels parcel
    where parcel.id =
      '71000000-0000-4000-8000-000000000013'
      and parcel.tracking_id = 'SQLTRACK0001'
  ) then
    raise exception 'Shipment result did not update package authority';
  end if;
end
$invoice_shipment$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '71000000-0000-4000-8000-000000000090',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', '71000000-0000-4000-8000-000000000091',
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
  '71000000-0000-4000-8000-000000000090',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

set local role authenticated;

do $shipment_delivery$
declare
  delivery_result jsonb;
begin
  delivery_result := api.admin_operations_command(
    'sql-ops-shipment-delivered-0001',
    repeat('d', 64),
    4,
    'shipment.status.update',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'shipment.status.update',
      'trackingId', 'SQLTRACK0001',
      'state', 'delivered'
    )
  );
  if delivery_result->'projection'->>'orderStatus' <> 'delivered'
    or delivery_result->'projection'->>'shipmentStatus' <> 'delivered'
  then
    raise exception 'Delivery transition did not update authority';
  end if;
end
$shipment_delivery$;

do $admin_return_refund$
declare
  open_result jsonb;
  replay_result jsonb;
  decision_result jsonb;
  receive_result jsonb;
  inspect_result jsonb;
  refund_request_result jsonb;
  refund_execute_result jsonb;
  return_id text;
  refund_id text;
begin
  open_result := api.admin_operations_command(
    'sql-ops-return-open-0001',
    repeat('e', 64),
    5,
    'return.open',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'return.open',
      'unitIds', jsonb_build_array(
        '71000000-0000-4000-8000-000000000004'
      ),
      'reason', 'SQL 14 day return lifecycle'
    )
  );
  return_id := open_result->'references'->>'returnId';
  if return_id is null
    or open_result->'projection'->>'returnStatus' <> 'requested'
  then
    raise exception 'Return open did not create authoritative records';
  end if;

  replay_result := api.admin_operations_command(
    'sql-ops-return-open-0001',
    repeat('e', 64),
    5,
    'return.open',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'return.open',
      'unitIds', jsonb_build_array(
        '71000000-0000-4000-8000-000000000004'
      ),
      'reason', 'SQL 14 day return lifecycle'
    )
  );
  if not (replay_result->>'replayed')::boolean
  then
    raise exception 'Return idempotency replay was not recognized';
  end if;

  begin
    perform api.admin_operations_command(
      'sql-ops-return-open-0001',
      repeat('e', 64),
      5,
      'return.open',
      '71000000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'type', 'return.open',
        'unitIds', jsonb_build_array(
          '71000000-0000-4000-8000-000000000004'
        ),
        'reason', 'A different payload must conflict'
      )
    );
    raise exception 'Changed payload reused an idempotency key';
  exception
    when others then
      if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then
        raise;
      end if;
  end;

  decision_result := api.admin_operations_command(
    'sql-ops-return-decision-0001',
    repeat('f', 64),
    (open_result->'projection'->>'version')::bigint,
    'return.decision',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'return.decision',
      'returnId', return_id,
      'decision', 'authorize',
      'reason', 'SQL return is eligible'
    )
  );
  receive_result := api.admin_operations_command(
    'sql-ops-return-receive-0001',
    repeat('1', 64),
    (decision_result->'projection'->>'version')::bigint,
    'return.receive',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'return.receive',
      'returnId', return_id,
      'receivedUnitIds', jsonb_build_array(
        '71000000-0000-4000-8000-000000000004'
      )
    )
  );
  inspect_result := api.admin_operations_command(
    'sql-ops-return-inspect-0001',
    repeat('2', 64),
    (receive_result->'projection'->>'version')::bigint,
    'return.inspect',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'return.inspect',
      'returnId', return_id,
      'accepted', true,
      'disposition', 'sellable',
      'note', 'SQL inspection accepted'
    )
  );
  if inspect_result->'projection'->>'returnStatus'
      <> 'settlement_pending'
  then
    raise exception 'Return inspection projection was not updated';
  end if;

  refund_request_result := api.admin_operations_command(
    'sql-ops-refund-request-0001',
    repeat('3', 64),
    (inspect_result->'projection'->>'version')::bigint,
    'refund.request',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'refund.request',
      'amountTwd', 7800,
      'reason', 'SQL accepted return refund',
      'providerTradeNo', 'SQLPROVIDERPAY001'
    )
  );
  refund_id := refund_request_result->'references'->>'refundId';
  refund_execute_result := api.admin_operations_command(
    'sql-ops-refund-execute-0001',
    repeat('4', 64),
    (refund_request_result->'projection'->>'version')::bigint,
    'refund.execute',
    '71000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'type', 'refund.execute',
      'refundId', refund_id
    )
  );
  if refund_execute_result->'projection'->>'refundStatus' <> 'queued'
    or jsonb_array_length(
      refund_execute_result->'enqueuedOperationKeys'
    ) <> 1
  then
    raise exception 'Refund execute did not enqueue durable provider work';
  end if;
end
$admin_return_refund$;

reset role;

do $delivery_return_authority$
declare
  return_id text;
begin
  if not exists (
    select 1
    from commerce_private.order_status_events event
    where event.order_id =
      '71000000-0000-4000-8000-000000000002'
      and event.to_state = 'delivered'
      and event.operation_key =
        'sql-ops-shipment-delivered-0001:order-status'
  ) then
    raise exception 'Delivery transition did not append order history';
  end if;

  if (
    select count(*)
    from commerce_private.return_cases return_case
    where return_case.order_id =
      '71000000-0000-4000-8000-000000000002'
  ) <> 1 then
    raise exception 'Return idempotency replay created duplicate authority';
  end if;
  select return_case.public_id
  into return_id
  from commerce_private.return_cases return_case
  where return_case.order_id =
    '71000000-0000-4000-8000-000000000002';

  if not exists (
    select 1
    from commerce_private.return_cases return_case
    where return_case.public_id = return_id
      and return_case.requested_reason =
        'SQL 14 day return lifecycle'
      and return_case.decision_reason =
        'SQL return is eligible'
      and return_case.received_at is not null
      and return_case.inspection_note =
        'SQL inspection accepted'
      and return_case.inspection_accepted
      and return_case.disposition = 'sellable'
      and return_case.inspected_at is not null
  ) or not exists (
    select 1
    from commerce_private.inventory_movements movement
    where movement.operation_key =
      'sql-ops-return-inspect-0001:return:' ||
      '71000000-0000-4000-8000-000000000004'
      and movement.kind = 'return_sellable'
      and movement.delta_on_hand = 1
  ) or not exists (
    select 1
    from commerce_private.inventory_balances balance
    where balance.sku_id =
      '40000000-0000-4000-8000-000000000101'
      and balance.on_hand = 5
  ) then
    raise exception 'Return inspection did not append inventory authority';
  end if;
end
$delivery_return_authority$;

do $refund_worker$
declare
  claimed jsonb;
begin
  claimed := api.worker_operations_claim(
    'sql-operations-refund-worker',
    now(),
    30
  );
  if claimed->>'type' <> 'payment.refund' then
    raise exception 'Refund provider job was not claimable';
  end if;
  perform api.worker_operations_dispatch_start(
    claimed->>'id',
    claimed->>'leaseToken',
    now()
  );
  perform api.worker_operations_complete(
    claimed->>'id',
    claimed->>'leaseToken',
    'succeeded',
    repeat('d', 64),
    '{"state":"succeeded"}'::jsonb,
    null,
    null,
    now()
  );
end
$refund_worker$;

do $refund$
declare
  projection jsonb;
begin
  if not exists (
    select 1
    from commerce_private.refund_operations refund
    where refund.order_id =
      '71000000-0000-4000-8000-000000000002'
      and refund.state = 'succeeded'
      and refund.amount_twd = 7800
  ) then
    raise exception 'Refund result did not update refund authority';
  end if;
  select projection_record.projection into projection
  from ops_private.operation_projections projection_record
  where projection_record.order_id =
    '71000000-0000-4000-8000-000000000002';
  if projection->>'paymentStatus' <> 'refunded'
    or (projection->>'refundedTwd')::integer <> 7800
    or projection->>'orderStatus' <> 'closed'
  then
    raise exception 'Refund projection was not derived from authority';
  end if;
  if not exists (
    select 1
    from ops_private.outbox_jobs outbox
    where outbox.operation_key =
      'operations-result:operations:' ||
      'sql-ops-refund-execute-0001:refund.execute:completed'
  ) then
    raise exception 'Refund result did not append its outbox record';
  end if;
end
$refund$;

insert into commerce_private.shipments (
  id,
  order_id,
  direction,
  state,
  provider_operation_key
) values (
  '71000000-0000-4000-8000-000000000019',
  '71000000-0000-4000-8000-000000000002',
  'outbound',
  'creating',
  'sql-operations-shipment-unknown-0001'
);

insert into ops_private.operation_jobs (
  id,
  operation_key,
  kind,
  command_type,
  safety,
  aggregate_id,
  payload,
  state,
  lease_token,
  leased_by,
  lease_expires_at
) values (
  '71000000-0000-4000-8000-000000000020',
  'sql-operations-shipment-unknown-0001',
  'provider',
  'shipment.create',
  'remote_effect',
  '71000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'shipmentId', '71000000-0000-4000-8000-000000000019',
    'parcelCount', 1
  ),
  'leased',
  '71000000-0000-4000-8000-000000000021',
  'crashed-worker',
  now() - interval '1 minute'
);

select api.worker_operations_claim(
  'sql-operations-sweeper',
  now(),
  30
);

do $unknown$
begin
  if not exists (
    select 1
    from ops_private.operation_jobs job
    where job.id =
      '71000000-0000-4000-8000-000000000020'
      and job.state = 'unknown'
      and job.error_code = 'LEASE_EXPIRED_EFFECT_UNKNOWN'
  ) or not exists (
    select 1
    from commerce_private.shipments shipment
    where shipment.id =
      '71000000-0000-4000-8000-000000000019'
      and shipment.state = 'creation_unknown'
  ) then
    raise exception 'Expired remote lease was not reduced to unknown';
  end if;
end
$unknown$;

rollback;
