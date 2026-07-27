begin;

set local role postgres;

update commerce_private.inventory_balances
set on_hand = 5, reserved = 0, safety_stock = 1
where sku_id = '40000000-0000-4000-8000-000000000101';

select *
from api.apply_inventory_operation(
  'sql-test-reserve-0001',
  '40000000-0000-4000-8000-000000000101',
  'reserve',
  2
);

select *
from api.apply_inventory_operation(
  'sql-test-reserve-0001',
  '40000000-0000-4000-8000-000000000101',
  'reserve',
  2
);

do $test$
declare
  balance commerce_private.inventory_balances%rowtype;
  movement_count integer;
begin
  select * into balance
  from commerce_private.inventory_balances
  where sku_id = '40000000-0000-4000-8000-000000000101';
  if balance.on_hand <> 5 or balance.reserved <> 2 or balance.safety_stock <> 1 then
    raise exception 'Unexpected post-reservation balance';
  end if;
  select count(*) into movement_count
  from commerce_private.inventory_movements
  where operation_key = 'sql-test-reserve-0001';
  if movement_count <> 1 then
    raise exception 'Idempotent operation produced % movements', movement_count;
  end if;
end
$test$;

rollback;
