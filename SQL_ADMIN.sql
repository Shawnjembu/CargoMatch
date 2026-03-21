-- ============================================================
-- CargoMatch Admin Panel — SQL Setup
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- 1. Add is_admin column to profiles (additive, safe)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Admin helper function (SECURITY DEFINER avoids recursive RLS)
--    Safely checks if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Allow admins to view ALL shipments (in addition to existing party-only policy)
CREATE POLICY "Admins can view all shipments"
  ON public.shipments FOR SELECT
  USING (public.is_admin());

-- 4. Allow admins to view ALL carriers
--    (add SELECT policy — carriers may not have one yet)
CREATE POLICY "Carriers are viewable by owner"
  ON public.carriers FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all carriers"
  ON public.carriers FOR SELECT
  USING (public.is_admin());

-- 5. Allow admins to UPDATE carriers (for toggling verified status)
CREATE POLICY "Carrier owners can update their carrier"
  ON public.carriers FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can update all carriers"
  ON public.carriers FOR UPDATE
  USING (public.is_admin());

-- 6. Allow carriers to INSERT their own record
CREATE POLICY "Users can insert their own carrier"
  ON public.carriers FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 7. carrier_routes: allow any authenticated user to read
--    (needed for ShipperDashboard smart matching + CarrierProfile)
ALTER TABLE public.carrier_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view carrier routes"
  ON public.carrier_routes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Carriers can manage own routes"
  ON public.carrier_routes FOR ALL
  USING (carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid()));

-- 8. Grant yourself admin access (replace with your user ID from Supabase Auth)
--    Run this separately after finding your user UUID in Supabase > Authentication > Users
UPDATE public.profiles SET is_admin = TRUE WHERE id = '77b2186a-5b5b-4dab-b96b-f56a94bafacc';
