-- ============================================================
-- CargoMatch v7 — Disputes table migration
-- Run this in Supabase SQL editor (Database → SQL Editor)
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

-- Index for fast lookup by shipment and raiser
CREATE INDEX IF NOT EXISTS disputes_shipment_id_idx ON public.disputes(shipment_id);
CREATE INDEX IF NOT EXISTS disputes_raised_by_idx   ON public.disputes(raised_by);
CREATE INDEX IF NOT EXISTS disputes_status_idx      ON public.disputes(status);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
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
-- they are a party to (one per shipment per user enforced at app level)
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
-- DONE — verify with:
--   SELECT * FROM public.disputes LIMIT 0;
-- ============================================================
