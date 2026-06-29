-- ============================================================
-- ShiftFuel — Harden public_track_request (customer Track page lookup)
--
-- Two issues addressed:
--
--   1. OVER-EXPOSURE. The function returned `SELECT sr.*` — the entire
--      service_requests row — to the customer's browser, including
--      business-internal cost/margin fields (base service fees, operating
--      recovery, net target, actual fuel/wash receipt cost, driven miles, etc.).
--      A customer could open devtools and read ShiftFuel's cost structure on
--      their own booking. None of these are used by the Track UI (confirmed
--      against track.js / track-two-criteria.js / returning.js — they read only
--      customer-facing fields plus assigned_employee_id for the live map).
--
--   2. STALE PERMISSIVE OVERLOAD. An older (uuid, text, text) overload allowed a
--      SINGLE-identifier lookup (phone-only OR email-only), and a leftover
--      overload also causes ambiguous-function errors. We DROP it here
--      (idempotent — earlier migrations also dropped it) so only the
--      two-identifier (text, text, text) version remains.
--
-- The function still:
--   * requires at least TWO of {request/ticket, phone, email},
--   * supports full-UUID and SF-XXXXXXXX short-ticket lookups,
--   * returns the customer's own matching requests, newest first.
--
-- It now returns SETOF jsonb (each row minus the internal keys). The Track page
-- consumes the result as plain objects (`data?.length`, field reads), so this is
-- transparent to the client. Using `to_jsonb(sr) - keys[]` also means any key
-- that doesn't exist in this database is simply skipped — no hard failure if a
-- pricing-audit column hasn't been added yet.
-- ============================================================

-- Kill the permissive single-identifier overload if it still exists anywhere.
DROP FUNCTION IF EXISTS public.public_track_request(uuid, text, text);

-- Drop the current (text,text,text) version so we can change its return type.
DROP FUNCTION IF EXISTS public.public_track_request(text, text, text);

CREATE FUNCTION public.public_track_request(
  p_request_id text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_email      text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH resolved AS (
    SELECT
      upper(trim(coalesce(p_request_id, '')))                          AS req,
      regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')             AS phone,
      lower(trim(coalesce(p_email, '')))                               AS email
  ),
  resolved2 AS (
    SELECT
      req, phone, email,
      ((phone <> '')::int + (email <> '')::int + (req <> '')::int)     AS id_count,
      CASE
        WHEN req LIKE 'SF-%'         THEN lower(substring(req FROM 4 FOR 8))
        WHEN req ~ '^[A-F0-9]{8}$'   THEN lower(req)
        ELSE NULL
      END                                                              AS ticket_prefix
    FROM resolved
  )
  SELECT to_jsonb(sr) - ARRAY[
    'base_fuel_service_fee', 'base_car_wash_service_fee', 'base_inspection_fee',
    'displayed_fuel_service_fee', 'displayed_car_wash_service_fee', 'displayed_inspection_fee',
    'payment_operating_recovery_amount', 'net_target_amount', 'gross_total_before_rounding',
    'rounded_customer_total', 'authorized_amount',
    'actual_fuel_receipt_amount', 'actual_car_wash_receipt_amount',
    'driven_miles'
  ]
  FROM service_requests sr, resolved2 r
  WHERE r.id_count >= 2
    AND (
      (r.req <> '' AND r.ticket_prefix IS NULL AND sr.id::text = lower(r.req))
      OR (r.ticket_prefix IS NOT NULL AND sr.id::text LIKE r.ticket_prefix || '%')
      OR (r.req = '')
    )
    AND (r.phone = '' OR regexp_replace(coalesce(sr.customer_phone, ''), '\D', '', 'g') = r.phone)
    AND (r.email = '' OR lower(coalesce(sr.customer_email, '')) = r.email)
  ORDER BY sr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_track_request(text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────────
-- 1) Single identifier should return nothing (needs 2):
--      SELECT public.public_track_request(NULL, '3025551234', '');     -- 0 rows
-- 2) Phone + email returns the customer's own rows, with NO internal keys:
--      SELECT public.public_track_request(NULL, '<phone>', '<email>'); -- check
--      the returned json has no base_*/net_target_amount/driven_miles keys.
-- 3) Only the (text,text,text) overload should remain:
--      SELECT pg_get_function_identity_arguments(oid)
--      FROM pg_proc WHERE proname = 'public_track_request';
