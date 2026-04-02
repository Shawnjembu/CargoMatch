-- ============================================================
-- CargoMatch — Live GPS Tracking + Onboarding SQL Setup
-- Run once in your Supabase SQL Editor
-- ============================================================

-- 1. shipment_locations table (one row per shipment = latest position)
CREATE TABLE IF NOT EXISTS public.shipment_locations (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id  UUID REFERENCES public.shipments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  lat          NUMERIC(10, 7) NOT NULL,
  lng          NUMERIC(10, 7) NOT NULL,
  speed_kmh    NUMERIC(5, 1),
  heading      NUMERIC(5, 1),
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shipment_locations ENABLE ROW LEVEL SECURITY;

-- Carrier can upsert their own shipment's location
CREATE POLICY "Carrier can upsert own location"
  ON public.shipment_locations FOR ALL
  USING (
    shipment_id IN (
      SELECT id FROM public.shipments
      WHERE carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    shipment_id IN (
      SELECT id FROM public.shipments
      WHERE carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
    )
  );

-- Both parties can read the location
CREATE POLICY "Parties can view shipment location"
  ON public.shipment_locations FOR SELECT
  USING (
    shipment_id IN (
      SELECT id FROM public.shipments
      WHERE shipper_id = auth.uid()
         OR carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Admins view all locations"
  ON public.shipment_locations FOR SELECT
  USING (public.is_admin());

-- Enable Realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_locations;

-- 2. Carriers table additions for onboarding
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS reg_number   TEXT,
  ADD COLUMN IF NOT EXISTS license_url  TEXT,
  ADD COLUMN IF NOT EXISTS insurance_url TEXT;
