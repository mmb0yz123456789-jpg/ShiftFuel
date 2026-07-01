-- Admin-only support tools for customer identity, claimed history, and promo
-- redemption review. All access is gated by a valid admin session token.

begin;

create table if not exists public.admin_support_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_session_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_support_audit_log_session_idx
  on public.admin_support_audit_log (admin_session_id, created_at desc);

create index if not exists admin_support_audit_log_target_idx
  on public.admin_support_audit_log (target_table, target_id, created_at desc);

alter table public.admin_support_audit_log enable row level security;

alter table public.promo_redemptions
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_admin_session_id uuid,
  add column if not exists void_reason text;

create index if not exists promo_redemptions_voided_idx
  on public.promo_redemptions (voided_at)
  where voided_at is not null;

create or replace function public.admin_customer_identity_lookup(
  p_token uuid,
  p_phone text default null,
  p_email text default null,
  p_customer_id uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := p_customer_id;
  v_phone text := nullif(public.clean_phone(p_phone), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_customer public.customers%rowtype;
  v_request public.service_requests%rowtype;
begin
  if not exists (select 1 from public.admin_sessions where id = p_token and expires_at > now()) then
    raise exception 'Unauthorized';
  end if;

  if p_request_id is not null then
    select * into v_request
    from public.service_requests
    where id = p_request_id;

    if found then
      v_customer_id := coalesce(v_customer_id, v_request.customer_id);
      v_phone := coalesce(v_phone, v_request.customer_phone_digits, nullif(public.clean_phone(v_request.customer_phone), ''));
      v_email := coalesce(v_email, v_request.customer_email_normalized, nullif(lower(trim(coalesce(v_request.customer_email, ''))), ''));
    end if;
  end if;

  if v_customer_id is null and v_phone is not null and v_email is not null then
    select *
    into v_customer
    from public.customers
    where phone_digits = v_phone
      and email_normalized = v_email
    order by created_at asc
    limit 1;

    if found then
      v_customer_id := v_customer.id;
    end if;
  end if;

  if v_customer_id is not null then
    select *
    into v_customer
    from public.customers
    where id = v_customer_id;

    if found then
      v_phone := coalesce(v_phone, v_customer.phone_digits);
      v_email := coalesce(v_email, v_customer.email_normalized);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lookup', jsonb_build_object(
      'customer_id', v_customer_id,
      'phone_digits', v_phone,
      'email_normalized', v_email
    ),
    'customer', coalesce((
      select to_jsonb(c)
      from (
        select id, first_name, last_name, name, phone, phone_digits, email,
               email_normalized, service_area, zip_code, created_at, updated_at,
               last_seen_at
        from public.customers
        where id = v_customer_id
      ) c
    ), 'null'::jsonb),
    'service_history', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, customer_id, customer_name, customer_phone, customer_email,
               customer_phone_digits, customer_email_normalized, service_type,
               service_label, status, service_date, created_at, promo_code,
               promo_discount, claimed_at, claimed_by_customer_id,
               claim_method, previous_customer_id
        from public.service_requests
        where (
          (v_customer_id is not null and customer_id = v_customer_id)
          or (v_phone is not null and v_email is not null
              and customer_phone_digits = v_phone
              and customer_email_normalized = v_email)
        )
        order by created_at desc
        limit 50
      ) r
    ), '[]'::jsonb),
    'promo_redemptions', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.redeemed_at desc)
      from (
        select pr.id, pr.promo_code_id, pc.code, pc.name, pr.request_id,
               pr.customer_id, pr.customer_phone_digits,
               pr.customer_email_normalized, pr.discount_amount,
               pr.redeemed_at, pr.claimed_at, pr.claimed_by_customer_id,
               pr.claim_method, pr.voided_at, pr.void_reason
        from public.promo_redemptions pr
        left join public.promo_codes pc on pc.id = pr.promo_code_id
        where (
          (v_customer_id is not null and pr.customer_id = v_customer_id)
          or (v_phone is not null and pr.customer_phone_digits = v_phone)
          or (v_email is not null and pr.customer_email_normalized = v_email)
        )
        order by pr.redeemed_at desc
        limit 50
      ) p
    ), '[]'::jsonb),
    'saved_vehicles', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.updated_at desc, v.created_at desc)
      from (
        select id, customer_id, customer_name, vehicle_year, vehicle_make,
               vehicle_model, vehicle_color, license_plate, fuel_type,
               customer_phone_digits, customer_email_normalized, claimed_at,
               claimed_by_customer_id, claim_method, created_at, updated_at
        from public.saved_customer_vehicles
        where (
          (v_customer_id is not null and customer_id = v_customer_id)
          or (v_phone is not null and v_email is not null
              and customer_phone_digits = v_phone
              and customer_email_normalized = v_email)
        )
        order by updated_at desc, created_at desc
        limit 50
      ) v
    ), '[]'::jsonb),
    'saved_addresses', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.updated_at desc, a.created_at desc)
      from (
        select id, customer_id, customer_name, hospital, address_street,
               address_apt, address_city, address_state, address_zip,
               parking_location, key_handoff_details, customer_phone_digits,
               customer_email_normalized, claimed_at, claimed_by_customer_id,
               claim_method, created_at, updated_at
        from public.saved_service_addresses
        where (
          (v_customer_id is not null and customer_id = v_customer_id)
          or (v_phone is not null and v_email is not null
              and customer_phone_digits = v_phone
              and customer_email_normalized = v_email)
        )
        order by updated_at desc, created_at desc
        limit 50
      ) a
    ), '[]'::jsonb),
    'claim_audit', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.claimed_at desc)
      from (
        select id, customer_id, source_table, source_id, previous_customer_id,
               claim_method, claimed_at
        from public.customer_history_claim_audit
        where customer_id = v_customer_id
        order by claimed_at desc
        limit 50
      ) a
    ), '[]'::jsonb),
    'conflicts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.issue, c.row_count desc)
      from (
        select issue, scope, identity_value, row_count, sample_ids
        from public.customer_identity_qa_conflicts
        where (v_phone is not null and (scope = v_phone or identity_value = v_phone))
           or (v_email is not null and (scope = v_email or identity_value = v_email))
        order by issue, row_count desc
        limit 50
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_customer_identity_action(
  p_token uuid,
  p_action text,
  p_target_id uuid,
  p_customer_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old jsonb;
  v_new jsonb;
begin
  if not exists (select 1 from public.admin_sessions where id = p_token and expires_at > now()) then
    raise exception 'Unauthorized';
  end if;

  if p_action = 'link_request' then
    if p_target_id is null or p_customer_id is null then
      raise exception 'Request and customer are required.';
    end if;
    if not exists (select 1 from public.customers where id = p_customer_id) then
      raise exception 'Customer was not found.';
    end if;

    select to_jsonb(sr) into v_old
    from (
      select id, customer_id, customer_phone_digits, customer_email_normalized,
             claimed_at, claimed_by_customer_id, claim_method, previous_customer_id
      from public.service_requests
      where id = p_target_id
      for update
    ) sr;

    if v_old is null then
      raise exception 'Request was not found.';
    end if;

    update public.service_requests
    set previous_customer_id = case
          when customer_id is distinct from p_customer_id then customer_id
          else previous_customer_id
        end,
        customer_id = p_customer_id,
        claimed_at = now(),
        claimed_by_customer_id = p_customer_id,
        claim_method = 'admin_manual_link'
    where id = p_target_id;

    select to_jsonb(sr) into v_new
    from (
      select id, customer_id, customer_phone_digits, customer_email_normalized,
             claimed_at, claimed_by_customer_id, claim_method, previous_customer_id
      from public.service_requests
      where id = p_target_id
    ) sr;

    insert into public.customer_history_claim_audit (
      customer_id, source_table, source_id, previous_customer_id, claim_method, claimed_at
    )
    values (
      p_customer_id, 'service_requests', p_target_id,
      nullif(v_old->>'customer_id', '')::uuid, 'admin_manual_link', now()
    )
    on conflict do nothing;

    insert into public.admin_support_audit_log (
      admin_session_id, action, target_table, target_id, old_value, new_value
    )
    values (p_token, p_action, 'service_requests', p_target_id, v_old, jsonb_set(v_new, '{reason}', coalesce(to_jsonb(v_reason), 'null'::jsonb)));

    return jsonb_build_object('ok', true, 'action', p_action, 'request', v_new);
  end if;

  if p_action = 'unlink_request' then
    if p_target_id is null then
      raise exception 'Request is required.';
    end if;

    select to_jsonb(sr) into v_old
    from (
      select id, customer_id, customer_phone_digits, customer_email_normalized,
             claimed_at, claimed_by_customer_id, claim_method, previous_customer_id
      from public.service_requests
      where id = p_target_id
      for update
    ) sr;

    if v_old is null then
      raise exception 'Request was not found.';
    end if;

    update public.service_requests
    set previous_customer_id = case when customer_id is not null then customer_id else previous_customer_id end,
        customer_id = null,
        claimed_at = null,
        claimed_by_customer_id = null,
        claim_method = 'admin_manual_unlink'
    where id = p_target_id;

    select to_jsonb(sr) into v_new
    from (
      select id, customer_id, customer_phone_digits, customer_email_normalized,
             claimed_at, claimed_by_customer_id, claim_method, previous_customer_id
      from public.service_requests
      where id = p_target_id
    ) sr;

    insert into public.admin_support_audit_log (
      admin_session_id, action, target_table, target_id, old_value, new_value
    )
    values (p_token, p_action, 'service_requests', p_target_id, v_old, jsonb_set(v_new, '{reason}', coalesce(to_jsonb(v_reason), 'null'::jsonb)));

    return jsonb_build_object('ok', true, 'action', p_action, 'request', v_new);
  end if;

  if p_action = 'void_promo_redemption' then
    if p_target_id is null then
      raise exception 'Promo redemption is required.';
    end if;
    if v_reason is null then
      raise exception 'A reason is required to mark a promo redemption voided.';
    end if;

    select to_jsonb(pr) into v_old
    from (
      select id, promo_code_id, request_id, customer_id, customer_phone_digits,
             customer_email_normalized, discount_amount, redeemed_at, voided_at,
             void_reason
      from public.promo_redemptions
      where id = p_target_id
      for update
    ) pr;

    if v_old is null then
      raise exception 'Promo redemption was not found.';
    end if;

    update public.promo_redemptions
    set voided_at = coalesce(voided_at, now()),
        voided_by_admin_session_id = p_token,
        void_reason = v_reason
    where id = p_target_id;

    select to_jsonb(pr) into v_new
    from (
      select id, promo_code_id, request_id, customer_id, customer_phone_digits,
             customer_email_normalized, discount_amount, redeemed_at, voided_at,
             void_reason
      from public.promo_redemptions
      where id = p_target_id
    ) pr;

    insert into public.admin_support_audit_log (
      admin_session_id, action, target_table, target_id, old_value, new_value
    )
    values (p_token, p_action, 'promo_redemptions', p_target_id, v_old, v_new);

    return jsonb_build_object('ok', true, 'action', p_action, 'promo_redemption', v_new);
  end if;

  raise exception 'Unsupported support action.';
end;
$$;

grant execute on function public.admin_customer_identity_lookup(uuid, text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.admin_customer_identity_action(uuid, text, uuid, uuid, text) to anon, authenticated;

commit;
