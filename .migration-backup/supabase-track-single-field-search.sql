-- ─────────────────────────────────────────────────────────────────────────────
-- Track My Vehicle: allow phone-only, email-only, or ticket-only search.
--
-- The existing public_track_request (supabase-create-request.sql) required
-- phone AND email together whenever no request ID was given, and required
-- the request ID plus a matching phone OR email when an ID was given. The
-- redesigned Track My Vehicle page allows searching with any single field —
-- phone only, email only, or request/ticket number only — so the RPC must
-- accept any one matching criterion instead of requiring two.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_track_request(
  p_request_id uuid DEFAULT NULL,
  p_phone      text DEFAULT '',
  p_email      text DEFAULT ''
)
RETURNS SETOF service_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sr.*
  FROM service_requests sr
  WHERE (
      p_request_id IS NOT NULL
      AND sr.id = p_request_id
    )
    OR (
      p_request_id IS NULL
      AND (
        (length(trim(coalesce(p_phone, ''))) > 0 AND public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone))
        OR (length(trim(coalesce(p_email, ''))) > 0 AND lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, '')))
      )
    )
  ORDER BY sr.created_at DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.public_track_request(uuid, text, text) TO anon, authenticated;
