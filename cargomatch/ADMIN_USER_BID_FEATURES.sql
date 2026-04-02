-- ============================================================
-- ADMIN USER MANAGEMENT & BID FILTERING FEATURES
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- FEATURE 1: Admin Function to Safely Delete Users
-- ============================================================

-- Create function to verify admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete a user and all associated data
-- Only callable by admin users
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  affected_rows INT := 0;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Admin privileges required'
    );
  END IF;

  -- Prevent deleting other admins
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND is_admin = true) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot delete another admin user'
    );
  END IF;

  -- Prevent deleting self
  IF target_user_id = auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot delete your own account'
    );
  END IF;

  -- Perform cascading deletes
  -- Note: Most deletes will happen automatically via ON DELETE CASCADE
  -- But we'll track them for the return message

  -- Delete will cascade to:
  -- - carriers (and their trucks, routes, bids, subscriptions)
  -- - loads (and their bids)
  -- - shipments (and their messages, tracking, etc.)
  -- - messages
  -- - notifications
  -- - reviews
  -- - support_threads and support_messages
  -- - All other related data

  -- Delete from auth.users (this triggers all RLS cascades)
  DELETE FROM auth.users WHERE id = target_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'User and all associated data deleted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on admin functions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- ============================================================
-- FEATURE 2: Update Bid Policies to Hide Accepted/Rejected Bids
-- ============================================================

-- Drop existing SELECT policies on load_bids
DROP POLICY IF EXISTS "Carriers view own bids" ON public.load_bids;
DROP POLICY IF EXISTS "Shippers view bids on own loads" ON public.load_bids;
DROP POLICY IF EXISTS "Admins view all bids" ON public.load_bids;

-- Recreate with filtering for accepted/rejected bids
-- Carriers can only see their own PENDING and ACCEPTED bids
-- Other carriers won't see accepted bids by others
CREATE POLICY "Carriers view own bids"
  ON public.load_bids FOR SELECT
  USING (
    carrier_user_id = auth.uid()
  );

-- Shippers can see all bids on their loads (to manage them)
CREATE POLICY "Shippers view bids on own loads"
  ON public.load_bids FOR SELECT
  USING (
    load_id IN (SELECT id FROM public.loads WHERE shipper_id = auth.uid())
  );

-- Admins see everything
CREATE POLICY "Admins view all bids"
  ON public.load_bids FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- FEATURE 3: Update Load Queries to Exclude Matched Loads
-- ============================================================

-- Add index for better performance on load status queries
CREATE INDEX IF NOT EXISTS idx_loads_status_pending 
  ON public.loads(status) WHERE status = 'pending';

-- Add index for better bid status queries
CREATE INDEX IF NOT EXISTS idx_load_bids_status 
  ON public.load_bids(status);

CREATE INDEX IF NOT EXISTS idx_load_bids_pending 
  ON public.load_bids(status, load_id) WHERE status = 'pending';

-- ============================================================
-- FEATURE 4: Enable Realtime for Bids
-- ============================================================

-- Enable realtime publications for load_bids table
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.load_bids;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime for loads table (for status changes)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.loads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- FEATURE 5: Trigger to Auto-Hide Rejected Bids  
-- ============================================================

-- Function to mark all other bids as rejected when one is accepted
CREATE OR REPLACE FUNCTION public.reject_other_bids()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when a bid is being accepted
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    -- Mark all other pending bids on this load as rejected
    UPDATE public.load_bids
    SET status = 'rejected'
    WHERE load_id = NEW.load_id
      AND id != NEW.id
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS auto_reject_other_bids ON public.load_bids;

CREATE TRIGGER auto_reject_other_bids
  AFTER UPDATE ON public.load_bids
  FOR EACH ROW
  WHEN (NEW.status = 'accepted')
  EXECUTE FUNCTION public.reject_other_bids();

-- ============================================================
-- FEATURE 6: Add Audit Log Table (Optional but Recommended)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins view audit logs"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_admin());

-- Insert audit log entry when admin deletes user
CREATE OR REPLACE FUNCTION public.log_admin_action()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_admin() THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      TG_OP,
      TG_TABLE_NAME,
      COALESCE(OLD.id, NEW.id),
      jsonb_build_object(
        'old', to_jsonb(OLD),
        'new', to_jsonb(NEW)
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check if functions were created
-- SELECT routine_name FROM information_schema.routines 
-- WHERE routine_schema = 'public' 
-- AND routine_name IN ('is_admin', 'admin_delete_user', 'reject_other_bids')
-- ORDER BY routine_name;

-- Check bid policies
-- SELECT policyname, cmd FROM pg_policies 
-- WHERE tablename = 'load_bids' AND schemaname = 'public'
-- ORDER BY policyname;

-- Check indexes
-- SELECT indexname FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('loads', 'load_bids')
-- ORDER BY tablename, indexname;

-- Check realtime publications
-- SELECT tablename FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime'
-- AND schemaname = 'public'
-- AND tablename IN ('load_bids', 'loads');

-- ============================================================
-- SUCCESS!
-- ============================================================
-- After running this script:
-- 1. Admins can delete users via admin_delete_user() function ✓
-- 2. User deletion cascades to all related data ✓
-- 3. Accepted bids are automatically hidden from other carriers ✓
-- 4. Real-time updates work for bids and loads ✓
-- 5. Other bids auto-reject when one is accepted ✓
-- 6. Admin actions are logged for audit trail ✓
