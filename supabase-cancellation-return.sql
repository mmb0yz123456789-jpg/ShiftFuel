-- Migration: customer cancellation / post-key-receipt return-request workflow.
-- Run this in the Supabase SQL editor before deploying the new cancellation logic.

alter table service_requests
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by text,
  add column if not exists return_requested_at timestamptz,
  add column if not exists return_requested_by text,
  add column if not exists return_request_reason text,
  add column if not exists pre_return_request_status text,
  add column if not exists cancellation_fee_applied boolean default false,
  add column if not exists cancellation_fee_amount numeric,
  add column if not exists cancellation_fee_waived boolean default false,
  add column if not exists cancellation_fee_decision_by text,
  add column if not exists cancellation_fee_decision_at timestamptz,
  add column if not exists authorization_released_at timestamptz,
  add column if not exists captured_amount numeric;
