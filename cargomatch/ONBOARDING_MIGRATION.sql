-- ============================================================
-- CargoMatch v7 — Onboarding flag migration
-- Run this in Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- Add onboarded flag to profiles (default false so existing users
-- are NOT shown onboarding again — set to true for existing rows below)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;

-- Mark all existing users as already onboarded so only new sign-ups
-- see the onboarding flow going forward.
UPDATE public.profiles SET onboarded = true WHERE onboarded = false;

-- ── RLS: allow users to update their own onboarded flag ──────
-- (profiles table must already have RLS enabled)
-- Drop policy if re-running:
DROP POLICY IF EXISTS "Users can update own onboarded flag" ON public.profiles;

CREATE POLICY "Users can update own onboarded flag"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- DONE — verify with:
--   SELECT id, full_name, onboarded FROM public.profiles LIMIT 10;
-- ============================================================
