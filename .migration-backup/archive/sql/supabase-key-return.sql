-- Migration: add key-return tracking columns to service_requests
-- Run this in the Supabase SQL editor before deploying the new tracking workflow.

alter table service_requests
  add column if not exists key_returned_to_type text,
  add column if not exists key_returned_to_name_or_location text,
  add column if not exists key_returned_at timestamptz,
  add column if not exists key_returned_by text;
