-- ============================================================
-- MESSAGING SYSTEM COMPLETE FIX
-- Run this in your Supabase SQL Editor to fix all messaging issues
-- ============================================================

-- ============================================================
-- FIX 1: Messages UPDATE Policy (Mark as Read)
-- ============================================================
-- Drop if exists to avoid duplicates
DROP POLICY IF EXISTS "Receivers can mark messages read" ON public.messages;

-- Create policy allowing receivers to mark messages as read
CREATE POLICY "Receivers can mark messages read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- ============================================================
-- FIX 2: Notifications INSERT Policy
-- ============================================================
-- Drop if exists to avoid duplicates
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- Create policy allowing authenticated users to send notifications
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- FIX 3: Support Chat Tables
-- ============================================================

-- Create support_threads table
CREATE TABLE IF NOT EXISTS public.support_threads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create support_messages table
CREATE TABLE IF NOT EXISTS public.support_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id  UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id),
  body       TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on support tables
ALTER TABLE public.support_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FIX 4: Support Threads RLS Policies
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users view own support thread" ON public.support_threads;
DROP POLICY IF EXISTS "Users create own support thread" ON public.support_threads;
DROP POLICY IF EXISTS "Admins update support threads" ON public.support_threads;

-- Users can view their own thread; admins can view all
CREATE POLICY "Users view own support thread"
  ON public.support_threads FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Users can create their own support thread
CREATE POLICY "Users create own support thread"
  ON public.support_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admins can update support threads (e.g., mark as resolved)
CREATE POLICY "Admins update support threads"
  ON public.support_threads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================================
-- FIX 5: Support Messages RLS Policies
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Support message participants can view" ON public.support_messages;
DROP POLICY IF EXISTS "Users and admins can send support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Receivers can mark support messages read" ON public.support_messages;

-- Thread participants can view messages
CREATE POLICY "Support message participants can view"
  ON public.support_messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR EXISTS (
      SELECT 1 FROM public.support_threads t 
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Users and admins can send messages
CREATE POLICY "Users and admins can send support messages"
  ON public.support_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Thread owner or admin can mark messages as read
CREATE POLICY "Receivers can mark support messages read"
  ON public.support_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.support_threads t 
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================================
-- FIX 6: Realtime Subscriptions
-- ============================================================

-- Enable realtime for messages (if not already enabled)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime for support_messages
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable realtime for notifications (if not already enabled)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- FIX 7: Performance Indexes
-- ============================================================

-- Create indexes for support tables
CREATE INDEX IF NOT EXISTS idx_support_threads_user 
  ON public.support_threads(user_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread 
  ON public.support_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_sender 
  ON public.support_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_created 
  ON public.support_messages(created_at DESC);

-- Ensure message indexes exist
CREATE INDEX IF NOT EXISTS idx_messages_receiver 
  ON public.messages(receiver_id);

CREATE INDEX IF NOT EXISTS idx_messages_read 
  ON public.messages(read) WHERE read = false;

-- ============================================================
-- FIX 8: Update Timestamp Trigger for Support Threads
-- ============================================================

-- Create or replace function to update updated_at
CREATE OR REPLACE FUNCTION update_support_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_threads
  SET updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS update_support_thread_on_message ON public.support_messages;

-- Create trigger to update thread timestamp when new message arrives
CREATE TRIGGER update_support_thread_on_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_support_thread_timestamp();

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Uncomment to verify the fix was applied successfully:

-- Check if support tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('support_threads', 'support_messages');

-- Check RLS policies on messages
-- SELECT schemaname, tablename, policyname, cmd 
-- FROM pg_policies 
-- WHERE tablename IN ('messages', 'notifications', 'support_threads', 'support_messages')
-- ORDER BY tablename, policyname;

-- Check realtime publications
-- SELECT tablename FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime'
-- AND schemaname = 'public';

-- ============================================================
-- SUCCESS!
-- ============================================================
-- After running this script:
-- 1. Messages can now be marked as read ✓
-- 2. Notifications can be created ✓
-- 3. Support chat is fully functional ✓
-- 4. Real-time updates are enabled ✓
-- 5. Performance is optimized with indexes ✓
