-- Backend support for safely claiming guest history after a customer account is
-- verified. This does not change customer UI or remove phone/email lookup.

begin;

create table if not exists public.customer_history_claim_audit (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  source_table text not null check (source_table in (
    'service_requests',
    'saved_customer_vehicles',
    'saved_service_addresses',
    'promo_redemptions'
  )),
  source_id uuid not null,
  previous_customer_id uuid,
  claim_method text not null,
  claimed_at timestamptz not null default now()
);

create index if not exists customer_history_claim_audit_customer_idx
  on public.customer_history_claim_audit (customer_id, claimed_at desc);

create unique index if not exists customer_history_claim_audit_source_idx
  on public.customer_history_claim_audit (source_table, source_id, customer_id);

alter table public.service_requests
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_customer_id uuid,
  add column if not exists claim_method text,
  add column if not exists previous_customer_id uuid;

alter table public.saved_customer_vehicles
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_customer_id uuid,
  add column if not exists claim_method text,
  add column if not exists previous_customer_id uuid;

alter table public.saved_service_addresses
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_customer_id uuid,
  add column if not exists claim_method text,
  add column if not exists previous_customer_id uuid;

alter table public.promo_redemptions
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_customer_id uuid,
  add column if not exists claim_method text,
  add column if not exists previous_customer_id uuid;

create index if not exists service_requests_claimed_by_customer_idx
  on public.service_requests (claimed_by_customer_id)
  where claimed_by_customer_id is not null;

create index if not exists saved_customer_vehicles_claimed_by_customer_idx
  on public.saved_customer_vehicles (claimed_by_customer_id)
  where claimed_by_customer_id is not null;

create index if not exists saved_service_addresses_claimed_by_customer_idx
  on public.saved_service_addresses (claimed_by_customer_id)
  where claimed_by_customer_id is not null;

create index if not exists promo_redemptions_claimed_by_customer_idx
  on public.promo_redemptions (claimed_by_customer_id)
  where claimed_by_customer_id is not null;

create or replace function public.public_claim_customer_history(
  p_customer_id uuid,
  p_execute boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
  v_same_identity_customers integer := 0;
  v_phone_conflicts integer := 0;
  v_email_conflicts integer := 0;
  v_already_linked_conflicts integer := 0;
  v_claim_method text := 'exact_phone_email';
  v_claimed_at timestamptz := now();
  v_service_count integer := 0;
  v_vehicle_count integer := 0;
  v_address_count integer := 0;
  v_promo_count integer := 0;
  v_partial_service_count integer := 0;
  v_partial_vehicle_count integer := 0;
  v_partial_address_count integer := 0;
  v_partial_promo_count integer := 0;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok', false, 'status', 'missing_customer_id');
  end if;

  select *
  into v_customer
  from public.customers
  where id = p_customer_id;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'customer_not_found');
  end if;

  if v_customer.phone_digits is null or v_customer.email_normalized is null then
    return jsonb_build_object('ok', false, 'status', 'missing_verified_identity');
  end if;

  select count(*)
  into v_same_identity_customers
  from public.customers
  where phone_digits = v_customer.phone_digits
    and email_normalized = v_customer.email_normalized;

  select count(*)
  into v_phone_conflicts
  from public.customers
  where id <> p_customer_id
    and phone_digits = v_customer.phone_digits
    and email_normalized <> v_customer.email_normalized;

  select count(*)
  into v_email_conflicts
  from public.customers
  where id <> p_customer_id
    and email_normalized = v_customer.email_normalized
    and phone_digits <> v_customer.phone_digits;

  select count(*)
  into v_already_linked_conflicts
  from (
    select id from public.service_requests
    where customer_phone_digits = v_customer.phone_digits
      and customer_email_normalized = v_customer.email_normalized
      and customer_id is not null
      and customer_id <> p_customer_id
    union all
    select id from public.saved_customer_vehicles
    where customer_phone_digits = v_customer.phone_digits
      and customer_email_normalized = v_customer.email_normalized
      and customer_id is not null
      and customer_id <> p_customer_id
    union all
    select id from public.saved_service_addresses
    where customer_phone_digits = v_customer.phone_digits
      and customer_email_normalized = v_customer.email_normalized
      and customer_id is not null
      and customer_id <> p_customer_id
    union all
    select id from public.promo_redemptions
    where customer_phone_digits = v_customer.phone_digits
      and customer_email_normalized = v_customer.email_normalized
      and customer_id is not null
      and customer_id <> p_customer_id
  ) conflicts;

  select count(*) into v_service_count
  from public.service_requests
  where (customer_id is null or customer_id = p_customer_id)
    and claimed_at is null
    and customer_phone_digits = v_customer.phone_digits
    and customer_email_normalized = v_customer.email_normalized;

  select count(*) into v_vehicle_count
  from public.saved_customer_vehicles
  where (customer_id is null or customer_id = p_customer_id)
    and claimed_at is null
    and customer_phone_digits = v_customer.phone_digits
    and customer_email_normalized = v_customer.email_normalized;

  select count(*) into v_address_count
  from public.saved_service_addresses
  where (customer_id is null or customer_id = p_customer_id)
    and claimed_at is null
    and customer_phone_digits = v_customer.phone_digits
    and customer_email_normalized = v_customer.email_normalized;

  select count(*) into v_promo_count
  from public.promo_redemptions
  where (customer_id is null or customer_id = p_customer_id)
    and claimed_at is null
    and customer_phone_digits = v_customer.phone_digits
    and customer_email_normalized = v_customer.email_normalized;

  select count(*) into v_partial_service_count
  from public.service_requests
  where customer_id is null
    and (
      (customer_phone_digits = v_customer.phone_digits and customer_email_normalized is distinct from v_customer.email_normalized)
      or (customer_email_normalized = v_customer.email_normalized and customer_phone_digits is distinct from v_customer.phone_digits)
    );

  select count(*) into v_partial_vehicle_count
  from public.saved_customer_vehicles
  where customer_id is null
    and (
      (customer_phone_digits = v_customer.phone_digits and customer_email_normalized is distinct from v_customer.email_normalized)
      or (customer_email_normalized = v_customer.email_normalized and customer_phone_digits is distinct from v_customer.phone_digits)
    );

  select count(*) into v_partial_address_count
  from public.saved_service_addresses
  where customer_id is null
    and (
      (customer_phone_digits = v_customer.phone_digits and customer_email_normalized is distinct from v_customer.email_normalized)
      or (customer_email_normalized = v_customer.email_normalized and customer_phone_digits is distinct from v_customer.phone_digits)
    );

  select count(*) into v_partial_promo_count
  from public.promo_redemptions
  where customer_id is null
    and (
      (customer_phone_digits = v_customer.phone_digits and customer_email_normalized is distinct from v_customer.email_normalized)
      or (customer_email_normalized = v_customer.email_normalized and customer_phone_digits is distinct from v_customer.phone_digits)
    );

  if v_same_identity_customers <> 1
     or v_phone_conflicts > 0
     or v_email_conflicts > 0
     or v_already_linked_conflicts > 0 then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'execute', p_execute,
      'claimable', jsonb_build_object(
        'service_requests', v_service_count,
        'saved_vehicles', v_vehicle_count,
        'saved_addresses', v_address_count,
        'promo_redemptions', v_promo_count
      ),
      'potential_matches', jsonb_build_object(
        'service_requests', v_partial_service_count,
        'saved_vehicles', v_partial_vehicle_count,
        'saved_addresses', v_partial_address_count,
        'promo_redemptions', v_partial_promo_count
      ),
      'conflicts', jsonb_build_object(
        'same_identity_customers', v_same_identity_customers,
        'same_phone_different_email_customers', v_phone_conflicts,
        'same_email_different_phone_customers', v_email_conflicts,
        'already_linked_to_other_customer', v_already_linked_conflicts
      )
    );
  end if;

  if p_execute then
    with claimed as (
      update public.service_requests
      set previous_customer_id = case when customer_id is distinct from p_customer_id then customer_id else previous_customer_id end,
          customer_id = p_customer_id,
          claimed_at = v_claimed_at,
          claimed_by_customer_id = p_customer_id,
          claim_method = v_claim_method,
          updated_at = v_claimed_at
      where (customer_id is null or customer_id = p_customer_id)
        and claimed_at is null
        and customer_phone_digits = v_customer.phone_digits
        and customer_email_normalized = v_customer.email_normalized
      returning id, previous_customer_id
    )
    insert into public.customer_history_claim_audit (
      customer_id, source_table, source_id, previous_customer_id, claim_method, claimed_at
    )
    select p_customer_id, 'service_requests', id, previous_customer_id, v_claim_method, v_claimed_at
    from claimed
    on conflict do nothing;

    with claimed as (
      update public.saved_customer_vehicles
      set previous_customer_id = case when customer_id is distinct from p_customer_id then customer_id else previous_customer_id end,
          customer_id = p_customer_id,
          claimed_at = v_claimed_at,
          claimed_by_customer_id = p_customer_id,
          claim_method = v_claim_method,
          updated_at = v_claimed_at
      where (customer_id is null or customer_id = p_customer_id)
        and claimed_at is null
        and customer_phone_digits = v_customer.phone_digits
        and customer_email_normalized = v_customer.email_normalized
      returning id, previous_customer_id
    )
    insert into public.customer_history_claim_audit (
      customer_id, source_table, source_id, previous_customer_id, claim_method, claimed_at
    )
    select p_customer_id, 'saved_customer_vehicles', id, previous_customer_id, v_claim_method, v_claimed_at
    from claimed
    on conflict do nothing;

    with claimed as (
      update public.saved_service_addresses
      set previous_customer_id = case when customer_id is distinct from p_customer_id then customer_id else previous_customer_id end,
          customer_id = p_customer_id,
          claimed_at = v_claimed_at,
          claimed_by_customer_id = p_customer_id,
          claim_method = v_claim_method,
          updated_at = v_claimed_at
      where (customer_id is null or customer_id = p_customer_id)
        and claimed_at is null
        and customer_phone_digits = v_customer.phone_digits
        and customer_email_normalized = v_customer.email_normalized
      returning id, previous_customer_id
    )
    insert into public.customer_history_claim_audit (
      customer_id, source_table, source_id, previous_customer_id, claim_method, claimed_at
    )
    select p_customer_id, 'saved_service_addresses', id, previous_customer_id, v_claim_method, v_claimed_at
    from claimed
    on conflict do nothing;

    with claimed as (
      update public.promo_redemptions
      set previous_customer_id = case when customer_id is distinct from p_customer_id then customer_id else previous_customer_id end,
          customer_id = p_customer_id,
          claimed_at = v_claimed_at,
          claimed_by_customer_id = p_customer_id,
          claim_method = v_claim_method
      where (customer_id is null or customer_id = p_customer_id)
        and claimed_at is null
        and customer_phone_digits = v_customer.phone_digits
        and customer_email_normalized = v_customer.email_normalized
      returning id, previous_customer_id
    )
    insert into public.customer_history_claim_audit (
      customer_id, source_table, source_id, previous_customer_id, claim_method, claimed_at
    )
    select p_customer_id, 'promo_redemptions', id, previous_customer_id, v_claim_method, v_claimed_at
    from claimed
    on conflict do nothing;

    select count(*) into v_service_count
    from public.service_requests
    where claimed_by_customer_id = p_customer_id
      and claimed_at = v_claimed_at
      and claim_method = v_claim_method;

    select count(*) into v_vehicle_count
    from public.saved_customer_vehicles
    where claimed_by_customer_id = p_customer_id
      and claimed_at = v_claimed_at
      and claim_method = v_claim_method;

    select count(*) into v_address_count
    from public.saved_service_addresses
    where claimed_by_customer_id = p_customer_id
      and claimed_at = v_claimed_at
      and claim_method = v_claim_method;

    select count(*) into v_promo_count
    from public.promo_redemptions
    where claimed_by_customer_id = p_customer_id
      and claimed_at = v_claimed_at
      and claim_method = v_claim_method;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_execute then 'claimed' else 'preview' end,
    'execute', p_execute,
    'claim_method', v_claim_method,
    'claimable', jsonb_build_object(
      'service_requests', v_service_count,
      'saved_vehicles', v_vehicle_count,
      'saved_addresses', v_address_count,
      'promo_redemptions', v_promo_count
    ),
    'potential_matches', jsonb_build_object(
      'service_requests', v_partial_service_count,
      'saved_vehicles', v_partial_vehicle_count,
      'saved_addresses', v_partial_address_count,
      'promo_redemptions', v_partial_promo_count
    ),
    'conflicts', jsonb_build_object(
      'same_identity_customers', v_same_identity_customers,
      'same_phone_different_email_customers', v_phone_conflicts,
      'same_email_different_phone_customers', v_email_conflicts,
      'already_linked_to_other_customer', v_already_linked_conflicts
    )
  );
end;
$$;

grant execute on function public.public_claim_customer_history(uuid, boolean) to service_role;

commit;
