# Customer Identity, Promo, and Claiming QA

Use this checklist after applying the customer identity and promo migrations in a
dev or staging Supabase project. Do not run destructive cleanup on production
until every conflict in `public.customer_identity_qa_conflicts` has been reviewed.

## Audit Queries

```sql
select * from public.customer_identity_qa_summary order by metric;
select * from public.customer_identity_qa_conflicts order by issue, row_count desc;
select * from public.unclaimed_customer_history order by created_at desc limit 100;
```

Expected before production:

- `duplicate_promo_redemption_phone` and `duplicate_promo_redemption_email`: 0 unresolved groups.
- `service_request_stale_customer_id`: 0 rows.
- `service_request_missing_normalized_identity`: 0 rows where the original phone/email is usable.
- `saved_vehicle_safely_matchable` and `saved_address_safely_matchable`: acceptable only if those rows are intentionally waiting for customer claim.

## Promo Abuse QA

| Case | Steps | Expected |
| --- | --- | --- |
| Guest first booking with first-time promo | Book as guest with a new normalized phone/email and valid first-time code. | Promo preview succeeds, booking succeeds, one `promo_redemptions` row is created. |
| Same guest tries first-time promo again | Book again with same phone/email and same code. | Promo is rejected with “This first-time promo has already been used for this customer.” |
| Same guest changes phone formatting | Retry with `(908) 500-6350`, `908.500.6350`, `9085006350`. | All normalize to the same phone and are rejected after first redemption. |
| Same guest changes email case | Retry with upper/mixed-case email. | Email lowercases and is rejected after first redemption. |
| Same guest uses Gmail plus alias | Retry with `name+test@gmail.com` after `name@gmail.com`. | Currently treated as a different email unless phone matches; if phone also changes, this can bypass and needs future policy. |
| Same guest changes both phone and email | Retry with different phone and different email. | System cannot prove same customer; promo may pass unless vehicle/address/payment fraud checks catch it. |
| Existing customer tries first-time promo | Use account/phone/email with prior service history but no redemption. | Promo is rejected as first-time only. |
| Two simultaneous attempts | Submit two bookings with same phone/email/code at the same time. | Only one redemption insert succeeds; the loser receives the already-used message. |

## Guest-To-Account QA

| Case | Steps | Expected |
| --- | --- | --- |
| Guest books 4 washes then creates account | Complete four guest bookings with the same phone/email, then create My Account. | Account creation succeeds; claim panel appears. |
| Same phone/email claim | Tap “Add these past services to my account.” | Service history, matching vehicles, addresses, and promo rows link to the customer. |
| Same phone, different email | Create account with same phone but different email. | No auto-claim; possible-match/conflict state only. |
| Same email, different phone | Create account with same email but different phone. | No auto-claim; possible-match/conflict state only. |
| Two users share a phone | Create two accounts with same phone and different emails. | Exact claim is blocked by conflict rules. |
| Two users share an email | Create two accounts with same email and different phones. | Exact claim is blocked by conflict rules. |
| Already linked row | Attempt to claim a service linked to another `customer_id`. | Claim endpoint returns conflict; row is not stolen. |

## Customer Surface QA

| Area | Steps | Expected |
| --- | --- | --- |
| My Account history | Sign in after claim. | Claimed and phone/email-matched service history appears without internal IDs. |
| Saved vehicles | Review My Account vehicles. | Claimed vehicles appear once; duplicates are deduped in the UI. |
| Saved addresses | Review My Account addresses. | Claimed addresses appear once; duplicates are deduped in the UI. |
| Track request | Open Track My Vehicle with request number and matching phone/email. | Tracking still works for guest and account customers. |
| Returning customer booking | Start booking as returning customer. | Saved options still load from phone/email and account-linked rows. |

## Payment Correctness QA

| Case | Steps | Expected |
| --- | --- | --- |
| Payment authorization equals server-approved total | Apply a valid promo, authorize payment, submit booking. | Stripe PaymentIntent amount equals either full server total or server total minus server-approved promo discount. |
| Promo preview does not override final amount | Preview a promo, make it invalid before final submit, then submit. | Final booking is rejected; service request is not kept with an unearned discount. |
| Redemption fails after preview | Create a duplicate redemption before final submit. | Final submit returns the already-used promo message and does not keep the discounted booking. |

