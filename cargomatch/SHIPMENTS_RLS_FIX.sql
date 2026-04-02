-- ============================================================
-- Fix: Missing RLS policies for shipments table
-- Run in Supabase SQL Editor
-- ============================================================

-- Shippers can create shipments for their own loads
CREATE POLICY "Shippers can insert shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (auth.uid() = shipper_id);

-- Carrier or shipper can update shipment status (tracking updates, delivery confirmation)
CREATE POLICY "Shipment parties can update shipment"
  ON public.shipments FOR UPDATE
  USING (
    auth.uid() = shipper_id
    OR EXISTS (
      SELECT 1 FROM public.carriers c
      WHERE c.id = carrier_id AND c.user_id = auth.uid()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins manage all shipments"
  ON public.shipments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
