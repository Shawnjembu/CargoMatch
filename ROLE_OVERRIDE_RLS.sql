-- ============================================================
-- CargoMatch v7 — Admin role-override RLS policy
-- Run this in Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- Allow admins to update any user's role column
-- (The existing "users can update own row" policy covers
--  self-updates; this separate policy covers admin overrides.)

DROP POLICY IF EXISTS "Admins can update any profile role" ON public.profiles;

CREATE POLICY "Admins can update any profile role"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================================
-- DONE — verify by attempting a role update as an admin user:
--   UPDATE public.profiles SET role = 'carrier' WHERE id = '<target-uuid>';
-- ============================================================
