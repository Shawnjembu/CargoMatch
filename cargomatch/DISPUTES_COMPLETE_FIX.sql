-- ============================================================
-- DISPUTES SYSTEM COMPLETE FIX
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STEP 1: Ensure Disputes Table Exists with Correct Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS public.disputes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     UUID        NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  raised_by       UUID        NOT NULL REFERENCES public.profiles(id),
  reason          TEXT        NOT NULL,
  details         TEXT,
  status          TEXT        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','under_review','resolved','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);

-- ============================================================
-- STEP 2: Create Indexes for Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS disputes_shipment_id_idx ON public.disputes(shipment_id);
CREATE INDEX IF NOT EXISTS disputes_raised_by_idx   ON public.disputes(raised_by);
CREATE INDEX IF NOT EXISTS disputes_status_idx      ON public.disputes(status);
CREATE INDEX IF NOT EXISTS disputes_created_at_idx  ON public.disputes(created_at DESC);

-- ============================================================
-- STEP 3: Enable Row Level Security
-- ============================================================

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them fresh
DROP POLICY IF EXISTS "Admins full access to disputes" ON public.disputes;
DROP POLICY IF EXISTS "Parties can view disputes on their shipments" ON public.disputes;
DROP POLICY IF EXISTS "Parties can raise disputes on delivered shipments" ON public.disputes;

-- ============================================================
-- STEP 4: Create RLS Policies
-- ============================================================

-- Admins can do everything with disputes
CREATE POLICY "Admins full access to disputes"
  ON public.disputes FOR ALL
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

-- Shippers and carriers can SELECT disputes on their own shipments
CREATE POLICY "Parties can view disputes on their shipments"
  ON public.disputes FOR SELECT
  USING (
    raised_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = disputes.shipment_id
        AND (
          s.shipper_id = auth.uid()
          OR s.carrier_id IN (
            SELECT id FROM public.carriers WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Shippers and carriers can INSERT a dispute on a delivered shipment
CREATE POLICY "Parties can raise disputes on delivered shipments"
  ON public.disputes FOR INSERT
  WITH CHECK (
    raised_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_id
        AND s.status = 'delivered'
        AND (
          s.shipper_id = auth.uid()
          OR s.carrier_id IN (
            SELECT id FROM public.carriers WHERE user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- STEP 5: Enable Realtime for Disputes
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- STEP 6: Create Helper Function to Check Dispute Permissions
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_update_dispute(dispute_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_update_dispute(UUID) TO authenticated;

-- ============================================================
-- STEP 7: Create Trigger to Update Timestamp on Status Change
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_dispute_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changes to resolved or dismissed, set resolved_at
  IF NEW.status IN ('resolved', 'dismissed') AND OLD.status != NEW.status THEN
    NEW.resolved_at := NOW();
  END IF;
  
  -- If status changes back to open or under_review, clear resolved_at
  IF NEW.status IN ('open', 'under_review') AND OLD.status IN ('resolved', 'dismissed') THEN
    NEW.resolved_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_dispute_resolved_at ON public.disputes;

CREATE TRIGGER set_dispute_resolved_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_dispute_resolved_at();

-- ============================================================
-- STEP 8: Create View for Disputes with Full Details
-- ============================================================

CREATE OR REPLACE VIEW public.disputes_with_details AS
SELECT 
  d.id,
  d.shipment_id,
  d.raised_by,
  d.reason,
  d.details,
  d.status,
  d.created_at,
  d.resolved_at,
  d.resolution_note,
  s.reference as shipment_reference,
  s.status as shipment_status,
  s.shipper_id,
  s.carrier_id,
  sp.full_name as shipper_name,
  sp.email as shipper_email,
  c.company_name as carrier_company,
  cp.full_name as carrier_contact_name,
  cp.email as carrier_email,
  rp.full_name as raised_by_name,
  rp.role as raised_by_role
FROM public.disputes d
LEFT JOIN public.shipments s ON d.shipment_id = s.id
LEFT JOIN public.profiles sp ON s.shipper_id = sp.id
LEFT JOIN public.carriers c ON s.carrier_id = c.id
LEFT JOIN public.profiles cp ON c.user_id = cp.id
LEFT JOIN public.profiles rp ON d.raised_by = rp.id;

-- Grant access to the view
GRANT SELECT ON public.disputes_with_details TO authenticated;

-- ============================================================
-- STEP 9: Add Notification Trigger for New Disputes
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_dispute()
RETURNS TRIGGER AS $$
DECLARE
  admin_ids UUID[];
  shipment_ref TEXT;
BEGIN
  -- Get shipment reference
  SELECT reference INTO shipment_ref
  FROM public.shipments
  WHERE id = NEW.shipment_id;
  
  -- Get all admin user IDs
  SELECT ARRAY_AGG(id) INTO admin_ids
  FROM public.profiles
  WHERE is_admin = true;
  
  -- Create notifications for all admins
  IF admin_ids IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT 
      unnest(admin_ids),
      'alert',
      'New Dispute Filed',
      'A dispute has been raised on shipment ' || shipment_ref || ': "' || NEW.reason || '"',
      '/admin'
    FROM generate_series(1, 1); -- Ensures INSERT runs
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_admins_new_dispute ON public.disputes;

CREATE TRIGGER notify_admins_new_dispute
  AFTER INSERT ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_dispute();

-- ============================================================
-- STEP 10: Verification Queries
-- ============================================================

-- Check disputes table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'disputes'
-- AND table_schema = 'public'
-- ORDER BY ordinal_position;

-- Check RLS policies
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'disputes'
-- AND schemaname = 'public';

-- Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'disputes'
-- AND schemaname = 'public';

-- Check if realtime is enabled
-- SELECT tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
-- AND tablename = 'disputes';

-- Test dispute view
-- SELECT * FROM public.disputes_with_details LIMIT 5;

-- ============================================================
-- SUCCESS!
-- ============================================================
-- After running this script:
-- 1. Disputes table is properly configured ✓
-- 2. RLS policies ensure proper access control ✓
-- 3. Real-time updates are enabled ✓
-- 4. Admins receive notifications for new disputes ✓
-- 5. Automatic timestamp management ✓
-- 6. Performance indexes in place ✓
-- 7. Helper view for detailed dispute queries ✓
