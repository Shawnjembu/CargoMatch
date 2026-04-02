-- ─────────────────────────────────────────────────────────────────
-- CargoMatch — Carrier Location Migration
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- Add location columns to carriers table (idempotent)
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS current_location    text,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_carriers_location ON public.carriers (current_location)
  WHERE current_location IS NOT NULL;
