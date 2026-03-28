-- ─────────────────────────────────────────────────────────────────
-- CargoMatch — Carrier Subscriptions Migration
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.carrier_subscriptions (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id            uuid         NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  subscription_tier     text         NOT NULL DEFAULT 'trial'
                          CHECK (subscription_tier IN ('trial','basic','pro','enterprise','expired')),
  trial_start_date      timestamptz,
  trial_end_date        timestamptz,   -- trial_start_date + 30 days
  subscription_start    timestamptz,
  subscription_end      timestamptz,   -- subscription_start + 30 days
  monthly_bid_count     integer      NOT NULL DEFAULT 0,
  monthly_bid_reset     timestamptz,   -- resets every 30 days for Basic tier
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (carrier_id)                -- one row per carrier
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_carrier_subs_carrier_id
  ON public.carrier_subscriptions (carrier_id);

CREATE INDEX IF NOT EXISTS idx_carrier_subs_tier
  ON public.carrier_subscriptions (subscription_tier);

CREATE INDEX IF NOT EXISTS idx_carrier_subs_trial_end
  ON public.carrier_subscriptions (trial_end_date)
  WHERE subscription_tier = 'trial';

-- 3. Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_carrier_subscriptions_updated_at
  ON public.carrier_subscriptions;

CREATE TRIGGER set_carrier_subscriptions_updated_at
  BEFORE UPDATE ON public.carrier_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE public.carrier_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4a. Carriers can read their own subscription
DROP POLICY IF EXISTS "carrier_subs_select_own" ON public.carrier_subscriptions;
CREATE POLICY "carrier_subs_select_own"
  ON public.carrier_subscriptions FOR SELECT
  USING (
    carrier_id IN (
      SELECT id FROM public.carriers WHERE user_id = auth.uid()
    )
  );

-- 4b. Carriers can insert their own subscription row
DROP POLICY IF EXISTS "carrier_subs_insert_own" ON public.carrier_subscriptions;
CREATE POLICY "carrier_subs_insert_own"
  ON public.carrier_subscriptions FOR INSERT
  WITH CHECK (
    carrier_id IN (
      SELECT id FROM public.carriers WHERE user_id = auth.uid()
    )
  );

-- 4c. Carriers can update their own subscription row
DROP POLICY IF EXISTS "carrier_subs_update_own" ON public.carrier_subscriptions;
CREATE POLICY "carrier_subs_update_own"
  ON public.carrier_subscriptions FOR UPDATE
  USING (
    carrier_id IN (
      SELECT id FROM public.carriers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    carrier_id IN (
      SELECT id FROM public.carriers WHERE user_id = auth.uid()
    )
  );

-- 5. Back-fill: create trial rows for any existing carriers
-- (safe to run even if some already have rows due to ON CONFLICT DO NOTHING)
INSERT INTO public.carrier_subscriptions
  (carrier_id, subscription_tier, trial_start_date, trial_end_date, monthly_bid_reset)
SELECT
  c.id,
  'trial',
  now(),
  now() + interval '30 days',
  now() + interval '30 days'
FROM public.carriers c
WHERE NOT EXISTS (
  SELECT 1 FROM public.carrier_subscriptions cs WHERE cs.carrier_id = c.id
)
ON CONFLICT (carrier_id) DO NOTHING;
