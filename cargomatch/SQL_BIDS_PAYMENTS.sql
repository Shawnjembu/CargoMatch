-- ============================================================
-- CargoMatch — Bidding & Payments SQL Setup
-- Run once in your Supabase SQL Editor
-- ============================================================

-- 1. Load Bids table
CREATE TABLE IF NOT EXISTS public.load_bids (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id         UUID REFERENCES public.loads(id)     ON DELETE CASCADE NOT NULL,
  carrier_id      UUID REFERENCES public.carriers(id)  ON DELETE CASCADE NOT NULL,
  carrier_user_id UUID REFERENCES auth.users(id)       ON DELETE CASCADE NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  note            TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(load_id, carrier_id)  -- one bid per carrier per load
);

-- 2. Escrow Transactions table
CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id    UUID REFERENCES public.shipments(id)  ON DELETE CASCADE NOT NULL UNIQUE,
  amount         NUMERIC(10,2) NOT NULL,
  currency       TEXT DEFAULT 'BWP',
  status         TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending','held','released','refunded')),
  dpo_token      TEXT,
  dpo_reference  TEXT,
  paid_at        TIMESTAMPTZ,
  released_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row-Level Security: load_bids ────────────────────────────

ALTER TABLE public.load_bids ENABLE ROW LEVEL SECURITY;

-- Carriers can see their own bids
CREATE POLICY "Carriers view own bids"
  ON public.load_bids FOR SELECT
  USING (carrier_user_id = auth.uid());

-- Shippers can see all bids on their loads
CREATE POLICY "Shippers view bids on own loads"
  ON public.load_bids FOR SELECT
  USING (load_id IN (SELECT id FROM public.loads WHERE shipper_id = auth.uid()));

-- Admins see everything
CREATE POLICY "Admins view all bids"
  ON public.load_bids FOR SELECT
  USING (public.is_admin());

-- Carriers can place bids
CREATE POLICY "Carriers insert own bids"
  ON public.load_bids FOR INSERT
  WITH CHECK (carrier_user_id = auth.uid());

-- Carriers can withdraw their own pending bids
CREATE POLICY "Carriers update own bids"
  ON public.load_bids FOR UPDATE
  USING (carrier_user_id = auth.uid());

-- Shippers can accept/reject bids on their loads
CREATE POLICY "Shippers update bids on own loads"
  ON public.load_bids FOR UPDATE
  USING (load_id IN (SELECT id FROM public.loads WHERE shipper_id = auth.uid()));

-- Admins can update all bids
CREATE POLICY "Admins update all bids"
  ON public.load_bids FOR UPDATE
  USING (public.is_admin());

-- ── Row-Level Security: escrow_transactions ──────────────────

ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;

-- Parties (shipper + carrier) can see their own escrow
CREATE POLICY "Parties view own escrow"
  ON public.escrow_transactions FOR SELECT
  USING (
    shipment_id IN (
      SELECT id FROM public.shipments
      WHERE shipper_id = auth.uid()
         OR carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
    )
  );

-- Admins see all escrow
CREATE POLICY "Admins view all escrow"
  ON public.escrow_transactions FOR SELECT
  USING (public.is_admin());

-- Shippers can insert escrow on their shipments (created after payment)
CREATE POLICY "Shippers insert escrow"
  ON public.escrow_transactions FOR INSERT
  WITH CHECK (
    shipment_id IN (SELECT id FROM public.shipments WHERE shipper_id = auth.uid())
  );

-- Admins can update escrow (approve payouts)
CREATE POLICY "Admins update escrow"
  ON public.escrow_transactions FOR UPDATE
  USING (public.is_admin());

-- ── Useful indexes ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_load_bids_load_id     ON public.load_bids(load_id);
CREATE INDEX IF NOT EXISTS idx_load_bids_carrier_id  ON public.load_bids(carrier_user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_shipment_id    ON public.escrow_transactions(shipment_id);
