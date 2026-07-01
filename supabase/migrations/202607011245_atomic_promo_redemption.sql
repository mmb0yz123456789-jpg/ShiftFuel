-- Atomic promo redemption recorder. Validation/math stay in the service-role API,
-- but the durable redemption insert + global count increment happen together.

begin;

create or replace function public.public_record_promo_redemption(
  p_promo_code_id uuid,
  p_request_id uuid,
  p_customer_phone text,
  p_customer_email text,
  p_discount_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redemption public.promo_redemptions%rowtype;
  v_promo public.promo_codes%rowtype;
  v_phone text := nullif(public.clean_phone(p_customer_phone), '');
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
begin
  if p_promo_code_id is null then
    raise exception 'Promo code id is required.';
  end if;

  select *
  into v_promo
  from public.promo_codes
  where id = p_promo_code_id
  for update;

  if not found then
    raise exception 'Promo code was not found.';
  end if;

  if v_promo.max_redemptions is not null
     and v_promo.redemption_count >= v_promo.max_redemptions then
    raise exception 'This promo code has reached its redemption limit.';
  end if;

  insert into public.promo_redemptions (
    promo_code_id,
    request_id,
    customer_phone,
    customer_email,
    customer_phone_digits,
    customer_email_normalized,
    discount_amount
  )
  values (
    p_promo_code_id,
    p_request_id,
    v_phone,
    v_email,
    v_phone,
    v_email,
    greatest(coalesce(p_discount_amount, 0), 0)
  )
  returning * into v_redemption;

  update public.promo_codes
  set redemption_count = redemption_count + 1,
      updated_at = now()
  where id = p_promo_code_id
  returning * into v_promo;

  return jsonb_build_object(
    'redemption_id', v_redemption.id,
    'redemption_count', v_promo.redemption_count
  );
end;
$$;

grant execute on function public.public_record_promo_redemption(uuid, uuid, text, text, numeric) to service_role;

commit;
