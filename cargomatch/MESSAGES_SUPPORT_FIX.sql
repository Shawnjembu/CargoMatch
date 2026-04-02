-- ============================================================
-- Fix 1: Missing messages UPDATE policy (mark-as-read)
-- ============================================================
CREATE POLICY "Receivers can mark messages read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- ============================================================
-- Fix 2: Missing notifications INSERT policy
-- (client-side sends notifications to the other party)
-- ============================================================
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Fix 3: Support chat tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_threads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id  UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id),
  body       TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- support_threads: user sees own thread; admins see all
CREATE POLICY "Users view own support thread"
  ON public.support_threads FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));
CREATE POLICY "Users create own support thread"
  ON public.support_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update support threads"
  ON public.support_threads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- support_messages: thread owner or admin can read/write
CREATE POLICY "Support message participants can view"
  ON public.support_messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY "Users and admins can send support messages"
  ON public.support_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Receivers can mark support messages read"
  ON public.support_messages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Realtime for support_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_threads_user    ON public.support_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON public.support_messages(thread_id);
