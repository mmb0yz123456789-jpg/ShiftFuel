-- Drops the uuid overload of public_track_request that causes an ambiguous
-- function resolution error when p_request_id is NULL (Postgres cannot pick
-- between the text and uuid signatures).  The text version handles all cases:
-- if a caller passes a UUID string it is matched via a text comparison in the
-- WHERE clause, so no functionality is lost.

begin;

drop function if exists public.public_track_request(uuid, text, text);

commit;
